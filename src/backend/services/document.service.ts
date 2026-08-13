import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { db, ensureAuth } from "../config/firebase-client.ts";
import { doc, getDoc, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { BatchIssuance, BatchSheetRecord, ProductMaster as Product, User, ElectronicSignature } from "../../types.ts";
import { Response } from "express";
import { SignatureService } from "./signature.service.ts";

export class DocumentService {
  /**
   * Generates a Batch Manufacturing Record (BMR) PDF for a given batch ID
   */
  static async generateBatchPDF(batchId: string, res: Response, viewerUser?: any): Promise<void> {
    await ensureAuth();
    // 1. Fetch Batch Data
    const batchDoc = await getDoc(doc(db, "production_batches", batchId));
    if (!batchDoc.exists()) throw new Error("Batch not found");
    const batchData = batchDoc.data() as BatchIssuance;

    // 2. Fetch Related Data (Sheet Record, Product, Signatures)
    const [recordDoc, productDoc, issuerDoc, signatures] = await Promise.all([
      getDoc(doc(db, "batch_sheet_records", batchData.recordId)),
      getDoc(doc(db, "product_masters", batchData.productId)),
      getDoc(doc(db, "users", batchData.issuedBy)),
      SignatureService.getSignaturesByEntity(batchId, "BATCH")
    ]);

    if (!recordDoc.exists() || !productDoc.exists()) {
      throw new Error("Related record or product data missing");
    }

    const recordData = recordDoc.data() as BatchSheetRecord;
    const productData = productDoc.data() as Product;
    const issuerData = issuerDoc.exists() ? issuerDoc.data() as User : null;

    // 3. Generate QR Code for Verification
    // In a real app, this would be a public verification URL
    const verificationUrl = `https://brims.app/verify/batch/${batchData.batchNumber}`;
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);

    // 4. Initialize PDF Document
    const pdfDoc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `BMR - ${batchData.batchNumber}`,
        Author: "BRIMS System",
      }
    });

    // Pipe the PDF to the response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=BMR_${batchData.batchNumber}.pdf`);
    pdfDoc.pipe(res);

    // --- PDF CONTENT GENERATION ---

    // 1. Header Section with QR Code
    this.generateHeader(pdfDoc, batchData.batchNumber, qrCodeDataUrl);

    // 2. Watermark (DRAFT / APPROVED / COMPLETED)
    this.generateWatermark(pdfDoc, batchData.status);

    // 2.1 Dynamic Secure Watermark (Screenshot Deterrence)
    if (viewerUser) {
      this.generateSecureWatermark(pdfDoc, viewerUser, batchData.batchNumber);
    }

    // 3. Batch & Product Details
    this.generateBatchDetails(pdfDoc, batchData, productData, recordData, issuerData);

    // 4. Manufacturing Steps Table
    this.generateStepsTable(pdfDoc, recordData.masterSnapshot.steps_json);

    // 5. Signature Section (Dynamic)
    this.generateSignatureSection(pdfDoc, signatures as ElectronicSignature[]);

    // 6. Footer (Page Numbers)
    this.generateFooter(pdfDoc);

    pdfDoc.end();
  }

  private static generateHeader(doc: PDFKit.PDFDocument, batchNumber: string, qrCode?: string) {
    doc
      .fillColor("#444444")
      .fontSize(20)
      .text("ACME PHARMACEUTICALS", 50, 45)
      .fontSize(10)
      .text("Quality Assurance Department", 50, 65)
      .fontSize(16)
      .text("BATCH MANUFACTURING RECORD", 0, 45, { align: "right" })
      .fontSize(10)
      .text(`Document No: BMR-SOP-001`, 0, 65, { align: "right" });

    if (qrCode) {
      doc.image(qrCode, 500, 80, { width: 50 });
      doc.fontSize(7).text("Scan to Verify", 500, 135, { align: "center", width: 50 });
    }

    this.generateHr(doc, 140);
  }

  private static generateWatermark(doc: PDFKit.PDFDocument, status: string) {
    const opacity = 0.05;
    doc.save();
    doc.opacity(opacity);
    doc.fontSize(80);
    doc.fillColor("#000000");
    
    const text = status === "COMPLETED" ? "APPROVED" : status;
    
    doc.rotate(-45, { origin: [300, 400] });
    doc.text(text, 150, 400, { align: "center", width: 300 });
    doc.restore();
  }

  private static generateSecureWatermark(doc: PDFKit.PDFDocument, user: any, batchNum: string) {
    const watermarkText = `SECURE RECORD • VIEWED BY: ${user.name || user.displayName || user.email} (${user.id || user.uid}) • ${new Date().toLocaleString()} • BATCH: ${batchNum}`;
    
    doc.save();
    doc.opacity(0.08);
    doc.fontSize(7);
    doc.fillColor("#000000");

    // Add multiple diagonal lines across the page
    for (let i = 0; i < 6; i++) {
      doc.save();
      doc.rotate(-30, { origin: [100, 100 + (i * 150)] });
      doc.text(watermarkText, 50, 100 + (i * 150));
      doc.restore();
    }
    doc.restore();
  }

  private static generateBatchDetails(
    doc: PDFKit.PDFDocument, 
    batch: BatchIssuance, 
    product: Product, 
    record: BatchSheetRecord,
    issuer: User | null
  ) {
    doc
      .fillColor("#444444")
      .fontSize(14)
      .text("Batch Identification", 50, 160);

    this.generateHr(doc, 180);

    const top = 195;
    doc
      .fontSize(10)
      .font("Helvetica-Bold").text("Batch Number:", 50, top)
      .font("Helvetica").text(batch.batchNumber, 150, top)
      .font("Helvetica-Bold").text("Title:", 50, top + 15)
      .font("Helvetica").text(product.title, 150, top + 15)
      .font("Helvetica-Bold").text("Product Code:", 50, top + 30)
      .font("Helvetica").text((product.title || 'UNKNOWN').substring(0, 10).toUpperCase(), 150, top + 30)
      
      .font("Helvetica-Bold").text("Document No:", 350, top)
      .font("Helvetica").text(record.masterSnapshot.documentNumber || 'N/A', 450, top)
      .font("Helvetica-Bold").text("Mfg. Date:", 350, top + 15)
      .font("Helvetica").text(batch.manufacturingDate, 450, top + 15)
      .font("Helvetica-Bold").text("Exp. Date:", 350, top + 30)
      .font("Helvetica").text(batch.expiryDate, 450, top + 30);

    doc
      .fontSize(10)
      .font("Helvetica-Bold").text("Batch Sheet Master:", 50, top + 55)
      .font("Helvetica").text(`Ver ${record.masterSnapshot.version} - ${record.masterSnapshot.masterName}`, 150, top + 55)
      .font("Helvetica-Bold").text("Issued By:", 350, top + 55)
      .font("Helvetica").text(issuer?.displayName || issuer?.email || "System", 450, top + 55);

    this.generateHr(doc, top + 75);
    doc.moveDown();
  }

  private static generateStepsTable(doc: PDFKit.PDFDocument, steps: any[]) {
    let i;
    const invoiceTableTop = 310;

    doc.font("Helvetica-Bold");
    this.generateTableRow(
      doc,
      invoiceTableTop,
      "Step",
      "Description",
      "Equipment",
      "Operator Entry",
      "Verified By"
    );
    this.generateHr(doc, invoiceTableTop + 20);
    doc.font("Helvetica");

    for (i = 0; i < steps.length; i++) {
      const step = steps[i];
      const position = invoiceTableTop + (i + 1) * 40;
      
      // Check if we need a new page
      if (position > 700) {
        doc.addPage();
        this.generateHeader(doc, "CONTINUED");
        // Reset position for new page
      }

      this.generateTableRow(
        doc,
        position,
        step.step_number.toString(),
        step.description,
        step.equipment,
        "________________",
        "________________"
      );

      this.generateHr(doc, position + 30);
    }
  }

  private static generateSignatureSection(doc: PDFKit.PDFDocument, signatures: ElectronicSignature[]) {
    const top = 700;
    this.generateHr(doc, top);

    doc
      .fontSize(10)
      .font("Helvetica-Bold").text("Prepared By (Production)", 50, top + 15)
      .text("Checked By (QA)", 250, top + 15)
      .text("Approved By (QA Manager)", 430, top + 15);

    // Find specific signatures if they exist
    const preparedBy = signatures.find(s => s.meaning.toLowerCase().includes("prepared") || s.actionType === "COMPLETE_BATCH");
    const checkedBy = signatures.find(s => s.meaning.toLowerCase().includes("checked") || s.meaning.toLowerCase().includes("reviewed"));
    const approvedBy = signatures.find(s => s.meaning.toLowerCase().includes("approved"));

    doc.font("Helvetica").fontSize(8);

    // Prepared By
    if (preparedBy) {
      doc.text(`Signed: ${preparedBy.userId}`, 50, top + 45);
      doc.text(`Date: ${new Date(preparedBy.signedAt).toLocaleString()}`, 50, top + 60);
    } else {
      doc.text("Sign: ________________", 50, top + 45);
      doc.text("Date: ________________", 50, top + 60);
    }

    // Checked By
    if (checkedBy) {
      doc.text(`Signed: ${checkedBy.userId}`, 250, top + 45);
      doc.text(`Date: ${new Date(checkedBy.signedAt).toLocaleString()}`, 250, top + 60);
    } else {
      doc.text("Sign: ________________", 250, top + 45);
      doc.text("Date: ________________", 250, top + 60);
    }

    // Approved By
    if (approvedBy) {
      doc.text(`Signed: ${approvedBy.userId}`, 430, top + 45);
      doc.text(`Date: ${new Date(approvedBy.signedAt).toLocaleString()}`, 430, top + 60);
    } else {
      doc.text("Sign: ________________", 430, top + 45);
      doc.text("Date: ________________", 430, top + 60);
    }
  }

  private static generateFooter(doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
       doc.switchToPage(i);
      doc
        .fontSize(8)
        .text(
          `Page ${i + 1} of ${range.count} | Document Uncontrolled if Printed | BRIMS Secure View v1.0.4`,
          50,
          780,
          { align: "center", width: 500 }
        );
    }
  }

  private static generateTableRow(
    doc: PDFKit.PDFDocument,
    y: number,
    step: string,
    desc: string,
    equip: string,
    entry: string,
    verify: string
  ) {
    doc
      .fontSize(9)
      .text(step, 50, y)
      .text(desc, 100, y, { width: 180 })
      .text(equip, 290, y, { width: 80 })
      .text(entry, 380, y)
      .text(verify, 480, y);
  }

  private static generateHr(doc: PDFKit.PDFDocument, y: number) {
    doc
      .strokeColor("#aaaaaa")
      .lineWidth(1)
      .moveTo(50, y)
      .lineTo(550, y)
      .stroke();
  }
}
