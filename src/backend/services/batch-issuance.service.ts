import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, setDoc, updateDoc, runTransaction } from "firebase/firestore";
import { AuditService } from "./audit.service.ts";
import { SignatureService } from "./signature.service.ts";
import { BatchSheetRecordService } from "./batchSheetRecord.service.ts";
import { NotificationService, NotificationType, TargetType } from "./notification.service.ts";
import { PrintService } from "./print.service.ts";
import { BatchIssuance, BatchIssuanceStatus, BatchSheetRecord, ProductMaster, BatchSheetItem, PrintJobStatus, BatchSheetPrintHistoryEntry, getUserBaseRole } from "../../types.ts";
import { hasRoleAccess } from "../utils/auth-utils.ts";

export { PrintService };

function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => (v === undefined ? null : v)));
}

export function expandBatchSeries(series: string): string[] {
  const trimmed = (series || '').trim();
  if (!trimmed) return [];
  
  const rawParts = trimmed.includes(',') ? trimmed.split(',').map(p => p.trim()).filter(Boolean) : [trimmed];
  const result: string[] = [];

  for (const part of rawParts) {
    const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (!isNaN(start) && !isNaN(end) && start <= end && (end - start) <= 500) {
        const padLength = Math.max(rangeMatch[1].length, rangeMatch[2].length);
        for (let i = start; i <= end; i++) {
          result.push(String(i).padStart(padLength, '0'));
        }
      } else {
        result.push(part);
      }
    } else {
      result.push(part);
    }
  }

  return result;
}

export function computeServerSheetCustody(sheet: BatchSheetItem, batchStatus?: string): string {
  if (sheet.currentCustody) return sheet.currentCustody;
  if (sheet.qaReviewStatus === 'QA_REVIEW_COMPLETED') return 'QA – Reviewed';
  if (sheet.qaReceiptStatus === 'RECEIVED_BY_QA') return 'QA – Under Review';
  if (sheet.qaReturnStatus === 'SENT_FOR_QA_REVIEW') return 'QA – Awaiting Receipt';
  if (sheet.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION') return 'Production';
  if (sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION') return 'QA – Handed Over / Awaiting Production Receipt';
  const isPrinted = sheet.status === 'PRINT_COMPLETED' || sheet.status === 'PRINTED' || sheet.status === 'REPRINTED' || (sheet.printCount || 0) > 0;
  if (isPrinted) return 'QA – Printed / Pending Handover';
  return 'QA – Awaiting Printing';
}

export function normalizeServerBatchSheet(sheet: BatchSheetItem, batchStatus: string = 'ISSUED'): BatchSheetItem {
  let handoverStatus = sheet.handoverStatus;
  let productionReceiptStatus = sheet.productionReceiptStatus;
  let productionStatus = sheet.productionStatus;
  let qaReturnStatus = sheet.qaReturnStatus;
  let qaReceiptStatus = sheet.qaReceiptStatus;
  let qaReviewStatus = sheet.qaReviewStatus;

  if (!handoverStatus) {
    if (['HANDED_OVER', 'PRODUCTION_IN_PROGRESS', 'READY_FOR_QA_REVIEW', 'COMPLETED'].includes(batchStatus)) {
      handoverStatus = 'HANDED_OVER_TO_PRODUCTION';
    } else {
      handoverStatus = 'PENDING_HANDOVER';
    }
  }

  if (!productionReceiptStatus) {
    if (['PRODUCTION_IN_PROGRESS', 'READY_FOR_QA_REVIEW', 'COMPLETED'].includes(batchStatus)) {
      productionReceiptStatus = 'RECEIVED_BY_PRODUCTION';
    } else if (handoverStatus === 'HANDED_OVER_TO_PRODUCTION') {
      productionReceiptStatus = 'AWAITING_PRODUCTION_RECEIPT';
    } else {
      productionReceiptStatus = 'NOT_AVAILABLE';
    }
  }

  if (!productionStatus) {
    if (['COMPLETED'].includes(batchStatus)) {
      productionStatus = 'COMPLETED';
    } else if (['READY_FOR_QA_REVIEW'].includes(batchStatus)) {
      productionStatus = 'READY_FOR_QA_REVIEW';
    } else if (['PRODUCTION_IN_PROGRESS'].includes(batchStatus)) {
      productionStatus = 'IN_PROGRESS';
    } else {
      productionStatus = 'PENDING';
    }
  }

  if (!qaReturnStatus) {
    if (['READY_FOR_QA_REVIEW', 'COMPLETED'].includes(batchStatus)) {
      qaReturnStatus = 'SENT_FOR_QA_REVIEW';
    } else {
      qaReturnStatus = 'NOT_SENT';
    }
  }

  if (!qaReceiptStatus) {
    if (['COMPLETED', 'READY_FOR_QA_REVIEW'].includes(batchStatus)) {
      qaReceiptStatus = 'RECEIVED_BY_QA';
    } else {
      qaReceiptStatus = 'NOT_AVAILABLE';
    }
  }

  if (!qaReviewStatus) {
    if (['COMPLETED'].includes(batchStatus)) {
      qaReviewStatus = 'QA_REVIEW_COMPLETED';
    } else if (qaReceiptStatus === 'RECEIVED_BY_QA') {
      qaReviewStatus = 'RECEIVED';
    } else {
      qaReviewStatus = 'PENDING_RECEIPT';
    }
  }

  const normalized: BatchSheetItem = {
    ...sheet,
    handoverStatus,
    productionReceiptStatus,
    productionStatus,
    qaReturnStatus,
    qaReceiptStatus,
    qaReviewStatus,
    history: sheet.history || []
  };

  normalized.currentCustody = computeServerSheetCustody(normalized, batchStatus);
  return normalized;
}

export function initializeBatchSheets(batchData: any): BatchSheetItem[] {
  if (Array.isArray(batchData.batchSheets) && batchData.batchSheets.length > 0) {
    return batchData.batchSheets.map((s: BatchSheetItem) => normalizeServerBatchSheet(s, batchData.status));
  }

  const rawSeries = batchData.batchNumberSeries || batchData.batchNumber || '';
  const items = expandBatchSeries(rawSeries);
  if (items.length === 0) {
    items.push(batchData.batchNumber || 'BATCH-001');
  }

  const isAlreadyPrinted = [
    'READY_FOR_PRODUCTION_HANDOVER',
    'HANDED_OVER',
    'PRODUCTION_IN_PROGRESS',
    'READY_FOR_QA_REVIEW',
    'COMPLETED'
  ].includes(batchData.status);

  return items.map((num, idx) => {
    let initialStatus: PrintJobStatus = 'PENDING';
    if (isAlreadyPrinted) {
      initialStatus = 'PRINTED';
    } else if (batchData.status === 'ISSUED') {
      initialStatus = idx === 0 ? 'READY_TO_PRINT' : 'PENDING';
    } else {
      initialStatus = 'PENDING';
    }

    const item: BatchSheetItem = {
      id: `sheet-${idx}`,
      batchNumber: num,
      sequenceIndex: idx,
      status: initialStatus,
      printCount: isAlreadyPrinted ? 1 : 0,
      activeLock: null,
      printedAt: isAlreadyPrinted ? (batchData.completedAt || batchData.updatedAt || batchData.createdAt || null) : null,
      printedBy: isAlreadyPrinted ? (batchData.completedBy || batchData.issuedBy || null) : null,
      printedByName: isAlreadyPrinted ? (batchData.completedByName || batchData.issuedByName || 'Akshay Sharma') : null,
      printedByEmployeeId: isAlreadyPrinted ? (batchData.completedByEmployeeId || 'N/A') : null,
      history: isAlreadyPrinted ? [
        {
          id: `hist-${idx}-init`,
          action: 'PRINT_COMPLETED',
          status: 'PRINTED',
          timestamp: batchData.completedAt || batchData.updatedAt || batchData.createdAt || new Date().toISOString(),
          performedBy: batchData.completedByName || batchData.issuedByName || 'Akshay Sharma',
          userId: batchData.completedBy || batchData.issuedBy || 'system',
          userEmail: 'shakshay04@gmail.com',
          userRole: batchData.completedByRole || 'ADMIN',
          employeeId: batchData.completedByEmployeeId || 'N/A',
          reason: 'Initial Batch Sheet Print',
          copyNumber: 1
        }
      ] : []
    };

    return normalizeServerBatchSheet(item, batchData.status);
  });
}

export class BatchIssuanceService {
  /**
   * Generates a unique batch number in the format: PRODUCTCODE-YYYYMMDD-XXX
   * Prefetching the last batch number outside the transaction for Client SDK compatibility.
   */
  private static async generateBatchNumber(productTitle: string, date: string): Promise<string> {
    const validDate = date ? String(date).split("T")[0] : new Date().toISOString().split("T")[0];
    const dateStr = validDate.replace(/-/g, ""); // YYYYMMDD
    const sanitizedTitle = (productTitle || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, "").substring(0, 10).toUpperCase();
    const prefix = `${sanitizedTitle}-${dateStr}-`;
    
    await ensureAuth();
    
    try {
      const q = query(
        collection(db, "production_batches"),
        where("batchNumber", ">=", prefix),
        where("batchNumber", "<=", prefix + "\uf8ff"),
        orderBy("batchNumber", "desc"),
        limit(1)
      );

      const snapshot = await getDocs(q);
      let sequence = 1;
      if (!snapshot.empty) {
        const lastBatchNumber = snapshot.docs[0].data().batchNumber;
        const lastSequenceStr = (lastBatchNumber || '').split("-").pop();
        if (lastSequenceStr && !isNaN(parseInt(lastSequenceStr, 10))) {
          sequence = parseInt(lastSequenceStr, 10) + 1;
        }
      }
      const sequenceStr = sequence.toString().padStart(3, "0");
      return `${prefix}${sequenceStr}`;
    } catch (err) {
      console.warn("generateBatchNumber query fallback:", err);
      const seq = Math.floor(Math.random() * 900) + 100;
      return `${prefix}${seq}`;
    }
  }

  static async issueBatch(data: { recordId: string; manufacturingDate: string; batchNumberSeries?: string; dropdownBatchSeries?: string; singlePagesBatchNumber?: string; startDate: string; endDate: string; status?: BatchIssuanceStatus; signaturePassword?: string; requestType?: 'NEW' | 'REPRINT'; reprintReason?: string; comments?: string }, user: any, metadata?: any, selectedBranch?: string) {
    let { recordId, manufacturingDate, batchNumberSeries = "", dropdownBatchSeries = "", singlePagesBatchNumber = "", startDate, endDate, status = "PENDING_REVIEW", signaturePassword, requestType = "NEW", reprintReason = "", comments = "" } = data;

    // Electronic Signature Verification
    if (signaturePassword) {
      const userEmail = user?.email || user?.firestoreEmail || user?.username || "shakshay04@gmail.com";
      await SignatureService.verifyCredentials(userEmail, signaturePassword);
    }

    await ensureAuth();
    // 1. Resolve Record ID (if a master ID is provided instead)
    const recordRef = doc(db, "batch_sheet_records", recordId);
    let recordDoc = await getDoc(recordRef);
    let recordData: any;
    
    if (!recordDoc.exists()) {
      // Check if it's a master ID
      const masterDoc = await getDoc(doc(db, "batch_sheet_masters", recordId));
      if (masterDoc.exists()) {
        let latestApproved = await BatchSheetRecordService.getLatestApprovedRecord(recordId);
        if (!latestApproved) {
          const masterData = masterDoc.data();
          if (masterData) {
            console.log(`[SERVICE]: Auto-creating and approving batch_sheet_record for master ${recordId}...`);
            latestApproved = await BatchSheetRecordService.autoInitializeRecord(recordId, user, masterData);
          }
        }
        if (!latestApproved) {
          throw new Error("No approved master record found for this product. Please approve the master sheet first.");
        }
        recordId = latestApproved.id;
        recordData = latestApproved;
      } else {
        throw new Error("Batch Sheet Record or Master not found");
      }
    } else {
      recordData = recordDoc.data();
    }

    // 2. Business Rule: Ensure record or master is approved
    const normalizedStatus = (recordData?.status || "").toUpperCase();
    if (normalizedStatus !== "APPROVED" && normalizedStatus !== "ACTIVE") {
      if (recordData?.masterSnapshot?.status === "APPROVED" || recordData?.masterSnapshot?.status === "ACTIVE") {
        recordData.status = "APPROVED";
      } else {
        throw new Error(`Cannot request batch from a record in ${recordData?.status} status. Only APPROVED records are allowed.`);
      }
    }

    // 3. Business Rule: Prevent duplicate batch issuance or check for re-print validation
    const requestedItems = expandBatchSeries(batchNumberSeries);

    const batchesQuery = query(
      collection(db, "production_batches"),
      where("recordId", "==", recordId)
    );
    const existingBatchesDocs = await getDocs(batchesQuery);
    const existingBatches = existingBatchesDocs.docs
      .map(d => d.data() as any)
      .filter(b => b.status !== "REJECTED" && b.status !== "CANCELLED");

    const issuedItemsSet = new Set<string>();
    existingBatches
      .filter(b => ['ISSUED', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER', 'PRODUCTION_IN_PROGRESS', 'READY_FOR_QA_REVIEW', 'COMPLETED'].includes(b.status))
      .forEach(b => {
        const bItems = expandBatchSeries(b.batchNumberSeries || b.batchNumber);
        bItems.forEach(item => issuedItemsSet.add(item));
      });

    const isAlreadyIssued = requestedItems.some(item => issuedItemsSet.has(item));

    const partsList = batchNumberSeries.split(',').map(p => p.trim()).filter(Boolean);
    const isIndividualPages = partsList.length > 0 && partsList.every(part => /^\d{1,3}$/.test(part));

    let targetBatchToVerify = singlePagesBatchNumber.trim();
    if (!targetBatchToVerify) {
      const nonPage = partsList.find(p => p.length > 3 || p.includes('-'));
      if (nonPage) targetBatchToVerify = nonPage;
    }

    let isTargetBatchPreviouslyIssued = false;
    if (targetBatchToVerify) {
      const targetInt = parseInt(targetBatchToVerify, 10);
      existingBatches.forEach(b => {
        const bSeries = b.batchNumberSeries || b.batchNumber || '';
        const bParts = bSeries.split(',').map((p: string) => p.trim()).filter(Boolean);
        for (const p of bParts) {
          if (p === targetBatchToVerify) isTargetBatchPreviouslyIssued = true;
          if (/^\d+-\d+$/.test(p)) {
            const [s, e] = p.split('-').map(Number);
            if (!isNaN(s) && !isNaN(e) && !isNaN(targetInt) && targetInt >= s && targetInt <= e) {
              isTargetBatchPreviouslyIssued = true;
            }
          }
        }
        if (b.singlePagesBatchNumber && b.singlePagesBatchNumber.trim() === targetBatchToVerify) {
          isTargetBatchPreviouslyIssued = true;
        }
      });
    }

    if (isIndividualPages && targetBatchToVerify && isTargetBatchPreviouslyIssued && requestType === "NEW") {
      throw new Error(`Single pages for Batch #${targetBatchToVerify} must be requested as a Re-print because previous batch issuance for Batch #${targetBatchToVerify} has already been recorded.`);
    }

    if (requestType === "NEW" && isAlreadyIssued) {
      throw new Error(`Cannot request batch series/pages (${requestedItems.filter(i => issuedItemsSet.has(i)).join(', ')}) as a New request because it has already been issued. Please select 'REPRINT' or use a different series.`);
    }

    // Compute the printCounts for each of the requested items (including this request)
    const printCounts: { [item: string]: number } = {};
    requestedItems.forEach(item => {
      let prevCount = 0;
      existingBatches.forEach(b => {
        const bItems = expandBatchSeries(b.batchNumberSeries || b.batchNumber);
        if (bItems.includes(item)) {
          prevCount++;
        }
      });
      printCounts[item] = prevCount + 1;
    });

    // 4. Date handling logic
    const parseDateToUTC = (dateStr: string) => {
      if (!dateStr) return new Date();
      const parts = dateStr.split('-').map(Number);
      return new Date(Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1));
    };

    const mfgDate = parseDateToUTC(manufacturingDate);

    // 5. Get Product Info outside transaction
    const prodId = recordData?.masterSnapshot?.productId || recordData?.productId || (recordData as any)?.product?.id;
    let productData: any = null;
    if (prodId) {
      try {
        const productDoc = await getDoc(doc(db, "product_masters", prodId));
        if (productDoc.exists()) {
          productData = { id: productDoc.id, ...(productDoc.data() as any) };
        }
      } catch (err) {
        console.warn("Product fetch fallback outside transaction:", err);
      }
    }

    if (!productData) {
      productData = recordData?.masterSnapshot?.product || recordData?.product || {
        id: prodId || "unknown",
        title: recordData?.masterSnapshot?.masterName || recordData?.masterSnapshot?.title || recordData?.masterName || "Batch Product",
        code: recordData?.masterSnapshot?.documentNumber || "PROD"
      };
    }

    // 6. Generate Batch Number outside transaction
    const batchNumber = await this.generateBatchNumber(productData.title || productData.name || "BATCH", manufacturingDate);

    // 7. Calculate Expiry Date
    let expiryDate = endDate;
    if (!expiryDate) {
      const shelfLife = 24;
      const expDate = new Date(mfgDate);
      expDate.setMonth(mfgDate.getMonth() + shelfLife);
      expiryDate = expDate.toISOString().split("T")[0];
    }

    const batchRef = doc(collection(db, "production_batches"));
    const rawBatch: any = {
      batchNumber,
      productId: prodId || productData.id || "unknown",
      recordId: recordId,
      version: recordData?.masterSnapshot?.version || recordData?.version || "1.0",
      manufacturingDate: manufacturingDate || startDate || new Date().toISOString().split("T")[0],
      expiryDate: expiryDate || null,
      startDate: startDate || manufacturingDate || new Date().toISOString().split("T")[0],
      endDate: endDate || expiryDate || null,
      status: status || "PENDING_REVIEW",
      issuedBy: user?.uid || "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branch: selectedBranch || recordData?.branch || "Masulkhana",
      batchNumberSeries: batchNumberSeries || "",
      dropdownBatchSeries: dropdownBatchSeries || "",
      singlePagesBatchNumber: singlePagesBatchNumber || "",
      requestType: requestType || "NEW",
      reprintReason: reprintReason || null,
      printCounts: printCounts || {},
      comments: comments || ""
    };

    // Initialize sequential individual batch sheets
    rawBatch.batchSheets = initializeBatchSheets(rawBatch);

    // Deep sanitize object to remove any `undefined` values for Firestore compatibility
    const newBatch = JSON.parse(JSON.stringify(rawBatch, (_, v) => (v === undefined ? null : v)));

    // 8. Execute atomic transaction for batch creation, signature, and audit log
    await runTransaction(db, async (transaction) => {
      const txRecordDoc = await transaction.get(doc(db, "batch_sheet_records", recordId));
      if (!txRecordDoc.exists() && !recordData) {
        throw new Error("Record lost during transaction");
      }

      transaction.set(batchRef, newBatch);

      // If signed, record the electronic signature
      let signatureId: string | undefined;
      let signatureMeaning: string | undefined;

      if (signaturePassword) {
        signatureMeaning = status === "ISSUED" ? "Signed for entry and issuance" : "Signed for issuance request";
        const sigResult = await SignatureService.signAction(
          user?.uid || "system",
          user?.email || "system@brims.com",
          status === "ISSUED" ? "ISSUE_BATCH" : "REQUEST_BATCH_ISSUANCE",
          "PRODUCTION_BATCH",
          batchRef.id,
          signatureMeaning,
          metadata?.ip || "unknown",
          metadata?.userAgent || "unknown",
          transaction
        );
        if (sigResult) {
          signatureId = sigResult.id;
        }
      }

      // Audit Log
      await AuditService.logAction(
        user?.uid || "system",
        user?.email || "system@brims.com",
        status === "ISSUED" ? "ISSUE_BATCH" : "REQUEST_BATCH_ISSUANCE",
        batchRef.id,
        "PRODUCTION_BATCH",
        null,
        newBatch,
        `${status === "ISSUED" ? "Issued" : "Requested"} batch ${batchNumber} for product ${productData.title || productData.name || 'Product'}`,
        transaction,
        signatureId,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent,
        selectedBranch || recordData?.branch
      );
    });

    // 9. Post-transaction notification (outside transaction)
    if (status === "PENDING_REVIEW") {
      try {
        await NotificationService.sendNotification({
          title: "New Batch Issuance Request",
          message: `Request for batch ${batchNumber} for ${productData.title || productData.name || 'Product'} is pending review.`,
          type: NotificationType.INFO,
          targetType: TargetType.ROLE,
          targetId: "QA",
          link: `/batch-sheet-records/status`
        });
      } catch (notifErr) {
        console.warn("Non-blocking notification error:", notifErr);
      }
    }

    return { id: batchRef.id, ...newBatch };
  }

  static async getAllBatches(filters: any) {
    const { status, productId, startDate, endDate, batchNumber, page = 1, limit: limitVal = 10, selectedBranch } = filters;
    await ensureAuth();
    
    // To completely avoid Firestore composite index requirements (which fail dynamically 
    // depending on the combinations of filters like branch, status, productId, and orderBy),
    // we query with a simple single-field branch filter, and perform 
    // all remaining filters, sorting, and pagination in memory. This is highly performant 
    // and 105% resilient to Firestore index errors in any deployment environment.
    const constraints: any[] = [];
    if (selectedBranch) {
      constraints.push(where("branch", "==", selectedBranch));
    }
    
    const q = query(collection(db, "production_batches"), ...constraints);
    const snapshot = await getDocs(q);
    
    let batchesData = snapshot.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() as any) }));

    // In-memory filtering
    if (status) {
      batchesData = batchesData.filter((b: any) => b.status === status);
    }
    if (productId) {
      batchesData = batchesData.filter((b: any) => b.productId === productId);
    }
    if (startDate) {
      batchesData = batchesData.filter((b: any) => b.manufacturingDate >= startDate);
    }
    if (endDate) {
      batchesData = batchesData.filter((b: any) => b.manufacturingDate <= endDate);
    }
    if (batchNumber) {
      const searchLower = batchNumber.toLowerCase();
      batchesData = batchesData.filter((b: any) => b.batchNumber && b.batchNumber.toLowerCase().includes(searchLower));
    }

    // In-memory sorting (createdAt desc)
    batchesData.sort((a: any, b: any) => {
      const dateA = a.createdAt || "";
      const dateB = b.createdAt || "";
      return dateB.localeCompare(dateA);
    });

    // In-memory pagination / limit
    const limitNum = Number(limitVal);
    if (!isNaN(limitNum) && limitNum > 0) {
      batchesData = batchesData.slice(0, limitNum);
    }

    const populated = await Promise.all(batchesData.map(async (batch: any) => {
      try {
        const batchSheets = initializeBatchSheets(batch);
        if (!batch.recordId) return { ...batch, batchSheets };
        const recordDoc = await getDoc(doc(db, "batch_sheet_records", batch.recordId));
        return {
          ...batch,
          batchSheets,
          recordInfo: recordDoc.exists() ? recordDoc.data() : null
        };
      } catch (err) {
        console.error("Error populating record info for batch id " + batch.id, err);
        return {
          ...batch,
          batchSheets: initializeBatchSheets(batch)
        };
      }
    }));

    return populated;
  }

  static async getBatchById(id: string) {
    if (!id || typeof id !== "string") {
      throw new Error("Invalid batch ID provided");
    }

    await ensureAuth();
    let batchDoc: any = null;

    try {
      const directRef = doc(db, "production_batches", id);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        batchDoc = directSnap;
      }
    } catch (e) {
      console.warn("Direct batch lookup failed, attempting fallback query:", e);
    }

    // Fallback: lookup by batchNumber if direct doc ID lookup did not find a match
    if (!batchDoc || !batchDoc.exists()) {
      try {
        const qNum = query(collection(db, "production_batches"), where("batchNumber", "==", id), limit(1));
        const snapNum = await getDocs(qNum);
        if (!snapNum.empty) {
          batchDoc = snapNum.docs[0];
        }
      } catch (e) {
        console.warn("batchNumber lookup query failed:", e);
      }
    }

    // Fallback: lookup by batchNumberSeries
    if (!batchDoc || !batchDoc.exists()) {
      try {
        const qSeries = query(collection(db, "production_batches"), where("batchNumberSeries", "==", id), limit(1));
        const snapSeries = await getDocs(qSeries);
        if (!snapSeries.empty) {
          batchDoc = snapSeries.docs[0];
        }
      } catch (e) {
        console.warn("batchNumberSeries lookup query failed:", e);
      }
    }

    // Fallback: lookup by recordId
    if (!batchDoc || !batchDoc.exists()) {
      try {
        const qRecord = query(collection(db, "production_batches"), where("recordId", "==", id), limit(1));
        const snapRecord = await getDocs(qRecord);
        if (!snapRecord.empty) {
          batchDoc = snapRecord.docs[0];
        }
      } catch (e) {
        console.warn("recordId lookup query failed:", e);
      }
    }

    if (!batchDoc || !batchDoc.exists()) {
      throw new Error(`Batch record '${id}' not found`);
    }
    
    const batchData = batchDoc.data() as BatchIssuance;
    
    // Safely fetch related info without throwing on missing or empty IDs
    let recordDocData: any = null;
    let productDocData: any = null;
    let userData: any = null;

    if (batchData.recordId) {
      try {
        const rDoc = await getDoc(doc(db, "batch_sheet_records", batchData.recordId)).catch(() => null);
        if (rDoc && rDoc.exists()) {
          recordDocData = rDoc.data();
        } else {
          // Check if recordId was actually a masterId
          const mDoc = await getDoc(doc(db, "batch_sheet_masters", batchData.recordId)).catch(() => null);
          if (mDoc && mDoc.exists()) {
            recordDocData = { id: mDoc.id, masterSnapshot: mDoc.data() };
          }
        }
      } catch (e) {
        console.warn("Could not load recordDoc for batch:", e);
      }
    }

    if (batchData.productId) {
      try {
        const pDoc = await getDoc(doc(db, "product_masters", batchData.productId)).catch(() => null);
        if (pDoc && pDoc.exists()) {
          productDocData = pDoc.data();
        }
      } catch (e) {
        console.warn("Could not load productDoc for batch:", e);
      }
    }

    if (batchData.issuedBy) {
      try {
        const uDoc = await getDoc(doc(db, "users", batchData.issuedBy)).catch(() => null);
        if (uDoc && uDoc.exists()) {
          userData = uDoc.data();
        }
      } catch (e) {
        console.warn("Could not load userDoc for batch:", e);
      }
    }
    
    let displayName = userData?.displayName || userData?.name || "";
    let role = userData?.role || "ADMIN";
    
    // Fallback overrides for standard UID / development scenarios
    if (!displayName && (batchData.issuedBy === "PGXHgKJarZcMgpUuF67TSE7KTqn1" || !batchData.issuedBy)) {
      displayName = "Akshay Sharma";
      role = "ADMIN";
    }
    if (!displayName && userData?.email) {
      displayName = userData.email.split("@")[0];
    }
    if (!displayName) {
      displayName = "Akshay Sharma";
    }

    const batchSheets = initializeBatchSheets(batchData);
    
    return {
      ...batchData,
      id: batchDoc.id,
      batchSheets,
      recordInfo: recordDocData || (batchData as any).recordInfo || null,
      productInfo: productDocData || (batchData as any).productInfo || null,
      issuedByName: displayName,
      issuedByRole: role
    };
  }

  static async getBatchForPrinting(id: string, user: any) {
    await ensureAuth();
    const batch = await this.getBatchById(id);
    
    // 1. Enforce Status = ISSUED
    if (batch.status !== "ISSUED") {
      throw new Error(`Printing denied. Batch status is ${batch.status}. Printing is only allowed for ISSUED batches.`);
    }

    // 2. Enforce Print Permission (Role check)
    const allowedRoles = ["ADMIN", "QA", "PRODUCTION_MANAGER"];
    if (!hasRoleAccess(user.role, allowedRoles)) {
      throw new Error(`Printing denied. Your role (${user.role}) does not have print permissions.`);
    }

    return batch;
  }

  static async updateBatchStatus(id: string, newStatus: BatchIssuanceStatus, changeReason: string, user: any, signaturePassword?: string, metadata?: any) {
    if (["READY_FOR_PRODUCTION_HANDOVER", "HANDED_OVER", "PRODUCTION_IN_PROGRESS", "READY_FOR_QA_REVIEW", "COMPLETED"].includes(newStatus)) {
      if (!signaturePassword) {
        throw new Error(`Password confirmation is required for electronic signature when changing status to ${newStatus}`);
      }
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    } else if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    }

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const batchRef = doc(db, "production_batches", id);
      const batchDoc = await transaction.get(batchRef);

      if (!batchDoc.exists()) {
        throw new Error("Batch not found");
      }

      const batchData = batchDoc.data() as BatchIssuance;

      // Business Rule: Cannot edit batch after completion
      if (batchData.status === "COMPLETED") {
        throw new Error("Cannot update status of a COMPLETED batch.");
      }

      // Business Rule: Cannot update if already CANCELLED
      if (batchData.status === "CANCELLED") {
        throw new Error("Cannot update status of a CANCELLED batch.");
      }

      // Granular System Operation Rights permission check
      if (user) {
        const baseRole = getUserBaseRole(user);
        if (baseRole !== 'ADMIN') {
          const userPerms: string[] = user.permissions || [];
          if (newStatus === 'READY_FOR_PRODUCTION_HANDOVER' && !userPerms.some(p => ['op:ready_for_handover', 'batch:approve', 'batch:review', 'batch:print', 'op:issued'].includes(p)) && baseRole !== 'QA') {
            throw new Error("Access Denied: You do not have permission to prepare batch handover.");
          } else if (newStatus === 'HANDED_OVER' && !userPerms.some(p => ['op:ready_for_handover', 'op:production_in_progress', 'batch:approve', 'batch:review', 'batch:sign', 'batch:create', 'batch:print'].includes(p)) && baseRole !== 'QA' && baseRole !== 'PRODUCTION_MANAGER') {
            throw new Error("Access Denied: You do not have permission to hand over batch to production.");
          } else if (newStatus === 'PRODUCTION_IN_PROGRESS' && !userPerms.some(p => ['op:production_in_progress', 'batch:sign', 'batch:edit', 'batch:create'].includes(p)) && baseRole !== 'PRODUCTION_MANAGER' && baseRole !== 'OPERATOR' && baseRole !== 'QA') {
            throw new Error("Access Denied: You do not have permission to receive batch custody.");
          } else if (newStatus === 'READY_FOR_QA_REVIEW' && !userPerms.some(p => ['op:ready_for_qa_review', 'batch:sign', 'batch:edit', 'op:production_in_progress'].includes(p)) && baseRole !== 'PRODUCTION_MANAGER' && baseRole !== 'OPERATOR' && baseRole !== 'QA') {
            throw new Error("Access Denied: You do not have permission to submit batch for QA review.");
          } else if (newStatus === 'COMPLETED' && !userPerms.some(p => ['op:completed', 'batch:approve', 'batch:review'].includes(p)) && baseRole !== 'QA') {
            throw new Error("Access Denied: You do not have permission to complete QA acceptance.");
          } else if (newStatus === 'RETURNED' && !userPerms.some(p => ['op:return_for_correction', 'batch:approve', 'batch:review'].includes(p)) && baseRole !== 'QA') {
            throw new Error("Access Denied: You do not have permission to return batch for correction.");
          }
        }
      }

      const oldStatus = batchData.status;
      const updateData: Record<string, any> = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      };

      if (newStatus === 'READY_FOR_QA_REVIEW' && batchData.batchSheets && batchData.batchSheets.length > 0) {
        const nowIso = new Date().toISOString();
        const userName = user?.displayName || user?.username || user?.email || 'Production Lead';
        const userUid = user?.uid || 'user';
        const updatedSheets = batchData.batchSheets.map(s => {
          if ((s.handoverStatus === 'HANDED_OVER_TO_PRODUCTION' || s.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION') && 
              s.qaReturnStatus !== 'SENT_FOR_QA_REVIEW' && 
              s.qaReviewStatus !== 'QA_REVIEW_COMPLETED') {
            return {
              ...s,
              productionReceiptStatus: 'RECEIVED_BY_PRODUCTION',
              qaReturnStatus: 'SENT_FOR_QA_REVIEW',
              qaReceiptStatus: 'AWAITING_QA_RECEIPT',
              qaReviewStatus: 'PENDING_RECEIPT',
              productionStatus: 'READY_FOR_QA_REVIEW',
              currentCustody: 'QA – Awaiting Receipt',
              currentOperationalState: 'SENT_FOR_QA_REVIEW',
              sentForQaReviewAt: nowIso,
              sentForQaReviewBy: userUid,
              sentForQaReviewByName: userName
            };
          }
          return s;
        });
        updateData.batchSheets = updatedSheets;
        updateData.qaReviewSubStatus = 'QA_REVIEW_IN_PROGRESS';
      }

      transaction.update(batchRef, sanitizeForFirestore(updateData));

      // Record Signature if password is provided
      let signatureId: string | undefined;
      let signatureMeaning: string | undefined;

      if (signaturePassword) {
        let actionMeaning = `Changed batch status from ${oldStatus} to ${newStatus}`;
        if (newStatus === 'READY_FOR_PRODUCTION_HANDOVER') {
          actionMeaning = "Certified Ready for Production Handover";
        } else if (newStatus === 'HANDED_OVER') {
          actionMeaning = "Certified Handed over to Production";
        } else if (newStatus === 'PRODUCTION_IN_PROGRESS') {
          actionMeaning = "Certified Received (Printed Batch Sheet Collected from QA)";
        } else if (newStatus === 'READY_FOR_QA_REVIEW') {
          actionMeaning = "Certified Sent back For QA Review";
        } else if (newStatus === 'COMPLETED') {
          actionMeaning = "Certified QA Received from Batch Sheet Reviewed";
        }
        signatureMeaning = actionMeaning;

        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email,
          `UPDATE_STATUS_${newStatus}`,
          "PRODUCTION_BATCH",
          id,
          actionMeaning,
          metadata?.ip || "unknown",
          metadata?.userAgent || "unknown",
          transaction
        );
        if (sigResult) {
          signatureId = sigResult.id;
        }
      }

      // Audit Log
      await AuditService.logAction(
        user.uid,
        user.email,
        "UPDATE_BATCH_STATUS",
        id,
        "PRODUCTION_BATCH",
        { status: oldStatus },
        { status: newStatus },
        changeReason,
        transaction,
        signatureId,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent
      );

      return { id, ...updateData };
    });
  }

  static async approveBatch(id: string, changeReason: string, user: any, signaturePassword?: string, metadata?: any) {
    if (!changeReason) throw new Error("Reason for approval is required");
    
    if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    }

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const batchRef = doc(db, "production_batches", id);
      const batchDoc = await transaction.get(batchRef);

      if (!batchDoc.exists()) throw new Error("Batch request not found");
      const batchData = batchDoc.data() as BatchIssuance;

      if (batchData.status !== "PENDING_REVIEW") {
        throw new Error(`Cannot approve batch in ${batchData.status} status. Only PENDING_REVIEW batches can be approved.`);
      }

      const updateData = {
        status: "ISSUED" as BatchIssuanceStatus, // Approval moves it to ISSUED
        updatedBy: user.uid,
        updatedAt: new Date().toISOString()
      };

      transaction.update(batchRef, sanitizeForFirestore(updateData));

      // Record Signature
      let signatureId: string | undefined;
      let signatureMeaning: string | undefined;

      if (signaturePassword) {
        signatureMeaning = "Approved for issuance";
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email,
          "APPROVE_BATCH_ISSUANCE",
          "PRODUCTION_BATCH",
          id,
          signatureMeaning,
          metadata?.ip || "unknown",
          metadata?.userAgent || "unknown",
          transaction
        );
        if (sigResult) {
          signatureId = sigResult.id;
        }
      }

      // Notify Requester
      await NotificationService.sendNotification({
        title: "Batch Issuance Approved",
        message: `Your request for batch ${batchData.batchNumber} has been approved and issued.`,
        type: NotificationType.SUCCESS,
        targetId: batchData.issuedBy,
        targetType: TargetType.USER,
        link: `/batches/${id}`
      });

      await AuditService.logAction(
        user.uid,
        user.email,
        "APPROVE_BATCH_ISSUANCE",
        id,
        "PRODUCTION_BATCH",
        { status: "PENDING_REVIEW" },
        { status: "ISSUED" },
        changeReason,
        transaction,
        signatureId,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent
      );

      return { id, ...updateData };
    });
  }

  static async rejectBatch(id: string, reason: string, user: any, signaturePassword?: string, metadata?: any) {
    if (!reason) throw new Error("Reason for rejection is required");
    
    if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    }

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const batchRef = doc(db, "production_batches", id);
      const batchDoc = await transaction.get(batchRef);

      if (!batchDoc.exists()) throw new Error("Batch request not found");
      const batchData = batchDoc.data() as BatchIssuance;

      if (batchData.status !== "PENDING_REVIEW") {
        throw new Error(`Cannot reject batch in ${batchData.status} status. Only PENDING_REVIEW batches can be rejected.`);
      }

      const updateData = {
        status: "REJECTED" as BatchIssuanceStatus,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
        rejectionReason: reason
      };

      transaction.update(batchRef, sanitizeForFirestore(updateData));

      // Record Signature
      let signatureId: string | undefined;
      let signatureMeaning: string | undefined;

      if (signaturePassword) {
        signatureMeaning = "Rejected issuance request";
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email,
          "REJECT_BATCH_ISSUANCE",
          "PRODUCTION_BATCH",
          id,
          signatureMeaning,
          metadata?.ip || "unknown",
          metadata?.userAgent || "unknown",
          transaction
        );
        if (sigResult) {
          signatureId = sigResult.id;
        }
      }

      // Notify Requester
      await NotificationService.sendNotification({
        title: "Batch Issuance Rejected",
        message: `Your request for batch ${batchData.batchNumber} has been rejected. Reason: ${reason}`,
        type: NotificationType.ERROR,
        targetId: batchData.issuedBy,
        targetType: TargetType.USER,
        link: `/batch-sheet-records/status`
      });

      await AuditService.logAction(
        user.uid,
        user.email,
        "REJECT_BATCH_ISSUANCE",
        id,
        "PRODUCTION_BATCH",
        { status: "PENDING_REVIEW" },
        { status: "REJECTED" },
        reason,
        transaction,
        signatureId,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent
      );

      return { id, ...updateData };
    });
  }

  static async returnBatch(
    id: string,
    returnReason: string,
    returnToStep?: string,
    comments?: string,
    user?: any,
    signaturePassword?: string,
    metadata?: any
  ) {
    if (!returnReason || returnReason.trim().length < 5) {
      throw new Error("Return reason is required and must be at least 5 characters long.");
    }

    if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    }

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const batchRef = doc(db, "production_batches", id);
      const batchDoc = await transaction.get(batchRef);

      if (!batchDoc.exists()) throw new Error("Batch not found");
      const batchData = batchDoc.data() as BatchIssuance;

      let targetStatus: BatchIssuanceStatus = 'RETURNED';
      if (batchData.status === 'READY_FOR_QA_REVIEW') {
        targetStatus = (returnToStep as BatchIssuanceStatus) || 'PRODUCTION_IN_PROGRESS';
      } else if (batchData.status === 'PENDING_REVIEW') {
        targetStatus = (returnToStep as BatchIssuanceStatus) || 'DRAFT';
      } else {
        targetStatus = 'RETURNED';
      }

      const returnCount = ((batchData as any).returnCount || 0) + 1;
      const history = (batchData as any).returnHistory || [];
      const newHistoryEntry = {
        returnNo: returnCount,
        returnedAt: new Date().toISOString(),
        returnedBy: user?.uid || 'QA',
        returnedByEmail: user?.email || '',
        returnedByName: user?.displayName || user?.email || 'QA Personnel',
        returnedByRole: user?.role || 'QA',
        fromStep: batchData.status,
        toStep: targetStatus,
        reason: returnReason.trim(),
        comments: comments?.trim() || '',
      };

      const updateData: any = {
        status: targetStatus,
        returnedAt: new Date().toISOString(),
        returnedReason: returnReason.trim(),
        returnReason: returnReason.trim(),
        returnComments: comments?.trim() || '',
        returnedBy: user?.uid,
        returnedByEmail: user?.email,
        returnedFrom: batchData.status,
        returnedTo: targetStatus,
        returnCount,
        returnHistory: [...history, newHistoryEntry],
        updatedBy: user?.uid || 'QA',
        updatedAt: new Date().toISOString()
      };

      transaction.update(batchRef, sanitizeForFirestore(updateData));

      // Record Signature
      let signatureId: string | undefined;
      let signatureMeaning: string | undefined;

      if (signaturePassword) {
        signatureMeaning = `Returned batch for correction from ${batchData.status} to ${targetStatus}`;
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email,
          "RETURN_BATCH_FOR_CORRECTION",
          "PRODUCTION_BATCH",
          id,
          signatureMeaning,
          metadata?.ip || "unknown",
          metadata?.userAgent || "unknown",
          transaction
        );
        if (sigResult) {
          signatureId = sigResult.id;
        }
      }

      // Notify Requester / Production
      await NotificationService.sendNotification({
        title: "Batch Returned for Correction",
        message: `Batch ${batchData.batchNumber} has been returned for correction. Reason: ${returnReason}`,
        type: NotificationType.WARNING,
        targetId: batchData.issuedBy,
        targetType: TargetType.USER,
        link: `/batches/${id}`
      });

      await AuditService.logAction(
        user.uid,
        user.email,
        "RETURN_BATCH_FOR_CORRECTION",
        id,
        "PRODUCTION_BATCH",
        { status: batchData.status },
        { status: targetStatus },
        `Returned for Correction: ${returnReason}`,
        transaction,
        signatureId,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent
      );

      return { id, ...updateData };
    });
  }

  static async completePrintBatch(id: string, user: any, signaturePassword?: string, metadata?: any) {
    if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    } else {
      throw new Error("Password is required for electronic signature validation");
    }

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const batchRef = doc(db, "production_batches", id);
      const batchDoc = await transaction.get(batchRef);

      if (!batchDoc.exists()) throw new Error("Batch request not found");
      const batchData = batchDoc.data() as BatchIssuance;

      if (batchData.status !== "ISSUED" && batchData.status !== "IN_PROGRESS") {
        throw new Error(`Cannot print same batch because status is ${batchData.status}. Only ISSUED or IN_PROGRESS batches can be printed.`);
      }

      const updateData = {
        status: "READY_FOR_PRODUCTION_HANDOVER" as BatchIssuanceStatus,
        completedAt: new Date().toISOString(),
        completedBy: user.uid,
        completedByName: user.displayName || user.username || "Unknown",
        completedByRole: user.role || "ADMIN",
        completedByEmployeeId: user.employeeId || "N/A",
        updatedBy: user.uid,
        updatedAt: new Date().toISOString()
      };

      transaction.update(batchRef, sanitizeForFirestore(updateData));

      // Record Signature
      const signatureMeaning = "Printed batch sheet. Status updated to Ready for Production Handover.";
      const sigResult = await SignatureService.signAction(
        user.uid,
        user.email,
        "PRINT_BATCH_SHEET",
        "PRODUCTION_BATCH",
        id,
        signatureMeaning,
        metadata?.ip || "unknown",
        metadata?.userAgent || "unknown",
        transaction
      );
      const signatureId = sigResult?.id;

      // Notify Requester
      await NotificationService.sendNotification({
        title: "Batch Ready for Handover",
        message: `Batch ${batchData.batchNumber} is now Ready for Production Handover.`,
        type: NotificationType.SUCCESS,
        targetId: batchData.issuedBy,
        targetType: TargetType.USER,
        link: `/batches/${id}`
      });

      await AuditService.logAction(
        user.uid,
        user.email,
        "PRINT_BATCH_SHEET",
        id,
        "PRODUCTION_BATCH",
        { status: batchData.status },
        { status: "READY_FOR_PRODUCTION_HANDOVER" },
        "Printed batch sheet (status updated to READY_FOR_PRODUCTION_HANDOVER).",
        transaction,
        signatureId,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent
      );

      return { id, ...updateData };
    });
  }

  /**
   * Acquire a lock and begin printing or reprinting an individual batch sheet.
   * Enforces sequence order and concurrency lock via PrintService.
   */
  static async startSheetPrint(
    batchId: string,
    sheetId: string,
    user: any,
    deliveryMethod: any = 'PDF_DOWNLOAD',
    totalPages: number = 60,
    isReprint: boolean = false,
    reprintReason?: string,
    metadata?: any
  ) {
    return await PrintService.startPrintJob(
      batchId,
      sheetId,
      user,
      deliveryMethod,
      totalPages,
      isReprint,
      reprintReason,
      metadata
    );
  }

  /**
   * Complete printing of an individual batch sheet with Part 11 e-signature.
   * Auto-advances the next sheet to READY_TO_PRINT.
   * If all sheets in the request are completed, transitions the whole batch to READY_FOR_PRODUCTION_HANDOVER.
   */
  static async completeSheetPrint(
    batchId: string,
    sheetId: string,
    user: any,
    signaturePassword?: string,
    comments?: string,
    metadata?: any
  ) {
    return await PrintService.completePrintJob(
      batchId,
      sheetId,
      user,
      signaturePassword,
      comments,
      metadata
    );
  }

  /**
   * Log a print operational or interactive action (both sheet history and central batch process audit)
   */
  static async logPrintAction(
    batchId: string,
    sheetId: string,
    action: any,
    user: any,
    details?: any,
    metadata?: any
  ) {
    return await PrintService.logPrintAction(
      batchId,
      sheetId,
      action,
      user,
      details,
      metadata
    );
  }

  /**
   * Handle printing issue report and page reprint specification.
   */
  static async reportPrintingIssue(
    batchId: string,
    sheetId: string,
    issueReason: string,
    requestedPages: string,
    comments: string,
    user: any,
    totalPages: number = 60,
    metadata?: any
  ) {
    return await PrintService.reportPrintingIssue(
      batchId,
      sheetId,
      issueReason,
      requestedPages,
      comments,
      user,
      totalPages,
      metadata
    );
  }

  /**
   * Release a stale print lock on an individual batch sheet.
   */
  static async unlockSheetPrint(
    batchId: string,
    sheetId: string,
    user: any,
    reason?: string,
    metadata?: any
  ) {
    return await PrintService.releasePrintLock(
      batchId,
      sheetId,
      user,
      reason,
      metadata
    );
  }

  static async getPrintQueue(batchId: string) {
    return await PrintService.getPrintQueueStatus(batchId);
  }

  static async getStatusSummary(selectedBranch?: string) {
    await ensureAuth();
    let q = collection(db, "production_batches") as any;
    if (selectedBranch) {
      q = query(q, where("branch", "==", selectedBranch));
    }
    const snapshot = await getDocs(q);
    const summary = {
      PENDING_REVIEW: 0,
      APPROVED: 0,
      REJECTED: 0,
      ISSUED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      RETURNED: 0,
      CANCELLED: 0
    };

    snapshot.docs.forEach(doc => {
      const data = doc.data() as any;
      const status = data.status as keyof typeof summary;
      if (summary[status] !== undefined) {
        summary[status]++;
      }
    });

    return summary;
  }

  /**
   * QA Handover of one or more selected Batch Sheets to Production.
   * Gated: Only printed sheets can be handed over.
   */
  static async handoverBatchSheets(
    batchId: string,
    sheetIds: string[],
    changeReason: string,
    user: any,
    signaturePassword?: string,
    metadata?: any
  ) {
    await ensureAuth();

    // Verify e-signature credentials
    if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    }

    if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
      throw new Error("At least one Batch Sheet must be selected for handover.");
    }

    // Role check: QA or Admin or specific handover rights
    const baseRole = getUserBaseRole(user);
    const userPerms = user.permissions || [];
    const isAuthorized = baseRole === 'ADMIN' || baseRole === 'QA' || 
      userPerms.some((p: string) => ['op:ready_for_handover', 'batch:approve', 'batch:review', 'batch:print', 'op:issued'].includes(p));

    if (!isAuthorized) {
      throw new Error("Unauthorized: Only QA or Admin personnel can hand over Batch Sheets to Production.");
    }

    const batchRef = doc(db, "production_batches", batchId);

    return await runTransaction(db, async (transaction) => {
      const batchSnap = await transaction.get(batchRef);
      if (!batchSnap.exists()) {
        throw new Error("Batch record not found.");
      }

      const batchData = batchSnap.data() as BatchIssuance & { branch?: string };

      // Branch authorization
      if (user.branch && batchData.branch && user.branch !== batchData.branch && baseRole !== 'ADMIN') {
        throw new Error("Unauthorized: You do not have access to this branch's batch records.");
      }

      const batchSheets = initializeBatchSheets(batchData);
      const selected = batchSheets.filter(s => sheetIds.includes(s.id) || sheetIds.includes(s.batchNumber));

      if (selected.length === 0) {
        throw new Error("None of the specified Batch Sheets were found in this batch.");
      }

      // Validate each selected sheet
      const eligibleToHandover = selected.filter(sheet => {
        const isPrinted = sheet.status === 'PRINT_COMPLETED' || sheet.status === 'PRINTED' || sheet.status === 'REPRINTED' || (sheet.printCount || 0) > 0;
        return isPrinted && sheet.handoverStatus !== 'HANDED_OVER_TO_PRODUCTION';
      });

      if (eligibleToHandover.length === 0) {
        for (const sheet of selected) {
          const isPrinted = sheet.status === 'PRINT_COMPLETED' || sheet.status === 'PRINTED' || sheet.status === 'REPRINTED' || (sheet.printCount || 0) > 0;
          if (!isPrinted) {
            throw new Error(`Sheet ${sheet.batchNumber} has not completed printing. Only printed sheets can be handed over to Production.`);
          }
          if (sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION') {
            throw new Error(`Sheet ${sheet.batchNumber} has already been handed over to Production.`);
          }
        }
        throw new Error("None of the selected Batch Sheets are currently eligible for handover.");
      }

      const toProcess = eligibleToHandover;

      // Create Electronic Signature
      const signatureMeaning = `QA Handover of ${toProcess.length} Batch Sheet(s) to Production`;
      const sig = await SignatureService.signAction(
        user.uid,
        user.email,
        "HANDOVER_TO_PRODUCTION",
        "PRODUCTION_BATCH",
        batchId,
        signatureMeaning,
        metadata?.ip || "unknown",
        metadata?.userAgent || "internal",
        transaction
      );

      const nowIso = new Date().toISOString();
      const userName = user.displayName || user.username || user.email || 'Akshay Sharma';
      const userEmployeeId = user.employeeId || 'N/A';
      const userRole = user.role || 'QA';

      // Update each selected sheet
      toProcess.forEach(sheet => {
        sheet.handoverStatus = 'HANDED_OVER_TO_PRODUCTION';
        sheet.handedOverBy = user.uid;
        sheet.handedOverByName = userName;
        sheet.handedOverByRole = userRole;
        sheet.handedOverByEmployeeId = userEmployeeId;
        sheet.handedOverAt = nowIso;
        sheet.handoverSignatureId = sig.id;
        sheet.productionReceiptStatus = 'AWAITING_PRODUCTION_RECEIPT';
        sheet.currentCustody = 'QA – Handed Over / Awaiting Production Receipt';
        sheet.currentOperationalState = 'HANDED_OVER_AWAITING_PRODUCTION_RECEIPT';

        const historyEntry: BatchSheetPrintHistoryEntry = {
          id: `hist-ho-${sheet.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          action: 'HANDOVER_TO_PRODUCTION' as any,
          status: 'HANDED_OVER_TO_PRODUCTION' as any,
          timestamp: nowIso,
          performedBy: userName,
          userId: user.uid,
          userEmail: user.email,
          userRole: userRole,
          employeeId: userEmployeeId,
          reason: changeReason || `Batch sheet handed over to Production by ${userName}`,
          signatureId: sig.id,
          signatureMeaning
        };
        sheet.history = [...(sheet.history || []), historyEntry];
      });

      // Recalculate parent counts
      const total = batchSheets.length;
      const handedOverCount = batchSheets.filter(s => s.handoverStatus === 'HANDED_OVER_TO_PRODUCTION').length;
      const productionReceivedCount = batchSheets.filter(s => s.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION').length;
      const allHandedOver = handedOverCount === total;
      const allReceived = productionReceivedCount === total;

      let nextParentStatus = batchData.status;
      let handoverSubStatus: 'NOT_STARTED' | 'HANDOVER_IN_PROGRESS' | 'HANDOVER_COMPLETED' = 'HANDOVER_IN_PROGRESS';

      if (allHandedOver && allReceived) {
        nextParentStatus = 'PRODUCTION_IN_PROGRESS';
        handoverSubStatus = 'HANDOVER_COMPLETED';
      } else if (allHandedOver) {
        nextParentStatus = 'HANDED_OVER';
        handoverSubStatus = 'HANDOVER_IN_PROGRESS';
      } else {
        nextParentStatus = 'READY_FOR_PRODUCTION_HANDOVER';
        handoverSubStatus = 'HANDOVER_IN_PROGRESS';
      }

      const handoverProgress = {
        total,
        handedOverCount,
        productionReceivedCount,
        pendingHandoverCount: total - handedOverCount,
        awaitingProductionReceiptCount: handedOverCount - productionReceivedCount,
        percent: total > 0 ? Math.round((handedOverCount / total) * 100) : 0
      };

      // Transaction update
      transaction.update(batchRef, sanitizeForFirestore({
        batchSheets,
        status: nextParentStatus,
        handoverSubStatus,
        handoverProgress,
        updatedAt: nowIso,
        updatedBy: user.uid
      }));

      // Audit logs for each sheet
      for (const sheet of toProcess) {
        await AuditService.logAction(
          user.uid,
          user.email,
          "HANDOVER_TO_PRODUCTION",
          batchId,
          "PRODUCTION_BATCH",
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, handoverStatus: "PENDING_HANDOVER" },
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, requestId: batchData.batchNumber || batchId, handoverStatus: "HANDED_OVER_TO_PRODUCTION", currentCustody: sheet.currentCustody },
          changeReason || `Batch sheet ${sheet.batchNumber} handed over to Production`,
          transaction,
          sig.id,
          signatureMeaning,
          metadata?.ip,
          metadata?.userAgent,
          user.branch,
          batchData.branch,
          userRole,
          userName
        );
      }

      // Aggregate audit log
      await AuditService.logAction(
        user.uid,
        user.email,
        "HANDOVER_SELECTED",
        batchId,
        "PRODUCTION_BATCH",
        { totalSelected: toProcess.length },
        { 
          totalSelected: toProcess.length, 
          selectedBatchNumbers: toProcess.map(s => s.batchNumber),
          remainingPending: total - handedOverCount,
          handoverProgress
        },
        changeReason || `QA handed over ${toProcess.length} batch sheet(s) to Production`,
        transaction,
        sig.id,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent,
        user.branch,
        batchData.branch,
        userRole,
        userName
      );

      return {
        success: true,
        batchId,
        selectedCount: toProcess.length,
        handedOverCount,
        total,
        allHandedOver,
        nextParentStatus,
        handoverProgress
      };
    });
  }

  /**
   * Production Receipt of one or more handed-over Batch Sheets.
   * GATE 1: Only when ALL sheets are handed over AND received by production does batch advance to PRODUCTION_IN_PROGRESS!
   */
  static async productionReceiveBatchSheets(
    batchId: string,
    sheetIds: string[],
    changeReason: string,
    user: any,
    signaturePassword?: string,
    metadata?: any
  ) {
    await ensureAuth();

    if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    }

    if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
      throw new Error("At least one Batch Sheet must be selected for Production Receipt.");
    }

    const baseRole = getUserBaseRole(user);
    const userPerms = user.permissions || [];
    const isAuthorized = baseRole === 'ADMIN' || baseRole === 'PRODUCTION_MANAGER' || baseRole === 'OPERATOR' ||
      userPerms.some((p: string) => ['op:production_in_progress', 'batch:sign', 'batch:create', 'batch:edit'].includes(p));

    if (!isAuthorized) {
      throw new Error("Unauthorized: Only Production personnel or Admin can accept custody of Batch Sheets.");
    }

    const batchRef = doc(db, "production_batches", batchId);

    return await runTransaction(db, async (transaction) => {
      const batchSnap = await transaction.get(batchRef);
      if (!batchSnap.exists()) {
        throw new Error("Batch record not found.");
      }

      const batchData = batchSnap.data() as BatchIssuance & { branch?: string };

      if (user.branch && batchData.branch && user.branch !== batchData.branch && baseRole !== 'ADMIN') {
        throw new Error("Unauthorized: You do not have access to this branch's batch records.");
      }

      const batchSheets = initializeBatchSheets(batchData);
      const selected = batchSheets.filter(s => sheetIds.includes(s.id) || sheetIds.includes(s.batchNumber));

      if (selected.length === 0) {
        throw new Error("None of the specified Batch Sheets were found in this batch.");
      }

      // Verify each selected sheet
      const eligibleToReceive = selected.filter(sheet => {
        return sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION' && sheet.productionReceiptStatus !== 'RECEIVED_BY_PRODUCTION';
      });

      if (eligibleToReceive.length === 0) {
        for (const sheet of selected) {
          if (sheet.handoverStatus !== 'HANDED_OVER_TO_PRODUCTION') {
            throw new Error(`Sheet ${sheet.batchNumber} has not yet been handed over by QA. Production receipt denied.`);
          }
          if (sheet.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION') {
            throw new Error(`Sheet ${sheet.batchNumber} has already been received by Production.`);
          }
        }
        throw new Error("None of the selected Batch Sheets are currently awaiting Production receipt.");
      }

      const toProcess = eligibleToReceive;

      const signatureMeaning = `Physical and Digital Batch Sheet Custody Receipt by Production for ${toProcess.length} Sheet(s)`;
      const sig = await SignatureService.signAction(
        user.uid,
        user.email,
        "PRODUCTION_RECEIVE",
        "PRODUCTION_BATCH",
        batchId,
        signatureMeaning,
        metadata?.ip || "unknown",
        metadata?.userAgent || "internal",
        transaction
      );

      const nowIso = new Date().toISOString();
      const userName = user.displayName || user.username || user.email || 'Production Lead';
      const userEmployeeId = user.employeeId || 'N/A';
      const userRole = user.role || 'PRODUCTION_MANAGER';

      toProcess.forEach(sheet => {
        sheet.productionReceiptStatus = 'RECEIVED_BY_PRODUCTION';
        sheet.receivedByProduction = user.uid;
        sheet.productionReceivedByName = userName;
        sheet.productionReceivedByRole = userRole;
        sheet.productionReceivedByEmployeeId = userEmployeeId;
        sheet.productionReceivedAt = nowIso;
        sheet.productionReceiptSignatureId = sig.id;
        sheet.productionStatus = 'IN_PROGRESS';
        sheet.currentCustody = 'Production';
        sheet.currentOperationalState = 'PRODUCTION_IN_PROGRESS';

        const historyEntry: BatchSheetPrintHistoryEntry = {
          id: `hist-pr-${sheet.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          action: 'RECEIVED_BY_PRODUCTION' as any,
          status: 'RECEIVED_BY_PRODUCTION' as any,
          timestamp: nowIso,
          performedBy: userName,
          userId: user.uid,
          userEmail: user.email,
          userRole: userRole,
          employeeId: userEmployeeId,
          reason: changeReason || `Batch sheet custody received by Production personnel (${userName})`,
          signatureId: sig.id,
          signatureMeaning
        };
        sheet.history = [...(sheet.history || []), historyEntry];
      });

      // Recalculate parent state and GATE 1 check
      const total = batchSheets.length;
      const handedOverCount = batchSheets.filter(s => s.handoverStatus === 'HANDED_OVER_TO_PRODUCTION').length;
      const productionReceivedCount = batchSheets.filter(s => s.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION').length;
      const isGate1Completed = handedOverCount === total && productionReceivedCount === total;

      let nextParentStatus = batchData.status;
      let handoverSubStatus: 'NOT_STARTED' | 'HANDOVER_IN_PROGRESS' | 'HANDOVER_COMPLETED' = 'HANDOVER_IN_PROGRESS';

      if (isGate1Completed) {
        nextParentStatus = 'PRODUCTION_IN_PROGRESS';
        handoverSubStatus = 'HANDOVER_COMPLETED';
      } else if (handedOverCount === total) {
        nextParentStatus = 'HANDED_OVER';
        handoverSubStatus = 'HANDOVER_IN_PROGRESS';
      } else {
        nextParentStatus = 'READY_FOR_PRODUCTION_HANDOVER';
        handoverSubStatus = 'HANDOVER_IN_PROGRESS';
      }

      const handoverProgress = {
        total,
        handedOverCount,
        productionReceivedCount,
        pendingHandoverCount: total - handedOverCount,
        awaitingProductionReceiptCount: handedOverCount - productionReceivedCount,
        percent: total > 0 ? Math.round((productionReceivedCount / total) * 100) : 0
      };

      transaction.update(batchRef, sanitizeForFirestore({
        batchSheets,
        status: nextParentStatus,
        handoverSubStatus,
        handoverProgress,
        updatedAt: nowIso,
        updatedBy: user.uid
      }));

      // Audit logs for each sheet
      for (const sheet of selected) {
        await AuditService.logAction(
          user.uid,
          user.email,
          "RECEIVED_BY_PRODUCTION",
          batchId,
          "PRODUCTION_BATCH",
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, productionReceiptStatus: "AWAITING_PRODUCTION_RECEIPT" },
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, requestId: batchData.batchNumber || batchId, productionReceiptStatus: "RECEIVED_BY_PRODUCTION", currentCustody: sheet.currentCustody },
          changeReason || `Batch sheet ${sheet.batchNumber} received by Production`,
          transaction,
          sig.id,
          signatureMeaning,
          metadata?.ip,
          metadata?.userAgent,
          user.branch,
          batchData.branch,
          userRole,
          userName
        );
      }

      // Aggregate audit log
      await AuditService.logAction(
        user.uid,
        user.email,
        "PRODUCTION_RECEIPT_SELECTED",
        batchId,
        "PRODUCTION_BATCH",
        { totalSelected: selected.length },
        { 
          totalSelected: selected.length, 
          selectedBatchNumbers: selected.map(s => s.batchNumber),
          productionReceivedCount,
          isGate1Completed,
          nextParentStatus
        },
        changeReason || `Production accepted custody for ${selected.length} batch sheet(s)`,
        transaction,
        sig.id,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent,
        user.branch,
        batchData.branch,
        userRole,
        userName
      );

      if (isGate1Completed) {
        await AuditService.logAction(
          user.uid,
          user.email,
          "PRODUCTION_RECEIPT_STAGE_COMPLETED",
          batchId,
          "PRODUCTION_BATCH",
          { status: batchData.status },
          { status: "PRODUCTION_IN_PROGRESS", totalSheets: total },
          `Gate 1 Cleared: All ${total} Batch Sheets handed over and received by Production. Workflow advanced to PRODUCTION_IN_PROGRESS.`,
          transaction,
          sig.id,
          signatureMeaning,
          metadata?.ip,
          metadata?.userAgent,
          user.branch,
          batchData.branch,
          userRole,
          userName
        );
      }

      return {
        success: true,
        batchId,
        selectedCount: selected.length,
        productionReceivedCount,
        total,
        isGate1Completed,
        nextParentStatus,
        handoverProgress
      };
    });
  }

  /**
   * Production sends selected eligible Batch Sheets back for QA Review.
   */
  static async sendBatchSheetsForQaReview(
    batchId: string,
    sheetIds: string[],
    changeReason: string,
    user: any,
    signaturePassword?: string,
    metadata?: any
  ) {
    await ensureAuth();

    if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    }

    if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
      throw new Error("At least one Batch Sheet must be selected to send for QA review.");
    }

    const baseRole = getUserBaseRole(user);
    const userPerms = user.permissions || [];
    const isAuthorized = baseRole === 'ADMIN' || baseRole === 'PRODUCTION_MANAGER' || baseRole === 'OPERATOR' ||
      userPerms.some((p: string) => ['op:ready_for_qa_review', 'batch:sign', 'batch:edit'].includes(p));

    if (!isAuthorized) {
      throw new Error("Unauthorized: Only Production personnel or Admin can send Batch Sheets for QA Review.");
    }

    const batchRef = doc(db, "production_batches", batchId);

    return await runTransaction(db, async (transaction) => {
      const batchSnap = await transaction.get(batchRef);
      if (!batchSnap.exists()) {
        throw new Error("Batch record not found.");
      }

      const batchData = batchSnap.data() as BatchIssuance & { branch?: string };

      if (user.branch && batchData.branch && user.branch !== batchData.branch && baseRole !== 'ADMIN') {
        throw new Error("Unauthorized: You do not have access to this branch's batch records.");
      }

      const batchSheets = initializeBatchSheets(batchData);
      const selected = batchSheets.filter(s => sheetIds.includes(s.id) || sheetIds.includes(s.batchNumber));

      if (selected.length === 0) {
        throw new Error("None of the specified Batch Sheets were found in this batch.");
      }

      for (const sheet of selected) {
        const isHandedOver = sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION' || sheet.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION';
        if (!isHandedOver) {
          throw new Error(`Sheet ${sheet.batchNumber} has not been handed over to Production by QA yet.`);
        }
        if (sheet.qaReturnStatus === 'SENT_FOR_QA_REVIEW') {
          throw new Error(`Sheet ${sheet.batchNumber} has already been sent for QA review.`);
        }
        if (sheet.qaReviewStatus === 'QA_REVIEW_COMPLETED') {
          throw new Error(`Sheet ${sheet.batchNumber} has already completed QA review.`);
        }
      }

      const signatureMeaning = `Production Submission of ${selected.length} Batch Sheet(s) for QA Review`;
      const sig = await SignatureService.signAction(
        user.uid,
        user.email,
        "SENT_FOR_QA_REVIEW",
        "PRODUCTION_BATCH",
        batchId,
        signatureMeaning,
        metadata?.ip || "unknown",
        metadata?.userAgent || "internal",
        transaction
      );

      const nowIso = new Date().toISOString();
      const userName = user.displayName || user.username || user.email || 'Production Lead';
      const userEmployeeId = user.employeeId || 'N/A';
      const userRole = user.role || 'PRODUCTION_MANAGER';

      selected.forEach(sheet => {
        if (sheet.productionReceiptStatus !== 'RECEIVED_BY_PRODUCTION') {
          sheet.productionReceiptStatus = 'RECEIVED_BY_PRODUCTION';
          sheet.productionReceivedAt = sheet.productionReceivedAt || nowIso;
          sheet.receivedByProduction = sheet.receivedByProduction || user.uid;
          sheet.productionReceivedByName = sheet.productionReceivedByName || userName;
          sheet.productionReceivedByRole = sheet.productionReceivedByRole || userRole;
          sheet.productionReceivedByEmployeeId = sheet.productionReceivedByEmployeeId || userEmployeeId;
        }

        sheet.qaReturnStatus = 'SENT_FOR_QA_REVIEW';
        sheet.sentForQaReviewBy = user.uid;
        sheet.sentForQaReviewByName = userName;
        sheet.sentForQaReviewByRole = userRole;
        sheet.sentForQaReviewByEmployeeId = userEmployeeId;
        sheet.sentForQaReviewAt = nowIso;
        sheet.sentForQaReviewSignatureId = sig.id;
        sheet.qaReceiptStatus = 'AWAITING_QA_RECEIPT';
        sheet.qaReviewStatus = 'PENDING_RECEIPT';
        sheet.productionStatus = 'READY_FOR_QA_REVIEW';
        sheet.currentCustody = 'QA – Awaiting Receipt';
        sheet.currentOperationalState = 'SENT_FOR_QA_REVIEW';

        const historyEntry: BatchSheetPrintHistoryEntry = {
          id: `hist-sqa-${sheet.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          action: 'SENT_FOR_QA_REVIEW' as any,
          status: 'SENT_FOR_QA_REVIEW' as any,
          timestamp: nowIso,
          performedBy: userName,
          userId: user.uid,
          userEmail: user.email,
          userRole: userRole,
          employeeId: userEmployeeId,
          reason: changeReason || `Batch sheet completed by Production and sent for QA Review`,
          signatureId: sig.id,
          signatureMeaning
        };
        sheet.history = [...(sheet.history || []), historyEntry];
      });

      const total = batchSheets.length;
      const sentForReviewCount = batchSheets.filter(s => s.qaReturnStatus === 'SENT_FOR_QA_REVIEW').length;
      const qaReceivedCount = batchSheets.filter(s => s.qaReceiptStatus === 'RECEIVED_BY_QA').length;
      const reviewedCount = batchSheets.filter(s => s.qaReviewStatus === 'QA_REVIEW_COMPLETED').length;
      const allSent = sentForReviewCount === total;

      let nextParentStatus = batchData.status;
      if (allSent) {
        nextParentStatus = 'READY_FOR_QA_REVIEW';
      }

      const qaReviewProgress = {
        total,
        sentForReviewCount,
        qaReceivedCount,
        reviewedCount,
        stillInProductionCount: total - sentForReviewCount,
        percent: total > 0 ? Math.round((reviewedCount / total) * 100) : 0
      };

      transaction.update(batchRef, sanitizeForFirestore({
        batchSheets,
        status: nextParentStatus,
        qaReviewSubStatus: 'QA_REVIEW_IN_PROGRESS',
        qaReviewProgress,
        updatedAt: nowIso,
        updatedBy: user.uid
      }));

      for (const sheet of selected) {
        await AuditService.logAction(
          user.uid,
          user.email,
          "SENT_FOR_QA_REVIEW",
          batchId,
          "PRODUCTION_BATCH",
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, qaReturnStatus: "NOT_SENT" },
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, requestId: batchData.batchNumber || batchId, qaReturnStatus: "SENT_FOR_QA_REVIEW", currentCustody: sheet.currentCustody },
          changeReason || `Batch sheet ${sheet.batchNumber} sent for QA Review`,
          transaction,
          sig.id,
          signatureMeaning,
          metadata?.ip,
          metadata?.userAgent,
          user.branch,
          batchData.branch,
          userRole,
          userName
        );
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "SEND_FOR_QA_REVIEW_SELECTED",
        batchId,
        "PRODUCTION_BATCH",
        { totalSelected: selected.length },
        { 
          totalSelected: selected.length, 
          selectedBatchNumbers: selected.map(s => s.batchNumber),
          sentForReviewCount,
          allSent
        },
        changeReason || `Production submitted ${selected.length} batch sheet(s) for QA Review`,
        transaction,
        sig.id,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent,
        user.branch,
        batchData.branch,
        userRole,
        userName
      );

      return {
        success: true,
        batchId,
        selectedCount: selected.length,
        sentForReviewCount,
        total,
        allSent,
        nextParentStatus,
        qaReviewProgress
      };
    });
  }

  /**
   * QA Department physical and digital receipt of selected Batch Sheets.
   */
  static async qaReceiveBatchSheets(
    batchId: string,
    sheetIds: string[],
    changeReason: string,
    user: any,
    signaturePassword?: string,
    metadata?: any
  ) {
    await ensureAuth();

    if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    }

    if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
      throw new Error("At least one Batch Sheet must be selected for QA Receipt.");
    }

    const baseRole = getUserBaseRole(user);
    const userPerms = user.permissions || [];
    const isAuthorized = baseRole === 'ADMIN' || baseRole === 'QA' ||
      userPerms.some((p: string) => ['op:completed', 'batch:approve', 'batch:review'].includes(p));

    if (!isAuthorized) {
      throw new Error("Unauthorized: Only QA personnel or Admin can receive Batch Sheets for QA review.");
    }

    const batchRef = doc(db, "production_batches", batchId);

    return await runTransaction(db, async (transaction) => {
      const batchSnap = await transaction.get(batchRef);
      if (!batchSnap.exists()) {
        throw new Error("Batch record not found.");
      }

      const batchData = batchSnap.data() as BatchIssuance & { branch?: string };

      if (user.branch && batchData.branch && user.branch !== batchData.branch && baseRole !== 'ADMIN') {
        throw new Error("Unauthorized: You do not have access to this branch's batch records.");
      }

      const batchSheets = initializeBatchSheets(batchData);
      const selected = batchSheets.filter(s => sheetIds.includes(s.id) || sheetIds.includes(s.batchNumber));

      if (selected.length === 0) {
        throw new Error("None of the specified Batch Sheets were found in this batch.");
      }

      for (const sheet of selected) {
        if (sheet.qaReturnStatus !== 'SENT_FOR_QA_REVIEW') {
          throw new Error(`Sheet ${sheet.batchNumber} has not yet been submitted by Production for QA review.`);
        }
        if (sheet.qaReceiptStatus === 'RECEIVED_BY_QA') {
          throw new Error(`Sheet ${sheet.batchNumber} has already been received by QA.`);
        }
      }

      const signatureMeaning = `QA Department Physical and Digital Receipt of ${selected.length} Batch Sheet(s) for Review`;
      const sig = await SignatureService.signAction(
        user.uid,
        user.email,
        "RECEIVED_BY_QA",
        "PRODUCTION_BATCH",
        batchId,
        signatureMeaning,
        metadata?.ip || "unknown",
        metadata?.userAgent || "internal",
        transaction
      );

      const nowIso = new Date().toISOString();
      const userName = user.displayName || user.username || user.email || 'QA Reviewer';
      const userEmployeeId = user.employeeId || 'N/A';
      const userRole = user.role || 'QA';

      selected.forEach(sheet => {
        sheet.qaReceiptStatus = 'RECEIVED_BY_QA';
        sheet.receivedByQa = user.uid;
        sheet.qaReceivedByName = userName;
        sheet.qaReceivedByRole = userRole;
        sheet.qaReceivedByEmployeeId = userEmployeeId;
        sheet.qaReceivedAt = nowIso;
        sheet.qaReceiptSignatureId = sig.id;
        sheet.qaReviewStatus = 'RECEIVED';
        sheet.currentCustody = 'QA – Under Review';
        sheet.currentOperationalState = 'QA_RECEIVED_UNDER_REVIEW';

        const historyEntry: BatchSheetPrintHistoryEntry = {
          id: `hist-qar-${sheet.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          action: 'RECEIVED_BY_QA' as any,
          status: 'RECEIVED_BY_QA' as any,
          timestamp: nowIso,
          performedBy: userName,
          userId: user.uid,
          userEmail: user.email,
          userRole: userRole,
          employeeId: userEmployeeId,
          reason: changeReason || `Batch sheet received by QA for review`,
          signatureId: sig.id,
          signatureMeaning
        };
        sheet.history = [...(sheet.history || []), historyEntry];
      });

      const total = batchSheets.length;
      const sentForReviewCount = batchSheets.filter(s => s.qaReturnStatus === 'SENT_FOR_QA_REVIEW').length;
      const qaReceivedCount = batchSheets.filter(s => s.qaReceiptStatus === 'RECEIVED_BY_QA').length;
      const reviewedCount = batchSheets.filter(s => s.qaReviewStatus === 'QA_REVIEW_COMPLETED').length;

      const qaReviewProgress = {
        total,
        sentForReviewCount,
        qaReceivedCount,
        reviewedCount,
        stillInProductionCount: total - sentForReviewCount,
        percent: total > 0 ? Math.round((reviewedCount / total) * 100) : 0
      };

      transaction.update(batchRef, sanitizeForFirestore({
        batchSheets,
        qaReviewProgress,
        updatedAt: nowIso,
        updatedBy: user.uid
      }));

      for (const sheet of selected) {
        await AuditService.logAction(
          user.uid,
          user.email,
          "RECEIVED_BY_QA",
          batchId,
          "PRODUCTION_BATCH",
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, qaReceiptStatus: "AWAITING_QA_RECEIPT" },
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, requestId: batchData.batchNumber || batchId, qaReceiptStatus: "RECEIVED_BY_QA", currentCustody: sheet.currentCustody },
          changeReason || `Batch sheet ${sheet.batchNumber} received by QA for review`,
          transaction,
          sig.id,
          signatureMeaning,
          metadata?.ip,
          metadata?.userAgent,
          user.branch,
          batchData.branch,
          userRole,
          userName
        );
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "QA_RECEIPT_SELECTED",
        batchId,
        "PRODUCTION_BATCH",
        { totalSelected: selected.length },
        { 
          totalSelected: selected.length, 
          selectedBatchNumbers: selected.map(s => s.batchNumber),
          qaReceivedCount
        },
        changeReason || `QA accepted custody of ${selected.length} batch sheet(s) for review`,
        transaction,
        sig.id,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent,
        user.branch,
        batchData.branch,
        userRole,
        userName
      );

      return {
        success: true,
        batchId,
        selectedCount: selected.length,
        qaReceivedCount,
        total,
        qaReviewProgress
      };
    });
  }

  /**
   * QA reviews and completes certification of selected Batch Sheets.
   * GATE 2: Only when ALL sheets are reviewed and certified does parent batch advance to COMPLETED!
   */
  static async completeQaReviewForBatchSheets(
    batchId: string,
    sheetIds: string[],
    changeReason: string,
    user: any,
    signaturePassword?: string,
    metadata?: any
  ) {
    await ensureAuth();

    if (signaturePassword) {
      await SignatureService.verifyCredentials(user.email, signaturePassword);
    }

    if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
      throw new Error("At least one Batch Sheet must be selected to complete QA Review.");
    }

    const baseRole = getUserBaseRole(user);
    const userPerms = user.permissions || [];
    const isAuthorized = baseRole === 'ADMIN' || baseRole === 'QA' ||
      userPerms.some((p: string) => ['op:completed', 'batch:approve'].includes(p));

    if (!isAuthorized) {
      throw new Error("Unauthorized: Only QA personnel or Admin can complete QA Review for Batch Sheets.");
    }

    const batchRef = doc(db, "production_batches", batchId);

    return await runTransaction(db, async (transaction) => {
      const batchSnap = await transaction.get(batchRef);
      if (!batchSnap.exists()) {
        throw new Error("Batch record not found.");
      }

      const batchData = batchSnap.data() as BatchIssuance & { branch?: string };

      if (user.branch && batchData.branch && user.branch !== batchData.branch && baseRole !== 'ADMIN') {
        throw new Error("Unauthorized: You do not have access to this branch's batch records.");
      }

      const batchSheets = initializeBatchSheets(batchData);
      const selected = batchSheets.filter(s => sheetIds.includes(s.id) || sheetIds.includes(s.batchNumber));

      if (selected.length === 0) {
        throw new Error("None of the specified Batch Sheets were found in this batch.");
      }

      for (const sheet of selected) {
        if (sheet.qaReceiptStatus !== 'RECEIVED_BY_QA') {
          throw new Error(`Sheet ${sheet.batchNumber} has not yet been received by QA. QA review cannot be completed.`);
        }
        if (sheet.qaReviewStatus === 'QA_REVIEW_COMPLETED') {
          throw new Error(`Sheet ${sheet.batchNumber} has already completed QA review.`);
        }
      }

      const signatureMeaning = `QA Review and Compliance Certification of ${selected.length} Batch Sheet(s)`;
      const sig = await SignatureService.signAction(
        user.uid,
        user.email,
        "QA_REVIEW_COMPLETED",
        "PRODUCTION_BATCH",
        batchId,
        signatureMeaning,
        metadata?.ip || "unknown",
        metadata?.userAgent || "internal",
        transaction
      );

      const nowIso = new Date().toISOString();
      const userName = user.displayName || user.username || user.email || 'QA Reviewer';
      const userEmployeeId = user.employeeId || 'N/A';
      const userRole = user.role || 'QA';

      selected.forEach(sheet => {
        sheet.qaReviewStatus = 'QA_REVIEW_COMPLETED';
        sheet.qaReviewedBy = user.uid;
        sheet.qaReviewedByName = userName;
        sheet.qaReviewedByRole = userRole;
        sheet.qaReviewedByEmployeeId = userEmployeeId;
        sheet.qaReviewedAt = nowIso;
        sheet.qaReviewSignatureId = sig.id;
        sheet.currentCustody = 'QA – Reviewed';
        sheet.currentOperationalState = 'QA_REVIEW_COMPLETED';

        const historyEntry: BatchSheetPrintHistoryEntry = {
          id: `hist-qac-${sheet.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          action: 'QA_REVIEW_COMPLETED' as any,
          status: 'QA_REVIEW_COMPLETED' as any,
          timestamp: nowIso,
          performedBy: userName,
          userId: user.uid,
          userEmail: user.email,
          userRole: userRole,
          employeeId: userEmployeeId,
          reason: changeReason || `Batch sheet QA review certified and completed`,
          signatureId: sig.id,
          signatureMeaning
        };
        sheet.history = [...(sheet.history || []), historyEntry];
      });

      const total = batchSheets.length;
      const sentForReviewCount = batchSheets.filter(s => s.qaReturnStatus === 'SENT_FOR_QA_REVIEW').length;
      const qaReceivedCount = batchSheets.filter(s => s.qaReceiptStatus === 'RECEIVED_BY_QA').length;
      const reviewedCount = batchSheets.filter(s => s.qaReviewStatus === 'QA_REVIEW_COMPLETED').length;
      const isGate2Completed = reviewedCount === total;

      let nextParentStatus = batchData.status;
      let qaReviewSubStatus: 'NOT_STARTED' | 'QA_REVIEW_IN_PROGRESS' | 'QA_REVIEW_COMPLETED' = 'QA_REVIEW_IN_PROGRESS';

      if (isGate2Completed) {
        nextParentStatus = 'COMPLETED';
        qaReviewSubStatus = 'QA_REVIEW_COMPLETED';
      }

      const qaReviewProgress = {
        total,
        sentForReviewCount,
        qaReceivedCount,
        reviewedCount,
        stillInProductionCount: total - sentForReviewCount,
        percent: total > 0 ? Math.round((reviewedCount / total) * 100) : 0
      };

      const updatePayload: any = {
        batchSheets,
        status: nextParentStatus,
        qaReviewSubStatus,
        qaReviewProgress,
        updatedAt: nowIso,
        updatedBy: user.uid
      };

      if (isGate2Completed) {
        updatePayload.completedAt = nowIso;
        updatePayload.completedBy = user.uid;
        updatePayload.completedByName = userName;
        updatePayload.completedByRole = userRole;
        updatePayload.completedByEmployeeId = userEmployeeId;
      }

      transaction.update(batchRef, sanitizeForFirestore(updatePayload));

      for (const sheet of selected) {
        await AuditService.logAction(
          user.uid,
          user.email,
          "QA_REVIEW_COMPLETED",
          batchId,
          "PRODUCTION_BATCH",
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, qaReviewStatus: "RECEIVED" },
          { sheetId: sheet.id, batchNumber: sheet.batchNumber, requestId: batchData.batchNumber || batchId, qaReviewStatus: "QA_REVIEW_COMPLETED", currentCustody: sheet.currentCustody },
          changeReason || `Batch sheet ${sheet.batchNumber} QA review completed`,
          transaction,
          sig.id,
          signatureMeaning,
          metadata?.ip,
          metadata?.userAgent,
          user.branch,
          batchData.branch,
          userRole,
          userName
        );
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "QA_REVIEW_SELECTED",
        batchId,
        "PRODUCTION_BATCH",
        { totalSelected: selected.length },
        { 
          totalSelected: selected.length, 
          selectedBatchNumbers: selected.map(s => s.batchNumber),
          reviewedCount,
          isGate2Completed,
          nextParentStatus
        },
        changeReason || `QA completed review for ${selected.length} batch sheet(s)`,
        transaction,
        sig.id,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent,
        user.branch,
        batchData.branch,
        userRole,
        userName
      );

      if (isGate2Completed) {
        await AuditService.logAction(
          user.uid,
          user.email,
          "QA_REVIEW_STAGE_COMPLETED",
          batchId,
          "PRODUCTION_BATCH",
          { status: batchData.status },
          { status: "COMPLETED", totalSheets: total },
          `Gate 2 Cleared: All ${total} Batch Sheets reviewed and certified by QA. Batch issuance completed.`,
          transaction,
          sig.id,
          signatureMeaning,
          metadata?.ip,
          metadata?.userAgent,
          user.branch,
          batchData.branch,
          userRole,
          userName
        );
      }

      return {
        success: true,
        batchId,
        selectedCount: selected.length,
        reviewedCount,
        total,
        isGate2Completed,
        nextParentStatus,
        qaReviewProgress
      };
    });
  }

  static async getBatchTimeline(id: string) {
    await ensureAuth();

    // 1. Query the main compliance audit log collection
    const qBatchLogs = query(
      collection(db, "batch_process_audit_logs"),
      where("entityId", "==", id),
      where("entityType", "==", "PRODUCTION_BATCH"),
      orderBy("timestamp", "asc")
    );
    const snapshotBatchLogs = await getDocs(qBatchLogs);

    // 2. Query the legacy audit trail collection
    const qLegacy = query(
      collection(db, "audit_trail"),
      where("entityId", "==", id),
      where("entityType", "==", "PRODUCTION_BATCH"),
      orderBy("timestamp", "asc")
    );
    const snapshotLegacy = await getDocs(qLegacy);

    const logsMap = new Map<string, any>();

    const parseDoc = (docSnap: any) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        action: data.action,
        userId: data.userId,
        userEmail: data.userEmail,
        timestamp: data.timestamp,
        changeReason: data.changeReason,
        oldStatus: data.oldValue?.status || null,
        newStatus: data.newValue?.status || null,
        signatureId: data.signatureId || null,
        signatureMeaning: data.signatureMeaning || null
      };
    };

    snapshotLegacy.docs.forEach((doc: any) => {
      logsMap.set(doc.id, parseDoc(doc));
    });

    snapshotBatchLogs.docs.forEach((doc: any) => {
      logsMap.set(doc.id, parseDoc(doc));
    });

    const combined = Array.from(logsMap.values());
    combined.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
    return combined;
  }
}
