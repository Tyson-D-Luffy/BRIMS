import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  History, 
  Search, 
  Layers, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  ShieldCheck, 
  Printer, 
  FileText, 
  Eye, 
  X,
  Package,
  ClipboardCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import api from '../services/api';
import { BatchIssuance, ProductMaster } from '../types';
import { toast } from 'sonner';
import { LoadingPage } from '../components/LoadingSpinner';

export default function CompletedBatchSheetRequests() {
  const navigate = useNavigate();
  const [completedRequests, setCompletedRequests] = useState<BatchIssuance[]>([]);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [masters, setMasters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog state for Workflow Chart
  const [isChartOpen, setIsChartOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchIssuance | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [batchesRes, productsRes, usersRes, mastersRes] = await Promise.all([
        api.get('/batches?limit=-1'),
        api.get('/product-masters'),
        api.get('/users').catch(() => ({ data: { success: false, data: [] } })),
        api.get('/batch-number-engine/masters').catch(() => ({ data: { success: false, data: [] } }))
      ]);

      if (batchesRes.data.success) {
        // Only keep COMPLETED requests
        const completed = batchesRes.data.data.filter((b: BatchIssuance) => b.status === 'COMPLETED');
        setCompletedRequests(completed);
      }
      if (productsRes.data.success) {
        setProducts(productsRes.data.data);
      }
      if (usersRes.data?.success) {
        setUsers(usersRes.data.data);
      }
      if (mastersRes.data?.success) {
        setMasters(mastersRes.data.data);
      }
    } catch (error: any) {
      console.error('Failed to load completed request history', error);
      toast.error('Failed to load completed requests');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWorkflowChart = async (batch: BatchIssuance) => {
    setSelectedBatch(batch);
    setIsChartOpen(true);
    setTimelineLoading(true);
    setTimeline([]);
    try {
      const response = await api.get(`/batches/${batch.id}/timeline`);
      if (response.data.success) {
        setTimeline(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch timeline for chart:', error);
      toast.error('Failed to load sequence timeline');
    } finally {
      setTimelineLoading(false);
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

  const filteredRequests = completedRequests.filter(req => {
    const product = products.find(p => p.id === req.productId);
    const matchesSearch = 
      req.batchNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.dropdownBatchSeries?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.batchNumberSeries?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product?.title?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  if (loading) return <LoadingPage label="Synchronizing completed history..." />;

  // Workflow steps generators for selected batch modal
  const renderWorkflowChartSteps = () => {
    if (!selectedBatch) return null;
    const prod = products.find(p => p.id === selectedBatch.productId);

    // Resolve Step 1
    const t1 = timeline.find((t: any) => t.action === 'CREATE' || t.action === 'ISSUE_BATCH' || t.newStatus === 'DRAFT' || t.newStatus === 'PENDING_REVIEW') || timeline[0];
    const d1 = t1 ? new Date(t1.timestamp).toLocaleString() : (selectedBatch.createdAt ? new Date(selectedBatch.createdAt).toLocaleString() : 'N/A');
    const u1 = t1 
      ? resolveUser(t1.userEmail || t1.userId, selectedBatch.issuedByName) 
      : resolveUser(selectedBatch.issuedBy || selectedBatch.issuedByName, selectedBatch.issuedByName || 'Akshay Sharma');

    // Resolve Step 2 & 3
    const t2 = timeline.find((t: any) => t.action === 'APPROVE' || t.action === 'APPROVE_BATCH' || t.newStatus === 'APPROVED');
    const d2 = t2 ? new Date(t2.timestamp).toLocaleString() : new Date(selectedBatch.updatedAt || selectedBatch.createdAt).toLocaleString();
    const u2 = t2 ? resolveUser(t2.userEmail || t2.userId, 'QA Reviewer') : resolveUser(selectedBatch.updatedBy, 'QA Reviewer');

    // Resolve Step 4
    const t4 = timeline.find((t: any) => t.newStatus === 'ISSUED' || t.action === 'ISSUE' || t.action === 'ISSUE_BATCH');
    const d4 = t4 ? new Date(t4.timestamp).toLocaleString() : new Date(selectedBatch.createdAt).toLocaleString();
    const u4 = t4 ? resolveUser(t4.userEmail || t4.userId, selectedBatch.issuedByName) : resolveUser(selectedBatch.issuedBy || selectedBatch.issuedByName, selectedBatch.issuedByName || 'Akshay Sharma');

    // Resolve Step 5
    const t5 = timeline.find((t: any) => t.newStatus === 'READY_FOR_PRODUCTION_HANDOVER' || t.action === 'PRINT_BATCH_SHEET');
    const d5 = t5 ? new Date(t5.timestamp).toLocaleString() : new Date(selectedBatch.createdAt).toLocaleString();
    const u5 = t5 ? resolveUser(t5.userEmail || t5.userId, 'Authorized Operator') : resolveUser(selectedBatch.updatedBy, 'Authorized Operator');

    // Resolve Step 6
    const t6 = timeline.find((t: any) => t.newStatus === 'READY_FOR_QA_REVIEW');
    const d6 = t6 ? new Date(t6.timestamp).toLocaleString() : new Date(selectedBatch.updatedAt || selectedBatch.createdAt).toLocaleString();
    const u6 = t6 ? resolveUser(t6.userEmail || t6.userId, 'QA Officer') : resolveUser(selectedBatch.updatedBy, 'QA Officer');

    // Resolve Step 7
    const t7 = timeline.find((t: any) => t.newStatus === 'COMPLETED' || t.action === 'COMPLETE');
    const d7 = t7 ? new Date(t7.timestamp).toLocaleString() : (selectedBatch.completedAt ? new Date(selectedBatch.completedAt).toLocaleString() : new Date(selectedBatch.updatedAt).toLocaleString());
    const u7 = t7 ? resolveUser(t7.userEmail || t7.userId, 'QA Reviewer') : resolveUser(selectedBatch.completedBy || selectedBatch.updatedBy, 'QA Reviewer');

    const steps = [
      {
        step: "1. Initiate Request",
        badge: "COMPLETED",
        badgeClass: "bg-emerald-100 text-emerald-800",
        description: "Product & process template configured.",
        date: d1,
        user: `${u1.employeeId !== 'N/A' ? u1.employeeId + ' - ' : ''}${u1.username}`,
        icon: FileText,
        iconClass: "bg-emerald-50 border-emerald-500 text-emerald-600"
      },
      {
        step: "2. QA Review",
        badge: "COMPLETED",
        badgeClass: "bg-emerald-100 text-emerald-800",
        description: "Verify documentation & GMP compliance.",
        date: d2,
        user: `${u2.employeeId !== 'N/A' ? u2.employeeId + ' - ' : ''}${u2.username}`,
        icon: Clock,
        iconClass: "bg-emerald-50 border-emerald-500 text-emerald-600"
      },
      {
        step: "3. Sign-off",
        badge: "COMPLETED",
        badgeClass: "bg-emerald-100 text-emerald-800",
        description: "Part 11 password digital e-signatures.",
        date: d2,
        user: `${u2.employeeId !== 'N/A' ? u2.employeeId + ' - ' : ''}${u2.username}`,
        icon: UserCheck,
        iconClass: "bg-emerald-50 border-emerald-500 text-emerald-600"
      },
      {
        step: "4. Sheet Issued",
        badge: "COMPLETED",
        badgeClass: "bg-emerald-100 text-emerald-800",
        description: "Unique batch number is locked & issued.",
        date: d4,
        user: `${u4.employeeId !== 'N/A' ? u4.employeeId + ' - ' : ''}${u4.username}`,
        icon: ShieldCheck,
        iconClass: "bg-emerald-50 border-emerald-500 text-emerald-600"
      },
      {
        step: "5. Batch Sheet Ready for Receiving",
        badge: "COMPLETED",
        badgeClass: "bg-emerald-100 text-emerald-800 border-none",
        description: "Print PDF and complete operations & hand over filled batch sheet.",
        date: d5,
        user: `${u5.employeeId !== 'N/A' ? u5.employeeId + ' - ' : ''}${u5.username}`,
        icon: Printer,
        iconClass: "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
      },
      {
        step: "6. QA Review",
        badge: "COMPLETED",
        badgeClass: "bg-emerald-100 text-emerald-800 border-none",
        description: "Verification of filled parameters & entries by QA officer.",
        date: d6,
        user: `${u6.employeeId !== 'N/A' ? u6.employeeId + ' - ' : ''}${u6.username}`,
        icon: ShieldCheck,
        iconClass: "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
      },
      {
        step: "7. Final Completion",
        badge: "COMPLETED",
        badgeClass: "bg-emerald-100 text-emerald-800 border-none",
        description: "Batch records completed, locked, and archived.",
        date: d7,
        user: `${selectedBatch.completedByEmployeeId ? selectedBatch.completedByEmployeeId + ' - ' : u7.employeeId !== 'N/A' ? u7.employeeId + ' - ' : ''}${selectedBatch.completedByName || u7.username}`,
        icon: CheckCircle2,
        iconClass: "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
      }
    ];

    return (
      <div className="relative pl-8 space-y-8 before:absolute before:left-8 before:top-5 before:bottom-5 before:w-[3px] before:bg-emerald-100">
        {steps.map((s, idx) => (
          <div key={idx} className="flex items-start gap-6 relative z-10">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 shrink-0 ${s.iconClass}`}>
              <s.icon className="w-6 h-6" />
            </div>
            <div className="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">{s.step}</h4>
                <Badge className={`${s.badgeClass} border-none text-[9px] font-bold w-fit`}>{s.badge}</Badge>
              </div>
              <p className="text-xs text-slate-600 mt-2 font-medium">{s.description}</p>
              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                <div>
                  <span className="text-slate-400 font-medium block">Performed On</span>
                  <span className="text-slate-700 font-bold block">{s.date}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Performed By</span>
                  <span className="text-slate-700 font-bold block">{s.user}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Title block */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm tracking-wider uppercase mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-pulse" />
            System Status: Completed Issuances
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Completed Requests</h1>
          <p className="text-slate-500 text-lg max-w-2xl mt-1">
            Browse the history of batch sheets that have completed electronic signoff and printing.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={() => navigate('/batch-sheet-records/rejected')}
            className="rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold h-12 px-6 shadow-md text-xs tracking-wider uppercase"
          >
            Rejected Requests
          </Button>
          <Button 
            onClick={() => navigate('/batch-sheet-records/status')}
            variant="outline"
            className="rounded-full border-slate-200 text-slate-600 font-bold h-12 px-6 hover:bg-slate-50 bg-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Ongoing Requests
          </Button>
        </div>
      </header>

      {/* Required completion banner */}
      <div className="bg-emerald-50 border-2 border-emerald-500/20 p-6 rounded-[32px] flex items-center gap-4 shadow-sm shadow-emerald-100">
        <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-extrabold text-emerald-950 text-lg leading-tight">System Status Confirmed</h3>
          <p className="text-emerald-700 text-sm font-semibold tracking-wide">
            The Batch Issuance Process has been Completed
          </p>
        </div>
      </div>

      {/* Search & filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-[32px] shadow-sm border border-slate-100">
        <div className="relative md:col-span-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search by completed batch number or product..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 rounded-2xl bg-slate-50 border-none focus-visible:ring-indigo-500 h-12"
          />
        </div>
        <div className="flex items-center justify-end">
          <Button onClick={fetchData} variant="ghost" className="rounded-full text-emerald-700 font-bold px-6 h-12 bg-emerald-50 hover:bg-emerald-100 w-full md:w-auto">
            Sync Records
          </Button>
        </div>
      </div>

      {/* Completed requests table */}
      <Card className="border-none shadow-xl rounded-[40px] overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-slate-100/50">
                <TableHead className="pl-10 py-6 text-xs font-black uppercase tracking-widest text-slate-400">Batch Details</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Stage / Process</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Status</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Completed By</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Completed On</TableHead>
                <TableHead className="pr-10 text-right text-xs font-black uppercase tracking-widest text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.map((iss) => {
                const product = products.find(p => p.id === iss.productId);
                
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

                // Completed signature identifier formatting: Employee ID - Username
                const resolvedUser = resolveUser(iss.completedBy);
                const employeeId = resolvedUser.employeeId !== 'N/A' ? resolvedUser.employeeId : (iss.completedByEmployeeId || 'N/A');
                
                // Prioritize authentic username field over full name / display name
                const actualUserObj = users.find(u => u.uid === iss.completedBy || u.id === iss.completedBy);
                const actualUsername = actualUserObj?.username || resolvedUser.username;

                const completedByStr = employeeId !== 'N/A'
                  ? `${employeeId} - ${actualUsername}`
                  : actualUsername;

                const completedOnStr = iss.completedAt 
                  ? new Date(iss.completedAt).toLocaleString() 
                  : (iss.updatedAt ? new Date(iss.updatedAt).toLocaleString() : 'N/A');

                return (
                  <TableRow key={iss.id} className="group hover:bg-slate-50/50 transition-all border-slate-50">
                    {/* Batch details with link to active batch details page */}
                    <TableCell className="pl-10 py-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-slate-900 group-hover:text-white transition-colors border border-emerald-100">
                          <ClipboardCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-indigo-600 hover:underline leading-tight uppercase cursor-pointer" onClick={() => navigate(`/batches/${iss.id}`)}>
                            {batchDetailLabel}
                          </p>
                          <p className="text-[11px] text-slate-400 font-bold block mt-1 tracking-wider">
                            ID: {iss.id.substring(0, 8)} | REQUEST TYPE: {iss.requestType || 'NEW'}
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

                    {/* Stage / Process */}
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

                    {/* Status badge */}
                    <TableCell className="py-8">
                      <Badge className="bg-emerald-500 text-white rounded-full px-3 py-1 font-extrabold border-none flex items-center gap-1 w-fit shadow-lg shadow-emerald-50">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white animate-pulse" />
                        Completed
                      </Badge>
                    </TableCell>

                    {/* Completed By */}
                    <TableCell className="py-8">
                      <div className="flex items-center gap-2 font-semibold text-slate-700 text-sm">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-black text-xs uppercase">
                          {completedByStr.charAt(0)}
                        </div>
                        <span className="truncate max-w-[180px]">{completedByStr}</span>
                      </div>
                    </TableCell>

                    {/* Completed On */}
                    <TableCell className="py-8">
                      <div className="font-semibold text-slate-600 text-xs">
                        {completedOnStr}
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="pr-10 py-8 text-right">
                      <Button 
                        onClick={() => handleOpenWorkflowChart(iss)}
                        variant="ghost"
                        className="rounded-full font-extrabold text-xs text-indigo-600 hover:text-white hover:bg-slate-900 border border-indigo-100 h-9 px-4 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && filteredRequests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center text-slate-400 italic font-medium">
                    No completed batch request records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Interactive Workflow Chart Dialog with Custom Scrollbar and Close Cross */}
      <Dialog open={isChartOpen} onOpenChange={(open) => !open && setIsChartOpen(false)}>
        <DialogContent showCloseButton={false} className="rounded-[32px] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-8 border-none bg-white shadow-2xl">
          <DialogHeader className="relative shrink-0 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <History className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black text-slate-900 leading-tight">
                  Issuance Workflow History
                </DialogTitle>
                <DialogDescription className="text-slate-500 font-medium">
                  Compliance validation audit for Batch No. {selectedBatch?.batchNumber}
                </DialogDescription>
              </div>
            </div>
            {/* Custom Cross Button inside header for elegant manual close */}
            <button 
              onClick={() => setIsChartOpen(false)}
              className="absolute right-0 top-0 w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-all border border-slate-200 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </DialogHeader>

          {/* Scrollable Container with Custom Styling */}
          <div className="flex-1 overflow-y-auto pr-2 py-6 custom-modal-scrollbar space-y-6">
            {timelineLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tracing Audit Trail...</p>
              </div>
            ) : (
              renderWorkflowChartSteps()
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-100 pt-5 gap-2 sm:gap-0">
            <Button 
              type="button" 
              onClick={() => setIsChartOpen(false)} 
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-8 font-bold"
            >
              Close Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Styles for the modal scrollbar */}
      <style>{`
        .custom-modal-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-modal-scrollbar::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 9999px;
        }
        .custom-modal-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 9999px;
        }
        .custom-modal-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>

    </div>
  );
}
