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
  RotateCcw
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
import { BatchIssuance, ProductMaster, getUserBaseRole } from '../types';
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

  const [selectedIssuance, setSelectedIssuance] = useState<BatchIssuance | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [approvalReason, setApprovalReason] = useState('Approving batch issuance request.');
  const [rejectionReason, setRejectionReason] = useState('');
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | 'RETURN' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  useEffect(() => {
    fetchData();
  }, []);

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
      case 'ISSUED':
        return (
          <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
            <ClipboardCheck className="w-3 h-3 mr-1" />
            Issued
          </Badge>
        );
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

  if (loading) return <LoadingPage label="Synchronizing request statuses..." />;

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm tracking-wider uppercase mb-1">
            <History className="w-4 h-4" />
            Batch Issuance Workflow
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Request Status</h1>
          <p className="text-slate-500 text-lg max-w-2xl mt-1">
            Track the status of the requests created in New Batch Sheet Request.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-3 bg-white p-1 rounded-full shadow-sm border border-slate-100">
              <div className="px-4 py-2 text-sm font-bold text-slate-400">Ongoing Requests:</div>
              <div className="px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-black shadow-lg shadow-slate-200">
                  {ongoingRequestsCount}
              </div>
          </div>
          <Button 
            onClick={() => navigate('/batch-sheet-records/completed')}
            className="rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold h-10 px-5 shadow-md text-xs tracking-wider uppercase w-full md:w-auto"
          >
            Completed Requests
          </Button>
          <Button 
            onClick={() => navigate('/batch-sheet-records/rejected')}
            className="rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold h-10 px-5 shadow-md text-xs tracking-wider uppercase w-full md:w-auto"
          >
            Rejected Requests
          </Button>
        </div>
      </header>

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
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="ISSUED">Issued</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="READY_FOR_PRODUCTION_HANDOVER">Ready for Handover</SelectItem>
              <SelectItem value="PRODUCTION_IN_PROGRESS">Production in Progress</SelectItem>
              <SelectItem value="READY_FOR_QA_REVIEW">Ready for QA Review</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-end">
          <Button onClick={fetchData} variant="ghost" className="rounded-full text-indigo-600 font-bold px-6 h-12 bg-indigo-50 hover:bg-indigo-100 w-full md:w-auto">
            Refresh Status
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-xl rounded-[40px] overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-slate-100/50">
                <TableHead className="pl-10 py-6 text-xs font-black uppercase tracking-widest text-slate-400">Batch Details</TableHead>
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
                  <TableRow key={iss.id} className="group hover:bg-slate-50/50 transition-all border-slate-50">
                    <TableCell className="pl-10 py-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                          <ClipboardCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 leading-tight uppercase tracking-tight hover:underline cursor-pointer" onClick={() => navigate(`/batches/${iss.id}`)}>
                            {batchDetailLabel}
                          </p>
                          <p className="text-[11px] text-slate-400 font-bold block mt-1 tracking-wider">
                            BATCH NO: {iss.batchNumber} | ID: {iss.id.substring(0, 8)}
                          </p>
                          {(iss.dropdownBatchSeries || iss.batchNumberSeries) && (
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {iss.dropdownBatchSeries && (
                                <Badge variant="outline" className="bg-indigo-50/50 text-indigo-700 border-indigo-100 text-[10px] font-bold py-0 h-5">
                                  Series: {iss.dropdownBatchSeries}
                                </Badge>
                              )}
                              {iss.batchNumberSeries && (
                                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] font-bold py-0 h-5">
                                  Sheets: {iss.batchNumberSeries}
                                </Badge>
                              )}
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
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant="outline" className="font-mono bg-slate-50 text-[10px] py-0 h-5 px-2">Ver {iss.version || '1.0'}</Badge>
                      </div>
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
                );
              })}
              {filteredIssuances.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-80 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-slate-300">
                        <Search className="w-16 h-16 opacity-10" />
                        <div>
                            <p className="text-lg font-bold text-slate-400">No requests found</p>
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

      {/* Approval Dialog */}
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
                className="rounded-2xl border-slate-100 focus:ring-indigo-500 resize-none h-24"
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

      {/* Rejection Dialog */}
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
                className="rounded-2xl border-slate-100 focus:ring-rose-500 resize-none h-32"
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
