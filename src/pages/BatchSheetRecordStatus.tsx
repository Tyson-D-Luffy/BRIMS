import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  ArrowRight, 
  ShieldCheck, 
  Search, 
  Filter, 
  Layers, 
  History, 
  XCircle, 
  Archive, 
  ClipboardCheck, 
  Check, 
  X, 
  FileCheck, 
  RotateCcw, 
  Printer, 
  Loader2, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  Copy, 
  Sparkles, 
  ClipboardList 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { LoadingPage } from '../components/LoadingSpinner';
import { cn } from '../lib/utils';
import { BatchIssuance, BatchSheetItem, PrintJobStatus, ProductMaster, getUserBaseRole } from '../types';
import { initializeBatchSheetsClient, evaluateSheetEligibility } from '../lib/batch-sheets';
import { SignatureDialog } from '../components/SignatureDialog';
import { ReturnDialog, ReturnDialogConfirmPayload } from '../components/ReturnDialog';
import { ReturnBadge } from '../components/ReturnBadge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatRequestId, generateRequestPreviewPDF } from '../lib/pdf-generator';
import { SecurePDFViewer } from '../components/SecurePDFViewer';

export default function BatchSheetRecordStatus() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [issuances, setIssuances] = useState<BatchIssuance[]>([]);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'ALL');

  // Selected for QA approval/rejection/return
  const [selectedIssuance, setSelectedIssuance] = useState<BatchIssuance | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [approvalReason, setApprovalReason] = useState('Approving batch issuance request.');
  const [rejectionReason, setRejectionReason] = useState('');
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | 'RETURN' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Expandable sequential print queues for batches
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});

  // Active individual sheet printing & confirmation state
  const [activePrintingBatch, setActivePrintingBatch] = useState<BatchIssuance | null>(null);
  const [activePrintingSheet, setActivePrintingSheet] = useState<BatchSheetItem | null>(null);
  const [isPrintConfirmOpen, setIsPrintConfirmOpen] = useState(false);
  const [printPassword, setPrintPassword] = useState('');
  const [printActionLoading, setPrintActionLoading] = useState(false);

  // Reprint request modal
  const [isReprintModalOpen, setIsReprintModalOpen] = useState(false);
  const [reprintTargetBatch, setReprintTargetBatch] = useState<BatchIssuance | null>(null);
  const [reprintTargetSheet, setReprintTargetSheet] = useState<BatchSheetItem | null>(null);
  const [reprintReasonPreset, setReprintReasonPreset] = useState('Paper Jam during initial print');
  const [reprintReasonDetails, setReprintReasonDetails] = useState('');

  // Interruption reporting modal
  const [isInterruptionModalOpen, setIsInterruptionModalOpen] = useState(false);
  const [interruptionReasonPreset, setInterruptionReasonPreset] = useState('Paper Jam / Printer Feed Failure');
  const [interruptionComments, setInterruptionComments] = useState('');

  // PDF Preview modal state
  const [previewPDFUrl, setPreviewPDFUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewSheetLabel, setPreviewSheetLabel] = useState('');
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [issuancesRes, productsRes, usersRes] = await Promise.all([
        api.get('/batches?limit=-1'),
        api.get('/product-masters'),
        api.get('/users').catch(() => ({ data: { success: false, data: [] } }))
      ]);
      
      if (issuancesRes.data.success) {
        setIssuances(issuancesRes.data.data);
      }
      if (productsRes.data.success) {
        setProducts(productsRes.data.data);
      }
      if (usersRes.data.success) {
        setUsers(usersRes.data.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch request status', error);
      toast.error('Failed to load request statuses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleExpandBatch = (batchId: string) => {
    setExpandedBatchIds(prev => ({
      ...prev,
      [batchId]: !prev[batchId]
    }));
  };

  const resolveUser = (userIdOrEmail: string | undefined, fallbackName: string = 'N/A') => {
    if (!userIdOrEmail) return { employeeId: 'N/A', username: fallbackName };
    const found = users.find(u => 
      u.uid === userIdOrEmail || 
      u.id === userIdOrEmail || 
      u.email === userIdOrEmail || 
      u.username === userIdOrEmail ||
      (typeof userIdOrEmail === 'string' && u.email?.toLowerCase() === userIdOrEmail.toLowerCase())
    );
    if (found) {
      return {
        employeeId: found.employeeId || 'N/A',
        username: found.username || found.displayName || found.email?.split('@')[0] || 'Unknown'
      };
    }
    return {
      employeeId: 'N/A',
      username: userIdOrEmail.includes('@') ? userIdOrEmail.split('@')[0] : userIdOrEmail
    };
  };

  // Helper for generating PDF for an individual batch sheet
  const generateSheetPDF = async (batch: BatchIssuance, sheet: BatchSheetItem, isDirectPrint: boolean = false) => {
    const product = products.find(p => p.id === batch.productId) || null;
    const masterSnapshot = batch.recordInfo?.masterSnapshot;
    if (!masterSnapshot) {
      toast.error('No master snapshot found in batch record.');
      return null;
    }

    const computedReqId = formatRequestId(
      sheet.batchNumber,
      batch.createdAt || batch.manufacturingDate,
      product?.title || product?.batchNumberSeries,
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
      product: product,
      userInfo: user ? { name: user.displayName || user.username || user.email || 'Unknown', id: user.employeeId || 'N/A' } : undefined,
      requestType: (copyNum > 1 || batch.requestType === 'REPRINT') ? 'REPRINT' : 'NEW',
      printCounts: { [sheet.batchNumber]: copyNum },
      requestId: computedReqId,
      isForPrint: isDirectPrint
    });

    return url;
  };

  // Trigger preview for individual sheet
  const handlePreviewSheet = async (batch: BatchIssuance, sheet: BatchSheetItem) => {
    setGeneratingPreview(true);
    setPreviewSheetLabel(`Sheet #${sheet.sequenceIndex + 1} (${sheet.batchNumber})`);
    try {
      const url = await generateSheetPDF(batch, sheet, false);
      if (url) {
        setPreviewPDFUrl(url);
        setIsPreviewOpen(true);
      }
    } catch (err) {
      console.error(err);
      toast.error(`Failed to generate preview for sheet ${sheet.batchNumber}`);
    } finally {
      setGeneratingPreview(false);
    }
  };

  // Start sequential printing of an individual batch sheet
  const handleStartPrint = async (batch: BatchIssuance, sheet: BatchSheetItem, isReprint: boolean = false, reason?: string) => {
    const baseRole = getUserBaseRole(user);
    const userPerms = user?.permissions || [];
    const canPrint = baseRole === 'ADMIN' || baseRole === 'QA' || userPerms.some(p => ['batch:print', 'op:issued'].includes(p));

    if (!canPrint) {
      toast.error('Access Denied: You do not have permission to print batch sheets.');
      return;
    }

    setPrintActionLoading(true);
    try {
      const res = await api.post(`/batches/${batch.id}/sheets/${sheet.id}/start-print`, {
        isReprint,
        reprintReason: reason
      });

      if (res.data.success) {
        toast.success(`Print lock acquired for Sheet #${sheet.sequenceIndex + 1} (${sheet.batchNumber}).`);
        await fetchData();

        // Generate print-ready PDF and trigger download/print stream
        const printUrl = await generateSheetPDF(batch, sheet, true);
        if (printUrl) {
          const responseBlob = await fetch(printUrl).then(r => r.blob());
          const link = document.createElement('a');
          const downloadUrl = URL.createObjectURL(responseBlob);
          link.href = downloadUrl;
          link.download = `Batch_${sheet.batchNumber}_Sheet_${sheet.sequenceIndex + 1}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(downloadUrl);
        }

        // Open 21 CFR Part 11 Electronic Signature Confirmation Modal
        setActivePrintingBatch(batch);
        setActivePrintingSheet(sheet);
        setPrintPassword('');
        setIsPrintConfirmOpen(true);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to initiate printing for sheet.');
    } finally {
      setPrintActionLoading(false);
    }
  };

  // Complete print confirmation with e-signature
  const handleConfirmPrintSuccess = async () => {
    if (!activePrintingBatch || !activePrintingSheet) return;
    if (!printPassword) {
      toast.error('Password is required for 21 CFR Part 11 Electronic Signature.');
      return;
    }

    setPrintActionLoading(true);
    try {
      const res = await api.post(`/batches/${activePrintingBatch.id}/sheets/${activePrintingSheet.id}/complete-print`, {
        password: printPassword
      });

      if (res.data.success) {
        toast.success(`Batch Sheet #${activePrintingSheet.sequenceIndex + 1} (${activePrintingSheet.batchNumber}) certified and completed!`);
        setIsPrintConfirmOpen(false);
        setActivePrintingBatch(null);
        setActivePrintingSheet(null);
        setPrintPassword('');
        await fetchData();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Verification failed. Incorrect electronic signature password.');
    } finally {
      setPrintActionLoading(false);
    }
  };

  // Report print interruption
  const handleReportInterruption = async () => {
    if (!activePrintingBatch || !activePrintingSheet) return;
    const fullReason = `${interruptionReasonPreset}${interruptionComments ? ` - ${interruptionComments}` : ''}`;
    if (!fullReason.trim()) {
      toast.error('Reason for interruption is mandatory.');
      return;
    }

    setPrintActionLoading(true);
    try {
      const res = await api.post(`/batches/${activePrintingBatch.id}/sheets/${activePrintingSheet.id}/interrupt-print`, {
        reason: fullReason,
        comments: interruptionComments
      });

      if (res.data.success) {
        toast.warning(`Print Interruption recorded for Sheet #${activePrintingSheet.sequenceIndex + 1} (${activePrintingSheet.batchNumber}). Reprint is now required.`);
        setIsPrintConfirmOpen(false);
        setIsInterruptionModalOpen(false);
        setActivePrintingBatch(null);
        setActivePrintingSheet(null);
        setInterruptionComments('');
        await fetchData();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to record interruption.');
    } finally {
      setPrintActionLoading(false);
    }
  };

  // Unlock / release print lock
  const handleReleaseLock = async (batch: BatchIssuance, sheet: BatchSheetItem) => {
    setPrintActionLoading(true);
    try {
      const res = await api.post(`/batches/${batch.id}/sheets/${sheet.id}/release-lock`, {
        reason: 'Operator manual lock release'
      });
      if (res.data.success) {
        toast.success(`Print lock released for Sheet #${sheet.sequenceIndex + 1}.`);
        await fetchData();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to release lock.');
    } finally {
      setPrintActionLoading(false);
    }
  };

  // Trigger reprint request submit
  const handleConfirmReprintRequest = async () => {
    if (!reprintTargetBatch || !reprintTargetSheet) return;
    const fullReason = `${reprintReasonPreset}${reprintReasonDetails ? ` - ${reprintReasonDetails}` : ''}`;
    if (!fullReason.trim()) {
      toast.error('Reason for reprint is mandatory.');
      return;
    }

    setIsReprintModalOpen(false);
    await handleStartPrint(reprintTargetBatch, reprintTargetSheet, true, fullReason);
    setReprintTargetBatch(null);
    setReprintTargetSheet(null);
    setReprintReasonDetails('');
  };

  // Evaluate sequential print eligibility based on database-persisted state
  const evaluateSheetPrintEligibility = (
    issuance: BatchIssuance,
    sheet: BatchSheetItem,
    sheetIndex: number,
    allSheets: BatchSheetItem[]
  ) => {
    return evaluateSheetEligibility(issuance, sheet, sheetIndex, allSheets, user);
  };

  // Render sequential badge for individual sheet status
  const getSequentialSheetBadge = (status?: PrintJobStatus, printCount: number = 0) => {
    switch (status) {
      case 'READY_TO_PRINT':
        return (
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-extrabold py-0.5 px-2.5 gap-1 shadow-sm animate-pulse">
            <Printer className="w-3 h-3 text-indigo-600" />
            Ready to Print
          </Badge>
        );
      case 'PRINTING':
        return (
          <Badge className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-extrabold py-0.5 px-2.5 gap-1 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
            Printing...
          </Badge>
        );
      case 'PRINTED':
        return (
          <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px] font-extrabold py-0.5 px-2.5 gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Printed (Copy {printCount || 1})
          </Badge>
        );
      case 'INTERRUPTED':
      case 'PRINT_FAILED':
        return (
          <Badge className="bg-rose-50 text-rose-800 border-rose-300 text-[10px] font-extrabold py-0.5 px-2.5 gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Interrupted
          </Badge>
        );
      case 'REPRINT_REQUIRED':
        return (
          <Badge className="bg-orange-50 text-orange-800 border-orange-300 text-[10px] font-extrabold py-0.5 px-2.5 gap-1">
            <RotateCcw className="w-3 h-3 text-orange-600" />
            Reprint Required
          </Badge>
        );
      case 'REPRINTING':
        return (
          <Badge className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-extrabold py-0.5 px-2.5 gap-1 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
            Reprinting...
          </Badge>
        );
      case 'REPRINTED':
        return (
          <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px] font-extrabold py-0.5 px-2.5 gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Reprinted (Copy {printCount})
          </Badge>
        );
      case 'PENDING':
      default:
        return (
          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-[10px] font-extrabold py-0.5 px-2.5 gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            Pending Sequence
          </Badge>
        );
    }
  };

  const handleAction = (issuance: BatchIssuance, action: 'APPROVE' | 'REJECT') => {
    setSelectedIssuance(issuance);
    setPendingAction(action);
    if (action === 'APPROVE') {
      setIsApproveDialogOpen(true);
    } else {
      setIsRejectDialogOpen(true);
    }
  };

  const handleConfirmReturn = async (payload: ReturnDialogConfirmPayload) => {
    if (!selectedIssuance) return;
    setActionLoading(true);
    try {
      const res = await api.post(`/batches/${selectedIssuance.id}/return`, payload);
      if (res.data.success) {
        toast.success('Batch issuance request returned for correction');
        setIsReturnDialogOpen(false);
        fetchData();
      }
    } catch (error: any) {
      console.error('Return failed', error);
      toast.error(error.response?.data?.message || 'Failed to return request for correction');
    } finally {
      setActionLoading(false);
    }
  };

  const onConfirmAction = () => {
    if (pendingAction === 'REJECT' && !rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setIsApproveDialogOpen(false);
    setIsRejectDialogOpen(false);
    setIsSignatureOpen(true);
  };

  const onSignatureConfirm = async (password: string) => {
    if (!selectedIssuance || !pendingAction) return;
    
    setActionLoading(true);
    try {
      const endpoint = pendingAction === 'APPROVE' 
        ? `/batches/${selectedIssuance.id}/approve` 
        : `/batches/${selectedIssuance.id}/reject`;
      
      const payload = {
        password,
        changeReason: pendingAction === 'APPROVE' ? approvalReason : rejectionReason
      };

      const res = await api.put(endpoint, payload);
      
      if (res.data.success) {
        toast.success(`Batch request ${pendingAction.toLowerCase()}d successfully`);
        fetchData();
        setIsSignatureOpen(false);
        setRejectionReason('');
      }
    } catch (error: any) {
      console.error('Action failed', error);
      toast.error(error.response?.data?.message || `Failed to ${pendingAction.toLowerCase()} request`);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (issuance: BatchIssuance) => {
    switch (issuance.status) {
      case 'DRAFT':
        return (
          <Badge className="bg-slate-100 text-slate-600 border-slate-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
            <FileText className="w-3 h-3 mr-1" />
            Draft
          </Badge>
        );
      case 'PENDING_REVIEW':
        return (
          <Badge className="bg-amber-100 text-amber-600 border-amber-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
            <Clock className="w-3 h-3 mr-1" />
            Pending Review
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge className="bg-emerald-100 text-emerald-600 border-emerald-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge className="bg-rose-100 text-rose-600 border-rose-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        );
      case 'ISSUED': {
        const sheets = issuance.batchSheets || [];
        const printedCount = sheets.filter(s => s.status === 'PRINTED' || s.status === 'REPRINTED').length;
        const totalSheets = sheets.length;
        const hasInterruption = sheets.some(s => s.status === 'INTERRUPTED' || s.status === 'REPRINT_REQUIRED');

        return (
          <div className="flex flex-col gap-1.5 items-start">
            <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
              <ClipboardCheck className="w-3 h-3 mr-1" />
              Issued
            </Badge>
            {totalSheets > 0 && (
              <Badge variant="outline" className={cn(
                "text-[9px] font-mono font-bold px-2 py-0.5 rounded-md",
                hasInterruption 
                  ? "bg-rose-50 text-rose-700 border-rose-200" 
                  : printedCount === totalSheets 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                  : "bg-slate-50 text-indigo-600 border-indigo-100"
              )}>
                {hasInterruption ? `Interrupted (${printedCount}/${totalSheets})` : `${printedCount} of ${totalSheets} Printed`}
              </Badge>
            )}
          </div>
        );
      }
      case 'IN_PROGRESS':
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
            <Layers className="w-3 h-3 mr-1" />
            In Progress
          </Badge>
        );
      case 'READY_FOR_PRODUCTION_HANDOVER':
        return (
          <Badge className="bg-orange-100 text-orange-700 border-orange-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
            <Layers className="w-3 h-3 mr-1" />
            Ready For Handover
          </Badge>
        );
      case 'PRODUCTION_IN_PROGRESS':
        return (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
            <Layers className="w-3 h-3 mr-1" />
            Production in Progress
          </Badge>
        );
      case 'READY_FOR_QA_REVIEW':
        return (
          <Badge className="bg-purple-100 text-purple-700 border-purple-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
            <ShieldCheck className="w-3 h-3 mr-1" />
            Ready For QA Review
          </Badge>
        );
      case 'RETURNED':
        return (
          <ReturnBadge 
            status="RETURNED"
            returnCount={(issuance as any).returnCount}
            returnReason={(issuance as any).returnReason}
            returnedBy={(issuance as any).returnedByEmail || (issuance as any).returnedBy}
          />
        );
      default:
        return <Badge variant="outline">{issuance.status}</Badge>;
    }
  };

  const ongoingRequestsCount = issuances.filter(iss => iss.status !== 'COMPLETED' && iss.status !== 'REJECTED').length;

  const filteredIssuances = issuances.filter(iss => {
    if (iss.status === 'COMPLETED' || iss.status === 'REJECTED') return false;
    
    const product = products.find(p => p.id === iss.productId);
    const matchesSearch = 
      iss.batchNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product?.title?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || iss.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) return <LoadingPage label="Synchronizing request statuses & sequential print queues..." />;

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm tracking-wider uppercase mb-1">
            <History className="w-4 h-4" />
            Batch Issuance Workflow
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Request Status</h1>
          <p className="text-slate-500 text-lg max-w-2xl mt-1">
            Track batch status and execute sequential individual batch sheet printing under 21 CFR Part 11 compliance.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-3 bg-white p-1 rounded-full shadow-sm border border-slate-100">
              <div className="px-4 py-2 text-sm font-bold text-slate-400">Ongoing Requests:</div>
              <div className="px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-black shadow-lg shadow-slate-200">
                  {ongoingRequestsCount}
              </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => navigate('/batch-sheet-records/completed')}
              className="rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold h-10 px-5 shadow-md text-xs tracking-wider uppercase"
            >
              Completed Requests
            </Button>
            <Button 
              onClick={() => navigate('/batch-sheet-records/rejected')}
              className="rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold h-10 px-5 shadow-md text-xs tracking-wider uppercase"
            >
              Rejected Requests
            </Button>
          </div>
        </div>
      </header>

      {/* Filter / Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-[32px] shadow-sm border border-slate-100">
        <div className="relative md:col-span-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search by batch number or product..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 rounded-2xl bg-slate-50 border-none focus-visible:ring-indigo-500 h-12"
          />
        </div>
        <div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-none">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400" />
                <SelectValue placeholder="Filter by Status" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="ISSUED">Issued (Printable)</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="READY_FOR_PRODUCTION_HANDOVER">Ready for Handover</SelectItem>
              <SelectItem value="PRODUCTION_IN_PROGRESS">Production in Progress</SelectItem>
              <SelectItem value="READY_FOR_QA_REVIEW">Ready for QA Review</SelectItem>
              <SelectItem value="RETURNED">Returned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-end">
          <Button onClick={fetchData} variant="ghost" className="rounded-full text-indigo-600 font-bold px-6 h-12 bg-indigo-50 hover:bg-indigo-100 w-full md:w-auto">
            Refresh Status
          </Button>
        </div>
      </div>

      {/* Requests Table */}
      <Card className="border-none shadow-xl rounded-[40px] overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-slate-100/50">
                <TableHead className="pl-10 py-6 text-xs font-black uppercase tracking-widest text-slate-400">Batch Details & Print Sequence</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Stage / Process</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Mfg Date</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Version</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Status</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Updated</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Requested By</TableHead>
                <TableHead className="pr-10 text-right text-xs font-black uppercase tracking-widest text-slate-400">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIssuances.map((iss) => {
                const product = products.find(p => p.id === iss.productId);
                const sheets: BatchSheetItem[] = initializeBatchSheetsClient(iss);
                const totalSheets = sheets.length;
                const printedCount = sheets.filter(s => s.status === 'PRINTED' || s.status === 'REPRINTED').length;
                const isExpanded = !!expandedBatchIds[iss.id];

                // Determine currently ready sheet for direct action
                const readySheetIdx = sheets.findIndex((s, idx) => evaluateSheetPrintEligibility(iss, s, idx, sheets).isReady);
                const readySheet = readySheetIdx !== -1 ? sheets[readySheetIdx] : null;
                const readySheetEligibility = readySheet ? evaluateSheetPrintEligibility(iss, readySheet, readySheetIdx, sheets) : null;

                const resolvedRequester = resolveUser(iss.issuedBy || iss.issuedByName, iss.issuedByName || 'N/A');
                const requesterStr = resolvedRequester.employeeId !== 'N/A'
                  ? `${resolvedRequester.employeeId} - ${resolvedRequester.username}`
                  : resolvedRequester.username;

                // Formulate Batch details label in format PRODUCTNAME-YYYYMMDD-Serial no.
                const productName = product ? product.title : 'UNKNOWN';
                let datePart = 'YYYYMMDD';
                if (iss.manufacturingDate) {
                  datePart = iss.manufacturingDate.replace(/[^0-9]/g, '');
                } else if (iss.batchNumber && iss.batchNumber.includes('-')) {
                  const parts = iss.batchNumber.split('-');
                  if (parts.length >= 2) {
                    const foundDate = parts.find(p => /^\d{8}$/.test(p));
                    if (foundDate) datePart = foundDate;
                  }
                }
                if (datePart === 'YYYYMMDD' && iss.createdAt) {
                  datePart = new Date(iss.createdAt).toISOString().split('T')[0].replace(/[^0-9]/g, '');
                }
                
                const serialNo = iss.batchNumber ? (iss.batchNumber.split('-').pop() || '001') : '001';
                const batchDetailLabel = `${productName}-${datePart}-${serialNo}`;

                return (
                  <React.Fragment key={iss.id}>
                    <TableRow className={cn(
                      "group hover:bg-slate-50/50 transition-all border-slate-50",
                      isExpanded && "bg-indigo-50/20"
                    )}>
                      <TableCell className="pl-10 py-8">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-colors shrink-0 mt-0.5">
                            <ClipboardCheck className="w-5 h-5" />
                          </div>
                          <div className="space-y-1.5">
                            <p 
                              className="font-black text-slate-900 leading-tight uppercase tracking-tight hover:underline cursor-pointer flex items-center gap-2" 
                              onClick={() => navigate(`/batches/${iss.id}`)}
                            >
                              {batchDetailLabel}
                            </p>
                            <p className="text-[11px] text-slate-400 font-bold block tracking-wider font-mono">
                              BATCH NO: {iss.batchNumber} | ID: {iss.id.substring(0, 8)}
                            </p>
                            
                            {/* Series Badges */}
                            {(iss.dropdownBatchSeries || iss.batchNumberSeries) && (
                              <div className="flex items-center gap-2 flex-wrap">
                                {iss.dropdownBatchSeries && (
                                  <Badge variant="outline" className="bg-indigo-50/50 text-indigo-700 border-indigo-100 text-[10px] font-bold py-0 h-5">
                                    Series: {iss.dropdownBatchSeries}
                                  </Badge>
                                )}
                                {iss.batchNumberSeries && (
                                  <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] font-bold py-0 h-5 font-mono">
                                    Sheets: {iss.batchNumberSeries}
                                  </Badge>
                                )}
                              </div>
                            )}

                            {/* Sequential Printing Queue Trigger / Indicator */}
                            {totalSheets > 0 && (
                              <div className="pt-1 flex items-center gap-2 flex-wrap">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleExpandBatch(iss.id)}
                                  className={cn(
                                    "rounded-full text-[11px] font-bold h-7 px-3 gap-1.5 transition-colors border",
                                    isExpanded 
                                      ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-sm" 
                                      : "bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                  )}
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Print Queue ({printedCount}/{totalSheets})</span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </Button>

                                {/* Compact inline status indicators for sequential sheets */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {sheets.map((s, idx) => (
                                    <span 
                                      key={s.id || idx}
                                      title={`Sheet #${idx + 1} (${s.batchNumber}): ${s.status}`}
                                      className={cn(
                                        "w-2.5 h-2.5 rounded-full border transition-all",
                                        s.status === 'PRINTED' || s.status === 'REPRINTED' 
                                          ? "bg-emerald-500 border-emerald-600" 
                                          : s.status === 'READY_TO_PRINT' 
                                          ? "bg-indigo-600 border-indigo-700 animate-pulse ring-2 ring-indigo-300"
                                          : s.status === 'PRINTING' || s.status === 'REPRINTING'
                                          ? "bg-amber-500 border-amber-600 animate-pulse"
                                          : s.status === 'INTERRUPTED' || s.status === 'REPRINT_REQUIRED'
                                          ? "bg-rose-500 border-rose-600"
                                          : "bg-slate-200 border-slate-300"
                                      )}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell className="py-8">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-extrabold font-mono tracking-tight bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 w-fit">
                            <Layers className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{iss.recordInfo?.masterSnapshot?.stage || product?.stage || 'N/A'}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-bold block pl-1">
                            Process: {iss.recordInfo?.masterSnapshot?.type || product?.type || 'N/A'}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold inline-block">
                          {iss.manufacturingDate}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="font-mono bg-slate-50 text-[10px] py-0 h-5 px-2">
                          Ver {iss.version || '1.0'}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {getStatusBadge(iss)}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2 text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-sm font-medium">{new Date(iss.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="text-sm font-bold text-slate-700">
                          {requesterStr}
                        </div>
                      </TableCell>

                      <TableCell className="pr-10 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {iss.status === 'PENDING_REVIEW' && (user?.permissions?.includes('batch:approve') || user?.permissions?.includes('batch:review') || getUserBaseRole(user) === 'ADMIN') && (
                            <>
                              <Button 
                                size="sm"
                                onClick={() => handleAction(iss, 'APPROVE')}
                                className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-9 px-4"
                              >
                                <Check className="w-4 h-4 mr-1.5" />
                                Approve
                              </Button>
                              <Button 
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedIssuance(iss);
                                  setIsReturnDialogOpen(true);
                                }}
                                className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-50 font-bold h-9 px-4"
                              >
                                <RotateCcw className="w-4 h-4 mr-1.5" />
                                Return
                              </Button>
                              <Button 
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAction(iss, 'REJECT')}
                                className="rounded-full text-rose-600 hover:bg-rose-50 font-bold h-9 px-4"
                              >
                                <X className="w-4 h-4 mr-1.5" />
                                Reject
                              </Button>
                            </>
                          )}
                          
                          {/* Direct Primary Action on Table Row: Print Ready Sheet */}
                          {(iss.status === 'ISSUED' || iss.status === 'IN_PROGRESS') && readySheet && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isExpanded) toggleExpandBatch(iss.id);
                                handleStartPrint(iss, readySheet, readySheetEligibility?.isReprintRequired || false);
                              }}
                              disabled={printActionLoading}
                              className={cn(
                                "rounded-full text-white font-bold h-9 px-4 text-xs shadow-sm flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95",
                                readySheetEligibility?.isReprintRequired
                                  ? "bg-orange-600 hover:bg-orange-700"
                                  : "bg-indigo-600 hover:bg-indigo-700"
                              )}
                            >
                              {printActionLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : readySheetEligibility?.isReprintRequired ? (
                                <RotateCcw className="w-3.5 h-3.5" />
                              ) : (
                                <Printer className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {readySheetEligibility?.isReprintRequired
                                  ? `Reprint Sheet #${readySheet.sequenceIndex + 1}`
                                  : `Print Sheet #${readySheet.sequenceIndex + 1}`}
                              </span>
                            </Button>
                          )}

                          {/* Toggle Sequential Print Queue for batches with sheets */}
                          {totalSheets > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleExpandBatch(iss.id)}
                              className={cn(
                                "rounded-full font-bold h-9 px-4 text-xs transition-colors",
                                isExpanded 
                                  ? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm" 
                                  : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                              )}
                            >
                              <Printer className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                              {isExpanded ? 'Hide Queue' : `Print Queue (${printedCount}/${totalSheets})`}
                            </Button>
                          )}

                          <Button 
                            variant="ghost"
                            onClick={() => navigate(`/batches/${iss.id}`)}
                            className="rounded-full text-indigo-600 font-black hover:bg-indigo-50 h-9 px-4"
                          >
                            View
                            <ArrowRight className="w-4 h-4 ml-1.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expandable Sequential Print Queue Sub-Row */}
                    {isExpanded && (
                      <TableRow className="bg-slate-50/70 border-b border-slate-100 hover:bg-slate-50/70">
                        <TableCell colSpan={8} className="p-6 md:p-8">
                          <div className="bg-white rounded-3xl p-6 md:p-8 border border-indigo-100/80 shadow-sm space-y-6">
                            {/* Queue Header */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                              <div>
                                <div className="flex items-center gap-2.5 mb-1">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Printer className="w-4 h-4" />
                                  </div>
                                  <h3 className="text-lg font-black text-slate-900">
                                    Sequential Batch Sheet Printing Queue
                                  </h3>
                                  <Badge className="bg-indigo-600 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full">
                                    21 CFR Part 11 Enforced
                                  </Badge>
                                </div>
                                <p className="text-xs text-slate-500 font-medium max-w-2xl">
                                  Batch sheets must be printed in strict sequential order. Only the designated ready sheet is unlocked for printing.
                                </p>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Queue Progress</div>
                                  <div className="text-sm font-black text-slate-900 font-mono">
                                    {printedCount} of {totalSheets} Certified
                                  </div>
                                </div>
                                <div className="w-28 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                                    style={{ width: `${totalSheets > 0 ? (printedCount / totalSheets) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Active Concurrency Lock Banner (if any) */}
                            {(() => {
                              const lockedSheet = sheets.find(s => s.activeLock != null);
                              if (!lockedSheet) return null;
                              const isMyLock = lockedSheet.activeLock?.lockedBy === user?.uid;
                              return (
                                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
                                  <div className="flex items-center gap-3">
                                    <Lock className="w-5 h-5 text-amber-600 shrink-0" />
                                    <div className="text-xs">
                                      <span className="font-bold block text-amber-950">Active Print Lock Engaged</span>
                                      <span>
                                        Sheet #{lockedSheet.sequenceIndex + 1} ({lockedSheet.batchNumber}) is currently locked by <strong>{lockedSheet.activeLock?.lockedByName || 'Operator'}</strong> since {new Date(lockedSheet.activeLock?.lockedAt || '').toLocaleTimeString()}.
                                      </span>
                                    </div>
                                  </div>
                                  {(isMyLock || getUserBaseRole(user) === 'ADMIN') && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleReleaseLock(iss, lockedSheet)}
                                      disabled={printActionLoading}
                                      className="rounded-full border-amber-300 bg-amber-100/50 hover:bg-amber-100 text-amber-900 font-bold text-xs shrink-0"
                                    >
                                      <Unlock className="w-3.5 h-3.5 mr-1 text-amber-700" />
                                      Release Lock
                                    </Button>
                                  )}
                                </div>
                              );
                            })()}

                            {/* List / Grid of Individual Sequential Batch Sheet Cards */}
                            <div className="space-y-3.5">
                              {sheets.map((sheet, idx) => {
                                const eligibility = evaluateSheetPrintEligibility(iss, sheet, idx, sheets);

                                return (
                                  <div
                                    key={sheet.id || idx}
                                    className={cn(
                                      "p-4 md:p-5 rounded-2xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4",
                                      eligibility.isReady 
                                        ? "bg-indigo-50/40 border-indigo-200 ring-2 ring-indigo-500/20 shadow-sm" 
                                        : eligibility.isPrinting
                                        ? "bg-amber-50/30 border-amber-200 ring-2 ring-amber-500/20"
                                        : eligibility.isInterrupted
                                        ? "bg-rose-50/30 border-rose-200"
                                        : eligibility.isPrinted
                                        ? "bg-slate-50/60 border-slate-200/80"
                                        : "bg-slate-50/30 border-slate-100 opacity-80"
                                    )}
                                  >
                                    {/* Left: Sequence Position & Information */}
                                    <div className="flex items-start gap-4">
                                      <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border",
                                        eligibility.isPrinted 
                                          ? "bg-emerald-50 border-emerald-300 text-emerald-700" 
                                          : eligibility.isReady
                                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                                          : eligibility.isInterrupted
                                          ? "bg-rose-50 border-rose-300 text-rose-700"
                                          : eligibility.isPrinting
                                          ? "bg-amber-100 border-amber-300 text-amber-800"
                                          : "bg-slate-100 border-slate-200 text-slate-500"
                                      )}>
                                        #{idx + 1}
                                      </div>

                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                          <span className="font-black text-slate-900 font-mono text-sm">
                                            {sheet.batchNumber}
                                          </span>
                                          {getSequentialSheetBadge(sheet.status, sheet.printCount)}
                                          {sheet.printCount > 1 && (
                                            <Badge variant="outline" className="text-[9px] font-bold border-amber-200 text-amber-700 bg-amber-50">
                                              Copy #{sheet.printCount}
                                            </Badge>
                                          )}
                                        </div>

                                        {/* Audit meta details */}
                                        <div className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap font-medium">
                                          {sheet.printedAt ? (
                                            <span>
                                              Printed by <strong>{sheet.printedByName || 'Operator'}</strong> on {new Date(sheet.printedAt).toLocaleTimeString()} ({new Date(sheet.printedAt).toLocaleDateString()})
                                            </span>
                                          ) : sheet.activeLock ? (
                                            <span className="text-amber-700 font-bold flex items-center gap-1">
                                              <Lock className="w-3 h-3" /> Locked by {sheet.activeLock.lockedByName || 'Operator'}
                                            </span>
                                          ) : sheet.interruptedReason ? (
                                            <span className="text-rose-600 font-bold">
                                              Interruption: {sheet.interruptedReason}
                                            </span>
                                          ) : (
                                            <span>Sequential Item #{idx + 1}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Right: Individual Action Buttons (Strictly enforcing disabled states on non-ready buttons) */}
                                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                      {/* Preview PDF */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handlePreviewSheet(iss, sheet)}
                                        disabled={generatingPreview}
                                        className="rounded-full text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 h-9 px-3 text-xs font-bold"
                                        title="Preview PDF"
                                      >
                                        <Eye className="w-3.5 h-3.5 mr-1" />
                                        Preview
                                      </Button>

                                      {/* Resume / Complete active lock if held by current user */}
                                      {eligibility.isPrinting && eligibility.isCurrentSheetLockedByMe && (
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            setActivePrintingBatch(iss);
                                            setActivePrintingSheet(sheet);
                                            setPrintPassword('');
                                            setIsPrintConfirmOpen(true);
                                          }}
                                          className="rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold h-9 px-4 text-xs shadow-sm animate-pulse"
                                        >
                                          <Check className="w-3.5 h-3.5 mr-1" />
                                          Complete E-Sign
                                        </Button>
                                      )}

                                      {/* Request Reprint action for already printed sheets */}
                                      {eligibility.isPrinted && (eligibility.hasPrintPerm || getUserBaseRole(user) === 'ADMIN') && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setReprintTargetBatch(iss);
                                            setReprintTargetSheet(sheet);
                                            setReprintReasonPreset('Paper Jam during initial print');
                                            setReprintReasonDetails('');
                                            setIsReprintModalOpen(true);
                                          }}
                                          className="rounded-full border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 h-9 px-3.5 text-xs font-bold"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                          Request Reprint
                                        </Button>
                                      )}

                                      {/* The Primary Individual Print / Reprint Button */}
                                      {eligibility.isReady ? (
                                        // ONLY THIS BUTTON IS ENABLED
                                        <Button
                                          size="sm"
                                          onClick={() => handleStartPrint(iss, sheet, eligibility.isReprintRequired)}
                                          disabled={printActionLoading}
                                          className={cn(
                                            "rounded-full text-white font-black text-xs h-9 px-5 shadow-md transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5",
                                            eligibility.isReprintRequired 
                                              ? "bg-orange-600 hover:bg-orange-700 shadow-orange-200" 
                                              : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200"
                                          )}
                                        >
                                          {printActionLoading ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : eligibility.isReprintRequired ? (
                                            <RotateCcw className="w-3.5 h-3.5" />
                                          ) : (
                                            <Printer className="w-3.5 h-3.5" />
                                          )}
                                          <span>
                                            {eligibility.isReprintRequired ? `Reprint Sheet #${idx + 1}` : `Print Sheet #${idx + 1}`}
                                          </span>
                                        </Button>
                                      ) : (
                                        // ALL OTHER BUTTONS ARE VISUALLY AND PROGRAMMATICALLY DISABLED
                                        <Button
                                          size="sm"
                                          disabled={true}
                                          title={eligibility.disabledReason}
                                          className={cn(
                                            "rounded-full font-bold text-xs h-9 px-4 select-none cursor-not-allowed border flex items-center gap-1.5 transition-none",
                                            eligibility.isPrinted 
                                              ? "bg-emerald-50/50 text-emerald-700 border-emerald-200 opacity-90 cursor-default" 
                                              : eligibility.isPrinting
                                              ? "bg-amber-50 text-amber-800 border-amber-200 opacity-80"
                                              : eligibility.isInterrupted
                                              ? "bg-rose-50 text-rose-700 border-rose-200 opacity-80"
                                              : "bg-slate-100 text-slate-400 border-slate-200 opacity-50"
                                          )}
                                        >
                                          {eligibility.isPrinted ? (
                                            <>
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                              <span>Certified & Printed</span>
                                            </>
                                          ) : eligibility.isPrinting ? (
                                            <>
                                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                              <span>Printing in Progress</span>
                                            </>
                                          ) : eligibility.isInterrupted ? (
                                            <>
                                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                              <span>Interrupted (Reprint Pending)</span>
                                            </>
                                          ) : (
                                            <>
                                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                                              <span>{eligibility.isPending ? `Locked (Sheet #${idx} First)` : 'Print Disabled'}</span>
                                            </>
                                          )}
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredIssuances.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-80 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-slate-300">
                        <Search className="w-16 h-16 opacity-10" />
                        <div>
                            <p className="text-lg font-bold text-slate-400">No batch issuance requests found</p>
                            <p className="text-sm text-slate-400 mt-1">Adjust your filters or search keywords.</p>
                        </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 21 CFR Part 11 Electronic Signature Print Confirmation Dialog */}
      <Dialog open={isPrintConfirmOpen} onOpenChange={setIsPrintConfirmOpen}>
        <DialogContent className="rounded-[32px] sm:max-w-lg">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900">
              Certify Batch Sheet Print Execution
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Verify physical receipt and print completion for <strong>Sheet #{activePrintingSheet ? activePrintingSheet.sequenceIndex + 1 : 1} ({activePrintingSheet?.batchNumber})</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider">Batch Number:</span>
                <span className="font-black text-slate-900 font-mono">{activePrintingSheet?.batchNumber}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider">Sequence Index:</span>
                <span className="font-black text-slate-900">Sheet #{activePrintingSheet ? activePrintingSheet.sequenceIndex + 1 : 1}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider">Copy Number:</span>
                <span className="font-black text-slate-900">Copy #{(activePrintingSheet?.printCount || 0) + 1}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Part 11 Electronic Signature Password *</Label>
              <Input
                type="password"
                value={printPassword}
                onChange={(e) => setPrintPassword(e.target.value)}
                placeholder="Enter your system password to certify print..."
                className="rounded-xl border-slate-200 focus:ring-indigo-500 h-11"
              />
              <p className="text-[11px] text-slate-400 font-medium">
                Under 21 CFR Part 11, confirming this action certifies that this specific batch sheet was printed, verified, and issued to the authorized production custody.
              </p>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2.5">
            <Button
              variant="outline"
              onClick={() => {
                setIsInterruptionModalOpen(true);
              }}
              className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
              Report Interruption
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsPrintConfirmOpen(false)}
                className="rounded-full font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmPrintSuccess}
                disabled={!printPassword || printActionLoading}
                className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-6 shadow-md"
              >
                {printActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />}
                Sign & Complete Print
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interruption Reason Modal */}
      <Dialog open={isInterruptionModalOpen} onOpenChange={setIsInterruptionModalOpen}>
        <DialogContent className="rounded-[32px] sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900">
              Report Print Interruption
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Record a printing failure (paper jam, spool error, power outage) for <strong>Sheet #{activePrintingSheet ? activePrintingSheet.sequenceIndex + 1 : 1}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Predefined Reason *</Label>
              <Select value={interruptionReasonPreset} onValueChange={setInterruptionReasonPreset}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Paper Jam / Printer Feed Failure">Paper Jam / Printer Feed Failure</SelectItem>
                  <SelectItem value="Toner / Ink Depletion Fault">Toner / Ink Depletion Fault</SelectItem>
                  <SelectItem value="Physical Page Misalignment or Smudge">Physical Page Misalignment or Smudge</SelectItem>
                  <SelectItem value="Network / Print Spooler Connection Loss">Network / Print Spooler Connection Loss</SelectItem>
                  <SelectItem value="Damaged Official Watermarked Paper Stock">Damaged Official Watermarked Paper Stock</SelectItem>
                  <SelectItem value="Other Operator Interruption">Other Operator Interruption</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Additional Comments</Label>
              <Textarea
                value={interruptionComments}
                onChange={(e) => setInterruptionComments(e.target.value)}
                placeholder="Detail the failure conditions and corrective disposal..."
                className="rounded-2xl border-slate-200 focus:ring-rose-500 resize-none h-24 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between gap-2">
            <Button variant="ghost" onClick={() => setIsInterruptionModalOpen(false)} className="rounded-full font-bold">
              Cancel
            </Button>
            <Button
              onClick={handleReportInterruption}
              disabled={printActionLoading}
              className="rounded-full bg-rose-600 hover:bg-rose-700 text-white font-black px-6"
            >
              {printActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <AlertTriangle className="w-4 h-4 mr-1.5" />}
              Submit Interruption
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprint Request Modal */}
      <Dialog open={isReprintModalOpen} onOpenChange={setIsReprintModalOpen}>
        <DialogContent className="rounded-[32px] sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 mb-4">
              <RotateCcw className="w-6 h-6" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900">
              Request Batch Sheet Reprint
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Specify a mandatory reason to authorize reprinting <strong>Sheet #{reprintTargetSheet ? reprintTargetSheet.sequenceIndex + 1 : 1} ({reprintTargetSheet?.batchNumber})</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Reprint Reason *</Label>
              <Select value={reprintReasonPreset} onValueChange={setReprintReasonPreset}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Paper Jam during initial print">Paper Jam during initial print</SelectItem>
                  <SelectItem value="Physical damage to issued batch sheet">Physical damage to issued batch sheet</SelectItem>
                  <SelectItem value="Inadvertent chemical spill on shopfloor">Inadvertent chemical spill on shopfloor</SelectItem>
                  <SelectItem value="Illegible barcode or watermark banding">Illegible barcode or watermark banding</SelectItem>
                  <SelectItem value="Quality Assurance authorized replacement copy">Quality Assurance authorized replacement copy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Detailed Justification</Label>
              <Textarea
                value={reprintReasonDetails}
                onChange={(e) => setReprintReasonDetails(e.target.value)}
                placeholder="Document QA authorization and physical disposition of previous copy..."
                className="rounded-2xl border-slate-200 focus:ring-orange-500 resize-none h-24 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between gap-2">
            <Button variant="ghost" onClick={() => setIsReprintModalOpen(false)} className="rounded-full font-bold">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReprintRequest}
              disabled={printActionLoading}
              className="rounded-full bg-orange-600 hover:bg-orange-700 text-white font-black px-6"
            >
              {printActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
              Proceed to Reprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Modal */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 overflow-hidden rounded-[32px] border-none bg-slate-900 flex flex-col">
          <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-sm tracking-wide">
                Certified Sheet Preview: {previewSheetLabel}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPreviewOpen(false)}
              className="text-slate-400 hover:text-white rounded-full h-8 px-3"
            >
              Close
            </Button>
          </div>
          <div className="flex-1 bg-slate-950 p-2 overflow-hidden">
            {previewPDFUrl && (
              <SecurePDFViewer
                fileUrl={previewPDFUrl}
                onClose={() => setIsPreviewOpen(false)}
                title={previewSheetLabel}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* QA Approval Dialog */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="rounded-[32px] sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900">Approve Request</DialogTitle>
            <DialogDescription className="text-slate-500">
              You are about to approve the issuance of batch <strong>{selectedIssuance?.batchNumber}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedIssuance?.comments && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-600 mb-2 whitespace-pre-wrap">
                <span className="font-bold text-slate-700 block mb-1 uppercase tracking-wider text-[10px]">Requester Comments:</span>
                {selectedIssuance.comments}
              </div>
            )}
            {selectedIssuance?.reprintReason && (
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3.5 text-xs text-rose-800 mb-2 whitespace-pre-wrap">
                <span className="font-bold text-rose-700 block mb-1 uppercase tracking-wider text-[10px]">Reason for Re-Print:</span>
                {selectedIssuance.reprintReason}
              </div>
            )}
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Reason for Approval</Label>
              <Textarea 
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value)}
                placeholder="Enter reason for approval (required for audit)..."
                className="rounded-2xl border-slate-100 focus:ring-indigo-500 resize-none h-24 text-xs"
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-between gap-3">
            <Button variant="ghost" onClick={() => setIsApproveDialogOpen(false)} className="rounded-full font-bold">
              Cancel
            </Button>
            <Button onClick={onConfirmAction} className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black px-8">
              Proceed to Sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QA Rejection Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="rounded-[32px] sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 mb-4">
              <XCircle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900">Reject Request</DialogTitle>
            <DialogDescription className="text-slate-500">
              Please provide a clear reason why the request for batch <strong>{selectedIssuance?.batchNumber}</strong> is being rejected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedIssuance?.comments && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-600 mb-2 whitespace-pre-wrap">
                <span className="font-bold text-slate-700 block mb-1 uppercase tracking-wider text-[10px]">Requester Comments:</span>
                {selectedIssuance.comments}
              </div>
            )}
            {selectedIssuance?.reprintReason && (
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3.5 text-xs text-rose-800 mb-2 whitespace-pre-wrap">
                <span className="font-bold text-rose-700 block mb-1 uppercase tracking-wider text-[10px]">Reason for Re-Print:</span>
                {selectedIssuance.reprintReason}
              </div>
            )}
            <div className="space-y-2">
              <Label className="font-bold text-slate-700 text-rose-600">Rejection Reason *</Label>
              <Textarea 
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Detail why this issuance request cannot be approved..."
                className="rounded-2xl border-slate-100 focus:ring-rose-500 resize-none h-32 text-xs"
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-between gap-3">
            <Button variant="ghost" onClick={() => setIsRejectDialogOpen(false)} className="rounded-full font-bold">
              Cancel
            </Button>
            <Button 
              onClick={onConfirmAction}
              disabled={!rejectionReason.trim()} 
              className="rounded-full bg-rose-500 hover:bg-rose-600 text-white font-black px-8"
            >
              Sign & Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Part 11 Electronic Signature Dialog */}
      <SignatureDialog 
        isOpen={isSignatureOpen}
        onClose={() => setIsSignatureOpen(false)}
        onConfirm={onSignatureConfirm}
        title={pendingAction === 'APPROVE' ? 'Sign Approval' : 'Sign Rejection'}
        description={`Electronic signature is required to ${pendingAction?.toLowerCase()} this batch issuance request.`}
        meaning={pendingAction === 'APPROVE' 
          ? `I verify that batch ${selectedIssuance?.batchNumber} is compliant and authorized for production issuance.`
          : `I am rejecting the issuance request for batch ${selectedIssuance?.batchNumber} based on the provided reason.`
        }
      />

      {/* Return Dialog */}
      <ReturnDialog 
        isOpen={isReturnDialogOpen}
        onClose={() => setIsReturnDialogOpen(false)}
        onConfirm={handleConfirmReturn}
        title="RETURN BATCH ISSUANCE REQUEST FOR CORRECTION"
        recordId={selectedIssuance?.batchNumber || selectedIssuance?.id || ''}
        recordTitle={selectedIssuance?.batchNumber}
        entityType="BATCH_ISSUANCE"
        currentStep={selectedIssuance?.status || 'PENDING_REVIEW'}
        isLoading={actionLoading}
        requiresESignature={true}
      />
    </div>
  );
}
