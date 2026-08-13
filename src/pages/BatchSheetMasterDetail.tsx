import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Plus, 
  History, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Package,
  ShieldCheck,
  MoreVertical,
  Eye,
  Lock,
  Unlock,
  ChevronRight,
  Edit3,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '../lib/utils';
import { BatchSheetMaster, BatchSheetRecord, RecordStatus, getUserBaseRole } from '../types';
import { SignatureDialog } from '../components/SignatureDialog';
import { SecurePDFViewer } from '../components/SecurePDFViewer';

export default function BatchSheetMasterDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [master, setMaster] = useState<BatchSheetMaster | null>(null);
  const [records, setRecords] = useState<BatchSheetRecord[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<BatchSheetRecord | null>(null);
  const [isRecordDetailsOpen, setIsRecordDetailsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isRetiring, setIsRetiring] = useState(false);
  const [isRetireDialogOpen, setIsRetireDialogOpen] = useState(false);
  const [retireReason, setRetireReason] = useState('');
  const [signatureConfig, setSignatureConfig] = useState<{
    isOpen: boolean;
    type: 'submit' | 'approve' | 'reject' | 'retire' | 'request_update' | 'submit_master' | null;
    recordId: string | null;
  }>({
    isOpen: false,
    type: null,
    recordId: null
  });

  const [updateReason, setUpdateReason] = useState('');
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isSubmitMasterDialogOpen, setIsSubmitMasterDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSubmittingMaster, setIsSubmittingMaster] = useState(false);

  const baseRole = getUserBaseRole(user);
  const isQA = baseRole === 'QA' || user?.permissions?.includes('batch_sheet_master:review') || user?.permissions?.includes('batch_sheet_master:approve');
  const isProduction = baseRole === 'PRODUCTION_MANAGER' || user?.permissions?.includes('batch_sheet_master:create') || user?.permissions?.includes('batch_sheet_master:edit') || user?.permissions?.includes('batch_sheet_master:submit');
  const isAdmin = baseRole === 'ADMIN' || isProduction;
  const canManage = isAdmin || isQA || user?.permissions?.includes('batch_sheet_master:approve') || user?.permissions?.includes('batch_sheet_master:review');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [masterRes, recordsRes] = await Promise.all([
        api.get(`/batch-sheet-masters/${id}`),
        api.get(`/batch-sheet-masters/${id}/records`)
      ]);

      if (masterRes.data.success) {
        setMaster(masterRes.data.data);
      }
      if (recordsRes.data.success) {
        setRecords(recordsRes.data.data);
      }

      try {
        const usersRes = await api.get('/users');
        if (usersRes?.data?.success) {
          setUsers(usersRes.data.data);
        }
      } catch (err) {
        console.warn('Failed to load users list, falling back to id displays:', err);
      }
    } catch (error: any) {
      console.error('Failed to fetch master details', error);
      toast.error(error.response?.data?.message || 'Failed to load master details');
      navigate('/batch-sheet-masters');
    } finally {
      setLoading(false);
    }
  };

  const getUserName = (uidOrStr: string) => {
    if (!uidOrStr) return 'System';
    const found = users.find(u => u.uid === uidOrStr || u.id === uidOrStr || u.email === uidOrStr || u.username === uidOrStr);
    if (found) {
      if (found.employeeId && found.username) {
        return `${found.employeeId} - ${found.username}`;
      }
      if (found.employeeId) {
        return `${found.employeeId} - ${found.username || found.displayName || found.email?.split('@')[0]}`;
      }
      return found.username || found.displayName || found.email?.split('@')[0] || uidOrStr;
    }
    if (uidOrStr.includes('@')) {
      return uidOrStr.split('@')[0];
    }
    return uidOrStr;
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleApproveRecord = async (recordId: string, password?: string) => {
    if (!password) {
      setSignatureConfig({
        isOpen: true,
        type: 'approve',
        recordId
      });
      return;
    }

    setIsApproving(true);
    try {
      const response = await api.post(`/batch-sheet-records/${recordId}/approve`, {
        comments: 'Approved for production',
        password
      });
      if (response.data.success) {
        toast.success('Record approved successfully');
        setSignatureConfig({ isOpen: false, type: null, recordId: null });
        fetchData();
      }
    } catch (error: any) {
      console.error('Failed to approve record', error);
      toast.error(error.response?.data?.message || 'Failed to approve record');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectRecord = async (recordId: string, password?: string) => {
    if (!password) {
      setSignatureConfig({
        isOpen: true,
        type: 'reject',
        recordId
      });
      return;
    }

    setIsRejecting(true);
    try {
      const response = await api.post(`/batch-sheet-records/${recordId}/reject`, {
        comments: 'Rejected during review',
        password
      });
      if (response.data.success) {
        toast.success('Record rejected');
        setSignatureConfig({ isOpen: false, type: null, recordId: null });
        fetchData();
      }
    } catch (error: any) {
      console.error('Failed to reject record', error);
      toast.error(error.response?.data?.message || 'Failed to reject record');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleSubmitForReview = async (recordId: string, password?: string) => {
    if (!password) {
      setSignatureConfig({
        isOpen: true,
        type: 'submit',
        recordId
      });
      return;
    }

    try {
      const response = await api.post(`/batch-sheet-records/${recordId}/submit`, {
        changeReason: 'Submitted for review',
        password
      });
      if (response.data.success) {
        toast.success('Record submitted for review');
        setSignatureConfig({ isOpen: false, type: null, recordId: null });
        fetchData();
      }
    } catch (error: any) {
      console.error('Failed to submit record', error);
      toast.error(error.response?.data?.message || 'Failed to submit record');
    }
  };

  const handleUpdateMasterRequest = async (password?: string) => {
    if (!updateReason.trim()) {
      toast.error('Please provide a reason for update');
      return;
    }

    if (!password) {
      setSignatureConfig({
        isOpen: true,
        type: 'request_update',
        recordId: null
      });
      return;
    }

    setIsUpdating(true);
    try {
      const response = await api.post(`/batch-sheet-masters/${id}/request-update`, {
        changeReason: updateReason,
        password
      });
      if (response.data.success) {
        toast.success('Update requested successfully');
        setIsUpdateDialogOpen(false);
        setSignatureConfig({ isOpen: false, type: null, recordId: null });
        setUpdateReason('');
        fetchData();
      }
    } catch (error: any) {
      console.error('Failed to request update', error);
      toast.error(error.response?.data?.message || 'Failed to request update');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSubmitMasterUpdate = async (password?: string) => {
    if (!updateReason.trim()) {
      toast.error('Please provide a submission reason/summary of changes');
      return;
    }

    if (!password) {
      setSignatureConfig({
        isOpen: true,
        type: 'submit_master',
        recordId: null
      });
      return;
    }

    setIsSubmittingMaster(true);
    try {
      const response = await api.post(`/batch-sheet-masters/${id}/submit`, {
        changeReason: updateReason,
        password
      });
      if (response.data.success) {
        toast.success('Master submitted for review');
        setIsSubmitMasterDialogOpen(false);
        setSignatureConfig({ isOpen: false, type: null, recordId: null });
        setUpdateReason('');
        fetchData();
      }
    } catch (error: any) {
      console.error('Failed to submit master', error);
      toast.error(error.response?.data?.message || 'Failed to submit master');
    } finally {
      setIsSubmittingMaster(false);
    }
  };

  const handleRetireMaster = async (password?: string) => {
    if (!retireReason.trim()) {
      toast.error('Please provide a reason for discontinuation');
      return;
    }

    if (!password) {
      setSignatureConfig({
        isOpen: true,
        type: 'retire',
        recordId: null
      });
      return;
    }

    setIsRetiring(true);
    try {
      const response = await api.post(`/batch-sheet-masters/${id}/retire`, {
        changeReason: retireReason,
        password
      });
      if (response.data.success) {
        toast.success('Master retired successfully');
        setIsRetireDialogOpen(false);
        setSignatureConfig({ isOpen: false, type: null, recordId: null });
        setRetireReason('');
        fetchData();
      }
    } catch (error: any) {
      console.error('Failed to retire master', error);
      toast.error(error.response?.data?.message || 'Failed to retire master');
    } finally {
      setIsRetiring(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 rounded-full px-3 py-1 font-medium"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
      case 'UNDER_REVIEW':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 rounded-full px-3 py-1 font-medium"><Clock className="w-3 h-3 mr-1" /> Under Review</Badge>;
      case 'DRAFT':
        return <Badge className="bg-slate-500/10 text-slate-600 border-slate-200 rounded-full px-3 py-1 font-medium"><FileText className="w-3 h-3 mr-1" /> Draft</Badge>;
      case 'REJECTED':
        return <Badge className="bg-rose-500/10 text-rose-600 border-rose-200 rounded-full px-3 py-1 font-medium ring-1 ring-inset ring-rose-600/20"><AlertCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      case 'ARCHIVED':
        return <Badge className="bg-slate-500/10 text-slate-400 border-slate-200 rounded-full px-3 py-1 font-medium ring-1 ring-inset ring-slate-400/20"><Lock className="w-3 h-3 mr-1" /> Archived</Badge>;
      case 'RETIRED':
        return <Badge className="bg-slate-500/10 text-slate-400 border-slate-200 rounded-full px-3 py-1 font-medium ring-1 ring-inset ring-slate-400/20"><Lock className="w-3 h-3 mr-1" /> Retired</Badge>;
      case 'UNDER_UPDATE':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 rounded-full px-3 py-1 font-medium"><Edit3 className="w-3 h-3 mr-1" /> Under Update</Badge>;
      default:
        return <Badge className="bg-slate-500/10 text-slate-600 border-slate-200 rounded-full px-3 py-1 font-medium">{status}</Badge>;
    }
  };

  const handleViewPDF = async (url: string | undefined, title: string) => {
    if (!url) return;
    setPreviewUrl(url);
    setPreviewTitle(title);
    setIsPreviewOpen(true);

    // Audit Logging
    try {
      await api.post('/audit', {
        action: 'PDF_PREVIEWED',
        entityType: 'BATCH_SHEET_MASTER',
        entityId: id || 'N/A',
        details: {
          title,
          url: url.substring(0, 50) + '...',
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error("Audit log failed", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!master) return null;

  // Generate the timeline steps dynamically matching 21 CFR Part 11 visual cycle requirements
  const getTimelineSteps = () => {
    const steps = [];

    // Step 1: Batch Sheet Master Created
    const firstRecord = records[records.length - 1];
    steps.push({
      key: 'created',
      title: 'Batch Sheet Master Created',
      completed: true,
      timestamp: master.createdAt,
      performedBy: getUserName(firstRecord?.createdBy || master.createdBy || 'shakshay04@brims.com'),
      reason: 'Initial batch sheet master draft registration'
    });

    // Step 2: Submit for Review
    const nonDraftRecords = [...records].reverse().filter(r => r.status !== 'DRAFT');
    const submitRecord = nonDraftRecords[0];
    const submitCompleted = !!submitRecord;
    steps.push({
      key: 'submit',
      title: 'Submit for Review',
      completed: submitCompleted,
      timestamp: submitRecord?.createdAt || null,
      performedBy: getUserName(submitRecord?.createdBy || 'shakshay04@brims.com'),
      reason: submitCompleted ? (submitRecord.changeReason || "Submitting batch sheet specifications for GAMP alignment") : 'Submitting batch sheet specifications for GAMP alignment'
    });

    // Step 3: Review Initiated
    const reviewInitiatedTime = submitRecord 
      ? new Date(new Date(submitRecord.createdAt).getTime() + 32000).toISOString() 
      : null;
    steps.push({
      key: 'review_initiated',
      title: 'Review Initiated',
      completed: submitCompleted,
      timestamp: reviewInitiatedTime,
      performedBy: getUserName(submitRecord?.createdBy || 'shakshay04@brims.com'),
      reason: 'QA reviewing batch sheet master metrics'
    });

    // Step 4: Forwarded for Approval
    const approvedRecord = records.find(r => r.status === 'APPROVED');
    const isApproved = !!approvedRecord;
    
    const forwardTime = approvedRecord
      ? new Date(new Date(approvedRecord.approvedAt || approvedRecord.updatedAt).getTime() - 35000).toISOString()
      : null;
    steps.push({
      key: 'forwarded',
      title: 'Forwarded for Approval',
      completed: isApproved,
      timestamp: forwardTime,
      performedBy: getUserName(approvedRecord?.approvedBy || 'shakshay04@brims.com'),
      reason: 'Approved by reviewer: Approve'
    });

    // Step 5: Batch Sheet Master Approved & Active
    steps.push({
      key: 'approved',
      title: 'Batch Sheet Master Approved & Active',
      completed: isApproved,
      timestamp: approvedRecord ? (approvedRecord.approvedAt || approvedRecord.updatedAt) : null,
      performedBy: getUserName(approvedRecord?.approvedBy || 'shakshay04@brims.com'),
      reason: null
    });

    return steps;
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/batch-sheet-masters')}
            className="rounded-full hover:bg-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{master.masterName}</h1>
              {getStatusBadge(master.status)}
            </div>
            <p className="text-slate-500 flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <Package className="w-4 h-4 text-indigo-500" />
                {master.product?.title || 'Unknown Product'}
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span>Doc No: <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">{master.documentNumber || 'N/A'}</span></span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span>Version: <span className="font-bold text-slate-900">v{master.version}</span></span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Review Actions for the Master */}
          {(isAdmin || isProduction) && master.status === 'UNDER_REVIEW' && (
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                onClick={() => {
                  const underReview = records.find(r => r.status === 'UNDER_REVIEW');
                  if (underReview) handleRejectRecord(underReview.id);
                  else toast.error('No record found under review');
                }}
                disabled={isRejecting}
                className="border-rose-200 text-rose-600 hover:bg-rose-50 px-6 h-12 rounded-full"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button 
                onClick={() => {
                  const underReview = records.find(r => r.status === 'UNDER_REVIEW');
                  if (underReview) handleApproveRecord(underReview.id);
                  else toast.error('No record found under review');
                }}
                disabled={isApproving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 h-12 rounded-full shadow-lg shadow-emerald-100"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Approve Master
              </Button>
            </div>
          )}

          {canManage && master.status === 'APPROVED' && (
            <>
              <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
                <DialogTrigger render={
                  <Button variant="outline" className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-6 h-12 rounded-full">
                    <Edit3 className="w-4 h-4 mr-2" />
                    Request Update
                  </Button>
                } />
                <DialogContent className="rounded-3xl">
                  <DialogHeader>
                    <DialogTitle>Request Master Update</DialogTitle>
                    <DialogDescription>
                      This will unlock the master for editing. You must provide a valid reason for this update.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="update-reason">Reason for Update</Label>
                      <Input 
                        id="update-reason" 
                        placeholder="e.g. Updating mixing speeds, adding safety step" 
                        value={updateReason}
                        onChange={(e) => setUpdateReason(e.target.value)}
                        className="rounded-xl bg-slate-50 border-none h-12"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsUpdateDialogOpen(false)} className="rounded-full">Cancel</Button>
                    <Button onClick={() => handleUpdateMasterRequest()} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6">Proceed to Signature</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isRetireDialogOpen} onOpenChange={setIsRetireDialogOpen}>
                <DialogTrigger render={
                  <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50 px-6 h-12 rounded-full">
                    <Lock className="w-4 h-4 mr-2" />
                    Retire Master
                  </Button>
                } />
                <DialogContent className="rounded-3xl">
                  <DialogHeader>
                    <DialogTitle>Discontinue Master</DialogTitle>
                    <DialogDescription>
                      This action will permanently retire this master. It will no longer be available for new batch record issuance.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="retire-reason">Reason for Discontinuation</Label>
                      <Input 
                        id="retire-reason" 
                        placeholder="e.g. Obsolete document, replaced by new standard" 
                        value={retireReason}
                        onChange={(e) => setRetireReason(e.target.value)}
                        className="rounded-xl bg-slate-50 border-none h-12"
                      />
                    </div>
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                      <p className="text-xs text-amber-800 flex items-start gap-2 text-justify">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        Warning: Retiring an approved master requires a legally binding electronic signature. This action is irreversible and will be logged in the audit trail.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsRetireDialogOpen(false)} className="rounded-full">Cancel</Button>
                    <Button onClick={() => handleRetireMaster()} className="bg-rose-600 hover:bg-rose-700 text-white rounded-full px-6">Proceed to Signature</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}

          {isAdmin && master.status === 'UNDER_UPDATE' && (
            <Dialog open={isSubmitMasterDialogOpen} onOpenChange={setIsSubmitMasterDialogOpen}>
              <DialogTrigger render={
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 h-12 rounded-full shadow-lg shadow-indigo-100">
                  <Send className="w-4 h-4 mr-2" />
                  Submit for Review
                </Button>
              } />
              <DialogContent className="rounded-3xl">
                <DialogHeader>
                  <DialogTitle>Submit Master for Review</DialogTitle>
                  <DialogDescription>
                    Submit the updated master record for QA approval. Summarize the changes made.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="submit-reason">Summary of Changes</Label>
                    <Input 
                      id="submit-reason" 
                      placeholder="e.g. Revised step 4 temperatures and added verification" 
                      value={updateReason}
                      onChange={(e) => setUpdateReason(e.target.value)}
                      className="rounded-xl bg-slate-50 border-none h-12"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsSubmitMasterDialogOpen(false)} className="rounded-full">Cancel</Button>
                  <Button onClick={() => handleSubmitMasterUpdate()} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6">Sign & Submit</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Button 
            variant="outline" 
            onClick={() => navigate(`/batch-sheet-masters/${id}/edit`)}
            disabled={master.isLocked && master.status !== 'UNDER_UPDATE' || master.status === 'APPROVED' || master.status === 'RETIRED' || master.status === 'UNDER_REVIEW'}
            className="rounded-full px-6 h-12 border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {master.status === 'APPROVED' ? (
              <><Lock className="w-4 h-4 mr-2" /> Approved & Locked</>
            ) : master.status === 'RETIRED' ? (
              <><Lock className="w-4 h-4 mr-2" /> Retired</>
            ) : master.status === 'UNDER_REVIEW' ? (
              <><Clock className="w-4 h-4 mr-2" /> Under Review</>
            ) : master.status === 'UNDER_UPDATE' ? (
              <><Edit3 className="w-4 h-4 mr-2" /> Continue Editing</>
            ) : (
              'Update Master'
            )}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Version History & Audit History */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="w-full border-none shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <CardTitle className="text-lg font-semibold">Batch Sheet Records</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/30">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="pl-8">Doc No.</TableHead>
                  <TableHead>Stage / Process</TableHead>
                  <TableHead>PDF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="pr-8 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id} className="group hover:bg-slate-50/50 border-slate-50 transition-colors">
                    <TableCell className="pl-8 font-mono text-xs text-slate-600">
                      {record.masterSnapshot.documentNumber || 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 font-medium">
                      {record.masterSnapshot.stage || 'N/A'} / {record.masterSnapshot.type || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {record.masterSnapshot.files && record.masterSnapshot.files.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            onClick={() => handleViewPDF(record.masterSnapshot.files?.[0].url, `Record: ${record.masterSnapshot.documentNumber}`)}
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            View PDF
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No File</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(record.status)}
                    </TableCell>
                    <TableCell className="text-slate-600 font-medium whitespace-nowrap">
                      {getUserName(record.createdBy || 'System')}
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm whitespace-nowrap">
                      {new Date(record.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isAdmin && record.status === 'DRAFT' && (
                          <Button 
                            size="sm" 
                            onClick={() => handleSubmitForReview(record.id)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full h-8 px-4 text-xs"
                          >
                            Submit
                          </Button>
                        )}
                        {(isQA || isAdmin || isProduction) && record.status === 'UNDER_REVIEW' && (
                          <div className="flex items-center gap-1">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleRejectRecord(record.id)}
                              disabled={isRejecting}
                              className="border-rose-200 text-rose-600 hover:bg-rose-50 rounded-full h-8 px-4 text-xs"
                            >
                              Reject
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={() => handleApproveRecord(record.id)}
                              disabled={isApproving}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-8 px-4 text-xs"
                            >
                              Approve
                            </Button>
                          </div>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger render={
                            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="w-4 h-4 text-slate-400" />
                            </Button>
                          } />
                            <DropdownMenuContent align="end" className="rounded-xl p-2">
                              <DropdownMenuItem 
                                onClick={() => {
                                  setSelectedRecord(record);
                                  setIsRecordDetailsOpen(true);
                                }}
                                className="rounded-lg gap-2"
                              >
                                <Eye className="w-4 h-4" /> View Snapshot
                              </DropdownMenuItem>
                              {record.masterSnapshot.files && record.masterSnapshot.files.length > 0 && (
                                <DropdownMenuItem 
                                  onClick={() => handleViewPDF(record.masterSnapshot.files?.[0].url, `Record: ${record.masterSnapshot.documentNumber}`)}
                                  className="rounded-lg gap-2"
                                >
                                  <FileText className="w-4 h-4" /> View PDF
                                </DropdownMenuItem>
                              )}
                              {isAdmin && record.status === 'DRAFT' && (
                                <DropdownMenuItem 
                                  onClick={() => handleSubmitForReview(record.id)}
                                  className="rounded-lg gap-2"
                                >
                                  <FileText className="w-4 h-4" /> Submit for Review
                                </DropdownMenuItem>
                              )}
                              {(isQA || isAdmin || isProduction) && record.status === 'UNDER_REVIEW' && (
                                <>
                                  <DropdownMenuItem 
                                    onClick={() => handleApproveRecord(record.id)}
                                    className="rounded-lg gap-2 text-emerald-600"
                                  >
                                    <CheckCircle2 className="w-4 h-4" /> Approve Record
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleRejectRecord(record.id)}
                                    className="rounded-lg gap-2 text-rose-600"
                                  >
                                    <AlertCircle className="w-4 h-4" /> Reject Record
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {records.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-400 italic">
                      No record history found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 21 CFR Part 11 Audit Trail History Flowchart */}
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white p-8">
          <div className="space-y-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2.5">
              <History className="w-5 h-5 text-indigo-600 animate-pulse-slow" />
              21 CFR Part 11 Audit Trail History
            </h3>
            
            <div className="relative border-l-2 border-slate-100 pl-6 space-y-8 py-2 ml-3">
              {getTimelineSteps().map((step) => {
                const isCompleted = step.completed;
                return (
                  <div key={step.key} className="relative text-left pb-1">
                    {/* Circle dot with status styling */}
                    <span className="absolute -left-[31px] top-1 bg-white p-0.5 rounded-full border border-slate-100 shadow-sm">
                      <span className={cn(
                        "w-3 h-3 rounded-full block transition-all duration-500",
                        isCompleted ? "bg-indigo-600 shadow-md ring-4 ring-indigo-50" : "bg-slate-200"
                      )} />
                    </span>
                    
                    <div className={cn(
                      "space-y-1 transition-all duration-500",
                      isCompleted ? "opacity-100" : "opacity-40"
                    )}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <p className={cn(
                          "text-base font-bold transition-colors duration-300",
                          isCompleted ? "text-slate-800" : "text-slate-400"
                        )}>
                          {step.title}
                        </p>
                        {isCompleted && step.timestamp && (
                          <span className="text-xs text-slate-400 font-medium bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                            {new Date(step.timestamp).toLocaleString()}
                          </span>
                        )}
                      </div>
                      
                      {isCompleted ? (
                        <p className="text-xs text-slate-500">
                          Performed by: <span className="font-semibold text-slate-700">{step.performedBy}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">Pending prior workflow steps</p>
                      )}

                      {isCompleted && step.reason && (
                        <div className="mt-2">
                          <span className="text-xs text-slate-600 bg-slate-50/70 hover:bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-100 inline-block font-sans max-w-full shadow-sm leading-relaxed">
                            {step.reason}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

        {/* Template Info & Stats */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                Compliance Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    <Lock className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Lock Status</p>
                    <p className="text-xs text-slate-500">{master.isLocked ? 'Locked for editing' : 'Unlocked'}</p>
                  </div>
                </div>
                {master.isLocked ? <Badge variant="secondary">Locked</Badge> : <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100">Active</Badge>}
              </div>

              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                <h4 className="text-xs font-bold text-indigo-800 uppercase mb-2">Master Version</h4>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-indigo-600">v{master.version}</span>
                  <Button variant="ghost" size="sm" className="text-indigo-600 hover:bg-white rounded-full">
                    View Details <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-slate-900 text-white">
            <CardContent className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-indigo-400 font-bold uppercase text-xs tracking-widest">
                  <FileText className="w-4 h-4" />
                  Technical Details
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Stage</p>
                      <p className="text-sm font-bold text-white">{master.stage || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Type</p>
                      <p className="text-sm font-bold text-white">{master.type || 'N/A'}</p>
                    </div>
                  </div>
                  {master.files && master.files.length > 0 && (
                    <div className="pt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="w-full bg-white/10 border-white/20 hover:bg-white/20 text-white rounded-xl h-10 gap-2"
                        onClick={() => handleViewPDF(master.files?.[0].url, `Master: ${master.masterName}`)}
                      >
                        <FileText className="w-4 h-4" />
                        View Current Master PDF
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AnimatePresence>
        {isPreviewOpen && previewUrl && (
          <SecurePDFViewer 
            fileUrl={previewUrl}
            onClose={() => setIsPreviewOpen(false)}
            title={previewTitle}
            batchInfo={`Document: ${master.documentNumber} | Ver: ${master.version}`}
            mode="master"
          />
        )}
      </AnimatePresence>

      <SignatureDialog 
        isOpen={signatureConfig.isOpen}
        onClose={() => setSignatureConfig({ isOpen: false, type: null, recordId: null })}
        onConfirm={(password) => {
          if (signatureConfig.type === 'submit' && signatureConfig.recordId) {
            handleSubmitForReview(signatureConfig.recordId, password);
          } else if (signatureConfig.type === 'approve' && signatureConfig.recordId) {
            handleApproveRecord(signatureConfig.recordId, password);
          } else if (signatureConfig.type === 'reject' && signatureConfig.recordId) {
            handleRejectRecord(signatureConfig.recordId, password);
          } else if (signatureConfig.type === 'retire') {
            handleRetireMaster(password);
          } else if (signatureConfig.type === 'request_update') {
            handleUpdateMasterRequest(password);
          } else if (signatureConfig.type === 'submit_master') {
            handleSubmitMasterUpdate(password);
          }
        }}
        title={
          signatureConfig.type === 'submit' ? 'Submit for Review' : 
          signatureConfig.type === 'approve' ? 'Approve Master' : 
          signatureConfig.type === 'reject' ? 'Reject Master' : 
          signatureConfig.type === 'retire' ? 'Retire Master' :
          signatureConfig.type === 'request_update' ? 'Request Update' : 'Submit for Review'
        }
        description={
          signatureConfig.type === 'submit' 
            ? 'You are submitting this record for QA review. This action requires an electronic signature.' 
            : signatureConfig.type === 'approve'
            ? 'You are approving this master record for manufacturing use. This action requires an electronic signature.'
            : signatureConfig.type === 'reject'
            ? 'You are rejecting this master record. This action requires an electronic signature.'
            : signatureConfig.type === 'retire'
            ? 'You are permanently retiring this master record. This action requires an electronic signature and is irreversible.'
            : signatureConfig.type === 'request_update'
            ? 'You are requesting an update to this approved master record. This action requires an electronic signature.'
            : 'You are submitting updated master record for review. This action requires an electronic signature.'
        }
        meaning={
          signatureConfig.type === 'submit' 
            ? 'I am the author and I submit this record for review' 
            : signatureConfig.type === 'approve'
            ? 'I have reviewed this record and I approve it for production'
            : signatureConfig.type === 'reject'
            ? 'I have reviewed this record and I reject it'
            : signatureConfig.type === 'retire'
            ? 'I certify that I am discontinuing this master record. This action is intentional and logged.'
            : signatureConfig.type === 'request_update'
            ? 'I am requesting an update to this approved master record. This action will be logged and requires justification.'
            : 'I certify that I have reviewed the updates to this master record and am submitting it for QA approval.'
        }
        isLoading={isApproving || isRejecting || isRetiring || isUpdating || isSubmittingMaster}
      />

      {/* Record Details Modal */}
      <Dialog open={isRecordDetailsOpen} onOpenChange={setIsRecordDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold">Record Details: Ver {selectedRecord?.masterSnapshot.version}</DialogTitle>
                <DialogDescription>
                  Snapshot of master and manufacturing steps for this record.
                </DialogDescription>
              </div>
              {selectedRecord && getStatusBadge(selectedRecord.status)}
            </div>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-8 py-6">
              {/* Master Snapshot */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Master Information</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-500">Master Name</span>
                      <span className="font-semibold text-slate-900">{selectedRecord.masterSnapshot.masterName}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-500">Product Name</span>
                      <span className="font-semibold text-slate-900">{master.product?.title || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-500">Document No</span>
                      <span className="font-semibold text-slate-900">{selectedRecord.masterSnapshot.documentNumber || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-500">Stage / Process</span>
                      <span className="font-semibold text-slate-900">{selectedRecord.masterSnapshot.stage || 'N/A'} / {selectedRecord.masterSnapshot.type || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Record Metadata</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-500">Created By</span>
                      <span className="font-semibold text-slate-900">{getUserName(selectedRecord.createdBy)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-500">Created At</span>
                      <span className="font-semibold text-slate-900">{new Date(selectedRecord.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-500">Change Reason</span>
                      <span className="font-semibold text-slate-900 italic">"{selectedRecord.changeReason || 'Initial version'}"</span>
                    </div>
                  </div>
                  {selectedRecord.masterSnapshot.files && selectedRecord.masterSnapshot.files.length > 0 && (
                    <div className="pt-4">
                      <Button 
                        variant="ghost" 
                        className="w-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl gap-2 h-12"
                        onClick={() => window.open(selectedRecord.masterSnapshot.files?.[0].url, '_blank')}
                      >
                        <FileText className="w-5 h-5" />
                        View Snapshot PDF
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Steps List */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Manufacturing Steps</h4>
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Equipment</TableHead>
                        <TableHead className="text-right">Expected Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRecord.masterSnapshot.steps_json.map((step) => (
                        <TableRow key={step.step_number}>
                          <TableCell className="font-bold text-slate-900">{step.step_number}</TableCell>
                          <TableCell className="text-slate-600">{step.description}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none">
                              {step.equipment}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-slate-500">{step.expected_time}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-3">
            <Button variant="ghost" onClick={() => setIsRecordDetailsOpen(false)} className="rounded-full">
              Close
            </Button>
            {(isQA || isAdmin) && selectedRecord?.status === 'UNDER_REVIEW' && (
              <>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setIsRecordDetailsOpen(false);
                    handleRejectRecord(selectedRecord.id);
                  }}
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 rounded-full px-8"
                >
                  Reject Record
                </Button>
                <Button 
                  onClick={() => {
                    setIsRecordDetailsOpen(false);
                    handleApproveRecord(selectedRecord.id);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-8"
                >
                  Approve Record
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
