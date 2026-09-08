import React, { useState, useMemo } from 'react';
import { 
  BatchIssuance, 
  BatchSheetItem, 
  ProductMaster, 
  getUserBaseRole 
} from '../types';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { toast } from 'sonner';
import { 
  CheckCircle2, 
  Clock, 
  Send, 
  ArrowRight, 
  ShieldCheck, 
  FileText, 
  AlertCircle, 
  History, 
  UserCheck, 
  PackageCheck, 
  Lock, 
  Filter, 
  HelpCircle,
  Eye,
  CheckSquare,
  Square,
  AlertTriangle,
  FileCheck2,
  Layers
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { cn } from '../lib/utils';
import { computeSheetCustody } from '../lib/batch-sheets';

interface BatchSheetCustodyManagerProps {
  batch: BatchIssuance;
  productMaster?: ProductMaster | null;
  onBatchUpdated: () => Promise<void>;
  onPreviewSheet?: (sheet: BatchSheetItem) => void;
}

type CustodyOperation = 
  | 'HANDOVER' 
  | 'PRODUCTION_RECEIVE' 
  | 'SEND_QA_REVIEW' 
  | 'QA_RECEIVE' 
  | 'COMPLETE_QA_REVIEW';

export const BatchSheetCustodyManager: React.FC<BatchSheetCustodyManagerProps> = ({
  batch,
  productMaster,
  onBatchUpdated,
  onPreviewSheet
}) => {
  const { user } = useAuth();
  const baseRole = getUserBaseRole(user);
  const userPerms = user?.permissions || [];

  // Active filter tab
  const [filterTab, setFilterTab] = useState<'ALL' | 'HANDOVER' | 'PRODUCTION' | 'QA_REVIEW' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selection state
  const [selectedSheetIds, setSelectedSheetIds] = useState<string[]>([]);

  // Modal states
  const [activeOperation, setActiveOperation] = useState<CustodyOperation | null>(null);
  const [signaturePassword, setSignaturePassword] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audit history modal
  const [auditSheet, setAuditSheet] = useState<BatchSheetItem | null>(null);

  // Normalize sheets
  const sheets: BatchSheetItem[] = useMemo(() => {
    return (batch.batchSheets || []).map(s => ({
      ...s,
      currentCustody: computeSheetCustody(s, batch.status)
    }));
  }, [batch]);

  // Role permissions
  const canQAHandover = baseRole === 'ADMIN' || baseRole === 'QA' || 
    userPerms.some(p => ['op:ready_for_handover', 'batch:approve', 'batch:review', 'batch:print', 'op:issued'].includes(p));

  const canProductionReceive = baseRole === 'ADMIN' || baseRole === 'PRODUCTION_MANAGER' || baseRole === 'OPERATOR' ||
    userPerms.some(p => ['op:production_in_progress', 'batch:sign', 'batch:create', 'batch:edit'].includes(p));

  const canSendForQaReview = baseRole === 'ADMIN' || baseRole === 'PRODUCTION_MANAGER' || baseRole === 'OPERATOR' ||
    userPerms.some(p => ['op:ready_for_qa_review', 'batch:sign', 'batch:edit'].includes(p));

  const canQaReceiveAndReview = baseRole === 'ADMIN' || baseRole === 'QA' ||
    userPerms.some(p => ['op:completed', 'batch:approve', 'batch:review'].includes(p));

  // Eligibility helpers
  const isSheetEligibleForHandover = (s: BatchSheetItem) => {
    const isPrinted = s.status === 'PRINT_COMPLETED' || s.status === 'PRINTED' || s.status === 'REPRINTED' || (s.printCount || 0) > 0;
    return isPrinted && s.handoverStatus !== 'HANDED_OVER_TO_PRODUCTION';
  };

  const isSheetEligibleForProductionReceive = (s: BatchSheetItem) => {
    return s.handoverStatus === 'HANDED_OVER_TO_PRODUCTION' && s.productionReceiptStatus !== 'RECEIVED_BY_PRODUCTION';
  };

  const isSheetEligibleForQaReturn = (s: BatchSheetItem) => {
    // If QA has handed over a batch sheet to Production, Production can send it back for QA Review
    // even if the Ready to Handover step is partially completed (i.e. some batch sheets are still pending for Handover)
    const isHandedOver = s.handoverStatus === 'HANDED_OVER_TO_PRODUCTION' || s.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION';
    return isHandedOver && 
      s.qaReturnStatus !== 'SENT_FOR_QA_REVIEW' && 
      s.qaReviewStatus !== 'QA_REVIEW_COMPLETED';
  };

  const isSheetEligibleForQaReceive = (s: BatchSheetItem) => {
    return s.qaReturnStatus === 'SENT_FOR_QA_REVIEW' && s.qaReceiptStatus !== 'RECEIVED_BY_QA';
  };

  const isSheetEligibleForQaReviewComplete = (s: BatchSheetItem) => {
    return s.qaReceiptStatus === 'RECEIVED_BY_QA' && s.qaReviewStatus !== 'QA_REVIEW_COMPLETED';
  };

  // Aggregated Counts
  const totalCount = sheets.length;
  const printedCount = sheets.filter(s => s.status === 'PRINT_COMPLETED' || s.status === 'PRINTED' || s.status === 'REPRINTED' || (s.printCount || 0) > 0).length;
  const eligibleForHandoverCount = sheets.filter(isSheetEligibleForHandover).length;
  const handedOverCount = sheets.filter(s => s.handoverStatus === 'HANDED_OVER_TO_PRODUCTION').length;
  const awaitingProdReceiptCount = sheets.filter(isSheetEligibleForProductionReceive).length;
  const inProductionCount = sheets.filter(s => (s.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION' || s.handoverStatus === 'HANDED_OVER_TO_PRODUCTION') && s.qaReturnStatus !== 'SENT_FOR_QA_REVIEW').length;
  const sentForQaReviewCount = sheets.filter(s => s.qaReturnStatus === 'SENT_FOR_QA_REVIEW').length;
  const awaitingQaReceiptCount = sheets.filter(isSheetEligibleForQaReceive).length;
  const underQaReviewCount = sheets.filter(isSheetEligibleForQaReviewComplete).length;
  const completedCount = sheets.filter(s => s.qaReviewStatus === 'QA_REVIEW_COMPLETED').length;

  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Filtered sheets
  const filteredSheets = useMemo(() => {
    return sheets.filter(sheet => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNum = sheet.batchNumber.toLowerCase().includes(q);
        const matchesCustody = (sheet.currentCustody || '').toLowerCase().includes(q);
        if (!matchesNum && !matchesCustody) return false;
      }

      // Tab filter
      if (filterTab === 'HANDOVER') {
        return isSheetEligibleForHandover(sheet) || isSheetEligibleForProductionReceive(sheet);
      }
      if (filterTab === 'PRODUCTION') {
        return (sheet.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION' || sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION') && sheet.qaReturnStatus !== 'SENT_FOR_QA_REVIEW';
      }
      if (filterTab === 'QA_REVIEW') {
        return sheet.qaReturnStatus === 'SENT_FOR_QA_REVIEW' && sheet.qaReviewStatus !== 'QA_REVIEW_COMPLETED';
      }
      if (filterTab === 'COMPLETED') {
        return sheet.qaReviewStatus === 'QA_REVIEW_COMPLETED';
      }
      return true;
    });
  }, [sheets, filterTab, searchQuery]);

  // Determine selectable eligible items based on current context
  const getContextEligibleSheets = () => {
    if (filterTab === 'HANDOVER') {
      return sheets.filter(isSheetEligibleForHandover);
    }
    if (filterTab === 'PRODUCTION') {
      return sheets.filter(isSheetEligibleForQaReturn);
    }
    if (filterTab === 'QA_REVIEW') {
      return sheets.filter(s => isSheetEligibleForQaReceive(s) || isSheetEligibleForQaReviewComplete(s));
    }
    if (filterTab === 'COMPLETED') {
      return [];
    }
    // In 'ALL' view: prioritize Production return for QA review if user has permission and sheets are ready
    if (canSendForQaReview && sheets.some(isSheetEligibleForQaReturn)) {
      return sheets.filter(isSheetEligibleForQaReturn);
    }
    if (canQAHandover && sheets.some(isSheetEligibleForHandover)) {
      return sheets.filter(isSheetEligibleForHandover);
    }
    if (canQaReceiveAndReview && sheets.some(s => isSheetEligibleForQaReceive(s) || isSheetEligibleForQaReviewComplete(s))) {
      return sheets.filter(s => isSheetEligibleForQaReceive(s) || isSheetEligibleForQaReviewComplete(s));
    }
    return sheets;
  };

  const contextEligible = getContextEligibleSheets();

  // Selection handlers
  const handleToggleSelectSheet = (sheetId: string) => {
    setSelectedSheetIds(prev => 
      prev.includes(sheetId) ? prev.filter(id => id !== sheetId) : [...prev, sheetId]
    );
  };

  const handleSelectAllEligible = () => {
    const ids = contextEligible.map(s => s.id);
    setSelectedSheetIds(ids);
  };

  const handleClearSelection = () => {
    setSelectedSheetIds([]);
  };

  // Open operation modal
  const handleOpenOperation = (op: CustodyOperation, specificSheetId?: string) => {
    if (specificSheetId) {
      setSelectedSheetIds([specificSheetId]);
    } else if (selectedSheetIds.length === 0) {
      toast.error('Please select at least one Batch Sheet.');
      return;
    }

    setActiveOperation(op);
    setSignaturePassword('');
    
    // Default reason based on operation
    switch (op) {
      case 'HANDOVER':
        setChangeReason('Physical batch sheets and issuance custody verified and handed over to Production.');
        break;
      case 'PRODUCTION_RECEIVE':
        setChangeReason('Production department has physically inspected and accepted batch sheet custody.');
        break;
      case 'SEND_QA_REVIEW':
        setChangeReason('Production processing completed; batch sheets submitted for QA review.');
        break;
      case 'QA_RECEIVE':
        setChangeReason('QA department received executed batch sheets for compliance review.');
        break;
      case 'COMPLETE_QA_REVIEW':
        setChangeReason('QA review completed and certified conforming to 21 CFR Part 11 and GMP.');
        break;
    }
  };

  // Submit operation
  const handleSubmitOperation = async () => {
    if (!signaturePassword.trim()) {
      toast.error('Electronic signature password is required for 21 CFR Part 11 verification.');
      return;
    }

    if (selectedSheetIds.length === 0) {
      toast.error('No Batch Sheets selected.');
      return;
    }

    setIsSubmitting(true);
    try {
      let endpoint = '';
      switch (activeOperation) {
        case 'HANDOVER':
          endpoint = `/batches/${batch.id}/sheets/handover`;
          break;
        case 'PRODUCTION_RECEIVE':
          endpoint = `/batches/${batch.id}/sheets/production-receive`;
          break;
        case 'SEND_QA_REVIEW':
          endpoint = `/batches/${batch.id}/sheets/send-qa-review`;
          break;
        case 'QA_RECEIVE':
          endpoint = `/batches/${batch.id}/sheets/qa-receive`;
          break;
        case 'COMPLETE_QA_REVIEW':
          endpoint = `/batches/${batch.id}/sheets/complete-qa-review`;
          break;
        default:
          throw new Error('Invalid operation');
      }

      const res = await api.post(endpoint, {
        sheetIds: selectedSheetIds,
        changeReason,
        password: signaturePassword
      });

      if (res.data.success) {
        toast.success(res.data.message || 'Operation executed successfully with electronic signature.');
        setActiveOperation(null);
        setSelectedSheetIds([]);
        await onBatchUpdated();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" id="batch-custody-manager">
      {/* Overview & Progress Card */}
      <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
        <CardHeader className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 backdrop-blur-md">
                  <PackageCheck className="w-6 h-6" />
                </span>
                <Badge className="bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40 border-indigo-400/30 text-xs px-3 py-1 font-bold">
                  21 CFR Part 11 Custody Transfer & Review
                </Badge>
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-white">
                Batch Sheet Handover & Custody Manager
              </CardTitle>
              <CardDescription className="text-slate-300 text-sm mt-1">
                Granular tracking and multi-sheet custody progression from QA issuance to shopfloor execution and QA review.
              </CardDescription>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
              <div className="text-center px-3 border-r border-white/10 last:border-none">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Sheets</span>
                <span className="text-xl font-black text-white">{totalCount}</span>
              </div>
              <div className="text-center px-3 border-r border-white/10 last:border-none">
                <span className="text-[10px] uppercase font-bold text-amber-300 block">In Production</span>
                <span className="text-xl font-black text-amber-300">{inProductionCount}</span>
              </div>
              <div className="text-center px-3 border-r border-white/10 last:border-none">
                <span className="text-[10px] uppercase font-bold text-sky-300 block">Under QA Review</span>
                <span className="text-xl font-black text-sky-300">{underQaReviewCount}</span>
              </div>
              <div className="text-center px-3">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">Completed</span>
                <span className="text-xl font-black text-emerald-400">{completedCount}</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="flex items-center justify-between text-xs text-slate-300 font-medium mb-2">
              <span>Overall Issuance & Review Completion</span>
              <span className="font-bold text-white">{completedCount} of {totalCount} Sheets ({progressPercent}%)</span>
            </div>
            <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden p-0.5">
              <div 
                className="h-full bg-gradient-to-r from-indigo-400 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-8 space-y-6">
          {/* Action Toolbar & Bulk Action Buttons */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/70">
            <div className="flex flex-wrap items-center gap-2">
              {/* Tab Filters */}
              <button
                onClick={() => setFilterTab('ALL')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
                  filterTab === 'ALL' 
                    ? "bg-slate-900 text-white shadow-sm" 
                    : "bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200"
                )}
              >
                All Sheets ({totalCount})
              </button>
              <button
                onClick={() => setFilterTab('HANDOVER')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
                  filterTab === 'HANDOVER' 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200"
                )}
              >
                QA Handover Queue ({eligibleForHandoverCount + awaitingProdReceiptCount})
              </button>
              <button
                onClick={() => setFilterTab('PRODUCTION')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
                  filterTab === 'PRODUCTION' 
                    ? "bg-amber-600 text-white shadow-sm" 
                    : "bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200"
                )}
              >
                In Production ({inProductionCount})
              </button>
              <button
                onClick={() => setFilterTab('QA_REVIEW')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
                  filterTab === 'QA_REVIEW' 
                    ? "bg-sky-600 text-white shadow-sm" 
                    : "bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200"
                )}
              >
                QA Review Queue ({sentForQaReviewCount})
              </button>
              <button
                onClick={() => setFilterTab('COMPLETED')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
                  filterTab === 'COMPLETED' 
                    ? "bg-emerald-600 text-white shadow-sm" 
                    : "bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200"
                )}
              >
                Certified & Completed ({completedCount})
              </button>
            </div>

            {/* Selection Controls */}
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-500 font-medium">
                Selected: <strong className="text-indigo-600 font-bold">{selectedSheetIds.length}</strong> of {filteredSheets.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllEligible}
                className="h-8 rounded-xl text-xs font-semibold"
              >
                Select All Eligible
              </Button>
              {selectedSheetIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  className="h-8 rounded-xl text-xs text-slate-500 hover:text-slate-900"
                >
                  Clear Selection
                </Button>
              )}
            </div>
          </div>

          {/* Operational Action Buttons Row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* QA Handover button */}
            {canQAHandover && (
              <Button
                onClick={() => handleOpenOperation('HANDOVER')}
                disabled={selectedSheetIds.length === 0}
                className={cn(
                  "h-10 px-5 rounded-2xl font-bold text-xs gap-2 transition-all",
                  selectedSheetIds.length > 0
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
                )}
              >
                <Send className="w-4 h-4" />
                Handover Selected to Production ({selectedSheetIds.length})
              </Button>
            )}

            {/* Production Accept Custody button */}
            {canProductionReceive && (
              <Button
                onClick={() => handleOpenOperation('PRODUCTION_RECEIVE')}
                disabled={selectedSheetIds.length === 0}
                className={cn(
                  "h-10 px-5 rounded-2xl font-bold text-xs gap-2 transition-all",
                  selectedSheetIds.length > 0
                    ? "bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-100"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
                )}
              >
                <UserCheck className="w-4 h-4" />
                Accept Production Custody ({selectedSheetIds.length})
              </Button>
            )}

            {/* Send back for QA Review button */}
            {canSendForQaReview && (
              <Button
                onClick={() => handleOpenOperation('SEND_QA_REVIEW')}
                disabled={selectedSheetIds.length === 0}
                className={cn(
                  "h-10 px-5 rounded-2xl font-bold text-xs gap-2 transition-all",
                  selectedSheetIds.length > 0
                    ? "bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-100"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
                )}
              >
                <ArrowRight className="w-4 h-4" />
                Send Selected for QA Review ({selectedSheetIds.length})
              </Button>
            )}

            {/* QA Receive button */}
            {canQaReceiveAndReview && (
              <Button
                onClick={() => handleOpenOperation('QA_RECEIVE')}
                disabled={selectedSheetIds.length === 0}
                className={cn(
                  "h-10 px-5 rounded-2xl font-bold text-xs gap-2 transition-all",
                  selectedSheetIds.length > 0
                    ? "bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-100"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
                )}
              >
                <FileCheck2 className="w-4 h-4" />
                Acknowledge QA Receipt ({selectedSheetIds.length})
              </Button>
            )}

            {/* QA Complete Review button */}
            {canQaReceiveAndReview && (
              <Button
                onClick={() => handleOpenOperation('COMPLETE_QA_REVIEW')}
                disabled={selectedSheetIds.length === 0}
                className={cn(
                  "h-10 px-5 rounded-2xl font-bold text-xs gap-2 transition-all",
                  selectedSheetIds.length > 0
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-100"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
                )}
              >
                <CheckCircle2 className="w-4 h-4" />
                Certify QA Review ({selectedSheetIds.length})
              </Button>
            )}
          </div>

          {/* Table of Batch Sheets */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4 w-12 text-center">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="py-3.5 px-4">Sheet Batch Number</th>
                    <th className="py-3.5 px-4">Print Status</th>
                    <th className="py-3.5 px-4">Current Custody</th>
                    <th className="py-3.5 px-4">Handover Status</th>
                    <th className="py-3.5 px-4">Production Status</th>
                    <th className="py-3.5 px-4">QA Review Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredSheets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No batch sheets match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredSheets.map((sheet, index) => {
                      const isSelected = selectedSheetIds.includes(sheet.id);
                      const isPrinted = sheet.status === 'PRINT_COMPLETED' || sheet.status === 'PRINTED' || sheet.status === 'REPRINTED' || (sheet.printCount || 0) > 0;
                      const custody = sheet.currentCustody || computeSheetCustody(sheet, batch.status);

                      return (
                        <tr 
                          key={sheet.id}
                          className={cn(
                            "hover:bg-slate-50/80 transition-colors",
                            isSelected && "bg-indigo-50/40"
                          )}
                        >
                          {/* Selection Checkbox */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectSheet(sheet.id)}
                              className="focus:outline-none"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                              )}
                            </button>
                          </td>

                          {/* Sheet Number & Index */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900">
                                {sheet.batchNumber}
                              </span>
                              <Badge variant="outline" className="text-[10px] font-semibold text-slate-500 py-0 px-1.5 h-4">
                                #{sheet.sequenceIndex + 1}
                              </Badge>
                            </div>
                          </td>

                          {/* Print Status */}
                          <td className="py-3.5 px-4">
                            {isPrinted ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                                PRINTED (Copy {sheet.printCount || 1})
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-bold">
                                {sheet.status}
                              </Badge>
                            )}
                          </td>

                          {/* Current Custody */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "w-2 h-2 rounded-full",
                                custody.includes('QA – Reviewed') ? "bg-emerald-500" :
                                custody.includes('QA – Under Review') ? "bg-sky-500" :
                                custody.includes('QA – Awaiting') ? "bg-purple-500" :
                                custody.includes('Production') ? "bg-amber-500" :
                                custody.includes('Printed') ? "bg-indigo-500" :
                                "bg-slate-400"
                              )} />
                              <span className="font-semibold text-slate-800">
                                {custody}
                              </span>
                            </div>
                          </td>

                          {/* Handover Status */}
                          <td className="py-3.5 px-4">
                            {sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION' ? (
                              <div>
                                <span className="font-bold text-emerald-700 block">Handed Over</span>
                                <span className="text-[10px] text-slate-400 block truncate max-w-[140px]">
                                  {sheet.handedOverByName || 'QA'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium">Pending Handover</span>
                            )}
                          </td>

                          {/* Production Status */}
                          <td className="py-3.5 px-4">
                            {sheet.productionReceiptStatus === 'RECEIVED_BY_PRODUCTION' ? (
                              <div>
                                <span className="font-bold text-amber-700 block">In Production</span>
                                <span className="text-[10px] text-slate-400 block truncate max-w-[140px]">
                                  {sheet.productionReceivedByName || 'Production'}
                                </span>
                              </div>
                            ) : sheet.handoverStatus === 'HANDED_OVER_TO_PRODUCTION' ? (
                              <span className="text-amber-600 font-semibold">Awaiting Receipt</span>
                            ) : (
                              <span className="text-slate-400 font-medium">Not Handed Over</span>
                            )}
                          </td>

                          {/* QA Review Status */}
                          <td className="py-3.5 px-4">
                            {sheet.qaReviewStatus === 'QA_REVIEW_COMPLETED' ? (
                              <div>
                                <span className="font-bold text-emerald-700 block">Reviewed & Certified</span>
                                <span className="text-[10px] text-slate-400 block truncate max-w-[140px]">
                                  {sheet.qaReviewedByName || 'QA'}
                                </span>
                              </div>
                            ) : sheet.qaReceiptStatus === 'RECEIVED_BY_QA' ? (
                              <span className="text-sky-600 font-semibold">Under QA Review</span>
                            ) : sheet.qaReturnStatus === 'SENT_FOR_QA_REVIEW' ? (
                              <span className="text-purple-600 font-semibold">Sent to QA</span>
                            ) : (
                              <span className="text-slate-400 font-medium">Not Submitted</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Row action: Handover to Production if eligible */}
                              {canQAHandover && isSheetEligibleForHandover(sheet) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenOperation('HANDOVER', sheet.id)}
                                  className="h-7 px-2.5 text-[11px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200 font-bold gap-1"
                                  title="Handover this batch sheet to Production"
                                >
                                  <Send className="w-3 h-3" />
                                  Handover
                                </Button>
                              )}

                              {/* Row action: Production Accept Custody if handed over */}
                              {canProductionReceive && isSheetEligibleForProductionReceive(sheet) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenOperation('PRODUCTION_RECEIVE', sheet.id)}
                                  className="h-7 px-2.5 text-[11px] bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 font-bold gap-1"
                                  title="Accept Production Custody for this sheet"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  Accept
                                </Button>
                              )}

                              {/* Row action: Send back for QA Review if in Production */}
                              {canSendForQaReview && isSheetEligibleForQaReturn(sheet) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenOperation('SEND_QA_REVIEW', sheet.id)}
                                  className="h-7 px-2.5 text-[11px] bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200 font-bold gap-1"
                                  title="Send this handed-over sheet back for QA Review"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                  Send to QA
                                </Button>
                              )}

                              {/* Row action: QA Receive if submitted for review */}
                              {canQaReceiveAndReview && isSheetEligibleForQaReceive(sheet) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenOperation('QA_RECEIVE', sheet.id)}
                                  className="h-7 px-2.5 text-[11px] bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 font-bold gap-1"
                                  title="Acknowledge QA physical receipt for this sheet"
                                >
                                  <FileCheck2 className="w-3 h-3" />
                                  QA Receive
                                </Button>
                              )}

                              {/* Row action: QA Complete Review if received */}
                              {canQaReceiveAndReview && isSheetEligibleForQaReviewComplete(sheet) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenOperation('COMPLETE_QA_REVIEW', sheet.id)}
                                  className="h-7 px-2.5 text-[11px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 font-bold gap-1"
                                  title="Complete QA review and accept this sheet"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Accept Sheet
                                </Button>
                              )}

                              {/* Audit Trail Button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAuditSheet(sheet)}
                                className="h-7 px-2 text-[11px] text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-bold gap-1"
                                title="View individual sheet custody audit log"
                              >
                                <History className="w-3.5 h-3.5" />
                                Audit
                              </Button>

                              {/* Preview PDF if supported */}
                              {onPreviewSheet && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onPreviewSheet(sheet)}
                                  className="h-7 px-2 text-[11px] text-slate-600 hover:text-slate-800 hover:bg-slate-100 font-semibold gap-1"
                                  title="Preview Batch Sheet PDF"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 21 CFR Part 11 Electronic Signature & Custody Action Modal */}
      <Dialog open={activeOperation !== null} onOpenChange={(open) => !open && setActiveOperation(null)}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <Badge className="bg-indigo-100 text-indigo-800 border-none font-bold text-xs">
                21 CFR Part 11 E-Signature Sign-Off
              </Badge>
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              {activeOperation === 'HANDOVER' && 'QA Handover of Batch Sheets to Production'}
              {activeOperation === 'PRODUCTION_RECEIVE' && 'Production Custody Receipt Confirmation'}
              {activeOperation === 'SEND_QA_REVIEW' && 'Submit Batch Sheets for QA Review'}
              {activeOperation === 'QA_RECEIVE' && 'QA Department Batch Sheet Receipt'}
              {activeOperation === 'COMPLETE_QA_REVIEW' && 'Certify QA Review for Selected Sheets'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              This action modifies electronic batch custody records. All events are written immutably to the 21 CFR Part 11 audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Selected Sheets Summary */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <span className="text-[11px] font-bold uppercase text-slate-500 block mb-1">
                Selected Batch Sheets ({selectedSheetIds.length})
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {selectedSheetIds.map(id => {
                  const s = sheets.find(sh => sh.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="font-mono text-[10px] font-bold">
                      {s?.batchNumber || id}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {/* Gating Notices */}
            {activeOperation === 'PRODUCTION_RECEIVE' && (
              <div className="flex items-start gap-2 bg-amber-50 p-3 rounded-2xl border border-amber-200 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Gate 1 Notice:</strong> The parent batch status will automatically advance to <code>PRODUCTION_IN_PROGRESS</code> only once <strong>ALL</strong> batch sheets have been handed over and received by Production.
                </span>
              </div>
            )}

            {activeOperation === 'COMPLETE_QA_REVIEW' && (
              <div className="flex items-start gap-2 bg-emerald-50 p-3 rounded-2xl border border-emerald-200 text-emerald-800 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Gate 2 Notice:</strong> The parent batch status will transition to <code>COMPLETED</code> only once <strong>ALL</strong> batch sheets have been reviewed and certified by QA.
                </span>
              </div>
            )}

            {/* Justification / Change Reason */}
            <div>
              <Label className="text-xs font-bold text-slate-700">Change Justification / Operational Comments</Label>
              <Input
                value={changeReason}
                onChange={e => setChangeReason(e.target.value)}
                placeholder="Enter justification conforming to standard operating procedures..."
                className="mt-1 h-9 rounded-xl text-xs"
              />
            </div>

            {/* Electronic Signature Password */}
            <div>
              <Label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Account Password (E-Signature Verification)</span>
                <span className="text-[10px] text-indigo-600 font-normal">21 CFR Part 11 Required</span>
              </Label>
              <Input
                type="password"
                value={signaturePassword}
                onChange={e => setSignaturePassword(e.target.value)}
                placeholder="Enter your account password..."
                className="mt-1 h-9 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setActiveOperation(null)}
              disabled={isSubmitting}
              className="rounded-xl text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitOperation}
              disabled={isSubmitting || !signaturePassword.trim()}
              className="rounded-xl text-xs h-9 bg-slate-900 text-white hover:bg-slate-800 font-bold"
            >
              {isSubmitting ? 'Authenticating & Signing...' : 'Authenticate & Sign E-Signature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Individual Batch Sheet Audit Modal */}
      <Dialog open={auditSheet !== null} onOpenChange={(open) => !open && setAuditSheet(null)}>
        <DialogContent className="sm:max-w-xl rounded-3xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <History className="w-5 h-5 text-indigo-600" />
              <DialogTitle className="text-lg font-bold text-slate-900">
                Sheet Custody Audit Trail: {auditSheet?.batchNumber}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Chronological log of all electronic printing, custody transfers, and QA reviews for this individual batch sheet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[420px] overflow-y-auto">
            {/* Sheet Metadata */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 font-medium block">Current Custody</span>
                <span className="font-bold text-slate-800">{auditSheet?.currentCustody || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Total Print Copies</span>
                <span className="font-bold text-slate-800">{auditSheet?.printCount || 0}</span>
              </div>
            </div>

            {/* Event Timeline */}
            <div className="relative pl-6 space-y-4 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
              {(!auditSheet?.history || auditSheet.history.length === 0) ? (
                <div className="text-xs text-slate-400 italic py-4">
                  No individual history logs recorded yet for this sheet.
                </div>
              ) : (
                auditSheet.history.map((entry, idx) => (
                  <div key={entry.id || idx} className="relative flex items-start gap-3 text-xs">
                    <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white" />
                    <div className="flex-1 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px] font-bold text-slate-700">
                          {entry.action}
                        </Badge>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}
                        </span>
                      </div>
                      <p className="text-slate-700 font-medium mt-1 text-xs">
                        {entry.reason || 'Operational progression'}
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                        <span>Performed By: <strong>{entry.performedBy || entry.userEmail}</strong></span>
                        {entry.signatureId && (
                          <span className="font-mono text-indigo-600">Sig: {entry.signatureId.substring(0, 8)}...</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setAuditSheet(null)}
              className="rounded-xl text-xs h-9 bg-slate-900 text-white font-bold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
