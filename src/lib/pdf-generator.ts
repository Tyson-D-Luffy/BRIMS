import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { BatchIssuance, ProductMaster as Product, BatchSheetMaster, ManufacturingStep } from '../types';
import api from '../services/api';

export function formatDateDDMMMYYYY(date: Date | string): string {
  if (!date) return 'N/A';
  let d: Date;
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      const parts = date.trim().split('-');
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }
  if (isNaN(d.getTime())) return typeof date === 'string' ? date : 'N/A';
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function getOrdinalCopy(num: number): string {
  if (num <= 0) return '';
  const lastDigit = num % 10;
  const lastTwoDigits = num % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${num}th Copy`;
  }
  if (lastDigit === 1) return `${num}st Copy`;
  if (lastDigit === 2) return `${num}nd Copy`;
  if (lastDigit === 3) return `${num}rd Copy`;
  return `${num}th Copy`;
}

export function formatRequestId(
  batchNumber?: string,
  issueDate?: string,
  productTitleOrSeries?: string,
  rawRequestId?: string
): string {
  if (rawRequestId) {
    const cleaned = rawRequestId.replace(/^Request ID:\s*/i, '').trim();
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleaned) || cleaned.length > 25;
    if (!isUuid && cleaned !== 'PENDING' && cleaned !== 'UNKNOWN' && cleaned.length > 0) {
      return cleaned;
    }
  }

  let prefix = '';
  if (batchNumber && batchNumber !== 'N/A') {
    const parts = batchNumber.split(/[-/]/);
    if (parts[0] && parts[0].trim()) {
      prefix = parts[0].trim().replace(/[^a-zA-Z0-9]/g, '');
    }
  }
  if (!prefix && productTitleOrSeries) {
    const parts = productTitleOrSeries.split(/[-/]/);
    prefix = parts[0].trim().replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
  }
  if (!prefix) {
    prefix = 'MK14';
  }

  let datePart = '';
  if (issueDate) {
    datePart = issueDate.split('T')[0].replace(/[^0-9]/g, '');
  }
  if (!datePart || datePart.length < 8) {
    datePart = new Date().toISOString().split('T')[0].replace(/[^0-9]/g, '');
  }
  datePart = datePart.substring(0, 8);

  let serialNo = '001';
  if (batchNumber && batchNumber !== 'N/A') {
    const parts = batchNumber.split(/[-/]/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1].replace(/[^0-9]/g, '');
      if (last) {
        serialNo = last.padStart(3, '0').slice(-3);
      }
    }
  }

  return `${prefix}-${datePart}-${serialNo}`;
}

export function extractDateSequence(batchNumber?: string, fallback: string = 'PENDING'): string {
  if (!batchNumber) return fallback;
  const parts = batchNumber.split('-');
  if (parts.length >= 3) {
    return `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
  }
  if (batchNumber.includes('-')) {
    return batchNumber;
  }
  return fallback;
}

export function getBatchNumberForSheet(dropdownSeries: string, sheetOrPage: string): string {
  if (!dropdownSeries) return sheetOrPage || '';
  const trimmed = (sheetOrPage || '').trim();
  if (!trimmed) return dropdownSeries;

  // 1. If dropdownSeries and trimmed are identical or equal
  if (dropdownSeries.trim() === trimmed) return dropdownSeries;

  // 2. If dropdownSeries contains a digit range like "26001-26005" (or "B-26001-26005/LH10")
  // and trimmed is a single batch number (like "26006" or "26003") or page,
  // replace the entire range "26001-26005" with trimmed!
  const rangeMatch = dropdownSeries.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const rangeStr = rangeMatch[0]; // e.g. "26001-26005"
    if (/^\d+$/.test(trimmed) || /^[A-Za-z0-9/]+$/.test(trimmed)) {
      return dropdownSeries.replace(rangeStr, trimmed);
    }
  }

  // 3. If trimmed is a complex request title or long key containing letters (e.g. "LORATADINE-20260807-001")
  // and dropdownSeries is set (e.g. "26001/LH10/IPE"), return dropdownSeries directly as the official series
  if ((trimmed.length > 18 || /[a-zA-Z]/.test(trimmed)) && dropdownSeries.includes('/') && !trimmed.includes('/')) {
    return dropdownSeries;
  }

  // 4. Wildcard replacement if dropdownSeries contains XXX, xxx, ___, or ???
  if (/X{2,}|x{2,}|_{2,}|\?{2,}/.test(dropdownSeries)) {
    return dropdownSeries.replace(/X{2,}|x{2,}|_{2,}|\?{2,}/, trimmed);
  }

  // 5. If dropdownSeries already contains trimmed as an exact substring (e.g. "26001" in "26001/LH10/IPE"), return dropdownSeries
  if (dropdownSeries.includes(trimmed)) {
    return dropdownSeries;
  }

  // 5. Extract digit blocks from dropdownSeries
  const matchDigits = dropdownSeries.match(/\d+/g);
  if (!matchDigits || matchDigits.length === 0) {
    return dropdownSeries;
  }

  // Extract pure digits from trimmed
  const trimmedDigits = trimmed.match(/\d+/g)?.join('') || '';

  // Find target digit block in dropdownSeries to substitute
  let targetDigits = '';

  // 5a. Look for a digit block in dropdownSeries with the same length as trimmed
  const sameLengthMatch = matchDigits.find(d => d.length === trimmed.length);
  if (sameLengthMatch) {
    targetDigits = sameLengthMatch;
  } else if (trimmedDigits) {
    // 5b. Look for a digit block with the same length as trimmedDigits
    const sameLengthDigitsMatch = matchDigits.find(d => d.length === trimmedDigits.length);
    if (sameLengthDigitsMatch) {
      targetDigits = sameLengthDigitsMatch;
    }
  }

  // 5c. If no length match found, default to the first digit block if it's main counter (e.g., "26001" in "26001/LH10/IPE")
  if (!targetDigits) {
    if (matchDigits[0].length >= 3 || /^\d/.test(dropdownSeries)) {
      targetDigits = matchDigits[0];
    } else {
      // Fallback to longest digit block
      targetDigits = [...matchDigits].sort((a, b) => b.length - a.length)[0];
    }
  }

  if (targetDigits) {
    const replacement = (/^\d+$/.test(trimmed) || !trimmedDigits) ? trimmed : trimmedDigits;
    const index = dropdownSeries.indexOf(targetDigits);
    if (index !== -1) {
      return dropdownSeries.substring(0, index) + replacement + dropdownSeries.substring(index + targetDigits.length);
    }
  }

  return dropdownSeries;
}

export const generateRequestPreviewPDF = async (data: {
  batchNumber: string;
  dropdownBatchSeries?: string;
  singlePagesBatchNumber?: string;
  issueDate: string;
  issuedBy: string;
  printedBy?: string;
  master: BatchSheetMaster;
  product: Product | null;
  userInfo?: { name?: string; id?: string; designation?: string; role?: string; displayName?: string; username?: string };
  requestType?: 'NEW' | 'REPRINT';
  printCounts?: { [item: string]: number };
  requestId?: string;
  overlayPositions?: Record<string, { x: number; y: number; visible?: boolean; text?: string }>;
  isForPrint?: boolean;
}) => {
  const fileUrl = data.master.files?.[0]?.url;

  console.log(`[PDF_OVERLAY]: Starting overlay process. File URL: ${fileUrl}`);

  if (fileUrl) {
    try {
      let existingPdfBytes: ArrayBuffer;
      if (fileUrl.startsWith('/api/') || fileUrl.startsWith('api/')) {
        let requestUrl = fileUrl;
        if (fileUrl.startsWith('/api/')) {
          requestUrl = fileUrl.substring('/api'.length);
        }
        console.log(`[PDF_OVERLAY]: Fetching original PDF from relative API: ${requestUrl}`);
        const response = await api.get(requestUrl, { responseType: 'arraybuffer' });
        existingPdfBytes = response.data;
      } else {
        console.log(`[PDF_OVERLAY]: Fetching original PDF via fetch: ${fileUrl}`);
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        existingPdfBytes = await response.arrayBuffer();
      }

      console.log(`[PDF_OVERLAY]: PDF fetched, loading into pdf-lib...`);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();
      console.log(`[PDF_OVERLAY]: Found ${pages.length} original pages.`);

      const finalPdfDoc = await PDFDocument.create();
      const font = await finalPdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaBold);

      const fontSize = 8.5;
      const margin = 20;
      const topOffset = 15; 
      const textColor = rgb(0.8, 0, 0);

      const inputStr = (data.batchNumber || '').trim();

      interface PageTask {
        sourcePageIndex: number;
        headerBatchNumber: string;
      }
      
      const pageTasks: PageTask[] = [];

      // Parse series to separate batch numbers and loose pages
      const partsList = inputStr.split(',').map(p => p.trim()).filter(Boolean);
      const batchNumbers: string[] = [];
      const loosePages: string[] = [];
      
      partsList.forEach(part => {
        if (/^\d+-\d+$/.test(part)) {
          const rangeParts = part.split('-');
          const start = parseInt(rangeParts[0], 10);
          const end = parseInt(rangeParts[1], 10);
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            // Is it a page range (both are <= 3 digits) or a batch range?
            const isPageRange = rangeParts[0].length <= 3 && rangeParts[1].length <= 3;
            if (isPageRange) {
              for (let i = start; i <= end; i++) {
                const padLen = Math.max(rangeParts[0].length, rangeParts[1].length);
                loosePages.push(String(i).padStart(padLen, '0'));
              }
            } else {
              for (let i = start; i <= end; i++) {
                batchNumbers.push(String(i));
              }
            }
          }
        } else if (/^\d+$/.test(part)) {
          if (part.length <= 3) {
            loosePages.push(part);
          } else {
            batchNumbers.push(part);
          }
        } else {
          // Any other alphanumeric string is treated as a batch number
          batchNumbers.push(part);
        }
      });

      if (batchNumbers.length > 100) {
        throw new Error("Too many batch sheet numbers. Please limit requests to a maximum of 100 copies.");
      }

      // 1. Process batch numbers (each batch number gets all pages of the template)
      for (const bNo of batchNumbers) {
        const displayBatchNo = data.dropdownBatchSeries ? getBatchNumberForSheet(data.dropdownBatchSeries, bNo) : bNo;
        for (let p = 0; p < pages.length; p++) {
          pageTasks.push({
            sourcePageIndex: p,
            headerBatchNumber: displayBatchNo,
          });
        }
      }

      // 2. Process loose pages (each page gets mapped to the corresponding template page index)
      if (loosePages.length > 0) {
        let fallbackBatchNo = data.singlePagesBatchNumber || batchNumbers[0] || '';
        if (!fallbackBatchNo) {
          if (data.dropdownBatchSeries) {
            fallbackBatchNo = data.dropdownBatchSeries;
          } else if (data.master && data.master.batchNumberSeries) {
            fallbackBatchNo = data.master.batchNumberSeries;
          } else if (data.product && data.product.batchNumberSeries) {
            fallbackBatchNo = data.product.batchNumberSeries;
          } else {
            fallbackBatchNo = 'N/A';
          }
        } else {
          if (data.dropdownBatchSeries) {
            fallbackBatchNo = getBatchNumberForSheet(data.dropdownBatchSeries, fallbackBatchNo);
          }
        }

        for (const pageStr of loosePages) {
          const pageNum = parseInt(pageStr, 10);
          if (isNaN(pageNum) || pageNum <= 0 || pageNum > pages.length) {
            throw new Error(`Entered page number ${pageStr} does not exist.`);
          }
          pageTasks.push({
            sourcePageIndex: pageNum - 1,
            headerBatchNumber: fallbackBatchNo,
          });
        }
      }

      // If nothing was parsed (e.g., input was completely empty)
      if (pageTasks.length === 0) {
        const displayBatchNo = data.dropdownBatchSeries || inputStr || 'N/A';
        for (let p = 0; p < pages.length; p++) {
          pageTasks.push({
            sourcePageIndex: p,
            headerBatchNumber: displayBatchNo,
          });
        }
      }

      console.log(`[PDF_OVERLAY]: Preparing copy of ${pageTasks.length} total pages.`);
      for (const task of pageTasks) {
        const [copiedPage] = await finalPdfDoc.copyPages(pdfDoc, [task.sourcePageIndex]);
        finalPdfDoc.addPage(copiedPage);
      }

      const finalPages = finalPdfDoc.getPages();

      // Helper to wrap text
      const wrapText = (text: string, maxWidth: number, f: any, size: number) => {
        if (!text) return [];
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {
          const word = words[i];
          try {
            const width = f.widthOfTextAtSize(currentLine + " " + word, size);
            if (width < maxWidth) {
              currentLine += " " + word;
            } else {
              lines.push(currentLine);
              currentLine = word;
            }
          } catch (e) {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
      };

      // Helper to draw text with rotation awareness
      const drawTextRotated = (page: any, text: string, x: number, y: number, align: 'left' | 'center' | 'right', maxWidth: number, customFontSize?: number, customColor?: any) => {
        const activeFontSize = customFontSize || fontSize;
        const colorToUse = customColor || textColor;
        const lines = wrapText(text, maxWidth, boldFont, activeFontSize);
        lines.forEach((line, i) => {
          const lineWidth = boldFont.widthOfTextAtSize(line, activeFontSize);
          let lx = x;
          if (align === 'center') lx = x + (maxWidth - lineWidth) / 2;
          if (align === 'right') lx = x + maxWidth - lineWidth;
          
          const ly = y - (i * (activeFontSize + 3));

          let finalX = lx;
          let finalY = ly;
          let textRot = 0;

          const rotationAngle = page.getRotation().angle;
          const { width, height } = page.getSize();

          if (rotationAngle === 90) {
            finalX = ly; 
            finalY = width - lx;
            textRot = -90;
          } else if (rotationAngle === 180) {
            finalX = width - lx;
            finalY = height - ly;
            textRot = 180;
          } else if (rotationAngle === 270) {
            finalX = height - ly;
            finalY = lx;
            textRot = 90;
          }

          page.drawText(line, {
            x: finalX,
            y: finalY,
            size: activeFontSize,
            font: boldFont,
            color: colorToUse,
            rotate: { type: 'degrees', angle: textRot } as any,
          });
        });
      };

      finalPages.forEach((page, index) => {
        const task = pageTasks[index];
        const { width, height } = page.getSize();
        const rotationAngle = page.getRotation().angle;
        
        const availableWidth = width - (margin * 2);
        const colWidthLeft = availableWidth * 0.22;
        const colWidthCenter = availableWidth * 0.58;
        const colWidthRight = availableWidth * 0.20;

        // Batch No. (removed as it is now a movable overlay layer)


        const parseIssueDateAndTime = (inputDateStr: string | undefined) => {
          let dateStr = '';
          let timeStr = '';
          const now = new Date();
          
          if (!inputDateStr) {
            dateStr = formatDateDDMMMYYYY(now);
            timeStr = formatTime(now);
            return { dateStr, timeStr };
          }

          try {
            const hasTimePart = inputDateStr.includes('T') || inputDateStr.includes(' ') || inputDateStr.includes(':');
            let parsed: Date;
            if (/^\d{4}-\d{2}-\d{2}$/.test(inputDateStr.trim())) {
              const parts = inputDateStr.trim().split('-');
              parsed = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            } else {
              parsed = new Date(inputDateStr);
            }

            if (!isNaN(parsed.getTime())) {
              dateStr = formatDateDDMMMYYYY(parsed);
              if (hasTimePart) {
                timeStr = formatTime(parsed);
              } else {
                timeStr = formatTime(now);
              }
            } else {
              dateStr = inputDateStr;
              timeStr = formatTime(now);
            }
          } catch (e) {
            dateStr = inputDateStr || formatDateDDMMMYYYY(now);
            timeStr = formatTime(now);
          }

          return { dateStr, timeStr };
        };

        const { dateStr: displayDate, timeStr: displayTime } = parseIssueDateAndTime(data.issueDate);

        // 5 Top Center Lines (removed as they are now movable overlay layers)


        // Nth Copy Overlay (drawn on the Top Right)
        let reprintCopyString = '';
        let reprintCountN = 1;
        let isQualifiedForReprint = false;

        if (data.printCounts) {
          let count = data.printCounts[task.headerBatchNumber];
          if (count === undefined) {
            const pageNumStrStr = String(task.sourcePageIndex + 1);
            const pageNumStrPad = String(task.sourcePageIndex + 1).padStart(3, '0');
            count = data.printCounts[pageNumStrPad] ?? data.printCounts[pageNumStrStr];
          }
          if (count && count > 1) {
            reprintCopyString = getOrdinalCopy(count - 1);
            reprintCountN = count - 1;
            isQualifiedForReprint = true;
          }
        } else if (data.requestType === 'REPRINT') {
          reprintCopyString = '1st Copy';
          reprintCountN = 1;
          isQualifiedForReprint = true;
        }

        if (isQualifiedForReprint && reprintCopyString) {
          drawTextRotated(page, reprintCopyString, width - margin - colWidthRight, height - topOffset, 'right', colWidthRight);
        }

        // Helper to draw small text near the bottom with rotation awareness
        const drawBottomText = (text: string, xPos: number, yPos: number, align: 'left' | 'center' | 'right', isBold: boolean = false, customColor?: any) => {
          const drawFont = isBold ? boldFont : font;
          const drawSize = 8;
          const textWidth = drawFont.widthOfTextAtSize(text, drawSize);
          
          let lx = xPos;
          if (align === 'center') lx = xPos - textWidth / 2;
          if (align === 'right') lx = xPos - textWidth;
          
          let finalX = lx;
          let finalY = yPos;
          let textRot = 0;

          if (rotationAngle === 90) {
            finalX = yPos; 
            finalY = width - lx;
            textRot = -90;
          } else if (rotationAngle === 180) {
            finalX = width - lx;
            finalY = height - yPos;
            textRot = 180;
          } else if (rotationAngle === 270) {
            finalX = height - yPos;
            finalY = lx;
            textRot = 90;
          }

          page.drawText(text, {
            x: finalX,
            y: finalY,
            size: drawSize,
            font: drawFont,
            color: customColor || rgb(0.5, 0.5, 0.5),
            rotate: { type: 'degrees', angle: textRot } as any,
          });
        };

        // Formulate Batch details label in format PRODUCTNAME-YYYYMMDD-Serial no.
        const productName = data.product ? data.product.title : 'UNKNOWN';
        let datePart = 'YYYYMMDD';
        const mDate = data.issueDate || '';
        if (mDate) {
          const mParts = mDate.split('T')[0].replace(/[^0-9]/g, '');
          if (mParts && mParts.length >= 8) {
            datePart = mParts.substring(0, 8);
          } else if (mParts && mParts.length > 0) {
            datePart = mParts;
          }
        }
        if (datePart === 'YYYYMMDD' && data.batchNumber && data.batchNumber.includes('-')) {
          const parts = data.batchNumber.split('-');
          if (parts.length >= 2) {
            const foundDate = parts.find(p => /^\d{8}$/.test(p));
            if (foundDate) datePart = foundDate;
          }
        }
        if (datePart === 'YYYYMMDD' || datePart.length < 8) {
          datePart = new Date().toISOString().split('T')[0].replace(/[^0-9]/g, '');
        }
        
        const serialNo = data.batchNumber ? (data.batchNumber.split('-').pop() || '001') : '001';
        const batchDetailLabel = `${productName}-${datePart}-${serialNo}`;

        // Movable PDF Overlays (stamped onto PDF pages when downloading/printing)
        if (data.isForPrint !== false) {
          let overlayConfig = data.overlayPositions;
          if (!overlayConfig && typeof window !== 'undefined' && window.localStorage) {
            try {
              const specificKey = (data.requestId && `pdf_overlay_config_${data.requestId}`) ||
                                  (data.batchNumber && `pdf_overlay_config_${data.batchNumber}`);
              const specificSaved = specificKey ? localStorage.getItem(specificKey) : null;
              const saved = specificSaved || localStorage.getItem('pdf_overlay_config_latest');
              if (saved) {
                overlayConfig = JSON.parse(saved);
                if (!specificSaved && overlayConfig && overlayConfig.comment) {
                  overlayConfig.comment.text = "";
                }
              }
            } catch (e) {
              console.warn('Failed to parse saved overlay config for PDF print', e);
            }
          }

          const defaultOverlays: Record<string, { x: number; y: number; visible?: boolean }> = {
            batchNo: { x: 6, y: 0, visible: true },
            issuedBy: { x: 30, y: 0, visible: true },
            dateTimeOfIssue: { x: 30, y: 1.5, visible: true },
            printedBy: { x: 30, y: 3.0, visible: true },
            printedDateTime: { x: 30, y: 4.5, visible: true },
            requestId: { x: 0, y: 97.5, visible: true }
          };

          const finalOverlays = overlayConfig || defaultOverlays;
          const overlayColor = rgb(0.88, 0.11, 0.11); // Red stamp color matching preview

          let resolvedPrintedBy = data.printedBy;
          if (!resolvedPrintedBy) {
            if (data.userInfo) {
              const rawName = data.userInfo.name || data.userInfo.displayName || data.userInfo.username || 'Akshay Sharma';
              const cleanName = String(rawName).replace(/\s*\([^)]*\)\s*$/, '').trim() || 'Akshay Sharma';
              const desig = data.userInfo.designation || (data.userInfo.role ? (data.userInfo.role.toUpperCase() === 'ADMIN' ? 'Admin' : data.userInfo.role) : '') || 'Admin';
              resolvedPrintedBy = `${cleanName} (${desig})`;
            } else {
              resolvedPrintedBy = 'Akshay Sharma (Admin)';
            }
          }
          resolvedPrintedBy = resolvedPrintedBy.replace(/\s*\(([^)]+)\)\s*\(\1\)$/i, ' ($1)').trim();
          const currentPrintedDate = formatDateDDMMMYYYY(new Date());
          const currentPrintedTime = formatTime(new Date());
          const currentPrintedDateTime = `${currentPrintedDate}, ${currentPrintedTime}`;

          const formattedReqId = formatRequestId(
            data.batchNumber,
            data.issueDate,
            data.product?.title || data.master?.product?.title || (data.product as any)?.batchNumberSeries,
            data.requestId
          );

          let resolvedIssuedBy = data.issuedBy || 'QA Incharge (Krishan Kumar)';
          if (resolvedIssuedBy.toLowerCase().includes('production incharge') || resolvedIssuedBy.toLowerCase().includes('production manager')) {
            resolvedIssuedBy = 'QA Incharge (Krishan Kumar)';
          }

          const overlayTexts: Record<string, string> = {
            batchNo: `Batch No.:\n${task.headerBatchNumber}`,
            issuedBy: `Issued By: ${resolvedIssuedBy}`,
            dateTimeOfIssue: `Date & Time Of issue: ${displayDate}, ${displayTime}`,
            printedBy: `Printed By: ${resolvedPrintedBy}`,
            printedDateTime: `Print Date & Time: ${currentPrintedDateTime}`,
            requestId: `Request ID: ${formattedReqId}`
          };

          Object.entries(finalOverlays).forEach(([key, item]: [string, any]) => {
            if (!item || item.visible === false) return;

            const xPct = typeof item.x === 'number' ? item.x : (defaultOverlays[key]?.x ?? 0);
            const yPct = typeof item.y === 'number' ? item.y : (defaultOverlays[key]?.y ?? 0);

            const fontSz = key === 'batchNo' ? 9 : 7.5;
            const xPoints = (xPct / 100) * width;
            const yPointsFromTop = (yPct / 100) * height;
            const yPointsFromBottom = height - yPointsFromTop - fontSz - 2;

            let rawText = item.text || overlayTexts[key] || '';
            if (key === 'requestId') {
              let cleanedText = (item.text || '').replace(/^Request ID:\s*/i, '').trim();
              const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanedText) || cleanedText.length > 25;
              if (!cleanedText || isUuid) {
                rawText = `Request ID: ${formattedReqId}`;
              } else if (!rawText.startsWith('Request ID:')) {
                rawText = `Request ID: ${cleanedText}`;
              }
            }
            if (!rawText) return;

            const textLines = rawText.split('\n');
            textLines.forEach((lineText, lineIdx) => {
              const lineY = yPointsFromBottom - (lineIdx * (fontSz + 2));
              drawTextRotated(page, lineText, xPoints, lineY, 'left', width - xPoints, fontSz, overlayColor);
            });
          });
        }


        // Bottom Center: Print Copy N - only if reprint
        if (isQualifiedForReprint) {
          const bottomReprintOverlay = `Print Copy ${reprintCountN}`;
          drawBottomText(bottomReprintOverlay, width / 2, 10, 'center', true, rgb(0.8, 0.1, 0.1));
        }

        // 3. Dynamic Diagonal Watermark (Secure Screenshot Deterrence)
        if (data.userInfo) {
          const watermarkText = `SECURE PREVIEW: ${data.userInfo.name} (${data.userInfo.id}) | ${new Date().toLocaleString()} | BATCH: ${task.headerBatchNumber}`;
          const wmSize = 7;
          
          for (let row = 0; row < 5; row++) {
            const wx = margin + (row * 100);
            const wy = margin + (row * 150);
            
            let fwx = wx, fwy = wy, fwr = -45;
            if (rotationAngle === 90) { fwx = wy; fwy = width - wx; fwr = -135; }
            else if (rotationAngle === 180) { fwx = width - wx; fwy = height - wy; fwr = 135; } 
            else if (rotationAngle === 270) { fwx = height - wy; fwy = wx; fwr = 45; }

            page.drawText(watermarkText, {
              x: fwx,
              y: fwy,
              size: wmSize,
              font: font,
              color: rgb(0.8, 0.8, 0.8),
              rotate: { type: 'degrees', angle: fwr } as any,
              opacity: 0.3,
            });
          }
        }

        // Footer Text
        const footerText = `Page ${index + 1} of ${finalPages.length} | PREVIEW ONLY - UNCONTROLLED COPY`;
        const footerWidth = font.widthOfTextAtSize(footerText, 8);
        let ffx = (width - footerWidth) / 2;
        let ffy = 22;
        let fRot = 0;

        if (rotationAngle === 90) {
          ffx = 22; ffy = (width - footerWidth) / 2; fRot = -90;
        } else if (rotationAngle === 180) {
          ffx = width - (width - footerWidth) / 2; ffy = height - 22; fRot = 180;
        } else if (rotationAngle === 270) {
          ffx = height - 22; ffy = (width + footerWidth) / 2; fRot = 90;
        }

        page.drawText(footerText, {
          x: ffx,
          y: ffy,
          size: 8,
          font: font,
          color: rgb(0.5, 0.5, 0.5),
          rotate: { type: 'degrees', angle: fRot } as any,
        });
      });

      console.log(`[PDF_OVERLAY]: Finalizing PDF...`);
      const pdfBytes = await finalPdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } catch (err: any) {
      console.error("[PDF_OVERLAY]: Error overlaying on PDF:", err.message);
      throw err;
    }
  }

  // Fallback to generated PDF (Same as before)
  console.log("[PDF_OVERLAY]: Using generated template fallback");

  // Formulate Batch details label in format PRODUCTNAME-YYYYMMDD-Serial no.
  const productName = data.product ? data.product.title : 'UNKNOWN';
  let datePart = 'YYYYMMDD';
  const mDate = data.issueDate || '';
  if (mDate) {
    const mParts = mDate.split('T')[0].replace(/[^0-9]/g, '');
    if (mParts && mParts.length >= 8) {
      datePart = mParts.substring(0, 8);
    } else if (mParts && mParts.length > 0) {
      datePart = mParts;
    }
  }
  if (datePart === 'YYYYMMDD' && data.batchNumber && data.batchNumber.includes('-')) {
    const parts = data.batchNumber.split('-');
    if (parts.length >= 2) {
      const foundDate = parts.find(p => /^\d{8}$/.test(p));
      if (foundDate) datePart = foundDate;
    }
  }
  if (datePart === 'YYYYMMDD' || datePart.length < 8) {
    datePart = new Date().toISOString().split('T')[0].replace(/[^0-9]/g, '');
  }
  
  const serialNo = data.batchNumber ? (data.batchNumber.split('-').pop() || '001') : '001';
  const batchDetailLabel = `${productName}-${datePart}-${serialNo}`;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const fallbackMargin = 20;

  const parseIssueDateAndTimeFallback = (inputDateStr: string | undefined) => {
    let dateStr = '';
    let timeStr = '';
    const now = new Date();
    
    if (!inputDateStr) {
      dateStr = formatDateDDMMMYYYY(now);
      timeStr = formatTime(now);
      return { dateStr, timeStr };
    }

    try {
      const hasTimePart = inputDateStr.includes('T') || inputDateStr.includes(' ') || inputDateStr.includes(':');
      let parsed: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(inputDateStr.trim())) {
        const parts = inputDateStr.trim().split('-');
        parsed = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      } else {
        parsed = new Date(inputDateStr);
      }

      if (!isNaN(parsed.getTime())) {
        dateStr = formatDateDDMMMYYYY(parsed);
        if (hasTimePart) {
          timeStr = formatTime(parsed);
        } else {
          timeStr = formatTime(now);
        }
      } else {
        dateStr = inputDateStr;
        timeStr = formatTime(now);
      }
    } catch (e) {
      dateStr = inputDateStr || formatDateDDMMMYYYY(now);
      timeStr = formatTime(now);
    }

    return { dateStr, timeStr };
  };

  const { dateStr: fallbackDisplayDate, timeStr: fallbackDisplayTime } = parseIssueDateAndTimeFallback(data.issueDate);

  // 1. Header Fields (Requested: Batch No., Date of Issue, Issued By)
  autoTable(doc, {
    startY: 10,
    margin: { left: fallbackMargin, right: fallbackMargin },
    tableWidth: pageWidth - (fallbackMargin * 2),
    body: [
      [
        { content: '', styles: { halign: 'left', fontStyle: 'bold', fontSize: 11 } },
        { 
          content: '', 
          styles: { halign: 'center', fontStyle: 'bold' } 
        },
        { content: '', styles: { halign: 'right' } }
      ]
    ],
    theme: 'plain',
    styles: { 
      fontSize: 8.5, 
      cellPadding: 2,
      textColor: [50, 50, 50],
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { cellWidth: (pageWidth - fallbackMargin * 2) * 0.25 },
      1: { cellWidth: (pageWidth - fallbackMargin * 2) * 0.60 },
      2: { cellWidth: (pageWidth - fallbackMargin * 2) * 0.15 }
    }
  });

  const headerEndY = (doc as any).lastAutoTable.finalY || 20;

  doc.setDrawColor(200, 200, 200);
  doc.line(fallbackMargin, headerEndY + 2, pageWidth - fallbackMargin, headerEndY + 2);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('BATCH MANUFACTURING RECORD', pageWidth / 2, headerEndY + 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  doc.text(`Master Record: ${data.master.masterName}`, fallbackMargin, headerEndY + 25);
  doc.text(`Product: ${data.product?.title || 'N/A'}`, fallbackMargin, headerEndY + 31);
  doc.text(`Stage / Type: ${data.master.stage || 'N/A'} / ${data.master.type || 'N/A'}`, fallbackMargin, headerEndY + 37);
  doc.text(`Document No: ${data.master.documentNumber || 'N/A'} | Version: v${data.master.version}`, pageWidth - fallbackMargin, headerEndY + 25, { align: 'right' });

  const steps = data.master.steps_json || [];
  const body = steps.map((s: ManufacturingStep) => [
    s.step_number.toString(),
    s.description,
    s.equipment || 'N/A',
    s.expected_time || 'N/A',
    '' 
  ]);

  autoTable(doc, {
    startY: headerEndY + 45,
    head: [['Step', 'Description', 'Equipment', 'Expected Time', 'Initials / Sign']],
    body: body,
    theme: 'grid',
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 35 },
      3: { cellWidth: 30 },
      4: { cellWidth: 30 }
    },
    styles: { fontSize: 9, cellPadding: 3 },
    margin: { left: fallbackMargin, right: fallbackMargin }
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Dynamic Watermark
    if (data.userInfo) {
      doc.setTextColor(220, 220, 220);
      doc.setFontSize(8);
      const wmText = `SECURE PREVIEW | USER: ${data.userInfo.name} (${data.userInfo.id}) | ${new Date().toLocaleString()} | BATCH: ${data.batchNumber}`;
      for (let j = 0; j < 5; j++) {
        doc.text(wmText, 20, 50 + (j * 50), { angle: 45 });
      }
    }

    // Center preview notice (moved up to pageHeight - 16)
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(
      `PREVIEW ONLY - Not for actual production use | Generated on ${new Date().toLocaleString()} | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 16,
      { align: 'center' }
    );

    // Bottom left: Request ID (removed as it is now movable)

    // Bottom center: Print Copy N (only if reprint, in bold red)
    let isFallbackReprint = false;
    let n = 1;
    if (data.printCounts) {
      let count = data.printCounts[data.batchNumber];
      if (count === undefined) {
        const pageNumStrStr = String(i);
        const pageNumStrPad = String(i).padStart(3, '0');
        count = data.printCounts[pageNumStrPad] ?? data.printCounts[pageNumStrStr];
      }
      if (count && count > 1) {
        isFallbackReprint = true;
        n = count - 1;
      }
    } else if (data.requestType === 'REPRINT') {
      isFallbackReprint = true;
      n = 1;
    }

    if (isFallbackReprint) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(204, 0, 0); // Bold Red
      doc.text(
        `Print Copy ${n}`,
        pageWidth / 2,
        pageHeight - 6,
        { align: 'center' }
      );
    }
  }

  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
};



export const generateBatchPDF = async (batch: BatchIssuance, product: Product | null, userInfo?: { name: string; id: string }) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header
  doc.setFillColor(21, 22, 25); // Dark background
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('BRIMS', 20, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Batch Record Management System', 20, 32);
  
  doc.setFontSize(14);
  doc.text(`Batch: ${batch.batchNumber}`, pageWidth - 20, 25, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`Status: ${batch.status}`, pageWidth - 20, 32, { align: 'right' });

  // Content
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Batch Information', 20, 55);
  
  // Basic Info Table
  const basicInfo = [
    ['Title', product?.title || 'N/A'],
    ['Product Code', product?.title?.substring(0, 10).toUpperCase() || 'N/A'],
    ['Stage', product?.stage || 'N/A'],
    ['Batch Number', batch.batchNumber],
    ['Manufacturing Date', new Date(batch.manufacturingDate).toLocaleDateString()],
    ['Expiry Date', new Date(batch.expiryDate).toLocaleDateString()],
    ['Issued By', batch.issuedBy],
    ['Issued At', new Date(batch.createdAt).toLocaleString()],
  ];

  autoTable(doc, {
    startY: 65,
    head: [['Field', 'Value']],
    body: basicInfo,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
    margin: { left: 20, right: 20 },
  });

  // Timeline
  const finalY = (doc as any).lastAutoTable?.finalY || 65;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Production Timeline', 20, finalY + 20);

  const timeline = [
    ['Issued', new Date(batch.createdAt).toLocaleString()],
    ['Started', batch.startedAt ? new Date(batch.startedAt).toLocaleString() : 'Not Started'],
    ['Completed', batch.completedAt ? new Date(batch.completedAt).toLocaleString() : 'Not Completed'],
  ];

  autoTable(doc, {
    startY: finalY + 30,
    head: [['Event', 'Timestamp']],
    body: timeline,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    margin: { left: 20, right: 20 },
  });

  // Formulate Batch details label in format PRODUCTNAME-YYYYMMDD-Serial no.
  const productNameBatch = product ? product.title : 'UNKNOWN';
  let datePartBatch = 'YYYYMMDD';
  if (batch.manufacturingDate) {
    datePartBatch = batch.manufacturingDate.replace(/[^0-9]/g, '').substring(0, 8);
  } else if (batch.createdAt) {
    datePartBatch = new Date(batch.createdAt).toISOString().split('T')[0].replace(/[^0-9]/g, '');
  }
  const serialNoBatch = batch.batchNumber ? (batch.batchNumber.split('-').pop() || '001') : '001';
  const batchDetailLabelBatch = `${productNameBatch}-${datePartBatch}-${serialNoBatch}`;

  // Watermarking
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Dynamic Watermark
    if (userInfo) {
      doc.setTextColor(200, 200, 200);
      doc.setFontSize(8);
      const wmText = `SECURE PREVIEW | USER: ${userInfo.name} (${userInfo.id}) | ${new Date().toLocaleString()} | BATCH: ${batch.batchNumber}`;
      for (let j = 0; j < 5; j++) {
        doc.text(wmText, 20, 50 + (j * 50), { angle: 45 });
      }
    }

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      '21 CFR Part 11 Compliant Electronic Record - PREVIEW ONLY',
      pageWidth / 2,
      pageHeight - 22,
      { align: 'center' }
    );
    doc.text(
      `Generated on ${new Date().toLocaleString()} | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 16,
      { align: 'center' }
    );

    // Bottom left: Request ID (removed as it is now movable)
  }

  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
};


export const getBatchPDFBlob = (batch: BatchIssuance, product: Product | null): Blob => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(21, 22, 25); // Dark background
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('BRIMS', 20, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Batch Record Management System', 20, 32);
  
  doc.setFontSize(14);
  doc.text(`Batch: ${batch.batchNumber}`, pageWidth - 20, 25, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`Status: ${batch.status}`, pageWidth - 20, 32, { align: 'right' });

  // Content
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Batch Information', 20, 55);
  
  // Basic Info Table
  const basicInfo = [
    ['Title', product?.title || 'N/A'],
    ['Product Code', product?.title?.substring(0, 10).toUpperCase() || 'N/A'],
    ['Stage', product?.stage || 'N/A'],
    ['Batch Number', batch.batchNumber],
    ['Manufacturing Date', new Date(batch.manufacturingDate).toLocaleDateString()],
    ['Expiry Date', new Date(batch.expiryDate).toLocaleDateString()],
    ['Issued By', batch.issuedBy],
    ['Issued At', new Date(batch.createdAt).toLocaleString()],
  ];

  autoTable(doc, {
    startY: 65,
    head: [['Field', 'Value']],
    body: basicInfo,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
    margin: { left: 20, right: 20 },
  });

  // Timeline
  const finalY = (doc as any).lastAutoTable?.finalY || 65;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Production Timeline', 20, finalY + 20);

  const timeline = [
    ['Issued', new Date(batch.createdAt).toLocaleString()],
    ['Started', batch.startedAt ? new Date(batch.startedAt).toLocaleString() : 'Not Started'],
    ['Completed', batch.completedAt ? new Date(batch.completedAt).toLocaleString() : 'Not Completed'],
  ];

  autoTable(doc, {
    startY: finalY + 30,
    head: [['Event', 'Timestamp']],
    body: timeline,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    margin: { left: 20, right: 20 },
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated on ${new Date().toLocaleString()} | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
    doc.text(
      '21 CFR Part 11 Compliant Electronic Record',
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 15,
      { align: 'center' }
    );
  }

  return doc.output('blob');
};
