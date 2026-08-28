import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Save, 
  CheckCircle2, 
  History, 
  FileText, 
  UserCheck, 
  ShieldCheck, 
  AlertTriangle,
  Play,
  CheckCircle,
  RotateCcw,
  XCircle,
  Clock,
  Calendar,
  Package,
  Layers,
  MoreVertical,
  ChevronRight,
  AlertCircle,
  ClipboardList,
  Printer,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter, 
  DialogDescription 
} from '@/components/ui/dialog';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { BatchIssuance, BatchIssuanceStatus, ProductMaster, Signature, AuditLog, getUserBaseRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { cn } from '../lib/utils';
import { generateBatchPDF, generateRequestPreviewPDF, formatRequestId } from '../lib/pdf-generator';
import { SecurePDFViewer } from '../components/SecurePDFViewer';
import { Loader2 } from 'lucide-react';
import { LoadingPage } from '../components/LoadingSpinner';
import { SignatureDialog } from '../components/SignatureDialog';
import { ReturnDialog, ReturnDialogConfirmPayload } from '../components/ReturnDialog';
import { ReturnBadge } from '../components/ReturnBadge';
import { ReturnHistorySection } from '../components/ReturnHistorySection';
import { SequentialPrintManager } from '../components/SequentialPrintManager';

export default function BatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<BatchIssuance | null>(null);
  const [productMaster, setProductMaster] = useState<ProductMaster | null>(null);
  const [masters, setMasters] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { user } = useAuth();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [signatureAction, setSignatureAction] = useState<'PRINT' | 'HANDOVER' | 'RECEIVED' | 'FILLED' | 'REVIEWED' | null>(null);

  const handlePreviewPDF = async () => {
    if (!batch) return;
    
    setGeneratingPreview(true);
    try {
      const masterSnapshot = batch.recordInfo?.masterSnapshot;
      if (!masterSnapshot) {
        toast.error('No master snapshot found in this batch record');
        return;
      }
      
      const hasFile = masterSnapshot.files && masterSnapshot.files.length > 0;
      if (!hasFile) {
        toast.info('No original PDF uploaded. Showing system-generated template preview.');
      }
      
      const computedReqId = formatRequestId(
        batch.batchNumberSeries || batch.batchNumber,
        batch.createdAt || batch.manufacturingDate,
        productMaster?.title || productMaster?.batchNumberSeries,
        batch.id
      );

      const url = await generateRequestPreviewPDF({
        batchNumber: batch.batchNumberSeries || batch.batchNumber,
        dropdownBatchSeries: (batch as any).dropdownBatchSeries || '',
        singlePagesBatchNumber: (batch as any).singlePagesBatchNumber,
        issueDate: batch.createdAt || batch.manufacturingDate || new Date().toISOString(),
        issuedBy: batch.issuedByName ? `${batch.issuedByRole || 'ADMIN'}(${batch.issuedByName})` : 'ADMIN(Akshay Sharma)',
        master: masterSnapshot,
        product: productMaster,
        userInfo: user ? { name: user.displayName || user.username || user.email || 'Unknown', id: user.employeeId || 'N/A' } : undefined,
        requestType: batch.requestType,
        printCounts: batch.printCounts,
        requestId: computedReqId,
        isForPrint: false
      });
      
      if (url) {
        setPreviewUrl(url);
        setIsPreviewOpen(true);
        toast.success('Preview PDF generated successfully');
      }
    } catch (err: any) {
      console.error('Error of generating PDF preview overlay:', err);
      toast.error('Failed to generate PDF preview');
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handlePrintBatchSheet = () => {
    setSignatureAction('PRINT');
    setIsSignatureOpen(true);
  };

  const handleHandoverToProduction = async () => {
    setSignatureAction('HANDOVER');
    setIsSignatureOpen(true);
  };

  const handleProductionReceived = async () => {
    setSignatureAction('RECEIVED');
    setIsSignatureOpen(true);
  };

  const handleBatchSheetFilled = async () => {
    setSignatureAction('FILLED');
    setIsSignatureOpen(true);
  };

  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);

  const handleReturnForCorrection = () => {
    setIsReturnDialogOpen(true);
  };

  const handleConfirmReturn = async (payload: ReturnDialogConfirmPayload) => {
    if (!batch) return;
    setUpdatingStatus(true);
    try {
      const res = await api.post(`/batches/${id}/return`, payload);
      if (res.data.success) {
        toast.success('Batch sheet returned for correction successfully!');
        setIsReturnDialogOpen(false);
        await fetchData();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to return batch sheet for correction');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleResubmit = async () => {
    if (!batch) return;
    setResubmitting(true);
    try {
      const res = await api.put(`/batches/${id}/status`, {
        status: 'READY_FOR_QA_REVIEW',
        changeReason: 'Resubmitted after corrections.'
      });
      if (res.data.success) {
        toast.success('Batch sheet resubmitted for QA Review!');
        await fetchData();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to resubmit batch sheet');
    } finally {
      setResubmitting(false);
    }
  };

  const handleBatchSheetReviewed = async () => {
    setSignatureAction('REVIEWED');
    setIsSignatureOpen(true);
  };

  const handleSignatureConfirm = async (password: string) => {
    if (!batch || !signatureAction) return;
    setIsSignatureOpen(false);

    if (signatureAction === 'PRINT') {
      setPrinting(true);
      try {
        const response = await api.post(`/batches/${id}/print`, { password });
        if (response.data.success) {
          // Refresh batch data to show COMPLETED status!
          await fetchData();

          const masterSnapshot = batch.recordInfo?.masterSnapshot || response.data.data?.recordInfo?.masterSnapshot;
          if (!masterSnapshot) {
            toast.error('No master snapshot found in this batch record');
            return;
          }
          
          const computedReqId = formatRequestId(
            batch.batchNumberSeries || batch.batchNumber,
            batch.createdAt || batch.manufacturingDate,
            productMaster?.title || productMaster?.batchNumberSeries,
            batch.id
          );

          const url = await generateRequestPreviewPDF({
            batchNumber: batch.batchNumberSeries || batch.batchNumber,
            dropdownBatchSeries: (batch as any).dropdownBatchSeries || '',
            issueDate: batch.createdAt || batch.manufacturingDate || new Date().toISOString(),
            issuedBy: batch.issuedByName ? `${batch.issuedByRole || 'ADMIN'}(${batch.issuedByName})` : 'ADMIN(Akshay Sharma)',
            master: masterSnapshot,
            product: productMaster,
            userInfo: user ? { name: user.displayName || user.username || user.email || 'Unknown', id: user.employeeId || 'N/A' } : undefined,
            requestType: batch.requestType,
            printCounts: batch.printCounts,
            requestId: computedReqId,
            isForPrint: true
          });
          
          if (url) {
            const responseBlob = await fetch(url).then(r => r.blob());
            const link = document.createElement('a');
            const downloadUrl = URL.createObjectURL(responseBlob);
            link.href = downloadUrl;
            link.download = `Batch_${batch.batchNumber}_Sheet.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
            toast.success('Batch sheet successfully printed! Status updated to Ready for Production Handover.');
          }
        }
      } catch (err: any) {
        console.error('Error of printing batch sheet:', err);
        toast.error(err.response?.data?.message || 'Failed to authorize printing');
      } finally {
        setPrinting(false);
        setSignatureAction(null);
      }
    } else if (signatureAction === 'HANDOVER') {
      setUpdatingStatus(true);
      try {
        const res = await api.put(`/batches/${id}/status`, {
          status: 'HANDED_OVER',
          changeReason: 'Batch handed over to production.',
          password
        });
        if (res.data.success) {
          toast.success('Batch successfully handed over to production!');
          await fetchData();
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.response?.data?.message || 'Failed to hand over batch to production');
      } finally {
        setUpdatingStatus(false);
        setSignatureAction(null);
      }
    } else if (signatureAction === 'RECEIVED') {
      setUpdatingStatus(true);
      try {
        const res = await api.put(`/batches/${id}/status`, {
          status: 'PRODUCTION_IN_PROGRESS',
          changeReason: 'Batch sheet received and collected by production.',
          password
        });
        if (res.data.success) {
          toast.success('Batch sheet successfully received by production!');
          await fetchData();
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.response?.data?.message || 'Failed to receive batch sheet');
      } finally {
        setUpdatingStatus(false);
        setSignatureAction(null);
      }
    } else if (signatureAction === 'FILLED') {
      setUpdatingStatus(true);
      try {
        const res = await api.put(`/batches/${id}/status`, {
          status: 'READY_FOR_QA_REVIEW',
          changeReason: 'Batch sheet completed by production and sent back for QA review.',
          password
        });
        if (res.data.success) {
          toast.success('Batch sheet status updated to Ready for QA Review!');
          await fetchData();
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.response?.data?.message || 'Failed to update batch status');
      } finally {
        setUpdatingStatus(false);
        setSignatureAction(null);
      }
    } else if (signatureAction === 'REVIEWED') {
      setUpdatingStatus(true);
      try {
        const res = await api.put(`/batches/${id}/status`, {
          status: 'COMPLETED',
          changeReason: 'Batch sheet reviewed and received by QA. Issuance completed.',
          password
        });
        if (res.data.success) {
          toast.success('Batch sheet process completed!');
          await fetchData();
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.response?.data?.message || 'Failed to complete batch process');
      } finally {
        setUpdatingStatus(false);
        setSignatureAction(null);
      }
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/batches/${id}`);
      if (response.data.success) {
        const batchData = response.data.data;
        setBatch(batchData);
        if (batchData.productInfo) {
          setProductMaster(batchData.productInfo);
        }
        
        // Fetch product info & masters in parallel track
        try {
          const [prodRes, mastersRes, timelineRes, usersRes] = await Promise.all([
            batchData.productId 
              ? api.get(`/product-masters/${batchData.productId}`).catch(() => ({ data: { success: false, data: null } }))
              : Promise.resolve({ data: { success: false, data: null } }),
            api.get('/batch-number-engine/masters').catch(() => ({ data: { success: false, data: [] } })),
            api.get(`/batches/${id}/timeline`).catch(() => ({ data: { success: false, data: [] } })),
            api.get('/users').catch(() => ({ data: { success: false, data: [] } }))
          ]);
          
          if (prodRes.data?.success && prodRes.data.data) {
            setProductMaster(prodRes.data.data);
          } else if (batchData.productInfo) {
            setProductMaster(batchData.productInfo);
          }
          if (mastersRes.data?.success) {
            setMasters(mastersRes.data.data || []);
          }
          if (timelineRes.data?.success) {
            setTimeline(timelineRes.data.data || []);
          }
          if (usersRes.data?.success) {
            setUsers(usersRes.data.data || []);
          }
        } catch (prodErr) {
          console.error('Error fetching additional product metadata:', prodErr);
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch batch details', error);
      toast.error(error.response?.data?.message || 'Failed to load batch record');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const getStatusBadge = (status: BatchIssuanceStatus) => {
    switch (status) {
      case 'DRAFT':
        return <Badge className="bg-slate-50 text-slate-600 border-slate-100 rounded-full px-3 py-1 font-medium"><FileText className="w-3 h-3 mr-1" /> Draft</Badge>;
      case 'PENDING_REVIEW':
        return <Badge className="bg-amber-50 text-amber-600 border-amber-100 rounded-full px-3 py-1 font-medium"><Clock className="w-3 h-3 mr-1" /> Pending Review</Badge>;
      case 'APPROVED':
        return <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 rounded-full px-3 py-1 font-medium"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
      case 'REJECTED':
        return <Badge className="bg-rose-50 text-rose-600 border-rose-100 rounded-full px-3 py-1 font-medium"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      case 'ISSUED':
        return <Badge className="bg-blue-50 text-blue-600 border-blue-100 rounded-full px-3 py-1 font-medium"><ClipboardList className="w-3 h-3 mr-1" /> Issued</Badge>;
      case 'READY_FOR_PRODUCTION_HANDOVER':
        return <Badge className="bg-orange-50 text-orange-600 border-orange-100 rounded-full px-3 py-1 font-medium"><Layers className="w-3 h-3 mr-1" /> Batch Sheet Ready for Receiving</Badge>;
      case 'PRODUCTION_IN_PROGRESS':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200 rounded-full px-3 py-1 font-medium"><Layers className="w-3 h-3 mr-1" /> Production in Progress</Badge>;
      case 'READY_FOR_QA_REVIEW':
        return <Badge className="bg-indigo-50 text-indigo-600 border-indigo-100 rounded-full px-3 py-1 font-medium"><ShieldCheck className="w-3 h-3 mr-1" /> Ready for QA Review</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 rounded-full px-3 py-1 font-medium"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'RETURNED':
        return (
          <ReturnBadge 
            status="RETURNED"
            returnCount={(batch as any)?.returnCount}
            returnReason={(batch as any)?.returnReason}
            returnedBy={(batch as any)?.returnedByEmail || (batch as any)?.returnedBy}
          />
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return <LoadingPage label="Loading batch record..." />;
  }

  if (!batch) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-6">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">Batch Record Not Found</h2>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">
            The requested batch issuance record could not be found or you may not have authorization for this branch.
          </p>
        </div>
        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={() => navigate('/batch-sheet-records/status')} className="rounded-full px-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Status List
          </Button>
          <Button onClick={fetchData} className="rounded-full px-6 bg-indigo-600 hover:bg-indigo-700 text-white">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Resolve product stage and process lookups
  const selectedStageCode = batch.recordInfo?.masterSnapshot?.stage || productMaster?.stage;
  const selectedTypeCode = batch.recordInfo?.masterSnapshot?.type || productMaster?.type;

  const stageLookup = masters.find(m => m.type === 'stage' && (m.code === selectedStageCode || m.name === selectedStageCode));
  const processLookup = masters.find(m => m.type === 'process' && (m.code === selectedTypeCode || m.name === selectedTypeCode));

  // Helper to resolve user's display details
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

  // Step 1: Initiate Request
  const step1Timeline = timeline.find((t: any) => t.action === 'CREATE' || t.action === 'ISSUE_BATCH' || t.newStatus === 'DRAFT' || t.newStatus === 'PENDING_REVIEW') || timeline[0];
  const step1DateStr = step1Timeline ? new Date(step1Timeline.timestamp).toLocaleString() : (batch.createdAt ? new Date(batch.createdAt).toLocaleString() : 'N/A');
  const step1UserAndId = step1Timeline 
    ? resolveUser(step1Timeline.userEmail || step1Timeline.userId, batch.issuedByName) 
    : resolveUser(batch.issuedBy || batch.issuedByName, batch.issuedByName || 'Akshay Sharma');

  // Step 2 & 3: QA Review & Sign-off
  const step2Timeline = timeline.find((t: any) => t.action === 'APPROVE' || t.action === 'APPROVE_BATCH' || t.newStatus === 'APPROVED' || t.newStatus === 'REJECTED');
  const step2Completed = !!step2Timeline || !['DRAFT', 'PENDING_REVIEW'].includes(batch.status);
  const step2Active = batch.status === 'PENDING_REVIEW';
  const step2DateStr = step2Completed 
    ? (step2Timeline ? new Date(step2Timeline.timestamp).toLocaleString() : new Date(batch.updatedAt || batch.createdAt).toLocaleString())
    : 'N/A';
  const step2UserAndId = step2Completed
    ? (step2Timeline ? resolveUser(step2Timeline.userEmail || step2Timeline.userId, 'QA Reviewer') : resolveUser(batch.updatedBy, 'QA Reviewer'))
    : { employeeId: 'N/A', username: step2Active ? 'Awaiting QA' : 'N/A' };

  const step3Completed = step2Completed;
  const step3Active = step2Active;
  const step3DateStr = step2DateStr;
  const step3UserAndId = step2UserAndId;

  // Step 4: Batch Sheet Issuance
  const step4Timeline = timeline.find((t: any) => t.newStatus === 'ISSUED' || t.action === 'ISSUE' || t.action === 'ISSUE_BATCH');
  const step4Completed = !!step4Timeline || !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED'].includes(batch.status);
  const step4Active = batch.status === 'APPROVED';
  const step4DateStr = step4Completed
    ? (step4Timeline ? new Date(step4Timeline.timestamp).toLocaleString() : new Date(batch.createdAt).toLocaleString())
    : 'N/A';
  const step4UserAndId = step4Completed
    ? (step4Timeline ? resolveUser(step4Timeline.userEmail || step4Timeline.userId, batch.issuedByName) : resolveUser(batch.issuedBy || batch.issuedByName, batch.issuedByName || 'Akshay Sharma'))
    : { employeeId: 'N/A', username: step4Active ? 'Awaiting Issuance' : 'N/A' };

  // Step 5: Ready for Production Handover
  const step5Timeline = timeline.find((t: any) => t.newStatus === 'READY_FOR_PRODUCTION_HANDOVER');
  const step5Completed = !!step5Timeline || !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER'].includes(batch.status);
  const step5Active = batch.status === 'READY_FOR_PRODUCTION_HANDOVER';
  const step5DateStr = step5Completed
    ? (step5Timeline ? new Date(step5Timeline.timestamp).toLocaleString() : (batch.updatedAt ? new Date(batch.updatedAt).toLocaleString() : 'N/A'))
    : 'N/A';
  const step5UserAndId = step5Completed
    ? (step5Timeline ? resolveUser(step5Timeline.userEmail || step5Timeline.userId, 'QA Officer') : resolveUser(batch.updatedBy, 'QA Officer'))
    : { employeeId: 'N/A', username: step5Active ? 'Awaiting Handover' : 'N/A' };

  // Step 6: Handover to Production
  const step6Timeline = timeline.find((t: any) => t.newStatus === 'HANDED_OVER');
  const step6Completed = !!step6Timeline || !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER'].includes(batch.status);
  const step6Active = batch.status === 'HANDED_OVER';
  const step6DateStr = step6Completed
    ? (step6Timeline ? new Date(step6Timeline.timestamp).toLocaleString() : (batch.updatedAt ? new Date(batch.updatedAt).toLocaleString() : 'N/A'))
    : 'N/A';
  const step6UserAndId = step6Completed
    ? (step6Timeline ? resolveUser(step6Timeline.userEmail || step6Timeline.userId, 'QA Officer') : resolveUser(batch.updatedBy, 'QA Officer'))
    : { employeeId: 'N/A', username: step6Active ? 'Awaiting Collection' : 'N/A' };

  // Step 7: Received by Production & In Progress
  const step7Timeline = timeline.find((t: any) => t.newStatus === 'PRODUCTION_IN_PROGRESS');
  const step7Completed = !!step7Timeline || !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER', 'PRODUCTION_IN_PROGRESS'].includes(batch.status);
  const step7Active = batch.status === 'PRODUCTION_IN_PROGRESS';
  const step7DateStr = step7Completed
    ? (step7Timeline ? new Date(step7Timeline.timestamp).toLocaleString() : (batch.updatedAt ? new Date(batch.updatedAt).toLocaleString() : 'N/A'))
    : 'N/A';
  const step7UserAndId = step7Completed
    ? (step7Timeline ? resolveUser(step7Timeline.userEmail || step7Timeline.userId, 'Production Operator') : resolveUser(batch.updatedBy, 'Production Operator'))
    : { employeeId: 'N/A', username: step7Active ? 'Production in Progress' : 'N/A' };

  // Step 8: Sent back for QA Review
  const step8Timeline = timeline.find((t: any) => t.newStatus === 'READY_FOR_QA_REVIEW');
  const step8Completed = !!step8Timeline || ['COMPLETED'].includes(batch.status);
  const step8Active = batch.status === 'READY_FOR_QA_REVIEW';
  const step8DateStr = step8Completed
    ? (step8Timeline ? new Date(step8Timeline.timestamp).toLocaleString() : (batch.updatedAt ? new Date(batch.updatedAt).toLocaleString() : 'N/A'))
    : 'N/A';
  const step8UserAndId = step8Completed
    ? (step8Timeline ? resolveUser(step8Timeline.userEmail || step8Timeline.userId, 'QA Reviewer') : resolveUser(batch.updatedBy, 'QA Reviewer'))
    : { employeeId: 'N/A', username: step8Active ? 'Awaiting QA Received' : 'N/A' };

  // Step 9: Final Completion
  const step9Timeline = timeline.find((t: any) => t.newStatus === 'COMPLETED' || t.action === 'COMPLETE');
  const step9Completed = !!step9Timeline || batch.status === 'COMPLETED';
  const step9Active = batch.status === 'READY_FOR_QA_REVIEW';
  const step9DateStr = step9Completed
    ? (step9Timeline ? new Date(step9Timeline.timestamp).toLocaleString() : (batch.completedAt ? new Date(batch.completedAt).toLocaleString() : 'N/A'))
    : 'N/A';
  const step9UserAndId = step9Completed
    ? (step9Timeline ? resolveUser(step9Timeline.userEmail || step9Timeline.userId, 'QA Reviewer') : resolveUser(batch.completedBy || batch.updatedBy, 'QA Reviewer'))
    : { employeeId: 'N/A', username: step9Active ? 'Awaiting Final Verification' : 'N/A' };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/batch-sheet-records/status')}
            className="rounded-full hover:bg-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{batch.batchNumber}</h1>
              {getStatusBadge(batch.status)}
            </div>
            <p className="text-slate-500 flex items-center gap-2">
              <Package className="w-4 h-4" />
              {productMaster?.title}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {(['PENDING_REVIEW', 'APPROVED', 'ISSUED', 'IN_PROGRESS', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER', 'PRODUCTION_IN_PROGRESS', 'READY_FOR_QA_REVIEW', 'COMPLETED'].includes(batch.status)) && (
            <Button 
              variant="outline" 
              onClick={handlePreviewPDF}
              disabled={generatingPreview}
              className="rounded-full border-slate-200 text-slate-700 hover:bg-slate-50 h-12 px-6 font-bold shadow-sm"
            >
              {generatingPreview ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-2 text-indigo-600" />
              )}
              Preview PDF
            </Button>
          )}

          {batch.status === 'ISSUED' && (user?.permissions?.includes('batch:print') || user?.permissions?.includes('op:issued') || getUserBaseRole(user) === 'ADMIN') && (
            <Button 
              variant="outline" 
              onClick={() => {
                const el = document.getElementById('sequential-printing-section');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
                } else {
                  handlePrintBatchSheet();
                }
              }}
              disabled={printing}
              className="rounded-full px-6 h-12 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold shadow-sm"
            >
              <Printer className="w-4 h-4 mr-2 text-indigo-600" />
              Sequential Printing ({(batch.batchSheets || []).filter(s => s.status === 'PRINTED' || s.status === 'REPRINTED').length}/{(batch.batchSheets || []).length || 1})
            </Button>
          )}

          {batch.status === 'READY_FOR_PRODUCTION_HANDOVER' && (user?.permissions?.includes('batch:approve') || user?.permissions?.includes('batch:review') || user?.permissions?.includes('op:ready_for_handover') || user?.permissions?.includes('batch:print') || getUserBaseRole(user) === 'ADMIN' || getUserBaseRole(user) === 'QA') && (
            <Button 
              onClick={handleHandoverToProduction}
              disabled={updatingStatus}
              className="rounded-full px-6 h-12 bg-orange-600 text-white hover:bg-orange-700 font-bold"
            >
              {updatingStatus ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Handover to Production
            </Button>
          )}

          {batch.status === 'HANDED_OVER' && (user?.permissions?.includes('batch:sign') || user?.permissions?.includes('batch:create') || user?.permissions?.includes('op:production_in_progress') || getUserBaseRole(user) === 'ADMIN' || getUserBaseRole(user) === 'PRODUCTION_MANAGER' || getUserBaseRole(user) === 'OPERATOR') && (
            <Button 
              onClick={handleProductionReceived}
              disabled={updatingStatus}
              className="rounded-full px-6 h-12 bg-emerald-600 text-white hover:bg-emerald-700 font-bold"
            >
              {updatingStatus ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Received
            </Button>
          )}

          {batch.status === 'PRODUCTION_IN_PROGRESS' && (user?.permissions?.includes('batch:sign') || user?.permissions?.includes('batch:edit') || user?.permissions?.includes('op:ready_for_qa_review') || user?.permissions?.includes('op:production_in_progress') || getUserBaseRole(user) === 'ADMIN' || getUserBaseRole(user) === 'PRODUCTION_MANAGER' || getUserBaseRole(user) === 'OPERATOR') && (
            <Button 
              onClick={handleBatchSheetFilled}
              disabled={updatingStatus}
              className="rounded-full px-6 h-12 bg-amber-600 text-white hover:bg-amber-700 font-bold"
            >
              {updatingStatus ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Send back For QA Review
            </Button>
          )}

          {batch.status === 'READY_FOR_QA_REVIEW' && (
            <>
              {(user?.permissions?.includes('batch:review') || user?.permissions?.includes('batch:approve') || user?.permissions?.includes('op:completed') || getUserBaseRole(user) === 'ADMIN' || getUserBaseRole(user) === 'QA') && (
                <Button 
                  onClick={handleBatchSheetReviewed}
                  disabled={updatingStatus}
                  className="rounded-full px-6 h-12 bg-indigo-600 text-white hover:bg-indigo-700 font-bold"
                >
                  {updatingStatus ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  QA Received
                </Button>
              )}
              {(user?.permissions?.includes('batch:review') || user?.permissions?.includes('batch:approve') || user?.permissions?.includes('op:return_for_correction') || getUserBaseRole(user) === 'ADMIN' || getUserBaseRole(user) === 'QA') && (
                <Button 
                  onClick={handleReturnForCorrection}
                  disabled={updatingStatus}
                  variant="outline"
                  className="rounded-full px-6 h-12 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold"
                >
                  {updatingStatus ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Return for Correction
                </Button>
              )}
            </>
          )}
          
          {batch.status === 'RETURNED' && (
            <Button 
              onClick={handleResubmit}
              disabled={resubmitting}
              className="rounded-full px-6 h-12 bg-amber-600 text-white hover:bg-amber-700 font-bold shadow-lg shadow-amber-100"
            >
              {resubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              Resubmit for QA Review
            </Button>
          )}

          {batch.status === 'PENDING_REVIEW' && (user?.permissions?.includes('batch:review') || user?.permissions?.includes('batch:approve') || getUserBaseRole(user) === 'ADMIN') && (
            <Button 
              variant="default" 
              onClick={() => navigate('/batch-sheet-records/status')}
              className="rounded-full px-8 h-12 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
            >
              Go to Approval
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-6 h-6 text-indigo-600" />
                Batch Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Product Stage</Label>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100">
                      <Layers className="w-4 h-4 text-indigo-500" />
                      <span>{selectedStageCode || 'N/A'}</span>
                    </div>
                    {stageLookup && (
                      <div className="text-xs text-indigo-600 font-semibold bg-indigo-50/50 px-3 py-2 rounded-xl border border-indigo-100/30">
                        <span className="font-extrabold block text-[9px] uppercase tracking-wider text-indigo-400 mb-0.5">Linked Stage Lookup</span>
                        {stageLookup.code} - {stageLookup.name || 'Active Master'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Manufacturing Process</Label>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100">
                      <Package className="w-4 h-4 text-emerald-500" />
                      <span>{selectedTypeCode || 'N/A'}</span>
                    </div>
                    {processLookup && (
                      <div className="text-xs text-emerald-600 font-semibold bg-emerald-50/50 px-3 py-2 rounded-xl border border-emerald-100/30">
                        <span className="font-extrabold block text-[9px] uppercase tracking-wider text-emerald-400 mb-0.5">Linked Process Lookup</span>
                        {processLookup.code} - {processLookup.name || 'Active Master'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Batch Number Series</Label>
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <span>{batch.dropdownBatchSeries || productMaster?.batchNumberSeries || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Batch Number Sheets Requested</Label>
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100">
                    <ClipboardList className="w-4 h-4 text-indigo-500" />
                    <span>{batch.batchNumberSeries || batch.batchNumber || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Issued By</Label>
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100 max-w-sm">
                    <UserCheck className="w-4 h-4 text-slate-400" />
                    <span>{batch.issuedByName || 'Akshay Sharma'}</span>
                  </div>
                </div>

                {batch.reprintReason && (
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs font-bold text-rose-500 uppercase tracking-wider block">Reason for Re-Print</Label>
                    <div className="text-rose-900 bg-rose-50/50 p-4 rounded-xl border border-rose-100 font-medium text-xs whitespace-pre-wrap">
                      {batch.reprintReason}
                    </div>
                  </div>
                )}

                {batch.comments && (
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Request Comments</Label>
                    <div className="text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-100 font-medium text-xs whitespace-pre-wrap">
                      {batch.comments}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sequential Individual Batch Sheet Printing Section */}
          {['ISSUED', 'IN_PROGRESS', 'READY_FOR_PRODUCTION_HANDOVER', 'PRODUCTION_IN_PROGRESS', 'READY_FOR_QA_REVIEW', 'COMPLETED'].includes(batch.status) && (
            <div id="sequential-printing-section">
              <SequentialPrintManager
                batch={batch}
                productMaster={productMaster}
                onBatchUpdated={fetchData}
              />
            </div>
          )}

          {/* Workflow Chart of the Batch Sheet Issuance Process */}
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-indigo-600" />
                Batch Sheet Issuance Workflow Chart
              </CardTitle>
              <CardDescription className="text-slate-500">
                Visual interactive chart mapping compliance track under 21 CFR Part 11 requirements.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <div className="relative pl-8 space-y-8 before:absolute before:left-8 before:top-5 before:bottom-5 before:w-[3px] before:bg-slate-100/80">
                
                {/* Step 1: Request Initiation */}
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 shrink-0",
                    "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
                  )}>
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">1. Initiate Request</h4>
                      <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9px] font-bold w-fit">COMPLETED</Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">Product & process template configured.</p>
                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                      <div>
                        <span className="text-slate-400 font-medium block">Performed On</span>
                        <span className="text-slate-700 font-bold block">{step1DateStr}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium block">Performed By</span>
                        <span className="text-slate-700 font-bold block">
                          {step1UserAndId.employeeId !== 'N/A' ? `${step1UserAndId.employeeId} - ` : ''}{step1UserAndId.username}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: QA Review */}
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 shrink-0",
                    batch.status === 'DRAFT'
                      ? "bg-slate-50 border-slate-200 text-slate-400"
                      : batch.status === 'PENDING_REVIEW'
                      ? "bg-amber-50 border-amber-500 text-amber-600 animate-pulse shadow-md shadow-amber-100"
                      : "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
                  )}>
                    <Clock className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">2. QA Review</h4>
                      <Badge className={cn(
                        "border-none text-[9px] font-bold w-fit",
                        batch.status === 'DRAFT' 
                          ? "bg-slate-100 text-slate-500"
                          : batch.status === 'PENDING_REVIEW'
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      )}>
                        {batch.status === 'DRAFT' ? 'UPCOMING' : batch.status === 'PENDING_REVIEW' ? 'ACTIVE' : 'COMPLETED'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">Verify documentation & GMP compliance.</p>
                    {step2Completed ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium block">Performed On</span>
                          <span className="text-slate-700 font-bold block">{step2DateStr}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Performed By</span>
                          <span className="text-slate-700 font-bold block">
                            {step2UserAndId.employeeId !== 'N/A' ? `${step2UserAndId.employeeId} - ` : ''}{step2UserAndId.username}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5 font-medium">
                        <span className={cn("w-1.5 h-1.5 rounded-full", step2Active ? "bg-amber-500 animate-ping" : "bg-slate-300")} />
                        {step2Active ? 'Currently awaiting review by QA department' : 'Upcoming step in sequence'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 3: Authorization Sign-off */}
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 shrink-0",
                    (batch.status === 'DRAFT' || batch.status === 'PENDING_REVIEW')
                      ? "bg-slate-50 border-slate-200 text-slate-400"
                      : batch.status === 'APPROVED'
                      ? "bg-indigo-50 border-indigo-500 text-indigo-600 animate-pulse shadow-md shadow-indigo-100"
                      : "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
                  )}>
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">3. Sign-off</h4>
                      <Badge className={cn(
                        "border-none text-[9px] font-bold w-fit",
                        (batch.status === 'DRAFT' || batch.status === 'PENDING_REVIEW')
                          ? "bg-slate-100 text-slate-500"
                          : batch.status === 'APPROVED'
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-emerald-100 text-emerald-800"
                      )}>
                        {(batch.status === 'DRAFT' || batch.status === 'PENDING_REVIEW') ? 'UPCOMING' : batch.status === 'APPROVED' ? 'ACTIVE' : 'COMPLETED'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">Part 11 password digital e-signatures.</p>
                    {step3Completed ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium block">Performed On</span>
                          <span className="text-slate-700 font-bold block">{step3DateStr}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Performed By</span>
                          <span className="text-slate-700 font-bold block">
                            {step3UserAndId.employeeId !== 'N/A' ? `${step3UserAndId.employeeId} - ` : ''}{step3UserAndId.username}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5 font-medium">
                        <span className={cn("w-1.5 h-1.5 rounded-full", step3Active ? "bg-indigo-500 animate-ping" : "bg-slate-300")} />
                        {step3Active ? 'Awaiting secure electronic signoff passphrase' : 'Upcoming step in sequence'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 4: Batch Sheet Issuance */}
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 shrink-0",
                    batch.status === 'ISSUED'
                      ? "bg-indigo-50 border-indigo-500 text-indigo-600 animate-pulse shadow-md shadow-indigo-100"
                      : (batch.status === 'IN_PROGRESS' || batch.status === 'COMPLETED')
                      ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
                      : "bg-slate-50 border-slate-200 text-slate-400"
                  )}>
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">4. Sheet Issued</h4>
                      <Badge className={cn(
                        "border-none text-[9px] font-bold w-fit",
                        batch.status === 'ISSUED'
                          ? "bg-indigo-100 text-indigo-800"
                          : ['IN_PROGRESS', 'READY_FOR_PRODUCTION_HANDOVER', 'READY_FOR_QA_REVIEW', 'COMPLETED'].includes(batch.status)
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {batch.status === 'ISSUED' ? 'ACTIVE' : ['IN_PROGRESS', 'READY_FOR_PRODUCTION_HANDOVER', 'READY_FOR_QA_REVIEW', 'COMPLETED'].includes(batch.status) ? 'COMPLETED' : 'UPCOMING'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">Unique batch number is locked & issued.</p>
                    {step4Completed ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium block">Performed On</span>
                          <span className="text-slate-700 font-bold block">{step4DateStr}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Performed By</span>
                          <span className="text-slate-700 font-bold block">
                            {step4UserAndId.employeeId !== 'N/A' ? `${step4UserAndId.employeeId} - ` : ''}{step4UserAndId.username}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5 font-medium">
                        <span className={cn("w-1.5 h-1.5 rounded-full", step4Active ? "bg-indigo-500 animate-ping" : "bg-slate-300")} />
                        {step4Active ? 'Ready to release batch sheet issuance' : 'Upcoming step in sequence'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 5: Batch Sheet Ready for Receiving */}
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 shrink-0",
                    !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER'].includes(batch.status)
                      ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
                      : batch.status === 'READY_FOR_PRODUCTION_HANDOVER'
                      ? "bg-slate-50 border-orange-500 text-orange-600 animate-pulse shadow-md shadow-orange-50"
                      : "bg-slate-50 border-slate-200 text-slate-400"
                  )}>
                    <Printer className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">5. Batch Sheet Ready for Receiving</h4>
                      <Badge className={cn(
                        "border-none text-[9px] font-bold w-fit",
                        !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER'].includes(batch.status)
                          ? "bg-emerald-100 text-emerald-800"
                          : batch.status === 'READY_FOR_PRODUCTION_HANDOVER'
                          ? "bg-orange-100 text-orange-900 animate-pulse"
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {!['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER'].includes(batch.status) ? 'COMPLETED' : batch.status === 'READY_FOR_PRODUCTION_HANDOVER' ? 'ACTIVE' : 'UPCOMING'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">Controlled copy printed by QA, waiting for Handover execution.</p>
                    {step5Completed ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium block">Performed On</span>
                          <span className="text-slate-700 font-bold block">{step5DateStr}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Performed By</span>
                          <span className="text-slate-700 font-bold block">
                            {step5UserAndId.employeeId !== 'N/A' ? `${step5UserAndId.employeeId} - ` : ''}{step5UserAndId.username}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5 font-medium">
                        <span className={cn("w-1.5 h-1.5 rounded-full", step5Active ? "bg-orange-500 animate-ping" : "bg-slate-300")} />
                        {step5Active ? 'Awaiting QA handover execution' : 'Upcoming step in sequence'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 6: Handover to Production */}
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 shrink-0",
                    !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER'].includes(batch.status)
                      ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
                      : batch.status === 'HANDED_OVER'
                      ? "bg-slate-50 border-orange-500 text-orange-600 animate-pulse shadow-md shadow-orange-50"
                      : "bg-slate-50 border-slate-200 text-slate-400"
                  )}>
                    <Play className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">6. Handed Over to Production</h4>
                      <Badge className={cn(
                        "border-none text-[9px] font-bold w-fit",
                        !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER'].includes(batch.status)
                          ? "bg-emerald-100 text-emerald-800"
                          : batch.status === 'HANDED_OVER'
                          ? "bg-orange-100 text-orange-900 animate-pulse"
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {!['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER'].includes(batch.status) ? 'COMPLETED' : batch.status === 'HANDED_OVER' ? 'ACTIVE' : 'UPCOMING'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">Batch sheet handed over by QA, awaiting collection confirmation from Production.</p>
                    {step6Completed ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium block">Performed On</span>
                          <span className="text-slate-700 font-bold block">{step6DateStr}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Performed By</span>
                          <span className="text-slate-700 font-bold block">
                            {step6UserAndId.employeeId !== 'N/A' ? `${step6UserAndId.employeeId} - ` : ''}{step6UserAndId.username}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5 font-medium">
                        <span className={cn("w-1.5 h-1.5 rounded-full", step6Active ? "bg-orange-500 animate-ping" : "bg-slate-300")} />
                        {step6Active ? 'Awaiting collection & signature from Production' : 'Upcoming step in sequence'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 7: Received by Production & In Progress */}
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 shrink-0",
                    !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER', 'PRODUCTION_IN_PROGRESS'].includes(batch.status)
                      ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
                      : batch.status === 'PRODUCTION_IN_PROGRESS'
                      ? "bg-slate-50 border-amber-500 text-amber-600 animate-pulse shadow-md shadow-amber-50"
                      : "bg-slate-50 border-slate-200 text-slate-400"
                  )}>
                    <Layers className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">7. Received & In Progress</h4>
                      <Badge className={cn(
                        "border-none text-[9px] font-bold w-fit",
                        !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER', 'PRODUCTION_IN_PROGRESS'].includes(batch.status)
                          ? "bg-emerald-100 text-emerald-800"
                          : batch.status === 'PRODUCTION_IN_PROGRESS'
                          ? "bg-amber-100 text-amber-900 animate-pulse"
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {!['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'READY_FOR_PRODUCTION_HANDOVER', 'HANDED_OVER', 'PRODUCTION_IN_PROGRESS'].includes(batch.status) ? 'COMPLETED' : batch.status === 'PRODUCTION_IN_PROGRESS' ? 'ACTIVE' : 'UPCOMING'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">Manufacturing process ongoing. Record filled batch sheet values.</p>
                    {step7Completed ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium block">Performed On</span>
                          <span className="text-slate-700 font-bold block">{step7DateStr}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Performed By</span>
                          <span className="text-slate-700 font-bold block">
                            {step7UserAndId.employeeId !== 'N/A' ? `${step7UserAndId.employeeId} - ` : ''}{step7UserAndId.username}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5 font-medium">
                        <span className={cn("w-1.5 h-1.5 rounded-full", step7Active ? "bg-amber-500 animate-ping" : "bg-slate-300")} />
                        {step7Active ? 'Awaiting production completion and QA review submission' : 'Upcoming step in sequence'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 8: Sent back for QA Review */}
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 shrink-0",
                    batch.status === 'COMPLETED'
                      ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
                      : batch.status === 'READY_FOR_QA_REVIEW'
                      ? "bg-slate-50 border-indigo-500 text-indigo-600 animate-pulse shadow-md shadow-indigo-100"
                      : "bg-slate-50 border-slate-200 text-slate-400"
                  )}>
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">8. QA Review</h4>
                      <Badge className={cn(
                        "border-none text-[9px] font-bold w-fit",
                        batch.status === 'COMPLETED'
                          ? "bg-emerald-100 text-emerald-800"
                          : batch.status === 'READY_FOR_QA_REVIEW'
                          ? "bg-indigo-100 text-indigo-800 animate-pulse"
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {batch.status === 'COMPLETED' ? 'COMPLETED' : batch.status === 'READY_FOR_QA_REVIEW' ? 'ACTIVE' : 'UPCOMING'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">Verification of filled parameters & entries by QA officer.</p>
                    {step8Completed ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium block">Performed On</span>
                          <span className="text-slate-700 font-bold block">{step8DateStr}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Performed By</span>
                          <span className="text-slate-700 font-bold block">
                            {step8UserAndId.employeeId !== 'N/A' ? `${step8UserAndId.employeeId} - ` : ''}{step8UserAndId.username}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5 font-medium">
                        <span className={cn("w-1.5 h-1.5 rounded-full", step8Active ? "bg-indigo-500 animate-ping" : "bg-slate-300")} />
                        {step8Active ? 'Awaiting QA Received confirmation' : 'Upcoming step in sequence'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 9: Completed */}
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 shrink-0",
                    batch.status === 'COMPLETED'
                      ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md shadow-emerald-100"
                      : "bg-slate-50 border-slate-200 text-slate-400"
                  )}>
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">9. Final Completion</h4>
                      <Badge className={cn(
                        "border-none text-[9px] font-bold w-fit",
                        batch.status === 'COMPLETED'
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {batch.status === 'COMPLETED' ? 'COMPLETED' : 'UPCOMING'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">Batch records completed, locked, and moved to Completed page.</p>
                    {step9Completed ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium block">Performed On</span>
                          <span className="text-slate-700 font-bold block">{step9DateStr}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Performed By</span>
                          <span className="text-slate-700 font-bold block">
                            {step9UserAndId.employeeId !== 'N/A' ? `${step9UserAndId.employeeId} - ` : ''}{step9UserAndId.username}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5 font-medium">
                        <span className={cn("w-1.5 h-1.5 rounded-full", batch.status === 'READY_FOR_QA_REVIEW' ? "bg-emerald-500 animate-ping" : "bg-slate-300")} />
                        {batch.status === 'READY_FOR_QA_REVIEW' ? 'Awaiting final QA sign-off and complete' : 'Upcoming step in sequence'}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {(batch as any)?.returnHistory && (batch as any).returnHistory.length > 0 && (
            <ReturnHistorySection history={(batch as any).returnHistory} />
          )}

          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-slate-900 text-white">
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold">Compliance Lock</h3>
                  <p className="text-xs text-slate-400">21 CFR Part 11 Compliant</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                This batch record is electronically signed and timestamped. All changes are tracked in the system audit trail.
              </p>
              <Button 
                variant="outline" 
                onClick={() => navigate('/audit')}
                className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl h-12"
              >
                View Audit Trail
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

       {isPreviewOpen && previewUrl && (
        <SecurePDFViewer 
          fileUrl={previewUrl}
          onClose={() => {
            setIsPreviewOpen(false);
            setPreviewUrl(null);
          }}
          title={`Batch Sheet Preview: ${batch.batchNumber}`}
          batchInfo={`Product: ${productMaster?.title || ''} | Stage: ${productMaster?.stage || ''}`}
          batchNo={batch.batchNumberSeries || batch.batchNumber}
          dropdownBatchSeries={(batch as any).dropdownBatchSeries}
          singlePagesBatchNumber={(batch as any).singlePagesBatchNumber}
          issuedBy={batch.issuedByName ? `${batch.issuedByRole || 'ADMIN'} (${batch.issuedByName})` : 'ADMIN (Akshay Sharma)'}
          dateOfIssue={batch.createdAt || batch.manufacturingDate}
          timeOfIssue={batch.createdAt || batch.manufacturingDate}
          printedBy={user ? `${user.displayName || user.username || 'Unknown'} (${user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase() : 'Admin'})` : 'Akshay Sharma (Admin)'}
          printedDateTime={new Date().toISOString()}
          requestId={formatRequestId(
            batch.batchNumberSeries || batch.batchNumber,
            batch.createdAt || batch.manufacturingDate,
            productMaster?.title || productMaster?.batchNumberSeries,
            batch.id
          )}
          mode="batch"
          batchStatus={batch.status}
        />
      )}

      {isSignatureOpen && (
        <SignatureDialog
          isOpen={isSignatureOpen}
          onClose={() => {
            setIsSignatureOpen(false);
            setSignatureAction(null);
          }}
          onConfirm={handleSignatureConfirm}
          title={
            signatureAction === 'PRINT' ? "Electronic Signature - Print Batch Sheet" :
            signatureAction === 'HANDOVER' ? "Electronic Signature - Handover to Production" :
            signatureAction === 'RECEIVED' ? "Electronic Signature - Received by Production" :
            signatureAction === 'FILLED' ? "Electronic Signature - Submit for QA Review" :
            signatureAction === 'REVIEWED' ? "Electronic Signature - QA Received" :
            "Electronic Signature"
          }
          description={
            signatureAction === 'PRINT' ? "Enter your authorization password to certify that you are printing this document as a controlled copy for execution." :
            signatureAction === 'HANDOVER' ? "Enter your authorization password to certify that the batch is being officially handed over to the production team for manufacturing." :
            signatureAction === 'RECEIVED' ? "Enter your authorization password to certify that you have collected and received the physical printed Batch Sheet from the QA officer." :
            signatureAction === 'FILLED' ? "Enter your authorization password to certify that all batch operations have been fully completed and you are sending this batch back for QA Review." :
            signatureAction === 'REVIEWED' ? "Enter your authorization password to certify that you have received the filled batch sheet and verified all records and entries." :
            "Enter your authorization password to authorize this action."
          }
          meaning={
            signatureAction === 'PRINT' ? "Print Batch Sheet & Start Process" :
            signatureAction === 'HANDOVER' ? "Confirm Handover to Production" :
            signatureAction === 'RECEIVED' ? "Confirm & Receive Batch Sheet" :
            signatureAction === 'FILLED' ? "Send back For QA Review" :
            signatureAction === 'REVIEWED' ? "QA Received from Batch Sheet Reviewed" :
            "Confirm Action"
          }
          isLoading={printing || updatingStatus}
        />
      )}

      {batch && (
        <ReturnDialog
          isOpen={isReturnDialogOpen}
          onClose={() => setIsReturnDialogOpen(false)}
          onConfirm={handleConfirmReturn}
          title="RETURN BATCH SHEET FOR CORRECTION"
          recordId={batch.batchNumberSeries || batch.batchNumber || batch.id}
          recordTitle={productMaster?.title || batch.batchNumber}
          entityType="BATCH_ISSUANCE"
          currentStep={batch.status}
          isLoading={updatingStatus}
          requiresESignature={true}
        />
      )}
    </div>
  );
}
