import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Download, 
  Printer, 
  FileText, 
  Calendar, 
  Package, 
  Layers,
  ShieldCheck,
  Clock,
  ExternalLink,
  ChevronLeft,
  Share2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { BatchIssuance, ProductMaster } from '../types';
import { getBatchPDFBlob, generateBatchPDF, formatRequestId } from '../lib/pdf-generator';
import { LoadingPage } from '../components/LoadingSpinner';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { SecurePDFViewer } from '../components/SecurePDFViewer';
import { useAuth } from '../context/AuthContext';

export default function BatchReportViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [batch, setBatch] = useState<BatchIssuance | null>(null);
  const [productMaster, setProductMaster] = useState<ProductMaster | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/batches/${id}`);
      if (response.data.success) {
        const batchData = response.data.data;
        setBatch(batchData);
        
        const prodRes = await api.get(`/product-masters/${batchData.productId}`);
        if (prodRes.data.success) {
          const productData = prodRes.data.data;
          setProductMaster(productData);
          
          // Generate PDF preview with user info for watermarking
          const url = await generateBatchPDF(
            batchData, 
            productData, 
            user ? { name: user.displayName || user.username || user.email || 'Unknown', id: user.employeeId || 'N/A' } : undefined
          );
          setPdfUrl(url);

          // Log Audit Event
          try {
            await api.post('/audit', {
              action: 'PDF_PREVIEWED',
              entityType: 'BATCH_REPORT',
              entityId: id,
              details: {
                batchNumber: batchData.batchNumber,
                product: productData.title,
                timestamp: new Date().toISOString()
              }
            });
          } catch (auditErr) {
            console.error("Failed to log audit event", auditErr);
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch batch details', error);
      toast.error('Failed to load report');
      navigate('/batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchData();
    
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [id]);

  const handleDownload = () => {
    if (!batch || !productMaster) return;
    const blob = getBatchPDFBlob(batch, productMaster);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Batch_${batch.batchNumber}_Report.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Report downloaded successfully');
  };

  const handlePrint = () => {
    const iframe = document.getElementById('pdf-viewer-iframe') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  if (loading) return <LoadingPage />;
  if (!batch) return null;

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC]">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(`/batches/${id}`)}
            className="rounded-full hover:bg-slate-100"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Batch Record Report
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              {batch.batchNumber} • {productMaster?.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
            Secure Preview Mode
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main PDF Area */}
        <div className="flex-1 overflow-hidden bg-slate-100 p-8 flex justify-center">
          <div className="w-full max-w-5xl h-full bg-white shadow-2xl rounded-sm overflow-hidden border border-slate-200 relative">
            {pdfUrl ? (
              <SecurePDFViewer 
                fileUrl={pdfUrl}
                onClose={() => navigate(`/batches/${id}`)}
                title={`Batch Report: ${batch.batchNumber}`}
                batchInfo={`${productMaster?.title} | Status: ${batch.status}`}
                batchNo={batch.batchNumberSeries || batch.batchNumber}
                dropdownBatchSeries={(batch as any).dropdownBatchSeries}
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
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                <FileText className="w-16 h-16 opacity-20" />
                <p className="font-medium">Generating preview...</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Batch Details */}
        <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-6 shrink-0">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Batch Summary</h2>
          
          <div className="space-y-6">
            <section>
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Status</Label>
              <Badge 
                className={cn(
                  "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
                  batch.status === 'COMPLETED' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                  batch.status === 'IN_PROGRESS' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                  "bg-slate-50 text-slate-700 border-slate-100"
                )}
              >
                {batch.status}
              </Badge>
            </section>

            <section className="space-y-4">
              <div className="flex items-start gap-3">
                <Package className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product</p>
                  <p className="text-sm font-bold text-slate-900">{productMaster?.title}</p>
                  <p className="text-xs text-slate-500">{productMaster?.title?.substring(0, 10).toUpperCase() || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Layers className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stage</p>
                  <p className="text-sm font-bold text-slate-900">{productMaster?.stage || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dates</p>
                  <div className="space-y-1 mt-1">
                    <div className="flex justify-between gap-4">
                      <span className="text-[10px] text-slate-500">MFG:</span>
                      <span className="text-[10px] font-bold text-slate-700">{new Date(batch.manufacturingDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[10px] text-slate-500">EXP:</span>
                      <span className="text-[10px] font-bold text-slate-700">{new Date(batch.endDate || batch.expiryDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timeline</p>
                  <div className="space-y-2 mt-2">
                    <div className="relative pl-4 border-l-2 border-slate-100">
                      <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-indigo-500" />
                      <p className="text-[10px] font-bold text-slate-700">Issued</p>
                      <p className="text-[9px] text-slate-500">{new Date(batch.createdAt).toLocaleString()}</p>
                    </div>
                    {batch.startedAt && (
                      <div className="relative pl-4 border-l-2 border-slate-100">
                        <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-indigo-500" />
                        <p className="text-[10px] font-bold text-slate-700">Started</p>
                        <p className="text-[9px] text-slate-500">{new Date(batch.startedAt).toLocaleString()}</p>
                      </div>
                    )}
                    {batch.completedAt && (
                      <div className="relative pl-4 border-l-2 border-slate-100">
                        <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-emerald-500" />
                        <p className="text-[10px] font-bold text-slate-700">Completed</p>
                        <p className="text-[9px] text-slate-500">{new Date(batch.completedAt).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <div className="pt-6 border-t border-slate-100">
              <div className="p-4 bg-slate-50 rounded-2xl flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-indigo-900">Compliance Verified</p>
                  <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">
                    This document is a 21 CFR Part 11 compliant electronic record.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
