import { db, ensureAuth } from "../config/firebase-client.ts";
import { 
  doc, 
  collection,
  runTransaction, 
  getDoc
} from "firebase/firestore";
import { 
  BatchIssuance, 
  BatchSheetItem, 
  PrintJobStatus, 
  BatchSheetPrintHistoryEntry,
  PrintJob,
  PrintDeliveryMethod,
  PrintJobType
} from "../../types.ts";
import { AuditService } from "./audit.service.ts";
import { SignatureService } from "./signature.service.ts";
import { NotificationService, NotificationType, TargetType } from "./notification.service.ts";
import { parseAndValidatePageSelection } from "../../lib/page-parser.ts";

/**
 * Deep sanitizes objects/arrays for Firestore transactions to strictly prevent
 * "Unsupported field value: undefined" errors.
 */
function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => (v === undefined ? null : v)));
}

export function expandBatchSeriesHelper(series?: string): string[] {
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

export function initializeBatchSheetsHelper(batchData: any): BatchSheetItem[] {
  if (Array.isArray(batchData.batchSheets) && batchData.batchSheets.length > 0) {
    return sanitizeForFirestore(batchData.batchSheets);
  }

  const seriesStr = batchData.batchNumberSeries || batchData.batchNumber || '';
  const items = expandBatchSeriesHelper(seriesStr);

  if (items.length === 0 && batchData.batchNumber) {
    items.push(batchData.batchNumber);
  }

  const isAlreadyPrinted = 
    batchData.status === 'READY_FOR_PRODUCTION_HANDOVER' || 
    batchData.status === 'HANDED_OVER' ||
    batchData.status === 'PRODUCTION_IN_PROGRESS' || 
    batchData.status === 'READY_FOR_QA_REVIEW' ||
    batchData.status === 'COMPLETED';

  return items.map((itemNum, idx) => {
    let initialStatus: PrintJobStatus = 'PENDING';
    if (isAlreadyPrinted) {
      initialStatus = 'PRINT_COMPLETED';
    } else if (batchData.status === 'ISSUED' && idx === 0) {
      initialStatus = 'READY_TO_PRINT';
    }

    return {
      id: `sheet-${idx}-${itemNum.replace(/\s+/g, '_')}`,
      batchNumber: itemNum,
      sequenceIndex: idx,
      status: initialStatus,
      printCount: isAlreadyPrinted ? 1 : 0,
      attemptCount: isAlreadyPrinted ? 1 : 0,
      activeLock: null,
      printedAt: isAlreadyPrinted ? (batchData.completedAt || batchData.updatedAt || batchData.createdAt || null) : null,
      printedBy: isAlreadyPrinted ? (batchData.completedBy || batchData.issuedBy || null) : null,
      printedByName: isAlreadyPrinted ? (batchData.completedByName || batchData.issuedByName || 'Akshay Sharma') : null,
      printedByEmployeeId: isAlreadyPrinted ? (batchData.completedByEmployeeId || 'N/A') : null,
      completedAt: isAlreadyPrinted ? (batchData.completedAt || batchData.updatedAt || batchData.createdAt || null) : null,
      completedBy: isAlreadyPrinted ? (batchData.completedBy || batchData.issuedBy || null) : null,
      completedByName: isAlreadyPrinted ? (batchData.completedByName || batchData.issuedByName || 'Akshay Sharma') : null,
      completedByEmployeeId: isAlreadyPrinted ? (batchData.completedByEmployeeId || 'N/A') : null,
      history: isAlreadyPrinted ? [
        {
          id: `hist-${idx}-init`,
          action: 'PRINT_COMPLETED',
          status: 'PRINT_COMPLETED',
          timestamp: batchData.completedAt || batchData.createdAt || new Date().toISOString(),
          performedBy: batchData.completedByName || batchData.issuedByName || 'Akshay Sharma',
          userId: batchData.completedBy || batchData.issuedBy || 'system',
          userEmail: 'akshay.sharma@morepen.com',
          reason: 'Initial system issuance & certification',
          copyNumber: 1
        }
      ] : [],
      printJobs: []
    };
  });
}

/**
 * GAMP 5 & 21 CFR Part 11 Compliant PrintService
 * Controls sequential individual batch sheet printing, confirmation checkpoints,
 * granular page reprints, audit trail generation, and concurrency locking.
 */
export class PrintService {

  /**
   * Helper to generate human-readable unique Print Job ID
   * e.g. PJ-20260827-001 or PJ-827391-492
   */
  private static generatePrintJobId(batchNumber: string, attempt: number): string {
    const timestamp = Date.now().toString().slice(-6);
    const rand = Math.floor(100 + Math.random() * 900);
    return `PJ-${batchNumber}-${attempt}-${timestamp}`;
  }

  /**
   * Logs an interactive or operational print event to BOTH the individual Batch Sheet history
   * and the central application-wide batch_process_audit_logs.
   */
  static async logPrintAction(
    batchId: string,
    sheetId: string,
    action: 
      | 'PRINT_BUTTON_CLICKED'
      | 'PRINT_INITIATED'
      | 'PDF_DOWNLOAD_INITIATED'
      | 'PDF_DOWNLOADED'
      | 'PRINTING_ISSUE_SELECTED'
      | 'PRINTING_ISSUE_REPORTED'
      | 'REPRINT_PAGES_SELECTED'
      | 'REPRINT_BUTTON_CLICKED'
      | 'REPRINT_INITIATED'
      | 'PRINT_COMPLETED_SELECTED'
      | 'E_SIGNATURE_INITIATED'
      | 'E_SIGNATURE_VERIFIED'
      | 'PRINT_COMPLETED'
      | 'PRINT_SEQUENCE_ADVANCED'
      | 'PRINT_SEQUENCE_COMPLETED'
      | 'E_SIGNATURE_FAILED'
      | 'PRINT_LOCK_RELEASED'
      | 'PRINT_INTERRUPTED'
      | 'LOCK_RELEASED',
    user: any,
    details?: any,
    metadata?: any
  ) {
    if (!batchId) return;
    await ensureAuth();

    try {
      return await runTransaction(db, async (transaction) => {
        const batchRef = doc(db, "production_batches", batchId);
        const batchDoc = await transaction.get(batchRef);

        if (!batchDoc.exists()) return;
        const batchData = batchDoc.data() as BatchIssuance;
        const sheets = initializeBatchSheetsHelper(batchData);

        const sheetIndex = sheets.findIndex(
          s => s.id === sheetId || String(s.sequenceIndex) === sheetId || s.batchNumber === sheetId
        );
        if (sheetIndex === -1) return;

        const targetSheet = sheets[sheetIndex];
        const nowIso = new Date().toISOString();
        const nowMs = Date.now();
        const auditEventId = `AUD-PRT-${nowMs}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        const reasonText = details?.reason || details?.changeReason || details?.failureReason || details?.comments || `Print Action: ${action.replace(/_/g, ' ')}`;

        const historyEntry: BatchSheetPrintHistoryEntry = {
          id: auditEventId,
          printJobId: details?.printJobId || targetSheet.currentPrintJobId || null,
          parentPrintJobId: details?.parentPrintJobId || null,
          action: action as any,
          status: targetSheet.status,
          timestamp: nowIso,
          performedBy: user?.displayName || user?.username || user?.email || 'Operator',
          userId: user?.uid || 'system',
          userEmail: user?.email || 'operator@brims.internal',
          userRole: user?.role || 'ADMIN',
          employeeId: user?.employeeId || 'N/A',
          branch: (batchData as any).branch || user?.branch || 'Masulkhana',
          attemptNumber: details?.attemptNumber || targetSheet.attemptCount || 1,
          printType: details?.printType || (targetSheet.reprintPages ? 'PAGE_REPRINT' : 'FULL_PRINT'),
          requestedPages: details?.requestedPages || targetSheet.reprintPages || 'ALL',
          originalPagesReprinted: details?.originalPagesReprinted || targetSheet.reprintPages || null,
          totalPages: details?.totalPages || targetSheet.totalPages || 60,
          deliveryMethod: details?.deliveryMethod || targetSheet.lastDeliveryMethod || 'PDF_DOWNLOAD',
          reason: reasonText,
          issueReason: details?.issueReason || targetSheet.issueReason || null,
          comments: details?.comments || null,
          documentVersion: batchData.version || 'v1.0',
          signatureId: details?.signatureId || null,
          signatureMeaning: details?.signatureMeaning || null,
          ipAddress: metadata?.ip || null,
          userAgent: metadata?.userAgent || null
        };

        if (!targetSheet.history) targetSheet.history = [];
        targetSheet.history.push(historyEntry);
        sheets[sheetIndex] = targetSheet;

        transaction.update(batchRef, sanitizeForFirestore({
          batchSheets: sheets,
          updatedAt: nowIso,
          updatedBy: user?.uid || null
        }));

        // Log into central batch_process_audit_logs
        await AuditService.logAction(
          user?.uid || 'system',
          user?.email || 'operator@brims.internal',
          action,
          batchId,
          "Batch Sheet Printing",
          { 
            sheetId: targetSheet.id, 
            batchNumber: targetSheet.batchNumber,
            status: targetSheet.status,
            attemptNumber: targetSheet.attemptCount
          },
          { 
            batchSheetRequestId: batchData.batchNumber || batchId,
            requestId: batchData.batchNumber || batchId,
            batchNumber: targetSheet.batchNumber,
            sheetId: targetSheet.id, 
            sequenceNumber: sheetIndex + 1,
            attemptNumber: details?.attemptNumber || targetSheet.attemptCount || 1,
            printJobId: details?.printJobId || targetSheet.currentPrintJobId,
            requestedPages: details?.requestedPages || targetSheet.reprintPages || 'ALL',
            totalPages: details?.totalPages || targetSheet.totalPages || 60,
            deliveryMethod: details?.deliveryMethod || targetSheet.lastDeliveryMethod || 'PDF_DOWNLOAD',
            action,
            status: targetSheet.status,
            reason: reasonText,
            issueReason: details?.issueReason || targetSheet.issueReason,
            comments: details?.comments,
            signatureId: details?.signatureId,
            signatureMeaning: details?.signatureMeaning,
            auditEventId
          },
          `[Batch Sheet Printing] ${action.replace(/_/g, ' ')} for Batch Sheet #${sheetIndex + 1} (${targetSheet.batchNumber})`,
          transaction,
          details?.signatureId,
          details?.signatureMeaning,
          metadata?.ip,
          metadata?.userAgent,
          (batchData as any).branch || user?.branch || 'Masulkhana',
          (batchData as any).branch || user?.branch || 'Masulkhana',
          user?.role || 'ADMIN',
          user?.displayName || user?.username || user?.email
        );

        return { success: true, auditEventId, sheet: targetSheet };
      });
    } catch (err: any) {
      console.warn(`[PrintService] Failed to logPrintAction (${action}):`, err?.message);
    }
  }

  /**
   * Initiates print/download for a batch sheet.
   * Enforces backend-side sequential verification and single active print operation lock.
   */
  static async startPrintJob(
    batchId: string,
    sheetId: string,
    user: any,
    deliveryMethod: PrintDeliveryMethod = 'PDF_DOWNLOAD',
    totalPages: number = 60,
    isReprint: boolean = false,
    reprintReason?: string,
    metadata?: any
  ) {
    if (!batchId) throw new Error("Batch ID is required.");
    if (!sheetId) throw new Error("Sheet ID is required.");
    if (!user || !user.uid) throw new Error("User credentials required.");

    await ensureAuth();

    return await runTransaction(db, async (transaction) => {
      const batchRef = doc(db, "production_batches", batchId);
      const batchDoc = await transaction.get(batchRef);

      if (!batchDoc.exists()) {
        throw new Error(`Production batch '${batchId}' not found.`);
      }

      const batchData = batchDoc.data() as BatchIssuance;

      const allowedPrintStatuses = [
        'ISSUED',
        'IN_PROGRESS',
        'READY_FOR_PRODUCTION_HANDOVER',
        'HANDED_OVER',
        'PRODUCTION_IN_PROGRESS',
        'READY_FOR_QA_REVIEW',
        'COMPLETED',
        'APPROVED',
        'RETURNED'
      ];

      if (!allowedPrintStatuses.includes(batchData.status)) {
        throw new Error(`Cannot print Batch Sheets: Batch Request status is '${batchData.status}'. Batch must be in 'ISSUED' or subsequent operational status.`);
      }

      const sheets = initializeBatchSheetsHelper(batchData);
      const sheetIndex = sheets.findIndex(
        s => s.id === sheetId || String(s.sequenceIndex) === sheetId || s.batchNumber === sheetId
      );

      if (sheetIndex === -1) {
        throw new Error(`Batch Sheet '${sheetId}' not found in request.`);
      }

      const targetSheet = sheets[sheetIndex];
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const auditEventId = `AUD-PRT-${nowMs}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      // -------------------------------------------------------------
      // 1. Strict Backend Sequential Verification
      // -------------------------------------------------------------
      for (let i = 0; i < sheetIndex; i++) {
        const prev = sheets[i];
        const isPrevDone = prev.status === 'PRINT_COMPLETED' || prev.status === 'PRINTED' || prev.status === 'REPRINTED';
        if (!isPrevDone) {
          throw new Error(`Batch Sheet ${targetSheet.batchNumber} cannot be printed because Batch Sheet ${prev.batchNumber} must be completed first.`);
        }
      }

      // -------------------------------------------------------------
      // 2. Concurrency Lock Check (Single Active Unresolved Print)
      // -------------------------------------------------------------
      const activeLockedSheet = sheets.find(s => s.activeLock != null && s.id !== targetSheet.id);
      if (activeLockedSheet?.activeLock) {
        const lockAge = nowMs - new Date(activeLockedSheet.activeLock.lockedAt).getTime();
        if (lockAge < 15 * 60 * 1000 && activeLockedSheet.activeLock.lockedBy !== user.uid) {
          throw new Error(`Lock Conflict: Batch Sheet ${activeLockedSheet.batchNumber} is currently actively printing by ${activeLockedSheet.activeLock.lockedByName}.`);
        }
      }

      // -------------------------------------------------------------
      // 3. Create Print Job & Update Sheet State
      // -------------------------------------------------------------
      const attemptNum = (targetSheet.attemptCount || 0) + 1;
      const printJobId = this.generatePrintJobId(targetSheet.batchNumber, attemptNum);
      const printType: PrintJobType = isReprint ? 'PAGE_REPRINT' : 'FULL_PRINT';

      const newPrintJob: PrintJob = {
        printJobId,
        parentPrintJobId: targetSheet.currentPrintJobId || null,
        requestId: batchData.batchNumber || batchId,
        batchSheetId: targetSheet.id,
        batchNumber: targetSheet.batchNumber,
        sequenceNumber: sheetIndex + 1,
        attemptNumber: attemptNum,
        printType,
        requestedPages: isReprint ? (targetSheet.reprintPages || 'ALL') : 'ALL',
        totalPages: totalPages || targetSheet.totalPages || 60,
        deliveryMethod,
        status: 'AWAITING_USER_CONFIRMATION',
        startedAt: nowIso,
        userId: user.uid,
        userName: user.displayName || user.username || user.email || 'Operator',
        userEmail: user.email || null,
        userRole: user.role || 'ADMIN',
        employeeId: user.employeeId || 'N/A',
        branch: (batchData as any).branch || user?.branch || 'Masulkhana',
        issueReason: reprintReason || null,
        documentVersion: batchData.version || 'v1.0'
      };

      if (!targetSheet.printJobs) targetSheet.printJobs = [];
      targetSheet.printJobs.push(newPrintJob);

      const previousStatus = targetSheet.status;
      targetSheet.status = 'AWAITING_USER_CONFIRMATION';
      targetSheet.attemptCount = attemptNum;
      targetSheet.currentPrintJobId = printJobId;
      targetSheet.lastDeliveryMethod = deliveryMethod;
      targetSheet.totalPages = totalPages || targetSheet.totalPages || 60;
      targetSheet.activeLock = {
        lockedBy: user.uid,
        lockedByName: user.displayName || user.username || user.email || 'Operator',
        lockedAt: nowIso,
        lockExpiresAt: new Date(nowMs + 15 * 60 * 1000).toISOString()
      };

      // -------------------------------------------------------------
      // 4. Audit Trail Recording (PRINT_INITIATED / REPRINT_INITIATED)
      // -------------------------------------------------------------
      const auditAction = isReprint ? 'REPRINT_INITIATED' : 'PRINT_INITIATED';
      const historyEntry: BatchSheetPrintHistoryEntry = {
        id: auditEventId,
        printJobId,
        parentPrintJobId: newPrintJob.parentPrintJobId || null,
        action: auditAction,
        status: 'AWAITING_USER_CONFIRMATION',
        timestamp: nowIso,
        performedBy: user.displayName || user.username || user.email || 'Operator',
        userId: user.uid,
        userEmail: user.email || 'operator@brims.internal',
        userRole: user.role || 'ADMIN',
        employeeId: user.employeeId || 'N/A',
        branch: (batchData as any).branch || user?.branch || 'Masulkhana',
        attemptNumber: attemptNum,
        printType,
        requestedPages: newPrintJob.requestedPages,
        originalPagesReprinted: isReprint ? (targetSheet.reprintPages || null) : null,
        totalPages: newPrintJob.totalPages,
        deliveryMethod,
        reason: isReprint ? (reprintReason || 'Reprint initiated') : `Print initiated for Batch Sheet ${targetSheet.batchNumber}`,
        documentVersion: batchData.version || 'v1.0',
        ipAddress: metadata?.ip || null,
        userAgent: metadata?.userAgent || null
      };

      if (!targetSheet.history) targetSheet.history = [];
      targetSheet.history.push(historyEntry);

      sheets[sheetIndex] = targetSheet;

      const updateData: any = {
        batchSheets: sheets,
        printSequenceStatus: 'IN_PROGRESS',
        currentPrintableSequence: sheetIndex,
        activePrintJobId: printJobId,
        activePrintLock: {
          lockedSheetId: targetSheet.id,
          lockedBy: user.uid,
          lockedByName: user.displayName || user.username || user.email || 'Operator',
          lockedAt: nowIso
        },
        totalPrintAttempts: (batchData.totalPrintAttempts || 0) + (isReprint ? 0 : 1),
        totalReprintAttempts: (batchData.totalReprintAttempts || 0) + (isReprint ? 1 : 0),
        updatedAt: nowIso,
        updatedBy: user.uid
      };

      transaction.update(batchRef, sanitizeForFirestore(updateData));

      // Audit Log in central batch_process_audit_logs
      await AuditService.logAction(
        user.uid,
        user.email,
        auditAction,
        batchId,
        "Batch Sheet Printing",
        { 
          sheetId: targetSheet.id, 
          batchNumber: targetSheet.batchNumber, 
          status: previousStatus,
          attemptNumber: attemptNum - 1 
        },
        { 
          batchSheetRequestId: batchData.batchNumber || batchId,
          requestId: batchData.batchNumber || batchId,
          batchNumber: targetSheet.batchNumber,
          sheetId: targetSheet.id, 
          sequenceNumber: sheetIndex + 1,
          printJobId,
          attemptNumber: attemptNum,
          deliveryMethod,
          printType,
          requestedPages: newPrintJob.requestedPages,
          totalPages: newPrintJob.totalPages,
          status: 'AWAITING_USER_CONFIRMATION',
          auditEventId
        },
        `${auditAction}: Batch Sheet ${targetSheet.batchNumber} (Attempt #${attemptNum}, Delivery: ${deliveryMethod})`,
        transaction,
        undefined,
        undefined,
        metadata?.ip,
        metadata?.userAgent,
        (batchData as any).branch || user?.branch || 'Masulkhana',
        (batchData as any).branch || user?.branch || 'Masulkhana',
        user?.role || 'ADMIN',
        user?.displayName || user?.username || user?.email
      );

      return {
        batchId,
        sheet: targetSheet,
        batchSheets: sheets,
        printJob: newPrintJob,
        auditEventId
      };
    });
  }

  /**
   * Reports a printing issue for a batch sheet, captures pages to reprint, and validates them.
   */
  static async reportPrintingIssue(
    batchId: string,
    sheetId: string,
    issueReason: string,
    requestedPages: string,
    comments?: string,
    user?: any,
    totalPages: number = 60,
    metadata?: any
  ) {
    if (!batchId) throw new Error("Batch ID is required.");
    if (!sheetId) throw new Error("Sheet ID is required.");
    if (!issueReason || !issueReason.trim()) throw new Error("Issue reason is mandatory.");

    // Validate page selection strictly
    const pageValidation = parseAndValidatePageSelection(requestedPages, totalPages || 60);
    if (!pageValidation.isValid) {
      throw new Error(pageValidation.error || "Invalid page selection for reprint.");
    }

    if (issueReason === 'Other' && (!comments || !comments.trim())) {
      throw new Error("Comments are mandatory when 'Other' is selected as issue reason.");
    }

    await ensureAuth();

    return await runTransaction(db, async (transaction) => {
      const batchRef = doc(db, "production_batches", batchId);
      const batchDoc = await transaction.get(batchRef);

      if (!batchDoc.exists()) throw new Error("Batch not found.");
      const batchData = batchDoc.data() as BatchIssuance;
      const sheets = initializeBatchSheetsHelper(batchData);

      const sheetIndex = sheets.findIndex(
        s => s.id === sheetId || String(s.sequenceIndex) === sheetId || s.batchNumber === sheetId
      );
      if (sheetIndex === -1) throw new Error("Batch Sheet not found.");

      const targetSheet = sheets[sheetIndex];
      const previousStatus = targetSheet.status;
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const auditEventId = `AUD-PRT-${nowMs}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      targetSheet.status = 'PRINTING_ISSUE';
      targetSheet.issueReason = issueReason;
      targetSheet.reprintReason = `${issueReason}${comments ? ` - ${comments.trim()}` : ''}`;
      targetSheet.reprintPages = pageValidation.normalizedString;
      targetSheet.interruptedAt = nowIso;
      targetSheet.interruptedBy = user?.uid;
      targetSheet.interruptedReason = targetSheet.reprintReason;

      // Update current PrintJob
      if (targetSheet.printJobs && targetSheet.printJobs.length > 0) {
        const currentJob = targetSheet.printJobs[targetSheet.printJobs.length - 1];
        currentJob.status = 'PRINTING_ISSUE';
        currentJob.issueReason = issueReason;
        currentJob.comments = comments || null;
      }

      const historyEntry: BatchSheetPrintHistoryEntry = {
        id: auditEventId,
        printJobId: targetSheet.currentPrintJobId || null,
        action: 'PRINTING_ISSUE_REPORTED',
        status: 'PRINTING_ISSUE',
        timestamp: nowIso,
        performedBy: user?.displayName || user?.username || user?.email || 'Operator',
        userId: user?.uid || 'unknown',
        userEmail: user?.email || 'operator@brims.internal',
        userRole: user?.role || 'ADMIN',
        employeeId: user?.employeeId || 'N/A',
        branch: (batchData as any).branch || user?.branch || 'Masulkhana',
        attemptNumber: targetSheet.attemptCount || 1,
        requestedPages: pageValidation.normalizedString,
        originalPagesReprinted: pageValidation.normalizedString,
        issueReason,
        comments: comments || null,
        reason: `Printing issue reported: ${issueReason}. Pages to reprint: ${pageValidation.normalizedString}`,
        ipAddress: metadata?.ip || null,
        userAgent: metadata?.userAgent || null
      };

      if (!targetSheet.history) targetSheet.history = [];
      targetSheet.history.push(historyEntry);

      sheets[sheetIndex] = targetSheet;

      transaction.update(batchRef, sanitizeForFirestore({
        batchSheets: sheets,
        updatedAt: nowIso,
        updatedBy: user?.uid || null
      }));

      // Audit Log in central batch_process_audit_logs
      await AuditService.logAction(
        user?.uid || 'unknown',
        user?.email || 'operator@brims.internal',
        "PRINTING_ISSUE_REPORTED",
        batchId,
        "Batch Sheet Printing",
        { 
          sheetId: targetSheet.id, 
          batchNumber: targetSheet.batchNumber,
          status: previousStatus 
        },
        { 
          batchSheetRequestId: batchData.batchNumber || batchId,
          requestId: batchData.batchNumber || batchId,
          batchNumber: targetSheet.batchNumber,
          sheetId: targetSheet.id, 
          sequenceNumber: sheetIndex + 1,
          printJobId: targetSheet.currentPrintJobId,
          issueReason,
          reprintPages: pageValidation.normalizedString,
          requestedPages: pageValidation.normalizedString,
          comments,
          status: 'PRINTING_ISSUE',
          auditEventId
        },
        `PRINTING_ISSUE_REPORTED: Batch Sheet ${targetSheet.batchNumber} - Reason: ${issueReason}, Pages: ${pageValidation.normalizedString}`,
        transaction,
        undefined,
        undefined,
        metadata?.ip,
        metadata?.userAgent,
        (batchData as any).branch || user?.branch || 'Masulkhana',
        (batchData as any).branch || user?.branch || 'Masulkhana',
        user?.role || 'ADMIN',
        user?.displayName || user?.username || user?.email
      );

      return {
        batchId,
        sheet: targetSheet,
        batchSheets: sheets,
        pageValidation,
        auditEventId
      };
    });
  }

  /**
   * Completes printing for a batch sheet after mandatory 21 CFR Part 11 electronic signature verification.
   * Sets printStatus = 'PRINT_COMPLETED', stores immutable electronic signature, logs central audit,
   * advances sequence, and unlocks the next sheet.
   */
  static async completePrintJob(
    batchId: string,
    sheetId: string,
    user: any,
    signaturePassword?: string,
    comments?: string,
    metadata?: any
  ) {
    if (!batchId) throw new Error("Batch ID is required.");
    if (!sheetId) throw new Error("Sheet ID is required.");
    if (!user || !user.uid) throw new Error("User details required.");

    // Mandatory Electronic Signature challenge
    const userEmail = user.email || user.firestoreEmail || user.username || 'operator@brims.internal';
    try {
      if (!signaturePassword || !signaturePassword.trim()) {
        throw new Error("Password is required for electronic signature verification.");
      }
      await SignatureService.verifyCredentials(userEmail, signaturePassword);
    } catch (sigErr: any) {
      // Log E_SIGNATURE_FAILED audit event to both individual sheet and central batch_process_audit_logs
      await this.logPrintAction(
        batchId,
        sheetId,
        "E_SIGNATURE_FAILED",
        user,
        {
          failureReason: "Electronic signature verification failed (incorrect credentials).",
          comments
        },
        metadata
      );
      throw new Error("Electronic signature verification failed.");
    }

    await ensureAuth();

    let notificationToDispatch: any = null;

    return await runTransaction(db, async (transaction) => {
      const batchRef = doc(db, "production_batches", batchId);
      const batchDoc = await transaction.get(batchRef);

      if (!batchDoc.exists()) throw new Error("Batch not found.");
      const batchData = batchDoc.data() as BatchIssuance;
      const sheets = initializeBatchSheetsHelper(batchData);

      const sheetIndex = sheets.findIndex(
        s => s.id === sheetId || String(s.sequenceIndex) === sheetId || s.batchNumber === sheetId
      );
      if (sheetIndex === -1) throw new Error("Batch Sheet not found.");

      const targetSheet = sheets[sheetIndex];
      const previousStatus = targetSheet.status;
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const auditEventId = `AUD-PRT-${nowMs}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      const newPrintCount = (targetSheet.printCount || 0) + 1;
      targetSheet.status = 'PRINT_COMPLETED';
      targetSheet.printCount = newPrintCount;
      targetSheet.completedAt = nowIso;
      targetSheet.completedBy = user.uid;
      targetSheet.completedByName = user.displayName || user.username || user.email || 'Operator';
      targetSheet.completedByEmployeeId = user.employeeId || 'N/A';
      targetSheet.printedAt = nowIso;
      targetSheet.printedBy = user.uid;
      targetSheet.printedByName = user.displayName || user.username || user.email || 'Operator';
      targetSheet.printedByEmployeeId = user.employeeId || 'N/A';
      targetSheet.activeLock = null;

      // Close current PrintJob
      if (targetSheet.printJobs && targetSheet.printJobs.length > 0) {
        const currentJob = targetSheet.printJobs[targetSheet.printJobs.length - 1];
        currentJob.status = 'COMPLETED';
        currentJob.completedAt = nowIso;
      }

      // -------------------------------------------------------------
      // 1. Create and Store 21 CFR Part 11 Electronic Signature Record
      // -------------------------------------------------------------
      const signatureMeaning = `Certified successful print and verification of Batch Sheet #${targetSheet.sequenceIndex + 1} (${targetSheet.batchNumber}). No pages require reprinting.`;
      const signatureRef = doc(collection(db, "electronic_signatures"));
      const signatureId = signatureRef.id;

      const signatureData: any = {
        id: signatureId,
        batchSheetRequestId: batchData.batchNumber || batchId,
        batchSheetId: targetSheet.id,
        batchNumber: targetSheet.batchNumber,
        printJobId: targetSheet.currentPrintJobId || `PJ-${targetSheet.batchNumber}-${targetSheet.attemptCount || 1}`,
        attemptNumber: targetSheet.attemptCount || 1,
        userId: user.uid,
        employeeId: user.employeeId || 'N/A',
        signerFullName: user.displayName || user.username || user.name || user.email || 'Operator',
        signerRole: user.role || 'ADMIN',
        branch: (batchData as any).branch || user?.branch || 'Masulkhana',
        date: nowIso.split('T')[0],
        time: new Date().toLocaleTimeString(),
        timestamp: nowIso,
        meaning: "Print Completion Confirmation",
        signatureMeaning,
        statement: "I confirm that I have checked the printed/downloaded Batch Sheet and that the required pages have been printed satisfactorily.",
        action: "PRINT_COMPLETED",
        actionType: "PRINT_COMPLETED",
        entityType: "BATCH_SHEET_ITEM",
        entityId: `${batchId}_${targetSheet.id}`,
        documentVersion: batchData.version || 'v1.0',
        batchSheetMasterVersion: (batchData as any).masterSnapshot?.version || batchData.version || 'v1.0',
        originalPageCount: targetSheet.totalPages || 60,
        requestedPages: targetSheet.reprintPages || 'ALL',
        verified: true,
        auditEventId,
        ipAddress: metadata?.ip || null,
        userAgent: metadata?.userAgent || null,
        createdAt: nowIso
      };

      transaction.set(signatureRef, sanitizeForFirestore(signatureData));

      // -------------------------------------------------------------
      // 2. Audit Trail: E_SIGNATURE_VERIFIED
      // -------------------------------------------------------------
      const eSigHistoryEntry: BatchSheetPrintHistoryEntry = {
        id: `AUD-SIG-${nowMs}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
        printJobId: targetSheet.currentPrintJobId || null,
        action: 'PRINT_COMPLETED' as any,
        status: 'PRINT_COMPLETED',
        timestamp: nowIso,
        performedBy: user.displayName || user.username || user.email || 'Operator',
        userId: user.uid,
        userEmail: user.email || 'operator@brims.internal',
        userRole: user.role || 'ADMIN',
        employeeId: user.employeeId || 'N/A',
        branch: (batchData as any).branch || user?.branch || 'Masulkhana',
        attemptNumber: targetSheet.attemptCount || 1,
        deliveryMethod: targetSheet.lastDeliveryMethod || 'PDF_DOWNLOAD',
        copyNumber: newPrintCount,
        totalPages: targetSheet.totalPages || 60,
        documentVersion: batchData.version || 'v1.0',
        signatureId,
        signatureMeaning,
        reason: comments || 'Electronic signature verified for print completion',
        ipAddress: metadata?.ip || null,
        userAgent: metadata?.userAgent || null
      };

      if (!targetSheet.history) targetSheet.history = [];
      targetSheet.history.push(eSigHistoryEntry);

      // -------------------------------------------------------------
      // 3. Unlock NEXT Sequential Sheet
      // -------------------------------------------------------------
      let unlockedNextSheet: BatchSheetItem | null = null;
      if (sheetIndex + 1 < sheets.length) {
        const nextSheet = sheets[sheetIndex + 1];
        if (nextSheet.status === 'PENDING' || nextSheet.status === 'PENDING_SEQUENCE') {
          nextSheet.status = 'READY_TO_PRINT';
          unlockedNextSheet = nextSheet;
          sheets[sheetIndex + 1] = nextSheet;
        }
      }

      sheets[sheetIndex] = targetSheet;

      // -------------------------------------------------------------
      // 4. Check if ALL sheets in batch are completed
      // -------------------------------------------------------------
      const allPrinted = sheets.every(s => s.status === 'PRINT_COMPLETED' || s.status === 'PRINTED' || s.status === 'REPRINTED');

      const updateData: any = {
        batchSheets: sheets,
        activePrintLock: null,
        activePrintJobId: null,
        currentPrintableSequence: sheetIndex + 1,
        updatedAt: nowIso,
        updatedBy: user.uid
      };

      if (allPrinted) {
        updateData.printSequenceStatus = 'COMPLETED';
        updateData.status = 'READY_FOR_PRODUCTION_HANDOVER';
        updateData.completedAt = nowIso;
        updateData.completedBy = user.uid;
        updateData.completedByName = user.displayName || user.username || 'Operator';
        updateData.completedByRole = user.role || 'ADMIN';
        updateData.completedByEmployeeId = user.employeeId || 'N/A';

        notificationToDispatch = {
          title: "All Batch Sheets Printed - Ready for Handover",
          message: `All ${sheets.length} Batch Sheets for ${batchData.batchNumber} have been printed and certified. Status transitioned to Ready for Production Handover.`,
          type: NotificationType.SUCCESS,
          targetId: batchData.issuedBy,
          targetType: TargetType.USER,
          link: `/batches/${batchId}`
        };
      }

      transaction.update(batchRef, sanitizeForFirestore(updateData));

      // -------------------------------------------------------------
      // 5. Log E_SIGNATURE_VERIFIED in central batch_process_audit_logs
      // -------------------------------------------------------------
      await AuditService.logAction(
        user.uid,
        user.email,
        "E_SIGNATURE_VERIFIED",
        batchId,
        "Batch Sheet Printing",
        null,
        { 
          batchSheetRequestId: batchData.batchNumber || batchId,
          requestId: batchData.batchNumber || batchId,
          batchNumber: targetSheet.batchNumber,
          sheetId: targetSheet.id, 
          sequenceNumber: sheetIndex + 1,
          signatureId,
          signatureMeaning,
          employeeId: user.employeeId || 'N/A',
          auditEventId
        },
        `E-Signature Verified: ${signatureMeaning}`,
        transaction,
        signatureId,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent,
        (batchData as any).branch || user?.branch || 'Masulkhana',
        (batchData as any).branch || user?.branch || 'Masulkhana',
        user?.role || 'ADMIN',
        user?.displayName || user?.username || user?.email
      );

      // -------------------------------------------------------------
      // 6. Log PRINT_COMPLETED in central batch_process_audit_logs
      // -------------------------------------------------------------
      await AuditService.logAction(
        user.uid,
        user.email,
        "PRINT_COMPLETED",
        batchId,
        "Batch Sheet Printing",
        { 
          sheetId: targetSheet.id, 
          batchNumber: targetSheet.batchNumber, 
          status: previousStatus 
        },
        { 
          batchSheetRequestId: batchData.batchNumber || batchId,
          requestId: batchData.batchNumber || batchId,
          batchNumber: targetSheet.batchNumber,
          sheetId: targetSheet.id, 
          sequenceNumber: sheetIndex + 1,
          status: 'PRINT_COMPLETED',
          printJobId: targetSheet.currentPrintJobId,
          attemptNumber: targetSheet.attemptCount,
          copyNumber: newPrintCount,
          unlockedNextSheetId: unlockedNextSheet?.id,
          unlockedNextBatchNumber: unlockedNextSheet?.batchNumber,
          allPrinted,
          signatureId,
          signatureMeaning,
          auditEventId
        },
        `PRINT_COMPLETED: Batch Sheet #${sheetIndex + 1} (${targetSheet.batchNumber}) verified and certified by ${user.displayName || user.username || user.email}`,
        transaction,
        signatureId,
        signatureMeaning,
        metadata?.ip,
        metadata?.userAgent,
        (batchData as any).branch || user?.branch || 'Masulkhana',
        (batchData as any).branch || user?.branch || 'Masulkhana',
        user?.role || 'ADMIN',
        user?.displayName || user?.username || user?.email
      );

      // -------------------------------------------------------------
      // 7. Log PRINT_SEQUENCE_ADVANCED if next sheet unlocked
      // -------------------------------------------------------------
      if (unlockedNextSheet) {
        await AuditService.logAction(
          user.uid,
          user.email,
          "PRINT_SEQUENCE_ADVANCED",
          batchId,
          "Batch Sheet Printing",
          { 
            completedSheetId: targetSheet.id, 
            completedBatchNumber: targetSheet.batchNumber,
            completedSequenceIndex: sheetIndex + 1
          },
          { 
            batchSheetRequestId: batchData.batchNumber || batchId,
            requestId: batchData.batchNumber || batchId,
            completedBatchNumber: targetSheet.batchNumber,
            nextReadySheetId: unlockedNextSheet.id, 
            nextBatchNumber: unlockedNextSheet.batchNumber,
            nextSequenceIndex: unlockedNextSheet.sequenceIndex + 1,
            status: 'READY_TO_PRINT',
            auditEventId: `AUD-ADV-${nowMs}`
          },
          `PRINT_SEQUENCE_ADVANCED: Unlocked next Batch Sheet #${unlockedNextSheet.sequenceIndex + 1} (${unlockedNextSheet.batchNumber})`,
          transaction,
          undefined,
          undefined,
          metadata?.ip,
          metadata?.userAgent,
          (batchData as any).branch || user?.branch || 'Masulkhana',
          (batchData as any).branch || user?.branch || 'Masulkhana',
          user?.role || 'ADMIN',
          user?.displayName || user?.username || user?.email
        );
      }

      // -------------------------------------------------------------
      // 8. Log PRINT_SEQUENCE_COMPLETED if all sheets completed
      // -------------------------------------------------------------
      if (allPrinted) {
        await AuditService.logAction(
          user.uid,
          user.email,
          "PRINT_SEQUENCE_COMPLETED",
          batchId,
          "Batch Sheet Printing",
          { 
            totalSheets: sheets.length, 
            previousBatchStatus: batchData.status 
          },
          { 
            batchSheetRequestId: batchData.batchNumber || batchId,
            requestId: batchData.batchNumber || batchId,
            totalBatchSheets: sheets.length, 
            completedBatchSheets: sheets.length,
            newBatchStatus: 'READY_FOR_PRODUCTION_HANDOVER',
            totalPrintAttempts: (batchData.totalPrintAttempts || 0) + 1,
            totalReprintAttempts: (batchData.totalReprintAttempts || 0),
            issueCount: sheets.filter(s => (s.attemptCount || 0) > 1).length,
            startTime: batchData.createdAt || nowIso,
            endTime: nowIso,
            finalBatchNumber: targetSheet.batchNumber,
            finalActingUser: user.displayName || user.username || user.email,
            branch: (batchData as any).branch || user?.branch || 'Masulkhana',
            signatureId,
            signatureMeaning,
            auditEventId: `AUD-SEQ-END-${nowMs}`
          },
          `PRINT_SEQUENCE_COMPLETED: All ${sheets.length} Batch Sheets printed and certified. Batch status advanced to READY_FOR_PRODUCTION_HANDOVER.`,
          transaction,
          signatureId,
          signatureMeaning,
          metadata?.ip,
          metadata?.userAgent,
          (batchData as any).branch || user?.branch || 'Masulkhana',
          (batchData as any).branch || user?.branch || 'Masulkhana',
          user?.role || 'ADMIN',
          user?.displayName || user?.username || user?.email
        );
      }

      return {
        batchId,
        sheet: targetSheet,
        batchSheets: sheets,
        unlockedNextSheet,
        allPrinted,
        signatureId,
        auditEventId
      };
    });

    if (notificationToDispatch) {
      try {
        await NotificationService.sendNotification(notificationToDispatch);
      } catch (err) {
        console.warn("[PrintService] Handover notification failed:", err);
      }
    }
  }

  /**
   * Releases an active print lock and logs to audit trail.
   */
  static async releasePrintLock(
    batchId: string,
    sheetId: string,
    user: any,
    reason: string = 'Operator manual lock release',
    metadata?: any
  ) {
    await ensureAuth();

    return await runTransaction(db, async (transaction) => {
      const batchRef = doc(db, "production_batches", batchId);
      const batchDoc = await transaction.get(batchRef);

      if (!batchDoc.exists()) throw new Error("Batch not found.");
      const batchData = batchDoc.data() as BatchIssuance;
      const sheets = initializeBatchSheetsHelper(batchData);

      const sheetIndex = sheets.findIndex(
        s => s.id === sheetId || String(s.sequenceIndex) === sheetId || s.batchNumber === sheetId
      );
      if (sheetIndex === -1) throw new Error("Batch Sheet not found.");

      const targetSheet = sheets[sheetIndex];
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const auditEventId = `AUD-REL-${nowMs}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      targetSheet.activeLock = null;
      if (targetSheet.status === 'PRINTING' || targetSheet.status === 'REPRINTING' || targetSheet.status === 'AWAITING_USER_CONFIRMATION') {
        targetSheet.status = targetSheet.reprintPages ? 'REPRINT_REQUIRED' : 'READY_TO_PRINT';
      }

      const historyEntry: BatchSheetPrintHistoryEntry = {
        id: auditEventId,
        printJobId: targetSheet.currentPrintJobId || null,
        action: 'LOCK_RELEASED',
        status: targetSheet.status,
        timestamp: nowIso,
        performedBy: user?.displayName || user?.username || user?.email || 'Operator',
        userId: user?.uid || 'unknown',
        userEmail: user?.email || 'operator@brims.internal',
        userRole: user?.role || 'ADMIN',
        employeeId: user?.employeeId || 'N/A',
        branch: (batchData as any).branch || user?.branch || 'Masulkhana',
        reason: reason || 'Print lock released manually',
        ipAddress: metadata?.ip || null,
        userAgent: metadata?.userAgent || null
      };

      if (!targetSheet.history) targetSheet.history = [];
      targetSheet.history.push(historyEntry);

      sheets[sheetIndex] = targetSheet;

      transaction.update(batchRef, sanitizeForFirestore({
        batchSheets: sheets,
        activePrintLock: null,
        updatedAt: nowIso,
        updatedBy: user?.uid || null
      }));

      await AuditService.logAction(
        user?.uid || 'unknown',
        user?.email || 'operator@brims.internal',
        "PRINT_LOCK_RELEASED",
        batchId,
        "Batch Sheet Printing",
        { sheetId: targetSheet.id, batchNumber: targetSheet.batchNumber },
        { 
          batchSheetRequestId: batchData.batchNumber || batchId,
          requestId: batchData.batchNumber || batchId,
          batchNumber: targetSheet.batchNumber,
          sheetId: targetSheet.id, 
          newStatus: targetSheet.status,
          reason,
          auditEventId
        },
        `PRINT_LOCK_RELEASED: Batch Sheet ${targetSheet.batchNumber} - ${reason}`,
        transaction,
        undefined,
        undefined,
        metadata?.ip,
        metadata?.userAgent,
        (batchData as any).branch || user?.branch || 'Masulkhana',
        (batchData as any).branch || user?.branch || 'Masulkhana',
        user?.role || 'ADMIN',
        user?.displayName || user?.username || user?.email
      );

      return {
        batchId,
        sheet: targetSheet,
        batchSheets: sheets,
        auditEventId
      };
    });
  }

  /**
   * Retrieves the current sequential print queue status.
   */
  static async getPrintQueueStatus(batchId: string) {
    await ensureAuth();
    const batchRef = doc(db, "production_batches", batchId);
    const batchDoc = await getDoc(batchRef);

    if (!batchDoc.exists()) {
      throw new Error(`Production batch '${batchId}' not found.`);
    }

    const batchData = batchDoc.data() as BatchIssuance;
    const sheets = initializeBatchSheetsHelper(batchData);

    const totalSheets = sheets.length;
    const printedCount = sheets.filter(s => s.status === 'PRINT_COMPLETED' || s.status === 'PRINTED' || s.status === 'REPRINTED').length;
    const awaitingConfirmationSheet = sheets.find(s => s.status === 'AWAITING_USER_CONFIRMATION' || s.status === 'PRINT_INITIATED') || null;
    const nextReadySheet = sheets.find(s => s.status === 'READY_TO_PRINT' || s.status === 'REPRINT_REQUIRED' || s.status === 'PRINTING_ISSUE') || null;
    const activeLock = batchData.activePrintLock || sheets.find(s => s.activeLock != null)?.activeLock || null;
    const hasInterruption = sheets.some(s => s.status === 'PRINTING_ISSUE' || s.status === 'INTERRUPTED' || s.status === 'PRINT_FAILED');

    return {
      batchId,
      batchNumber: batchData.batchNumber,
      overallBatchStatus: batchData.status,
      printSequenceStatus: batchData.printSequenceStatus || (printedCount === totalSheets ? 'COMPLETED' : printedCount > 0 ? 'IN_PROGRESS' : 'NOT_STARTED'),
      totalSheets,
      printedCount,
      progressPercentage: totalSheets > 0 ? Math.round((printedCount / totalSheets) * 100) : 0,
      allPrinted: totalSheets > 0 && printedCount === totalSheets,
      hasInterruption,
      activeLock,
      awaitingConfirmationSheet,
      nextReadySheet,
      batchSheets: sheets
    };
  }
}
