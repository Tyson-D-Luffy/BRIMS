import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ClipboardList, 
  MoreVertical, 
  Eye, 
  Calendar, 
  Package, 
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  RotateCcw,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { BatchIssuance, ProductMaster, BatchSheetMaster, BatchIssuanceStatus, getUserBaseRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '../lib/utils';
import { LoadingPage } from '../components/LoadingSpinner';
import { generateBatchPDF } from '../lib/pdf-generator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileDown } from 'lucide-react';

export default function BatchList() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchIssuance[]>([]);
  const [productMasters, setProductMasters] = useState<ProductMaster[]>([]);
  const [masters, setMasters] = useState<BatchSheetMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    recordId: '',
    manufacturingDate: new Date().toISOString().split('T')[0]
  });

  const { user } = useAuth();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [batchesRes, productsRes] = await Promise.all([
        api.get('/batches'),
        api.get('/product-masters')
      ]);

      if (batchesRes.data.success) setBatches(batchesRes.data.data);
      if (productsRes.data.success) setProductMasters(productsRes.data.data);
    } catch (error: any) {
      console.error('Failed to fetch batches', error);
      const message = error.response?.data?.message || 'Failed to load batch records. Please try again later.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleProductChange = async (productId: string) => {
    setFormData({ ...formData, productId, recordId: '' });
    try {
      // Fetch masters for this product
      const res = await api.get(`/batch-sheet-masters?productId=${productId}`);
      if (res.data.success) {
        setMasters(res.data.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch masters', error);
      const message = error.response?.data?.message || 'Failed to load product masters';
      toast.error(message);
    }
  };

  const handleIssueBatch = async () => {
    if (!formData.recordId || !formData.manufacturingDate) {
      toast.error('Please fill all required fields');
      return;
    }

    setIssuing(true);
    try {
      const response = await api.post('/batches', {
        recordId: formData.recordId,
        manufacturingDate: formData.manufacturingDate
      });

      if (response.data.success) {
        toast.success('Batch issued successfully');
        setIsIssueDialogOpen(false);
        fetchData();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to issue batch');
    } finally {
      setIssuing(false);
    }
  };

  const getStatusBadge = (status: BatchIssuanceStatus) => {
    switch (status) {
      case 'PENDING_REVIEW':
        return <Badge className="bg-amber-50 text-amber-600 border-amber-100 rounded-full px-3 py-1 font-medium"><Clock className="w-3 h-3 mr-1" /> Pending Review</Badge>;
      case 'APPROVED':
        return <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 rounded-full px-3 py-1 font-medium"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
      case 'REJECTED':
        return <Badge className="bg-rose-50 text-rose-600 border-rose-100 rounded-full px-3 py-1 font-medium"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      case 'ISSUED':
        return <Badge className="bg-blue-50 text-blue-600 border-blue-100 rounded-full px-3 py-1 font-medium"><Clock className="w-3 h-3 mr-1" /> Issued</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-amber-50 text-amber-600 border-amber-100 rounded-full px-3 py-1 font-medium"><RotateCcw className="w-3 h-3 mr-1 animate-spin-slow" /> In Progress</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 rounded-full px-3 py-1 font-medium"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'RETURNED':
        return <Badge className="bg-slate-50 text-slate-600 border-slate-200 rounded-full px-3 py-1 font-medium"><AlertCircle className="w-3 h-3 mr-1" /> Returned</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-rose-50 text-rose-600 border-rose-100 rounded-full px-3 py-1 font-medium"><XCircle className="w-3 h-3 mr-1" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredBatches = batches.filter(b => {
    const matchesSearch = b.batchNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
    const matchesProduct = productFilter === 'ALL' || b.productId === productFilter;
    return matchesSearch && matchesStatus && matchesProduct;
  });

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Issued Batch Records</h1>
          <p className="text-slate-500 mt-1">Manage and track manufacturing batch issuance and execution history.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => navigate('/batches')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 h-12 rounded-full shadow-lg shadow-indigo-100"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Batch Request
          </Button>
        </div>
      </header>

      {/* Filters & Search */}
      <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search by Batch Number..." 
                className="pl-11 h-12 rounded-2xl bg-slate-50 border-none focus-visible:ring-indigo-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap gap-3">
              <div className="w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-none">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-slate-400" />
                      <SelectValue placeholder="Status" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="ISSUED">Issued</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="RETURNED">Returned</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-64">
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-none">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-slate-400" />
                      <SelectValue placeholder="Product" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="ALL">All Products</SelectItem>
                    {productMasters.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                variant="ghost" 
                onClick={() => { setSearch(''); setStatusFilter('ALL'); setProductFilter('ALL'); }}
                className="h-12 rounded-2xl px-4 text-slate-500 hover:text-indigo-600"
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Batch Table */}
      <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="pl-8 w-40">Batch Number</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mfg Date</TableHead>
                <TableHead className="pr-8 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <LoadingPage label="Loading batches..." />
                  </TableCell>
                </TableRow>
              ) : filteredBatches.map((batch) => (
                <TableRow 
                  key={batch.id} 
                  className="group hover:bg-slate-50/50 border-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/batches/${batch.id}`)}
                >
                  <TableCell className="pl-8 font-mono font-bold text-slate-900">
                    {batch.batchNumber}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">
                        {productMasters.find(p => p.id === batch.productId)?.title || 'Unknown Product'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {productMasters.find(p => p.id === batch.productId)?.type}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(batch.status)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-white rounded-full px-3 text-[10px] font-bold">
                      {productMasters.find(p => p.id === batch.productId)?.stage || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {new Date(batch.manufacturingDate).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell className="pr-8 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger onClick={(e) => e.stopPropagation()} render={
                          <Button variant="ghost" size="icon" className="rounded-full">
                            <MoreVertical className="w-4 h-4 text-slate-400" />
                          </Button>
                        } />
                        <DropdownMenuContent align="end" className="rounded-xl w-48">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/batches/${batch.id}`); }}>
                            <Eye className="w-4 h-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          {batch.status === 'ISSUED' && (user?.permissions?.includes('batch:print') || getUserBaseRole(user) === 'ADMIN') && (
                            <DropdownMenuItem onClick={(e) => { 
                              e.stopPropagation(); 
                              navigate(`/batches/${batch.id}`);
                              toast.info('Electronic signature required for printing. Redirecting to details...');
                            }}>
                              <FileDown className="w-4 h-4 mr-2" /> Print Batch Sheet
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button variant="ghost" size="icon" className="rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filteredBatches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-slate-400 italic">
                    No batch records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
