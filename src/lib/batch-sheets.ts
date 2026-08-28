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
 * Ensures that a BatchIssuance object always has an array of BatchSheetItems,
 * populating it client-side if it was not provided by the backend response.
 */
export function initializeBatchSheetsClient(batchData: BatchIssuance): BatchSheetItem[] {
  if (Array.isArray(batchData.batchSheets) && batchData.batchSheets.length > 0) {
    return batchData.batchSheets;
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

    return {
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
  });
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
