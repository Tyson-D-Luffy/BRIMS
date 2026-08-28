import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  FileText, 
  RotateCcw, 
  History, 
  ShieldCheck, 
  Lock, 
  Unlock, 
  Eye, 
  Loader2, 
  AlertCircle,
  XCircle,
  Copy,
  ChevronRight,
  Download,
  Check,
  X,
  FileCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { toast } from 'sonner';
import api from '../services/api';
import { BatchIssuance, BatchSheetItem, PrintJobStatus, ProductMaster, getUserBaseRole, BatchSheetPrintHistoryEntry, PrintJob } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatRequestId, generateRequestPreviewPDF } from '../lib/pdf-generator';
import { initializeBatchSheetsClient, evaluateSheetEligibility } from '../lib/batch-sheets';
import { parseAndValidatePageSelection, extractSelectedPagesPDF, getPDFPageCount } from '../lib/page-parser';
import { SecurePDFViewer } from './SecurePDFViewer';
import { cn } from '../lib/utils';

interface SequentialPrintManagerProps {
  batch: BatchIssuance;
  productMaster: ProductMaster | null;
  onBatchUpdated: () => Promise<void>;
}

const ISSUE_REASONS = [
  'Printer Jam',
  'Paper Finished',
  'Partial Printing',
  'Printer Offline',
  'Network Interruption',
  'Print Job Cancelled',
  'Incorrect Pages Printed',
  'PDF Download Interrupted',
  'Damaged/Unreadable Print',
  'Other'
];

export function SequentialPrintManager({
  batch,
  productMaster,
  onBatchUpdated
}: SequentialPrintManagerProps) {
  const { user } = useAuth();
  const sheets: BatchSheetItem[] = initializeBatchSheetsClient(batch);

  // Active print & confirmation modal states
  const [activePrintingSheet, setActivePrintingSheet] = useState<BatchSheetItem | null>(null);
  const [isPostPrintConfirmationOpen, setIsPostPrintConfirmationOpen] = useState(false);
  const [isPrintCompletedConfirmOpen, setIsPrintCompletedConfirmOpen] = useState(false);
  
  // Issue & Reprint Modal States
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isReprintConfirmModalOpen, setIsReprintConfirmModalOpen] = useState(false);
  const [selectedSheetForIssue, setSelectedSheetForIssue] = useState<BatchSheetItem | null>(null);
  
  // Form values for Issue reporting & Reprint
  const [issueReasonPreset, setIssueReasonPreset] = useState('Printer Jam');
  const [issuePagesInput, setIssuePagesInput] = useState('');
  const [issueComments, setIssueComments] = useState('');
  const [validatedReprintInfo, setValidatedReprintInfo] = useState<{
    normalizedString: string;
    selectedPages: number[];
    totalSelected: number;
  } | null>(null);

  // Independent Audit Modal State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedSheetForAudit, setSelectedSheetForAudit] = useState<BatchSheetItem | null>(null);

  // Electronic Signature Password
  const [signaturePassword, setSignaturePassword] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);

  // PDF Preview for individual sheet
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewSheetNumber, setPreviewSheetNumber] = useState<string>('');
  const [generatingPreview, setGeneratingPreview] = useState(false);

  // Auto-detect if any sheet is in 'AWAITING_USER_CONFIRMATION' or 'PRINTING_ISSUE' on mount or batch update
  useEffect(() => {
    const pendingSheet = sheets.find(s => s.status === 'AWAITING_USER_CONFIRMATION' || s.status === 'PRINT_INITIATED');
    if (pendingSheet && !activePrintingSheet && !isPostPrintConfirmationOpen && !isIssueModalOpen && !isReprintConfirmModalOpen) {
      setActivePrintingSheet(pendingSheet);
    }
  }, [batch]);

  // Calculations
  const totalSheets = sheets.length;
  const printedCount = sheets.filter(s => s.status === 'PRINT_COMPLETED' || s.status === 'PRINTED' || s.status === 'REPRINTED').length;
  const progressPercent = totalSheets > 0 ? Math.round((printedCount / totalSheets) * 100) : 0;
  const hasInterruption = sheets.some(s => s.status === 'PRINTING_ISSUE' || s.status === 'INTERRUPTED' || s.status === 'REPRINT_REQUIRED');
  const allPrinted = totalSheets > 0 && printedCount === totalSheets;

  const baseRole = getUserBaseRole(user);
  const userPerms = user?.permissions || [];
  const canPrint = baseRole === 'ADMIN' || baseRole === 'QA' || userPerms.some(p => ['batch:print', 'op:issued', 'batch:create'].includes(p));

  // Determine active locked sheet (if any)
  const activeLockedSheet = sheets.find(s => s.activeLock != null);
  const isLockActive = !!activeLockedSheet?.activeLock;
  const isCurrentUserLock = isLockActive && activeLockedSheet?.activeLock?.lockedBy === user?.uid;

  // Generate & download full PDF for a specific sheet
  const handleGenerateSheetPDF = async (sheet: BatchSheetItem, isDirectPrint: boolean = false): Promise<{ url: string; arrayBuffer: ArrayBuffer; totalPages: number } | null> => {
    const masterSnapshot = batch.recordInfo?.masterSnapshot;
    if (!masterSnapshot) {
      toast.error('No master snapshot found in batch record.');
      return null;
    }

    const computedReqId = formatRequestId(
      sheet.batchNumber,
      batch.createdAt || batch.manufacturingDate,
      productMaster?.title || productMaster?.batchNumberSeries,
      batch.id
    );

    const copyNum = (sheet.printCount || 0) + (isDirectPrint ? 1 : 0);

    const url = await generateRequestPreviewPDF({
      batchNumber: sheet.batchNumber,
      dropdownBatchSeries: (batch as any).dropdownBatchSeries || '',
      singlePagesBatchNumber: sheet.batchNumber,
      issueDate: batch.createdAt || batch.manufacturingDate || new Date().toISOString(),
      issuedBy: batch.issuedByName ? `${batch.issuedByRole || 'ADMIN'}(${batch.issuedByName})` : 'ADMIN(Akshay Sharma)',
      master: masterSnapshot,
      product: productMaster,
      userInfo: user ? { name: user.displayName || user.username || user.email || 'Unknown', id: user.employeeId || 'N/A' } : undefined,
      requestType: (copyNum > 1 || batch.requestType === 'REPRINT') ? 'REPRINT' : 'NEW',
      printCounts: { [sheet.batchNumber]: copyNum },
      requestId: computedReqId,
      isForPrint: isDirectPrint
    });

    if (!url) return null;

    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const totalPages = await getPDFPageCount(arrayBuffer);

    return { url, arrayBuffer, totalPages };
  };

  // Preview an individual batch sheet (view-only, does not alter print state or queue)
  const handlePreviewIndividualSheet = async (sheet: BatchSheetItem) => {
    setGeneratingPreview(true);
    setPreviewSheetNumber(sheet.batchNumber);
    try {
      const generated = await handleGenerateSheetPDF(sheet, false);
      if (generated?.url) {
        setPreviewUrl(generated.url);
        setIsPreviewOpen(true);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to generate preview for sheet ' + sheet.batchNumber);
    } finally {
      setGeneratingPreview(false);
    }
  };

  // Trigger browser download for a PDF blob
  const triggerDownload = (pdfBytes: Uint8Array | ArrayBuffer, fileName: string) => {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    const downloadUrl = URL.createObjectURL(blob);
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
  };

  // Start printing an individual batch sheet (Full Print)
  const handleStartPrint = async (sheet: BatchSheetItem) => {
    if (!canPrint) {
      toast.error('Access Denied: You do not have permission to print batch sheets.');
      return;
    }

    setLoadingAction(true);
    try {
      // 1. Generate full PDF and determine total pages
      const generated = await handleGenerateSheetPDF(sheet, true);
      if (!generated) {
        throw new Error('Failed to generate Batch Sheet PDF.');
      }

      // 2. Call backend to start print job & lock sequence
      const res = await api.post(`/batches/${batch.id}/sheets/${sheet.id}/start-print`, {
        isReprint: false,
        deliveryMethod: 'PDF_DOWNLOAD',
        totalPages: generated.totalPages
      });

      if (res.data.success) {
        toast.success(`Print initiated for Batch Sheet #${sheet.sequenceIndex + 1} (${sheet.batchNumber}).`);
        
        // 3. Download the PDF
        triggerDownload(generated.arrayBuffer, `Batch_${sheet.batchNumber}_Sheet_${sheet.sequenceIndex + 1}.pdf`);
        
        await onBatchUpdated();

        // 4. Open User Confirmation Dialog
        setActivePrintingSheet(sheet);
        setIsPostPrintConfirmationOpen(true);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || err.message || 'Failed to start printing sheet.');
    } finally {
      setLoadingAction(false);
    }
  };

  // Open "Print Completed" confirmation step
  const handleOpenPrintCompletedConfirmation = () => {
    setIsPostPrintConfirmationOpen(false);
    setIsPrintCompletedConfirmOpen(true);
  };

  // Final Confirmation of Print Completed
  const handleConfirmPrintCompleted = async () => {
    if (!activePrintingSheet) return;

    setLoadingAction(true);
    try {
      const res = await api.post(`/batches/${batch.id}/sheets/${activePrintingSheet.id}/complete-print`, {
        password: signaturePassword,
        comments: 'Printed and physical output verified by operator.'
      });

      if (res.data.success) {
        toast.success(`Batch Sheet #${activePrintingSheet.sequenceIndex + 1} (${activePrintingSheet.batchNumber}) verified and marked completed!`);
        setIsPrintCompletedConfirmOpen(false);
        setActivePrintingSheet(null);
        setSignaturePassword('');
        await onBatchUpdated();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to complete print verification.');
    } finally {
      setLoadingAction(false);
    }
  };

  // Open "Printing Issue" Dialog
  const handleOpenIssueModal = (sheet?: BatchSheetItem) => {
    const target = sheet || activePrintingSheet;
    if (!target) return;
    setSelectedSheetForIssue(target);
    setIssueReasonPreset('Printer Jam');
    setIssuePagesInput('ALL');
    setIssueComments('');
    setValidatedReprintInfo(null);
    setIsPostPrintConfirmationOpen(false);
    setIsIssueModalOpen(true);
  };

  // Validate pages and proceed to Reprint Confirmation
  const handleValidateAndProceedToReprint = () => {
    if (!selectedSheetForIssue) return;
    const totalPages = selectedSheetForIssue.totalPages || 60;
    
    // If user enters 'ALL', normalize to 1-totalPages
    const rawInput = issuePagesInput.trim().toUpperCase() === 'ALL' ? `1-${totalPages}` : issuePagesInput;

    const validation = parseAndValidatePageSelection(rawInput, totalPages);
    if (!validation.isValid) {
      toast.error(validation.error || 'Please specify valid page numbers to reprint.');
      return;
    }

    if (issueReasonPreset === 'Other' && !issueComments.trim()) {
      toast.error('Comments are mandatory when "Other" is selected.');
      return;
    }

    setValidatedReprintInfo({
      normalizedString: validation.normalizedString,
      selectedPages: validation.selectedPages,
      totalSelected: validation.totalSelected
    });

    setIsIssueModalOpen(false);
    setIsReprintConfirmModalOpen(true);
  };

  // Execute Selected-Page Reprint
  const handleExecuteSelectedPageReprint = async () => {
    if (!selectedSheetForIssue || !validatedReprintInfo) return;

    setLoadingAction(true);
    try {
      const sheet = selectedSheetForIssue;
      const totalPages = sheet.totalPages || 60;
      const fullReason = `${issueReasonPreset}${issueComments ? ` - ${issueComments.trim()}` : ''}`;

      // 1. Report issue to backend and save reprint pages
      await api.post(`/batches/${batch.id}/sheets/${sheet.id}/report-issue`, {
        issueReason: issueReasonPreset,
        requestedPages: validatedReprintInfo.normalizedString,
        comments: issueComments,
        totalPages
      });

      // 2. Generate original master PDF
      const masterGenerated = await handleGenerateSheetPDF(sheet, true);
      if (!masterGenerated) {
        throw new Error('Failed to generate base Batch Sheet PDF for page extraction.');
      }

      // 3. Extract ONLY selected pages into a derivative reprint PDF
      const extractedBytes = await extractSelectedPagesPDF(
        masterGenerated.arrayBuffer,
        validatedReprintInfo.selectedPages
      );

      // 4. Start child print job (REPRINT_INITIATED)
      const res = await api.post(`/batches/${batch.id}/sheets/${sheet.id}/start-print`, {
        isReprint: true,
        reprintReason: fullReason,
        deliveryMethod: 'PDF_DOWNLOAD',
        totalPages
      });

      if (res.data.success) {
        toast.success(`Reprint initiated for Pages: ${validatedReprintInfo.normalizedString} of Batch Sheet ${sheet.batchNumber}`);
        
        // 5. Download extracted pages PDF
        triggerDownload(
          extractedBytes,
          `Batch_${sheet.batchNumber}_REPRINT_Pages_${validatedReprintInfo.normalizedString}.pdf`
        );

        await onBatchUpdated();

        // 6. Return user to post-print confirmation
        setIsReprintConfirmModalOpen(false);
        setActivePrintingSheet(sheet);
        setIsPostPrintConfirmationOpen(true);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || err.message || 'Failed to execute page reprint.');
    } finally {
      setLoadingAction(false);
    }
  };

  // Open Independent Sheet Audit
  const handleOpenAuditModal = (sheet: BatchSheetItem) => {
    setSelectedSheetForAudit(sheet);
    setIsAuditModalOpen(true);
  };

  // Unlock stale print lock
  const handleUnlockSheet = async (sheet: BatchSheetItem) => {
    setLoadingAction(true);
    try {
      const res = await api.post(`/batches/${batch.id}/sheets/${sheet.id}/unlock`, {
        reason: 'Operator manual lock release'
      });
      if (res.data.success) {
        toast.success(`Print lock released for Sheet #${sheet.sequenceIndex + 1}.`);
        await onBatchUpdated();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to release lock.');
    } finally {
      setLoadingAction(false);
    }
  };

  const getSheetStatusBadge = (status: PrintJobStatus, printCount: number) => {
    switch (status) {
      case 'PENDING_SEQUENCE':
      case 'PENDING':
        return (
          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-xs py-1 px-2.5 gap-1.5 font-bold">
            <Clock className="w-3.5 h-3.5" />
            Pending Sequence
          </Badge>
        );
      case 'READY_TO_PRINT':
        return (
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs py-1 px-2.5 gap-1.5 font-bold animate-pulse shadow-sm">
            <Printer className="w-3.5 h-3.5 text-indigo-600" />
            Ready to Print
          </Badge>
        );
      case 'PRINT_INITIATED':
      case 'AWAITING_USER_CONFIRMATION':
      case 'PRINTING':
        return (
          <Badge className="bg-amber-50 text-amber-800 border-amber-300 text-xs py-1 px-2.5 gap-1.5 font-bold animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
            Awaiting Confirmation
          </Badge>
        );
      case 'PRINT_COMPLETED':
      case 'PRINTED':
      case 'REPRINTED':
        return (
          <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 text-xs py-1 px-2.5 gap-1.5 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Printed & Verified ({printCount || 1} {printCount > 1 ? 'copies' : 'copy'})
          </Badge>
        );
      case 'PRINTING_ISSUE':
      case 'INTERRUPTED':
      case 'REPRINT_REQUIRED':
      case 'PRINT_FAILED':
        return (
          <Badge className="bg-orange-50 text-orange-800 border-orange-300 text-xs py-1 px-2.5 gap-1.5 font-bold">
            <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
            Reprint Required
          </Badge>
        );
      case 'REPRINT_INITIATED':
      case 'REPRINTING':
        return (
          <Badge className="bg-amber-50 text-amber-800 border-amber-300 text-xs py-1 px-2.5 gap-1.5 font-bold animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
            Reprint in Progress
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
      <CardHeader className="bg-slate-50/70 border-b border-slate-100 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Printer className="w-6 h-6 text-indigo-600" />
              <CardTitle className="text-xl font-bold text-slate-900">
                Sequential Individual Batch Sheet Printing
              </CardTitle>
            </div>
            <CardDescription className="text-slate-500 font-medium">
              GAMP 5 Category 5 controlled execution. Each Batch Sheet must be printed, physically verified, and confirmed individually in strict sequential order.
            </CardDescription>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Queue Progress</div>
              <div className="text-lg font-black text-slate-900">
                {printedCount} of {totalSheets} Printed
              </div>
            </div>
            <Badge className={cn(
              "font-bold px-3.5 py-1.5 text-xs rounded-full border-none",
              allPrinted ? "bg-emerald-500 text-white" : hasInterruption ? "bg-orange-500 text-white" : "bg-indigo-600 text-white"
            )}>
              {allPrinted ? '100% COMPLETED' : hasInterruption ? 'REPRINT REQUIRED' : `${progressPercent}% COMPLETED`}
            </Badge>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
          <div 
            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Concurrency Lock Alert Banner */}
        {isLockActive && activeLockedSheet && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block text-amber-950">Active Print Lock Engaged</span>
                <span>
                  Batch Sheet #{activeLockedSheet.sequenceIndex + 1} ({activeLockedSheet.batchNumber}) is currently locked by <strong>{activeLockedSheet.activeLock?.lockedByName || 'Operator'}</strong> since {new Date(activeLockedSheet.activeLock?.lockedAt || '').toLocaleTimeString()}.
                </span>
              </div>
            </div>
            {(isCurrentUserLock || baseRole === 'ADMIN') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUnlockSheet(activeLockedSheet)}
                disabled={loadingAction}
                className="rounded-full border-amber-300 bg-amber-100/50 hover:bg-amber-100 text-amber-900 font-bold text-xs shrink-0"
              >
                <Unlock className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
                Release Lock
              </Button>
            )}
          </div>
        )}

        {/* Pending Confirmation Sticky Prompt Banner */}
        {activePrintingSheet && (activePrintingSheet.status === 'AWAITING_USER_CONFIRMATION' || activePrintingSheet.status === 'PRINT_INITIATED') && (
          <div className="mt-4 p-4 rounded-2xl bg-indigo-50 border-2 border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-950 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0 animate-pulse" />
              <div>
                <div className="font-bold text-sm">
                  Print confirmation is pending for Batch Sheet {activePrintingSheet.batchNumber}
                </div>
                <div className="text-xs text-indigo-700 font-medium">
                  Please verify physical output from printer/download and confirm the result below.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => handleOpenIssueModal(activePrintingSheet)}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                PRINTING ISSUE
              </Button>
              <Button
                size="sm"
                onClick={handleOpenPrintCompletedConfirmation}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                PRINT COMPLETED
              </Button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-6 md:p-8">
        <div className="space-y-4">
          {sheets.map((sheet, index) => {
            const eligibility = evaluateSheetEligibility(batch, sheet, index, sheets, user);
            const {
              isReady,
              isReprintRequired,
              isPrinting,
              isAwaitingConfirmation,
              isPrinted,
              disabledReason
            } = eligibility;

            const isCurrentActive = activePrintingSheet?.id === sheet.id;

            return (
              <div 
                key={sheet.id || index}
                id={`batch-sheet-card-${sheet.id || index}`}
                className={cn(
                  "p-5 rounded-2xl border transition-all duration-200",
                  isCurrentActive || isAwaitingConfirmation
                    ? "bg-indigo-50/40 border-indigo-300 shadow-sm"
                    : isPrinted
                    ? "bg-slate-50/40 border-slate-200"
                    : isReprintRequired
                    ? "bg-orange-50/30 border-orange-200"
                    : "bg-white border-slate-100 opacity-90"
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Sheet Info */}
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm",
                      isPrinted 
                        ? "bg-emerald-600 text-white" 
                        : isReprintRequired
                        ? "bg-orange-500 text-white"
                        : isReady
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-400 border border-slate-200"
                    )}>
                      #{index + 1}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-base">
                          {sheet.batchNumber}
                        </span>
                        {getSheetStatusBadge(sheet.status, sheet.printCount)}
                        {sheet.attemptCount && sheet.attemptCount > 1 && (
                          <Badge variant="outline" className="text-[10px] font-bold py-0.5 px-2 bg-slate-100 text-slate-600 border-slate-200">
                            Attempt #{sheet.attemptCount}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500 font-medium">
                        {isPrinted && (
                          <span>
                            Printed by <strong>{sheet.printedByName || 'Operator'}</strong> on {new Date(sheet.printedAt || sheet.completedAt || '').toLocaleString()}
                          </span>
                        )}
                        {isReprintRequired && sheet.reprintReason && (
                          <span className="text-orange-700 font-semibold">
                            Reason: {sheet.reprintReason} {sheet.reprintPages ? `(Pages: ${sheet.reprintPages})` : ''}
                          </span>
                        )}
                        {!isReady && !isPrinted && disabledReason && (
                          <span className="text-slate-400 italic">
                            {disabledReason}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions per Batch Sheet */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Preview Button (View-Only, does not alter state or queue) */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreviewIndividualSheet(sheet)}
                      disabled={generatingPreview}
                      className="rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs h-9 px-3"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                      Preview
                    </Button>

                    {/* Audit Button (Independent Print History) */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAuditModal(sheet)}
                      className="rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs h-9 px-3"
                    >
                      <History className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                      Audit ({sheet.history?.length || 0})
                    </Button>

                    {/* Print / Confirmation Action Buttons */}
                    {isAwaitingConfirmation ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => handleOpenIssueModal(sheet)}
                          disabled={loadingAction}
                          className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl h-9 px-3 shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" />
                          Printing Issue
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleOpenPrintCompletedConfirmation}
                          disabled={loadingAction}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl h-9 px-3 shadow-sm"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Print Completed
                        </Button>
                      </div>
                    ) : isReprintRequired ? (
                      <Button
                        size="sm"
                        onClick={() => handleOpenIssueModal(sheet)}
                        disabled={loadingAction || !canPrint}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl h-9 px-3.5 shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Reprint Sheet #{index + 1}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleStartPrint(sheet)}
                        disabled={!isReady || loadingAction}
                        className={cn(
                          "font-bold text-xs rounded-xl h-9 px-4 shadow-sm transition-all",
                          isReady 
                            ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200" 
                            : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed hover:bg-slate-100"
                        )}
                      >
                        {isPrinted ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                            Completed
                          </>
                        ) : isReady ? (
                          <>
                            <Printer className="w-3.5 h-3.5 mr-1.5" />
                            Print Sheet #{index + 1}
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                            Locked
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* ------------------------------------------------------------- */}
      {/* 1. Post-Print User Confirmation Modal                           */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isPostPrintConfirmationOpen} onOpenChange={setIsPostPrintConfirmationOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6 bg-white shadow-2xl border-none">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-2">
              <Printer className="w-6 h-6 text-indigo-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Check Printed Batch Sheet
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium pt-1 text-sm">
              Batch Sheet: <strong>{activePrintingSheet?.batchNumber}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 text-sm text-slate-600 space-y-2">
            <p className="font-semibold text-slate-800">
              Printing / PDF delivery initiated.
            </p>
            <p>
              Please inspect the physical Batch Sheet output from your printer or downloaded file and confirm the result.
            </p>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenIssueModal(activePrintingSheet || undefined)}
              className="w-full sm:w-auto font-bold rounded-2xl text-xs border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 h-11"
            >
              <RotateCcw className="w-4 h-4 mr-2 text-orange-600" />
              PRINTING ISSUE
            </Button>
            <Button
              type="button"
              onClick={handleOpenPrintCompletedConfirmation}
              className="w-full sm:w-auto font-bold rounded-2xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white h-11"
            >
              <Check className="w-4 h-4 mr-2" />
              PRINT COMPLETED
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 2. Final "Print Completed" Confirmation Dialog                 */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isPrintCompletedConfirmOpen} onOpenChange={setIsPrintCompletedConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6 bg-white shadow-2xl border-none">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Confirm Print Completed
            </DialogTitle>
            <DialogDescription className="text-slate-600 font-medium pt-1 text-sm">
              Confirm that Batch Sheet <strong>{activePrintingSheet?.batchNumber}</strong> has been printed/downloaded successfully and no pages require reprinting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 space-y-1">
              <div><strong>Batch Number:</strong> {activePrintingSheet?.batchNumber}</div>
              <div><strong>Operator:</strong> {user?.displayName || user?.username || user?.email}</div>
              <div><strong>Action:</strong> Unlock next sequential Batch Sheet</div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPrintCompletedConfirmOpen(false)}
              className="w-full sm:w-auto rounded-2xl text-xs border-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmPrintCompleted}
              disabled={loadingAction}
              className="w-full sm:w-auto font-bold rounded-2xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loadingAction && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Print Completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 3. "Printing Issue" Dialog (Page Selection & Reason)           */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isIssueModalOpen} onOpenChange={setIsIssueModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-6 md:p-8 bg-white shadow-2xl border-none">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center mb-2">
              <RotateCcw className="w-6 h-6 text-orange-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              PRINTING ISSUE – BATCH SHEET {selectedSheetForIssue?.batchNumber}
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium text-xs">
              Specify the pages to reprint and mandatory reason. Only the selected original pages will be extracted and reprinted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Metadata Summary */}
            <div className="grid grid-cols-2 gap-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block font-semibold">Batch Sheet</span>
                <span className="font-extrabold text-slate-800">{selectedSheetForIssue?.batchNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Total Document Pages</span>
                <span className="font-extrabold text-slate-800">{selectedSheetForIssue?.totalPages || 60} Pages</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Current Print Attempt</span>
                <span className="font-extrabold text-slate-800">#{selectedSheetForIssue?.attemptCount || 1}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Print Job ID</span>
                <span className="font-mono text-slate-700 text-[11px] truncate block">{selectedSheetForIssue?.currentPrintJobId || 'PJ-INITIAL'}</span>
              </div>
            </div>

            {/* Pages to Print Again Input */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Pages to Print Again <span className="text-rose-500">*</span></span>
                <span className="text-[10px] text-slate-400 font-normal">e.g. 5, 5-10, or 2,5-8,12 (or 'ALL')</span>
              </Label>
              <Input
                value={issuePagesInput}
                onChange={(e) => setIssuePagesInput(e.target.value)}
                placeholder="e.g. 5-8, 12"
                className="rounded-xl border-slate-200 text-sm font-medium"
              />
              <p className="text-[11px] text-slate-500">
                Enter single page (<code>5</code>), ranges (<code>5-10</code>), multiple pages (<code>5,8,12</code>), or mixed (<code>2,5-8,12</code>).
              </p>
            </div>

            {/* Issue Reason Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">
                Issue Reason <span className="text-rose-500">*</span>
              </Label>
              <Select value={issueReasonPreset} onValueChange={setIssueReasonPreset}>
                <SelectTrigger className="rounded-xl border-slate-200 text-xs font-semibold">
                  <SelectValue placeholder="Select issue reason" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-xl">
                  {ISSUE_REASONS.map(reason => (
                    <SelectItem key={reason} value={reason} className="text-xs font-medium">
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Comments / Details */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">
                Comments {issueReasonPreset === 'Other' && <span className="text-rose-500">*</span>}
              </Label>
              <Textarea
                value={issueComments}
                onChange={(e) => setIssueComments(e.target.value)}
                placeholder={issueReasonPreset === 'Other' ? "Mandatory explanation for 'Other'..." : "Optional additional operator notes..."}
                rows={2}
                className="rounded-xl border-slate-200 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsIssueModalOpen(false)}
              className="w-full sm:w-auto rounded-2xl text-xs border-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleValidateAndProceedToReprint}
              className="w-full sm:w-auto font-bold rounded-2xl text-xs bg-orange-600 hover:bg-orange-700 text-white"
            >
              Next: Confirm Reprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 4. Reprint Confirmation Screen                                 */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isReprintConfirmModalOpen} onOpenChange={setIsReprintConfirmModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6 bg-white shadow-2xl border-none">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center mb-2">
              <RotateCcw className="w-6 h-6 text-orange-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Confirm Selected-Page Reprint
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium text-xs">
              BRIMS will generate a temporary derivative PDF containing only the requested pages. The original Batch Sheet Master remains unchanged.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <div className="p-4 bg-orange-50/60 rounded-2xl border border-orange-200 text-xs space-y-2 text-orange-950">
              <div className="flex justify-between">
                <span className="font-semibold text-orange-800">Batch Sheet:</span>
                <span className="font-extrabold">{selectedSheetForIssue?.batchNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-orange-800">Pages to Print Again:</span>
                <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-orange-200">
                  {validatedReprintInfo?.normalizedString}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-orange-800">Total Pages Selected:</span>
                <span className="font-extrabold">{validatedReprintInfo?.totalSelected} Pages</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-orange-800">Issue Reason:</span>
                <span className="font-bold">{issueReasonPreset}</span>
              </div>
              {issueComments && (
                <div className="pt-1 border-t border-orange-200 text-slate-700">
                  <strong>Notes:</strong> {issueComments}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsReprintConfirmModalOpen(false);
                setIsIssueModalOpen(true);
              }}
              className="w-full sm:w-auto rounded-2xl text-xs border-slate-200"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleExecuteSelectedPageReprint}
              disabled={loadingAction}
              className="w-full sm:w-auto font-bold rounded-2xl text-xs bg-orange-600 hover:bg-orange-700 text-white"
            >
              {loadingAction && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              REPRINT SELECTED PAGES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 5. Independent Audit History Modal                             */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isAuditModalOpen} onOpenChange={setIsAuditModalOpen}>
        <DialogContent className="sm:max-w-2xl rounded-3xl p-6 md:p-8 bg-white shadow-2xl border-none max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-2">
              <History className="w-6 h-6 text-indigo-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Audit Trail & Print History – Batch Sheet {selectedSheetForAudit?.batchNumber}
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium text-xs">
              Complete, independent chronological lifecycle and 21 CFR Part 11 audit events for this specific Batch Sheet.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Print Jobs Traceability */}
            {selectedSheetForAudit?.printJobs && selectedSheetForAudit.printJobs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Print Jobs Registry</h4>
                <div className="space-y-2">
                  {selectedSheetForAudit.printJobs.map((job, jIdx) => (
                    <div key={job.printJobId || jIdx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                        <span className="font-mono font-bold text-indigo-700">{job.printJobId}</span>
                        <Badge variant="outline" className="text-[10px] font-bold">
                          Attempt #{job.attemptNumber} ({job.printType})
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 mt-2">
                        <div><span className="text-slate-400 block">Pages:</span> {job.requestedPages || 'ALL'}</div>
                        <div><span className="text-slate-400 block">Delivery:</span> {job.deliveryMethod}</div>
                        <div><span className="text-slate-400 block">Status:</span> {job.status}</div>
                        <div><span className="text-slate-400 block">Operator:</span> {job.userName || job.userId}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Audit History Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chronological Audit Events</h4>
              {(!selectedSheetForAudit?.history || selectedSheetForAudit.history.length === 0) ? (
                <div className="p-4 text-center text-slate-400 text-xs italic bg-slate-50 rounded-2xl">
                  No print audit events recorded for this Batch Sheet yet.
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {selectedSheetForAudit.history.map((entry, eIdx) => (
                    <div key={entry.id || eIdx} className="relative">
                      <div className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white" />
                      <div className="p-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <span className="font-extrabold text-slate-900">{entry.action}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-slate-600">
                          {entry.reason || entry.signatureMeaning || 'Print operation logged'}
                        </div>
                        {entry.originalPagesReprinted && (
                          <div className="text-[11px] text-orange-700 font-semibold mt-1">
                            Original Pages Reprinted: {entry.originalPagesReprinted}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                          <span>Operator: <strong>{entry.performedBy}</strong></span>
                          {entry.employeeId && <span>ID: <strong>{entry.employeeId}</strong></span>}
                          {entry.signatureId && (
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> E-Signed: {entry.signatureId.slice(-8)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => setIsAuditModalOpen(false)}
              className="rounded-2xl text-xs font-bold bg-slate-900 text-white"
            >
              Close Audit Trail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 6. Individual Sheet View-Only PDF Preview Modal                 */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl w-full h-[90vh] p-0 overflow-hidden bg-slate-900 border-none rounded-3xl">
          <DialogHeader className="p-4 bg-slate-800 text-white flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Preview Batch Sheet {previewSheetNumber} (View-Only)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                This preview is for inspection only and does not count as a print job or advance the queue.
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPreviewOpen(false)}
              className="text-slate-400 hover:text-white rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          </DialogHeader>

          <div className="w-full h-[calc(90vh-65px)] bg-slate-950">
            {previewUrl ? (
              <SecurePDFViewer
                fileUrl={previewUrl}
                onClose={() => setIsPreviewOpen(false)}
                title={`Preview Batch Sheet ${previewSheetNumber}`}
                batchNo={previewSheetNumber}
                hideOverlays={true}
                hideOverlayPanel={true}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading PDF Preview...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
