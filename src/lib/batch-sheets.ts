import { BatchIssuance, BatchSheetItem, PrintJobStatus, getUserBaseRole } from '../types';

/**
 * Expands a batch series string (e.g. "001-005" or "001, 002, 003") into an array of individual batch sheet strings.
 */
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

/**
 * Computes human-readable custody location conforming to 21 CFR Part 11 integrity rules
 */
export function computeSheetCustody(sheet: BatchSheetItem, batchStatus?: string): string {
  if (sheet.discardStatus === 'DISCARDED_VERSION_CHANGE' || sheet.status === 'DISCARDED') {
    if (sheet.returnToQaStatus === 'RECEIVED_BACK_BY_QA') {
      return 'QA – Received & Reconciled (Discarded)';
    }
    if (sheet.returnToQaStatus === 'RETURNED_BY_PRODUCTION_AWAITING_QA_RECEIPT') {
      return 'Awaiting QA Receipt (Returned by Production)';
    }
    if (sheet.returnToQaStatus === 'AWAITING_PRODUCTION_RETURN' || sheet.returnToQaStatus === 'AWAITING_RETURN_TO_QA' || sheet.returnToQaRequired) {
      return 'Production – Awaiting Return to QA';
    }
    return sheet.currentCustody || 'QA – Discarded';
  }

  if (sheet.currentCustody) return sheet.currentCustody;

  if (sheet.qaReviewStatus === 'QA_REVIEW_COMPLETED') {
    return 'QA – Reviewed';
  }
  if (sheet.qaReceiptStatus === 'RECEIVED_BY_QA') {
    return 'QA – Under Review';
  }
  if (sheet.qaReturnStatus === 'SENT_FOR_QA_REVIEW') {
    return 'QA – Awaiting Receipt';
  }
  if (sheet.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION') {
    return 'Production';
  }
  if (sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION') {
    return 'QA – Handed Over / Awaiting Production Receipt';
  }
  const isPrinted = sheet.status === 'PRINT_COMPLETED' || sheet.status === 'PRINTED' || sheet.status === 'REPRINTED' || (sheet.printCount || 0) > 0;
  if (isPrinted) {
    return 'QA – Printed / Pending Handover';
  }
  return 'QA – Awaiting Printing';
}

/**
 * Normalizes an individual batch sheet item to ensure all custody and operational fields exist.
 */
export function normalizeBatchSheetItem(sheet: BatchSheetItem, batchStatus: string = 'ISSUED'): BatchSheetItem {
  const isPrinted = sheet.status === 'PRINT_COMPLETED' || sheet.status === 'PRINTED' || sheet.status === 'REPRINTED' || (sheet.printCount || 0) > 0;

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
    if (['COMPLETED'].includes(batchStatus)) {
      qaReceiptStatus = 'RECEIVED_BY_QA';
    } else if (['READY_FOR_QA_REVIEW'].includes(batchStatus)) {
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

  normalized.currentCustody = computeSheetCustody(normalized, batchStatus);
  return normalized;
}

/**
 * Ensures that a BatchIssuance object always has an array of BatchSheetItems,
 * populating it client-side if it was not provided by the backend response.
 */
export function initializeBatchSheetsClient(batchData: BatchIssuance): BatchSheetItem[] {
  if (Array.isArray(batchData.batchSheets) && batchData.batchSheets.length > 0) {
    return batchData.batchSheets.map(s => normalizeBatchSheetItem(s, batchData.status));
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
      initialStatus = 'PRINT_COMPLETED';
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
      attemptCount: isAlreadyPrinted ? 1 : 0,
      activeLock: null,
      printedAt: isAlreadyPrinted ? (batchData.completedAt || batchData.updatedAt || batchData.createdAt || null) : null,
      printedBy: isAlreadyPrinted ? (batchData.completedBy || batchData.issuedBy || null) : null,
      printedByName: isAlreadyPrinted ? (batchData.completedByName || batchData.issuedByName || 'Operator') : null,
      printedByEmployeeId: isAlreadyPrinted ? (batchData.completedByEmployeeId || 'N/A') : null,
      completedAt: isAlreadyPrinted ? (batchData.completedAt || batchData.updatedAt || batchData.createdAt || null) : null,
      completedBy: isAlreadyPrinted ? (batchData.completedBy || batchData.issuedBy || null) : null,
      completedByName: isAlreadyPrinted ? (batchData.completedByName || batchData.issuedByName || 'Operator') : null,
      completedByEmployeeId: isAlreadyPrinted ? (batchData.completedByEmployeeId || 'N/A') : null,
      history: isAlreadyPrinted ? [
        {
          id: `hist-${idx}-init`,
          action: 'PRINT_COMPLETED',
          status: 'PRINT_COMPLETED',
          timestamp: batchData.completedAt || batchData.updatedAt || batchData.createdAt || new Date().toISOString(),
          performedBy: batchData.completedByName || batchData.issuedByName || 'Operator',
          userId: batchData.completedBy || batchData.issuedBy || 'system',
          userEmail: 'operator@brims.internal',
          userRole: batchData.completedByRole || 'ADMIN',
          employeeId: batchData.completedByEmployeeId || 'N/A',
          reason: 'Initial Batch Sheet Print',
          copyNumber: 1
        }
      ] : [],
      printJobs: []
    };

    return normalizeBatchSheetItem(item, batchData.status);
  });
}

export function computeHandoverProgress(sheets: BatchSheetItem[]) {
  const total = sheets.length;
  const handedOverCount = sheets.filter(s => s.handoverStatus === 'HANDED_OVER_TO_PRODUCTION').length;
  const productionReceivedCount = sheets.filter(s => s.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION').length;
  const pendingHandoverCount = sheets.filter(s => s.handoverStatus !== 'HANDED_OVER_TO_PRODUCTION').length;
  const awaitingProductionReceiptCount = sheets.filter(s => s.handoverStatus === 'HANDED_OVER_TO_PRODUCTION' && s.productionReceiptStatus !== 'RECEIVED_BY_PRODUCTION').length;
  const percent = total > 0 ? Math.round((handedOverCount / total) * 100) : 0;

  return {
    total,
    handedOverCount,
    productionReceivedCount,
    pendingHandoverCount,
    awaitingProductionReceiptCount,
    percent
  };
}

export function computeQaReviewProgress(sheets: BatchSheetItem[]) {
  const total = sheets.length;
  const sentForReviewCount = sheets.filter(s => s.qaReturnStatus === 'SENT_FOR_QA_REVIEW').length;
  const qaReceivedCount = sheets.filter(s => s.qaReceiptStatus === 'RECEIVED_BY_QA').length;
  const reviewedCount = sheets.filter(s => s.qaReviewStatus === 'QA_REVIEW_COMPLETED').length;
  const stillInProductionCount = sheets.filter(s => s.qaReturnStatus !== 'SENT_FOR_QA_REVIEW').length;
  const percent = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

  return {
    total,
    sentForReviewCount,
    qaReceivedCount,
    reviewedCount,
    stillInProductionCount,
    percent
  };
}

export interface SheetEligibilityResult {
  isReady: boolean;
  isReprintRequired: boolean;
  isPrinting: boolean;
  isAwaitingConfirmation: boolean;
  isPrinted: boolean;
  isPending: boolean;
  isInterrupted: boolean;
  isCurrentSheetLockedByMe: boolean;
  isAnotherSheetLocked: boolean;
  hasPrintPerm: boolean;
  isBatchPrintable: boolean;
  allPriorCompleted: boolean;
  priorIncompleteSheet?: BatchSheetItem;
  disabledReason: string;
  activeLockedSheet?: BatchSheetItem;
}

/**
 * Validates sequential print eligibility matching the GAMP 5 sequential backend state machine.
 */
export function evaluateSheetEligibility(
  issuance: BatchIssuance,
  sheet: BatchSheetItem,
  sheetIndex: number,
  allSheets: BatchSheetItem[],
  user: any
): SheetEligibilityResult {
  const baseRole = getUserBaseRole(user);
  const userPerms = user?.permissions || [];
  const hasPrintPerm = baseRole === 'ADMIN' || baseRole === 'QA' || userPerms.some((p: string) => ['batch:print', 'op:issued', 'batch:create'].includes(p));

  const isBatchPrintable = issuance.status === 'ISSUED' || issuance.status === 'IN_PROGRESS';

  // Lock checks
  const activeLockedSheet = allSheets.find(s => s.activeLock != null);
  const isAnotherSheetLocked = !!activeLockedSheet && activeLockedSheet.id !== sheet.id && activeLockedSheet.activeLock?.lockedBy !== user?.uid;
  const isCurrentSheetLockedByMe = !!sheet.activeLock && sheet.activeLock?.lockedBy === user?.uid;

  // Check preceding sequence order: every prior sheet must be verified PRINT_COMPLETED
  let priorIncompleteSheet: BatchSheetItem | undefined;
  let allPriorCompleted = true;
  for (let i = 0; i < sheetIndex; i++) {
    const prev = allSheets[i];
    const isPrevDone = prev.status === 'PRINT_COMPLETED' || prev.status === 'PRINTED' || prev.status === 'REPRINTED';
    if (!isPrevDone) {
      priorIncompleteSheet = prev;
      allPriorCompleted = false;
      break;
    }
  }

  const isRawReadyToPrint = sheet.status === 'READY_TO_PRINT';
  const isReprintRequired = sheet.status === 'REPRINT_REQUIRED' || sheet.status === 'PRINTING_ISSUE';
  const isAwaitingConfirmation = sheet.status === 'AWAITING_USER_CONFIRMATION' || sheet.status === 'PRINT_INITIATED';
  const isPrinting = sheet.status === 'PRINTING' || sheet.status === 'REPRINTING' || isAwaitingConfirmation;
  const isPrinted = sheet.status === 'PRINT_COMPLETED' || sheet.status === 'PRINTED' || sheet.status === 'REPRINTED';
  const isInterrupted = sheet.status === 'INTERRUPTED' || sheet.status === 'PRINTING_ISSUE' || sheet.status === 'PRINT_FAILED';
  const isPending = sheet.status === 'PENDING' || sheet.status === 'PENDING_SEQUENCE';
  
  // A sheet is eligible to print if:
  // 1. Explicitly marked READY_TO_PRINT or (PENDING and all prior completed and no prior incomplete)
  // 2. Or isReprintRequired
  const isSequenceEligible = isRawReadyToPrint || isReprintRequired || (isPending && allPriorCompleted && !priorIncompleteSheet);

  // Strict Sequential Enforcement: Only the active next ready sheet is enabled for printing
  const isReady = isSequenceEligible && hasPrintPerm && isBatchPrintable && !isAnotherSheetLocked && allPriorCompleted && !isPrinting && !isPrinted;

  let disabledReason = '';
  if (!isBatchPrintable) {
    disabledReason = `Batch is ${issuance.status} (Printable when Issued)`;
  } else if (!hasPrintPerm) {
    disabledReason = 'Print authorization required';
  } else if (isAnotherSheetLocked) {
    disabledReason = `Locked: Sheet #${(activeLockedSheet?.sequenceIndex ?? 0) + 1} (${activeLockedSheet?.batchNumber}) actively printing`;
  } else if (priorIncompleteSheet) {
    disabledReason = `Locked: Sheet #${priorIncompleteSheet.sequenceIndex + 1} (${priorIncompleteSheet.batchNumber}) must be printed & confirmed first`;
  } else if (!allPriorCompleted) {
    disabledReason = `Locked: Preceding Batch Sheets must be completed first`;
  } else if (isAwaitingConfirmation) {
    disabledReason = 'Print confirmation pending (Check printed output)';
  } else if (isPrinting) {
    disabledReason = isCurrentSheetLockedByMe ? 'Print in progress' : 'Printing in progress by another operator';
  } else if (isPrinted) {
    disabledReason = `Completed (${sheet.printCount || 1} copies verified)`;
  } else if (isReprintRequired) {
    disabledReason = 'Printing issue reported (Reprint required)';
  } else if (isPending) {
    disabledReason = 'Waiting in sequential queue';
  }

  return {
    isReady,
    isReprintRequired,
    isPrinting,
    isAwaitingConfirmation,
    isPrinted,
    isPending,
    isInterrupted,
    isCurrentSheetLockedByMe,
    isAnotherSheetLocked,
    hasPrintPerm,
    isBatchPrintable,
    allPriorCompleted,
    priorIncompleteSheet,
    disabledReason,
    activeLockedSheet
  };
}

/**
 * Determines whether an individual batch sheet has reached final completion in the issuance lifecycle.
 */
export function isSheetCompleted(sheet: BatchSheetItem, parentStatus?: string): boolean {
  if (isSheetDiscarded(sheet)) return false;
  if (sheet.qaReviewStatus === 'QA_REVIEW_COMPLETED') return true;
  if (sheet.currentOperationalState === 'QA_REVIEW_COMPLETED') return true;
  if (parentStatus === 'COMPLETED' && !sheet.discardStatus && !sheet.discardReason) return true;
  return false;
}

/**
 * Determines whether an individual batch sheet has been discarded due to version change or rejection.
 */
export function isSheetDiscarded(sheet: BatchSheetItem): boolean {
  if (!sheet) return false;
  if (sheet.discardStatus === 'DISCARDED_DUE_TO_VERSION_CHANGE') return true;
  if (sheet.discardReason === 'Discarded due to Version Change') return true;
  if (Boolean(sheet.discardedAt)) return true;
  const statusStr = String(sheet.discardStatus || '').toUpperCase();
  if (statusStr.includes('DISCARD')) return true;
  return false;
}

/**
 * Computes the human-readable operational state of an individual batch sheet.
 */
export function getIndividualSheetState(sheet: BatchSheetItem, parentStatus?: string): string {
  if (isSheetDiscarded(sheet)) {
    return 'Discarded due to Version Change';
  }
  if (isSheetCompleted(sheet, parentStatus)) {
    return 'Completed';
  }
  if (sheet.qaReviewStatus === 'UNDER_QA_REVIEW' || (sheet.qaReceiptStatus === 'RECEIVED_BY_QA' && sheet.qaReviewStatus !== 'QA_REVIEW_COMPLETED')) {
    return 'QA Review In Progress';
  }
  if (sheet.qaReceiptStatus === 'RECEIVED_BY_QA') {
    return 'Received by QA';
  }
  if (sheet.qaReturnStatus === 'SENT_FOR_QA_REVIEW' || sheet.qaReceiptStatus === 'AWAITING_QA_RECEIPT') {
    return 'Sent for QA Review';
  }
  if (sheet.qaReturnStatus === 'READY_FOR_QA_REVIEW') {
    return 'Waiting to be sent to QA';
  }
  if (sheet.productionStatus === 'IN_PROGRESS') {
    return 'Production In Progress';
  }
  if (sheet.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION') {
    return 'Received by Production';
  }
  if (sheet.productionReceiptStatus === 'AWAITING_PRODUCTION_RECEIPT' || sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION') {
    return 'Handed Over / Awaiting Production Receipt';
  }
  const isPrinted = sheet.status === 'PRINT_COMPLETED' || sheet.status === 'PRINTED' || sheet.status === 'REPRINTED' || (sheet.printCount || 0) > 0;
  if (isPrinted) {
    return 'Printed / Pending Handover';
  }
  return 'Awaiting Printing';
}

/**
 * Determines physical custody and return-to-QA reconciliation state for a discarded batch sheet.
 */
export function computeDiscardReconciliation(sheet: BatchSheetItem, parentStatus?: string): {
  returnToQaStatus: 'NOT_REQUIRED_ALREADY_WITH_QA' | 'AWAITING_PRODUCTION_RETURN' | 'RETURNED_BY_PRODUCTION_AWAITING_QA_RECEIPT' | 'RECEIVED_BACK_BY_QA' | 'CUSTODY_RECONCILIATION_REQUIRED';
  custody: string;
} {
  // If already returned or received back:
  if (sheet.returnToQaStatus === 'RECEIVED_BACK_BY_QA') {
    return { returnToQaStatus: 'RECEIVED_BACK_BY_QA', custody: 'QA' };
  }
  if (sheet.returnToQaStatus === 'RETURNED_BY_PRODUCTION_AWAITING_QA_RECEIPT') {
    return { returnToQaStatus: 'RETURNED_BY_PRODUCTION_AWAITING_QA_RECEIPT', custody: 'Awaiting QA Receipt' };
  }
  if (sheet.returnToQaStatus === 'NOT_REQUIRED_ALREADY_WITH_QA') {
    return { returnToQaStatus: 'NOT_REQUIRED_ALREADY_WITH_QA', custody: 'QA' };
  }
  if (sheet.returnToQaStatus === 'AWAITING_PRODUCTION_RETURN') {
    return { returnToQaStatus: 'AWAITING_PRODUCTION_RETURN', custody: 'Production' };
  }

  // Determine from physical history
  const custody = sheet.currentCustody || computeSheetCustody(sheet, parentStatus);

  // If physically with Production
  if (custody === 'Production' || sheet.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION') {
    return { returnToQaStatus: 'AWAITING_PRODUCTION_RETURN', custody: 'Production' };
  }

  // If physically with QA (never handed over, or already returned to QA)
  if (
    custody.startsWith('QA') ||
    sheet.qaReceiptStatus === 'RECEIVED_BY_QA' ||
    sheet.qaReturnStatus === 'SENT_FOR_QA_REVIEW' ||
    sheet.qaReviewStatus === 'QA_REVIEW_COMPLETED' ||
    sheet.handoverStatus !== 'HANDED_OVER_TO_PRODUCTION'
  ) {
    return { returnToQaStatus: 'NOT_REQUIRED_ALREADY_WITH_QA', custody: 'QA' };
  }

  // If in transit / handed over but not yet received by production
  if (sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION') {
    return { returnToQaStatus: 'AWAITING_PRODUCTION_RETURN', custody: 'Production' };
  }

  return { returnToQaStatus: 'CUSTODY_RECONCILIATION_REQUIRED', custody: custody || 'Unknown' };
}

/**
 * Resolves the "Issued By" string for PDF overlays and batch display.
 * In 21 CFR Part 11 and EU Annex 11 GMP compliance, a batch sheet is officially issued
 * by the QA user who approves the Batch sheet Request (e.g. "QA Incharge (Krishan Kumar)"),
 * NOT by the Production Incharge / Operator who created/requested it.
 */
export function getBatchIssuedByString(batch: any, users?: any[], timeline?: any[]): string {
  if (!batch) return 'QA Incharge (Krishan Kumar)';

  // 1. If explicit approvedByName and approvedByRole are provided on the batch
  if (batch.approvedByName) {
    const role = batch.approvedByRole || 'QA Incharge';
    return `${role} (${batch.approvedByName})`;
  }

  // 2. Check if timeline has an approval entry
  if (Array.isArray(timeline) && timeline.length > 0) {
    const approveEntry = timeline.find((t: any) => 
      t.action === 'APPROVE' || 
      t.action === 'APPROVE_BATCH' || 
      t.action === 'APPROVE_BATCH_ISSUANCE' || 
      t.newStatus === 'APPROVED' || 
      t.newStatus === 'ISSUED'
    );
    if (approveEntry) {
      const emailOrId = approveEntry.userEmail || approveEntry.userId;
      const matchedUser = Array.isArray(users) ? users.find((u: any) => 
        u.id === emailOrId || u.uid === emailOrId || (u.email && emailOrId && u.email.toLowerCase() === emailOrId.toLowerCase())
      ) : null;
      if (matchedUser) {
        const role = matchedUser.designation || matchedUser.designationName || matchedUser.role || 'QA Incharge';
        const name = matchedUser.displayName || matchedUser.name || matchedUser.username;
        if (name) return `${role} (${name})`;
      }
      if (approveEntry.userName || approveEntry.performedBy) {
        const role = approveEntry.role || approveEntry.functionalRole || 'QA Incharge';
        return `${role} (${approveEntry.userName || approveEntry.performedBy})`;
      }
    }
  }

  // 3. If batch.approvedBy is set and users array is available
  if (batch.approvedBy && Array.isArray(users)) {
    const matchedUser = users.find((u: any) => u.id === batch.approvedBy || u.uid === batch.approvedBy || u.email === batch.approvedBy);
    if (matchedUser) {
      const role = matchedUser.designation || matchedUser.designationName || matchedUser.role || 'QA Incharge';
      const name = matchedUser.displayName || matchedUser.name || matchedUser.username;
      if (name) return `${role} (${name})`;
    }
  }

  // 4. If batch.issuedByName is set:
  // If its role is QA or Admin (NOT Production or Operator), use it!
  if (batch.issuedByName) {
    const role = batch.issuedByRole || '';
    const isProduction = /production|operator|requester/i.test(role);
    if (!isProduction && role) {
      return `${role} (${batch.issuedByName})`;
    }
  }

  // 5. If users list is available, look for an active QA Incharge or QA Manager in the branch
  if (Array.isArray(users)) {
    const qaIncharge = users.find((u: any) => 
      (u.designation?.toLowerCase().includes('qa incharge') || u.role?.toLowerCase().includes('qa incharge')) &&
      u.status === 'active'
    ) || users.find((u: any) => 
      (u.department?.toLowerCase().includes('quality') || u.role?.toLowerCase().includes('qa')) &&
      u.status === 'active'
    );
    if (qaIncharge) {
      const role = qaIncharge.designation || qaIncharge.role || 'QA Incharge';
      const name = qaIncharge.displayName || qaIncharge.name;
      if (name) return `${role} (${name})`;
    }
  }

  // Standard GMP QA Issuer fallback
  return 'QA Incharge (Krishan Kumar)';
}

/**
 * Formats a user into "Full Name (Designation)".
 * Strictly cleans up any pre-existing parenthetical text inside displayName (e.g. "Akshay Sharma (Admin)" -> "Akshay Sharma")
 * and extracts their official Designation from the user profile.
 */
export function getUserFullNameWithDesignation(user: any): string {
  if (!user) return 'Akshay Sharma (Admin)';

  let rawName = user.name || user.displayName || user.username || (user.email ? user.email.split('@')[0] : 'Akshay Sharma');
  // Strip trailing parenthetical e.g. "Akshay Sharma (Admin)" -> "Akshay Sharma"
  let cleanName = String(rawName).replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!cleanName) cleanName = 'Akshay Sharma';

  // Extract official designation: prefer designation, designationName, functionalRole, then role
  let designation = user.designation || user.designationName || user.functionalRole;
  if (!designation) {
    if (user.role) {
      designation = user.role.toUpperCase() === 'ADMIN' ? 'Admin' : user.role;
    } else {
      designation = 'Admin';
    }
  }

  return `${cleanName} (${designation})`;
}

/**
 * Resolves the "Printed By" string for a particular batch sheet.
 * In 21 CFR Part 11 and EU Annex 11 GMP compliance, each particular sheet's printedBy
 * must reflect the Full Name(Designation) of the user who presses the Print button for that sheet.
 * 
 * If the sheet has already been printed, it extracts who printed that sheet.
 * If currentUser is actively printing or previewing before print, it uses the currentUser.
 */
export function getSheetPrintedByString(sheet?: any, currentUser?: any, users?: any[]): string {
  // If active user is actively initiating a print or sheet is not yet printed
  if (currentUser) {
    const isAlreadyPrinted = sheet && ['PRINTED', 'PRINT_COMPLETED', 'REPRINTED'].includes(sheet.status);
    if (!isAlreadyPrinted) {
      return getUserFullNameWithDesignation(currentUser);
    }
  }

  // If sheet was already printed by a user, resolve that user
  if (sheet) {
    // 1. If explicit printedByName is recorded on sheet
    if (sheet.printedByName) {
      let rawName = sheet.printedByName;
      let cleanName = String(rawName).replace(/\s*\([^)]*\)\s*$/, '').trim();
      let desig = sheet.printedByDesignation || sheet.printedByRole;
      if (!desig && Array.isArray(users) && sheet.printedBy) {
        const matched = users.find((u: any) => u.id === sheet.printedBy || u.uid === sheet.printedBy);
        if (matched) {
          desig = matched.designation || matched.designationName || matched.role;
        }
      }
      if (!desig) desig = 'Operator';
      return `${cleanName} (${desig})`;
    }

    // 2. If completedByName has print entry
    if (sheet.completedByName) {
      let cleanName = String(sheet.completedByName).replace(/\s*\([^)]*\)\s*$/, '').trim();
      let desig = sheet.completedByDesignation || sheet.completedByRole || 'Operator';
      return `${cleanName} (${desig})`;
    }

    // 3. Check printJobs on the sheet
    if (Array.isArray(sheet.printJobs) && sheet.printJobs.length > 0) {
      const lastJob = sheet.printJobs[sheet.printJobs.length - 1];
      if (lastJob.userName) {
        let cleanName = String(lastJob.userName).replace(/\s*\([^)]*\)\s*$/, '').trim();
        let desig = lastJob.userRole || 'Operator';
        if (Array.isArray(users) && lastJob.userId) {
          const matched = users.find((u: any) => u.id === lastJob.userId || u.uid === lastJob.userId);
          if (matched) desig = matched.designation || matched.designationName || matched.role || desig;
        }
        return `${cleanName} (${desig})`;
      }
    }
  }

  // Fallback to currentUser if available
  if (currentUser) {
    return getUserFullNameWithDesignation(currentUser);
  }

  return 'Akshay Sharma (Admin)';
}


