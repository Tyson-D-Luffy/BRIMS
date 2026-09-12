import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ArrowLeftRight,
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronRight,
  Layers,
  FileText,
  Building2,
  Lock,
  RotateCcw,
  Check,
  Info,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export interface IndividualSheetSummary {
  id: string;
  batchNumber: string;
  sequenceIndex: number;
  state: string;
  custody: string;
  isCompleted: boolean;
  returnToQaStatus?: string | null;
  completedAt?: string | null;
  completedByName?: string | null;
  parentBatchId?: string;
  parentBatchNumber?: string;
  parentProductName?: string;
}

export interface AffectedBatchRequest {
  id: string;
  batchNumber: string;
  productId?: string;
  productName?: string;
  version?: string | number;
  status?: string;
  manufacturingDate?: string;
  createdAt?: string;
  issuedBy?: string;
  requestType?: string;
  completedSheets?: any[];
  incompleteSheets?: any[];
  completedCount?: number;
  incompleteCount?: number;
  totalSheets?: number;
  custodyBreakdown?: {
    production: number;
    qa: number;
  };
}

export interface BatchSheetMasterImpactData {
  masterId: string;
  masterName?: string;
  documentNumber?: string;
  status?: string;
  currentVersion?: string | number;
  nextVersion?: string | number;
  totalAffectedRequests?: number;
  totalCompletedSheets?: number;
  totalIncompleteSheetsToDiscard?: number;
  hasActiveRequests?: boolean;
  hasIncompleteSheets?: boolean;
  count?: number;
  activeRequests?: AffectedBatchRequest[];
  snapshot?: Record<string, string>;
  expectedSnapshot?: Record<string, string>;
  grandTotals?: {
    totalSheets: number;
    completedSheets: number;
    incompleteSheets: number;
    custodyProduction: number;
    custodyQa: number;
  };
}

export interface BatchSheetMasterVersionUpdateImpactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToSignature: (
    reason: string,
    options: { proceedWithDiscard: boolean; expectedSnapshot?: Record<string, string> }
  ) => void;
  master: {
    id: string;
    masterName?: string;
    title?: string;
    documentNumber?: string;
    version?: string | number;
    status?: string;
    productName?: string;
  };
  impactData: BatchSheetMasterImpactData | any | null;
  initialReason?: string;
  isLoading?: boolean;
}

export const BatchSheetMasterVersionUpdateImpactModal: React.FC<BatchSheetMasterVersionUpdateImpactModalProps> = ({
  isOpen,
  onClose,
  onProceedToSignature,
  master,
  impactData,
  initialReason = '',
  isLoading = false,
}) => {
  const [reason, setReason] = useState(initialReason);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'incomplete' | 'return_required'>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});

  // Sync initialReason when modal opens
  useEffect(() => {
    if (isOpen) {
      setReason(initialReason || '');
      setHasAcknowledged(false);
      setSearchQuery('');
      setActiveTab('all');

      // Auto-expand all batches by default if 3 or fewer
      if (impactData?.activeRequests) {
        const initialExpanded: Record<string, boolean> = {};
        impactData.activeRequests.forEach((req: AffectedBatchRequest) => {
          initialExpanded[req.id] = true;
        });
        setExpandedBatchIds(initialExpanded);
      }
    }
  }, [isOpen, initialReason, impactData]);

  // Aggregate sheet calculations
  const {
    allCompletedSheets,
    allIncompleteSheets,
    allFlattenedSheets,
    totalCompleted,
    totalIncomplete,
    totalSheetsCount,
    totalProductionCustody,
    totalQaCustody,
  } = useMemo(() => {
    const completedList: IndividualSheetSummary[] = [];
    const incompleteList: IndividualSheetSummary[] = [];
    const flatList: IndividualSheetSummary[] = [];

    let prodCustodyCount = 0;
    let qaCustodyCount = 0;

    if (impactData?.activeRequests && Array.isArray(impactData.activeRequests)) {
      for (const req of impactData.activeRequests) {
        const parentBatchId = req.id;
        const parentBatchNumber = req.batchNumber;
        const parentProductName = req.productName || master.productName || 'Pharmaceutical Product';

        // 1. Completed sheets
        if (Array.isArray(req.completedSheets)) {
          for (const s of req.completedSheets) {
            const item: IndividualSheetSummary = {
              id: s.id || `${parentBatchId}-${s.sequenceIndex}`,
              batchNumber: s.batchNumber || `${parentBatchNumber}-${s.sequenceIndex}`,
              sequenceIndex: s.sequenceIndex ?? 1,
              state: s.state || 'Completed',
              custody: s.custody || 'QA – Reviewed',
              isCompleted: true,
              completedAt: s.completedAt,
              completedByName: s.completedByName,
              parentBatchId,
              parentBatchNumber,
              parentProductName,
            };
            completedList.push(item);
            flatList.push(item);
          }
        }

        // 2. Incomplete sheets
        if (Array.isArray(req.incompleteSheets)) {
          for (const s of req.incompleteSheets) {
            const isProd =
              s.custody?.toLowerCase().includes('production') ||
              s.returnToQaStatus === 'AWAITING_PRODUCTION_RETURN';
            if (isProd) prodCustodyCount++;
            else qaCustodyCount++;

            const item: IndividualSheetSummary = {
              id: s.id || `${parentBatchId}-${s.sequenceIndex}`,
              batchNumber: s.batchNumber || `${parentBatchNumber}-${s.sequenceIndex}`,
              sequenceIndex: s.sequenceIndex ?? 1,
              state: s.state || 'In Progress',
              custody: s.custody || (isProd ? 'Production' : 'QA'),
              isCompleted: false,
              returnToQaStatus: s.returnToQaStatus,
              parentBatchId,
              parentBatchNumber,
              parentProductName,
            };
            incompleteList.push(item);
            flatList.push(item);
          }
        }
      }
    }

    const tCompleted = impactData?.totalCompletedSheets ?? completedList.length;
    const tIncomplete = impactData?.totalIncompleteSheetsToDiscard ?? incompleteList.length;
    const tTotal = impactData?.grandTotals?.totalSheets ?? (tCompleted + tIncomplete);

    return {
      allCompletedSheets: completedList,
      allIncompleteSheets: incompleteList,
      allFlattenedSheets: flatList,
      totalCompleted: tCompleted,
      totalIncomplete: tIncomplete,
      totalSheetsCount: tTotal,
      totalProductionCustody: impactData?.grandTotals?.custodyProduction ?? prodCustodyCount,
      totalQaCustody: impactData?.grandTotals?.custodyQa ?? qaCustodyCount,
    };
  }, [impactData, master.productName]);

  // Filtered sheets based on tab and search
  const filteredSheets = useMemo(() => {
    let list = allFlattenedSheets;

    if (activeTab === 'completed') {
      list = list.filter((s) => s.isCompleted);
    } else if (activeTab === 'incomplete') {
      list = list.filter((s) => !s.isCompleted);
    } else if (activeTab === 'return_required') {
      list = list.filter(
        (s) =>
          !s.isCompleted &&
          (s.custody?.toLowerCase().includes('production') ||
            s.returnToQaStatus === 'AWAITING_PRODUCTION_RETURN')
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.batchNumber.toLowerCase().includes(q) ||
          s.parentBatchNumber?.toLowerCase().includes(q) ||
          s.parentProductName?.toLowerCase().includes(q) ||
          s.state.toLowerCase().includes(q) ||
          s.custody.toLowerCase().includes(q)
      );
    }

    return list;
  }, [allFlattenedSheets, activeTab, searchQuery]);

  // Filtered batches for accordion view
  const filteredBatches = useMemo(() => {
    if (!impactData?.activeRequests) return [];

    return impactData.activeRequests.map((batch: AffectedBatchRequest) => {
      const batchSheets = allFlattenedSheets.filter((s) => s.parentBatchId === batch.id);

      let displayedSheets = batchSheets;
      if (activeTab === 'completed') {
        displayedSheets = displayedSheets.filter((s) => s.isCompleted);
      } else if (activeTab === 'incomplete') {
        displayedSheets = displayedSheets.filter((s) => !s.isCompleted);
      } else if (activeTab === 'return_required') {
        displayedSheets = displayedSheets.filter(
          (s) =>
            !s.isCompleted &&
            (s.custody?.toLowerCase().includes('production') ||
              s.returnToQaStatus === 'AWAITING_PRODUCTION_RETURN')
        );
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        displayedSheets = displayedSheets.filter(
          (s) =>
            s.batchNumber.toLowerCase().includes(q) ||
            s.state.toLowerCase().includes(q) ||
            s.custody.toLowerCase().includes(q)
        );
      }

      return {
        ...batch,
        displayedSheets,
        hasVisibleSheets: displayedSheets.length > 0,
      };
    });
  }, [impactData?.activeRequests, allFlattenedSheets, activeTab, searchQuery]);

  const toggleBatchExpand = (batchId: string) => {
    setExpandedBatchIds((prev) => ({
      ...prev,
      [batchId]: !prev[batchId],
    }));
  };

  const handleExpandAll = (expand: boolean) => {
    const updated: Record<string, boolean> = {};
    if (impactData?.activeRequests) {
      impactData.activeRequests.forEach((req: AffectedBatchRequest) => {
        updated[req.id] = expand;
      });
    }
    setExpandedBatchIds(updated);
  };

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error('Please enter a justification for the Version Update');
      return;
    }
    if (reason.trim().length < 5) {
      toast.error('Justification must be at least 5 characters long for 21 CFR Part 11 compliance');
      return;
    }
    if (impactData?.hasActiveRequests && !hasAcknowledged) {
      toast.error('Please acknowledge the completed vs. incomplete sheet impact before proceeding');
      return;
    }

    onProceedToSignature(reason.trim(), {
      proceedWithDiscard: true,
      expectedSnapshot: impactData?.expectedSnapshot || impactData?.snapshot,
    });
  };

  const currentVer = impactData?.currentVersion || master.version || '1.0';
  const nextVer = impactData?.nextVersion || 'next';
  const masterTitle = master.masterName || master.title || 'Batch Sheet Master';
  const docNumber = master.documentNumber || impactData?.documentNumber || 'BMR-DOC';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        id="version-update-impact-modal"
        className="rounded-3xl w-[96vw] sm:w-[94vw] md:w-[90vw] lg:w-[86vw] max-w-5xl max-h-[92vh] flex flex-col p-6 sm:p-7 bg-white shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 pb-4 border-b border-slate-100 pr-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0 shadow-xs">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                  <span>Batch Sheet Master Version Update</span>
                  <Badge variant="outline" className="font-mono bg-amber-50 text-amber-900 border-amber-300 text-xs px-2.5 py-0.5 font-bold">
                    v{currentVer} &rarr; v{nextVer}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-slate-500 text-xs sm:text-sm mt-0.5">
                  Pre-Update Impact Assessment &bull; Document: <strong className="text-slate-700">{docNumber}</strong> ({masterTitle})
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[11px] font-semibold flex items-center gap-1.5 py-1 px-3">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>21 CFR Part 11 Pre-Check</span>
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 pr-1 space-y-5">
          {/* Summary Metric Cards (4 Pillars) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Batches */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Referencing Batches</span>
                <Layers className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {impactData?.count || impactData?.activeRequests?.length || 0}
                </span>
                <span className="text-slate-500 text-[11px] block mt-0.5 font-medium">
                  Active issuance runs
                </span>
              </div>
            </div>

            {/* Total Individual Sheets */}
            <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-indigo-700 text-xs font-semibold">
                <span>Individual Sheets</span>
                <FileText className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-black text-indigo-950 font-mono">
                  {totalSheetsCount}
                </span>
                <span className="text-indigo-600 text-[11px] block mt-0.5 font-medium">
                  Total physical/digital sheets
                </span>
              </div>
            </div>

            {/* Completed Sheets (Retained) */}
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Completed (Retained)
                </span>
                <Badge variant="outline" className="text-[10px] bg-white text-emerald-700 border-emerald-300 font-bold px-1.5">
                  Preserved
                </Badge>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-black text-emerald-900 font-mono">
                  {totalCompleted}
                </span>
                <span className="text-emerald-700 text-[11px] block mt-0.5 font-medium">
                  Retained in batch archive
                </span>
              </div>
            </div>

            {/* Incomplete Sheets (To Discard) */}
            <div className="p-3.5 bg-rose-50/80 border border-rose-200 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-rose-800 text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  Incomplete (To Discard)
                </span>
                <Badge variant="outline" className="text-[10px] bg-white text-rose-700 border-rose-300 font-bold px-1.5">
                  Revoked
                </Badge>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-black text-rose-900 font-mono">
                  {totalIncomplete}
                </span>
                <span className="text-rose-700 text-[11px] block mt-0.5 font-medium">
                  Discarded upon master unlock
                </span>
              </div>
            </div>
          </div>

          {/* Physical Custody Return Callout if sheets are with Production */}
          {totalProductionCustody > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
                <ArrowLeftRight className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-amber-900 flex items-center gap-2">
                  <span>Physical Paper Custody Reconciliation Required</span>
                  <Badge className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0">
                    {totalProductionCustody} sheet(s) in Production
                  </Badge>
                </p>
                <p className="text-amber-800 mt-1 leading-relaxed">
                  There are <strong>{totalProductionCustody}</strong> incomplete individual batch sheet(s) currently physically with <strong>Production</strong>. 
                  Under GMP chain-of-custody protocols, these physical copies <em>must be physically returned to QA</em> for reconciliation and quarantine.
                </p>
              </div>
            </div>
          )}

          {/* Regulatory Directives Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-950 block">Completed Steps Protected</span>
                <span className="text-emerald-800 text-[11px]">Validated completed manufacturing records remain immutable in official archives.</span>
              </div>
            </div>

            <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-950 block">Incomplete Steps Invalidated</span>
                <span className="text-rose-800 text-[11px]">Status marked as <em>"Discarded due to Version Change"</em> with timestamp and user ID.</span>
              </div>
            </div>

            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-indigo-950 block">Optimistic Concurrency Lock</span>
                <span className="text-indigo-800 text-[11px]">Atomic snapshot guarantees no state drift occurs prior to electronic signature.</span>
              </div>
            </div>
          </div>

          {/* Granular Individual Batch Sheets Explorer */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Granular Batch Sheet Breakdown ({allFlattenedSheets.length})</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Inspect the disposition of every individual sheet before providing electronic signature.
                </p>
              </div>

              {/* View switch & Expand/Collapse */}
              <div className="flex items-center gap-2">
                {viewMode === 'grouped' && (
                  <div className="flex items-center gap-1 text-[11px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExpandAll(true)}
                      className="h-7 text-xs text-slate-600 hover:text-slate-900 px-2"
                    >
                      Expand All
                    </Button>
                    <span className="text-slate-300">|</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExpandAll(false)}
                      className="h-7 text-xs text-slate-600 hover:text-slate-900 px-2"
                    >
                      Collapse All
                    </Button>
                  </div>
                )}

                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('grouped')}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                      viewMode === 'grouped'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    By Batch
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('flat')}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                      viewMode === 'flat'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Flat Sheet List
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
              {/* Tab Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                    activeTab === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>All Sheets</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${activeTab === 'all' ? 'bg-slate-800 text-slate-200 border-none' : 'bg-slate-100 text-slate-700'}`}>
                    {totalSheetsCount}
                  </Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('completed')}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                    activeTab === 'completed'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Completed (Retained)</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${activeTab === 'completed' ? 'bg-emerald-800 text-emerald-100 border-none' : 'bg-emerald-50 text-emerald-800'}`}>
                    {totalCompleted}
                  </Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('incomplete')}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                    activeTab === 'incomplete'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>Incomplete (To Discard)</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${activeTab === 'incomplete' ? 'bg-rose-800 text-rose-100 border-none' : 'bg-rose-50 text-rose-800'}`}>
                    {totalIncomplete}
                  </Badge>
                </button>

                {totalProductionCustody > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('return_required')}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                      activeTab === 'return_required'
                        ? 'bg-amber-700 text-white shadow-xs'
                        : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
                    }`}
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span>Return Pending</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${activeTab === 'return_required' ? 'bg-amber-800 text-amber-100 border-none' : 'bg-amber-50 text-amber-800'}`}>
                      {totalProductionCustody}
                    </Badge>
                  </button>
                )}
              </div>

              {/* Search box */}
              <div className="relative w-full sm:w-56 shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search sheets or batches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white rounded-lg border-slate-200 focus-visible:ring-amber-500"
                />
              </div>
            </div>

            {/* Content Display: Grouped Accordion vs Flat Table */}
            {viewMode === 'grouped' ? (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {filteredBatches.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                    No batch records matching current filters.
                  </div>
                ) : (
                  filteredBatches.map((batch: any) => {
                    const isExpanded = expandedBatchIds[batch.id] ?? false;
                    const totalBSheets = batch.totalSheets || (batch.completedCount + batch.incompleteCount) || 1;
                    const compSheets = batch.completedCount || 0;
                    const incompSheets = batch.incompleteCount || 0;
                    const completionRate = Math.round((compSheets / totalBSheets) * 100);

                    return (
                      <div
                        key={batch.id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs transition-all"
                      >
                        {/* Batch Header Bar */}
                        <div
                          onClick={() => toggleBatchExpand(batch.id)}
                          className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 select-none border-b border-transparent transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              className="w-6 h-6 rounded-md hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-xs text-slate-900">
                                  {batch.batchNumber}
                                </span>
                                <Badge variant="outline" className="text-[10px] font-mono text-slate-600 bg-slate-50">
                                  Req: {batch.id.slice(0, 8)}...
                                </Badge>
                                {compSheets > 0 && incompSheets > 0 && (
                                  <Badge className="bg-purple-100 text-purple-900 border-purple-200 text-[10px] font-semibold">
                                    Result: PARTIALLY_COMPLETED
                                  </Badge>
                                )}
                                {compSheets === 0 && incompSheets > 0 && (
                                  <Badge className="bg-rose-100 text-rose-900 border-rose-200 text-[10px] font-semibold">
                                    Result: DISCARDED
                                  </Badge>
                                )}
                                {compSheets > 0 && incompSheets === 0 && (
                                  <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-semibold">
                                    Result: COMPLETED (RETAINED)
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 truncate block mt-0.5">
                                {batch.productName}
                              </span>
                            </div>
                          </div>

                          {/* Stats Right */}
                          <div className="flex items-center gap-3 shrink-0">
                            {/* Mini Progress */}
                            <div className="hidden sm:flex flex-col items-end text-right">
                              <span className="text-[11px] text-slate-600 font-medium">
                                <strong className="text-emerald-700 font-bold">{compSheets}</strong> / {totalBSheets} Sheets Completed
                              </span>
                              <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1 border border-slate-200">
                                <div
                                  className="h-full bg-emerald-600 rounded-full transition-all"
                                  style={{ width: `${completionRate}%` }}
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                                {compSheets} Retained
                              </Badge>
                              <Badge className="bg-rose-50 text-rose-800 border-rose-200 text-[10px] font-bold">
                                {incompSheets} Discard
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Individual Sheets List inside Batch */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.18 }}
                              className="border-t border-slate-100 bg-slate-50/50 p-2 sm:p-3"
                            >
                              <Table className="min-w-full">
                                <TableHeader className="bg-slate-100/70">
                                  <TableRow className="border-b border-slate-200">
                                    <TableHead className="text-[11px] font-bold text-slate-700 py-1.5">Sheet Identifier</TableHead>
                                    <TableHead className="text-[11px] font-bold text-slate-700 py-1.5">Index</TableHead>
                                    <TableHead className="text-[11px] font-bold text-slate-700 py-1.5">Lifecycle State</TableHead>
                                    <TableHead className="text-[11px] font-bold text-slate-700 py-1.5">Custody</TableHead>
                                    <TableHead className="text-[11px] font-bold text-slate-700 py-1.5 text-center">Post-Update Impact</TableHead>
                                    <TableHead className="text-[11px] font-bold text-slate-700 py-1.5">Custody Action</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {batch.displayedSheets.map((sheet: IndividualSheetSummary) => {
                                    const isProd =
                                      sheet.custody?.toLowerCase().includes('production') ||
                                      sheet.returnToQaStatus === 'AWAITING_PRODUCTION_RETURN';

                                    return (
                                      <TableRow key={sheet.id} className="border-b border-slate-100 text-xs hover:bg-white transition-colors">
                                        <TableCell className="font-mono font-bold text-slate-900 py-2">
                                          {sheet.batchNumber}
                                        </TableCell>
                                        <TableCell className="text-slate-500 text-[11px] py-2 font-mono">
                                          #{sheet.sequenceIndex}
                                        </TableCell>
                                        <TableCell className="py-2">
                                          <span className="text-[11px] font-medium text-slate-700">
                                            {sheet.state}
                                          </span>
                                        </TableCell>
                                        <TableCell className="py-2">
                                          <span className="text-[11px] text-slate-600 font-medium">
                                            {sheet.custody}
                                          </span>
                                        </TableCell>
                                        <TableCell className="py-2 text-center">
                                          {sheet.isCompleted ? (
                                            <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 text-[10px] font-bold">
                                              RETAINED (Certified)
                                            </Badge>
                                          ) : (
                                            <Badge className="bg-rose-100 text-rose-900 border-rose-300 text-[10px] font-bold">
                                              DISCARDED (Version Change)
                                            </Badge>
                                          )}
                                        </TableCell>
                                        <TableCell className="py-2">
                                          {sheet.isCompleted ? (
                                            <span className="text-emerald-700 text-[11px] font-medium">
                                              Archived in QA Vault
                                            </span>
                                          ) : isProd ? (
                                            <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                                              Return to QA Required
                                            </Badge>
                                          ) : (
                                            <span className="text-slate-500 text-[11px]">
                                              In QA Custody
                                            </span>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* Flat Individual Sheets Table View */
              <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white max-h-72 shadow-2xs">
                <Table className="min-w-full">
                  <TableHeader className="bg-slate-100/90 sticky top-0 z-10">
                    <TableRow className="border-b border-slate-200">
                      <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Sheet Identifier</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Parent Batch</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Product</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Lifecycle State</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Custody</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap text-center">Version Update Impact</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Physical Return</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSheets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-xs text-slate-400">
                          No individual batch sheets matching search or filter criteria.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSheets.map((sheet) => {
                        const isProd =
                          sheet.custody?.toLowerCase().includes('production') ||
                          sheet.returnToQaStatus === 'AWAITING_PRODUCTION_RETURN';

                        return (
                          <TableRow key={sheet.id} className="text-xs hover:bg-slate-50 border-b border-slate-100">
                            <TableCell className="font-mono font-bold text-slate-900 py-2.5 whitespace-nowrap">
                              {sheet.batchNumber}
                            </TableCell>
                            <TableCell className="font-mono text-slate-700 py-2.5 whitespace-nowrap">
                              {sheet.parentBatchNumber}
                            </TableCell>
                            <TableCell className="text-slate-600 py-2.5 max-w-[160px] truncate">
                              {sheet.parentProductName}
                            </TableCell>
                            <TableCell className="text-slate-700 py-2.5 whitespace-nowrap">
                              {sheet.state}
                            </TableCell>
                            <TableCell className="text-slate-600 py-2.5 whitespace-nowrap">
                              {sheet.custody}
                            </TableCell>
                            <TableCell className="py-2.5 text-center whitespace-nowrap">
                              {sheet.isCompleted ? (
                                <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 text-[10px] font-bold">
                                  RETAINED (Certified)
                                </Badge>
                              ) : (
                                <Badge className="bg-rose-100 text-rose-900 border-rose-300 text-[10px] font-bold">
                                  DISCARDED (Version Change)
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 whitespace-nowrap">
                              {sheet.isCompleted ? (
                                <span className="text-emerald-700 text-[11px] font-medium">
                                  Retained in Archive
                                </span>
                              ) : isProd ? (
                                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                                  Return to QA Required
                                </Badge>
                              ) : (
                                <span className="text-slate-500 text-[11px]">
                                  Already with QA
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Reason for Update & 21 CFR Part 11 Electronic Signature Justification */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <Label htmlFor="impact-modal-reason" className="text-slate-800 font-bold text-xs flex items-center justify-between">
                <span>Reason for Version Update / Change Justification *</span>
                <span className="text-slate-400 font-normal text-[11px]">Required for 21 CFR Part 11 Audit Trail</span>
              </Label>
              <Input
                id="impact-modal-reason"
                placeholder="e.g. Revised raw material tolerances and updated critical process parameters per change control CR-2026-042"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1.5 rounded-xl bg-slate-50 border-slate-200 h-11 text-xs sm:text-sm focus-visible:ring-amber-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                This explanation will be cryptographically linked to your electronic signature and permanently written to the GAMP audit trail.
              </p>
            </div>

            {/* Compliance Acknowledgment Checkbox */}
            {impactData?.hasActiveRequests && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="acknowledge-impact-checkbox"
                  checked={hasAcknowledged}
                  onChange={(e) => setHasAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded-md border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label
                  htmlFor="acknowledge-impact-checkbox"
                  className="text-xs text-amber-900 leading-snug cursor-pointer select-none"
                >
                  <strong>I certify and acknowledge the impact assessment above:</strong>{' '}
                  Completed individual batch sheets ({totalCompleted}) will remain certified and retained. Incomplete batch sheets ({totalIncomplete}) 
                  will transition to <em>"Discarded due to Version Change"</em>, and all physical copies in production ({totalProductionCustody}) must be physically reconciled and returned to QA.
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 select-none">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>21 CFR Part 11 Dual-Factor E-Signature Protection</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              className="rounded-full border-slate-200 hover:bg-slate-100 px-5 text-xs h-10"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isLoading ||
                !reason.trim() ||
                (Boolean(impactData?.hasActiveRequests) && !hasAcknowledged)
              }
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-full px-6 shadow-md shadow-amber-200 font-semibold text-xs h-10 flex items-center gap-2 disabled:opacity-50"
            >
              <span>Proceed to E-Signature</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
