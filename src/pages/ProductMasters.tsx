import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Loader2,
  X,
  FileText,
  User,
  Calendar,
  History,
  Send,
  Eye,
  Check,
  RotateCcw,
  ShieldCheck,
  FileSpreadsheet,
  LayoutGrid,
  List
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HighlightText } from '../components/HighlightText';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '../lib/utils';
import { getWorkflowActionStatus } from '../lib/workflowEngine';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ProductMaster, getUserBaseRole } from '../types';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { LoadingPage } from '../components/LoadingSpinner';
import { SignatureDialog } from '../components/SignatureDialog';
import { validateBatchNumber } from '../lib/batchValidation';

const productSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  type: z.string().optional().default(''),
  stage: z.string().optional(),
  batchNumberSeries: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  changeReason: z.string().optional().refine(val => !val || val.length >= 5, {
    message: 'Reason for change must be at least 5 characters'
  }),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function ProductMasters() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [activeProcesses, setActiveProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tabs representing different review workflow stages
  const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'pending_review' | 'pending_approval' | 'active' | 'rejected'>('active');
  const [sortBy, setSortBy] = useState<string>('latest');
  const [viewMode, setViewMode] = useState<'tiles' | 'list'>('tiles');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductMaster | null>(null);
  
  // Deactivation mechanics
  const [productToDelete, setProductToDelete] = useState<ProductMaster | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Specifications & Detail modal mechanics
  const [viewingProduct, setViewingProduct] = useState<ProductMaster | null>(null);
  const [workflowActionLoading, setWorkflowActionLoading] = useState(false);
  const [workflowComments, setWorkflowComments] = useState('');
  const [isWorkflowCommentsOpen, setIsWorkflowCommentsOpen] = useState(false);
  const [pendingActionType, setPendingActionType] = useState<'submit' | 'start-review' | 'approve' | 'reject' | 'return-correction' | 'forward-review' | null>(null);

  // E-Signatures Dialog
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [sigDialogConfig, setSigDialogConfig] = useState({
    title: '',
    description: '',
    meaning: '',
  });

  const form = useForm<any>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      title: '',
      type: '',
      stage: '',
      batchNumberSeries: '',
      description: '',
      status: 'active',
      changeReason: '',
    },
  });



  const getProcessLabel = (code: string) => {
    const pm = activeProcesses.find(p => p.code === code);
    return pm && pm.name ? `${pm.code} - ${pm.name}` : code;
  };

  const fetchActiveProcesses = async () => {
    try {
      const response = await api.get('/batch-number-engine/masters');
      if (response.data.success) {
        const processes = response.data.data.filter((m: any) => m.type === 'process' && m.status === 'ACTIVE');
        setActiveProcesses(processes);
      }
    } catch (error) {
      console.error('Failed to fetch active processes', error);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await api.get('/product-masters');
      if (response.data.success) {
        setProducts(response.data.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch products', error);
      toast.error(error.response?.data?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchActiveProcesses();
  }, []);

  // Filter products locally on active tab and search query to provide ultra-fast dynamic interaction
  const filteredProducts = products.filter(p => {
    const searchLower = searchQuery.toLowerCase().trim();
    const titleMatch = !searchLower || 
      (p.title || "").toLowerCase().includes(searchLower) ||
      (p.description || "").toLowerCase().includes(searchLower) ||
      (p.batchNumberSeries || "").toLowerCase().includes(searchLower) ||
      (p.type || "").toLowerCase().includes(searchLower) ||
      (p.stage || "").toLowerCase().includes(searchLower) ||
      (p.createdByEmail || "").toLowerCase().includes(searchLower) ||
      (p.workflowStatus || "").toLowerCase().includes(searchLower);
    
    let matchesTab = true;
    const wStatus = p.workflowStatus || "Active"; // Fallback to Active for existing master records

    if (activeTab === 'draft') {
      matchesTab = wStatus === 'Draft';
    } else if (activeTab === 'pending_review') {
      matchesTab = wStatus === 'Pending for Review';
    } else if (activeTab === 'pending_approval') {
      matchesTab = wStatus === 'Under Review';
    } else if (activeTab === 'active') {
      matchesTab = wStatus === 'Active' || p.status === 'active' && wStatus !== 'Obsolete';
    } else if (activeTab === 'rejected') {
      matchesTab = wStatus === 'Rejected' || wStatus === 'Returned for Correction';
    }

    return titleMatch && matchesTab;
  });

  const sortedAndFilteredProducts = useMemo(() => {
    if (activeTab !== 'active') return filteredProducts;
    return [...filteredProducts].sort((a, b) => {
      if (sortBy === 'a-z') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'z-a') {
        return (b.title || '').localeCompare(a.title || '');
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      // default 'latest'
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filteredProducts, sortBy, activeTab]);

  const onSubmit = async (values: ProductFormValues) => {
    const baseRole = getUserBaseRole(user);
    const isAuthorizedRole = 
      baseRole === 'ADMIN' || 
      ['QA_CHEMIST', 'QA_INCHARGE', 'QA_MANAGER', 'QA'].includes(baseRole) || 
      ['PRODUCTION_INCHARGE', 'PRODUCTION_MANAGER'].includes(baseRole) || 
      user?.permissions?.includes('create:product') ||
      user?.permissions?.includes('edit:product') ||
      user?.email?.toLowerCase() === 'shakshay04@gmail.com';
    
    const userPermissions = user?.permissions || [];
    if (editingProduct) {
      if (!isAuthorizedRole && !userPermissions.includes('edit:product')) {
        toast.error("Access Denied: You do not have 'Edit Product Master' permission.");
        return;
      }
    } else {
      if (!isAuthorizedRole && !userPermissions.includes('create:product')) {
        toast.error("Access Denied: You do not have 'Create Product Master' permission.");
        return;
      }
    }
    try {
      if (editingProduct) {
        const updatePayload = {
          ...values,
          changeReason: values.changeReason || 'Updated product details'
        };
        await api.put(`/product-masters/${editingProduct.id}`, updatePayload);
        toast.success(
          editingProduct.workflowStatus === 'Active' 
            ? 'Product Master edited! New Draft Revision created for approval workflow.' 
            : 'Draft Product Master updated successfully.'
        );
      } else {
        const { changeReason, ...createPayload } = values;
        console.log('ProductMasters: Creating new product as draft with payload:', createPayload);
        await api.post('/product-masters', createPayload);
        toast.success('Product Master draft registered successfully! Submit for review when ready.');
      }
      setIsDialogOpen(false);
      setEditingProduct(null);
      form.reset();
      fetchProducts();
    } catch (error: any) {
      console.error('Failed to save product:', error);
      let serverMessage = 'Failed to save product. Please try again.';
      if (error.response?.data) {
        if (error.response.data.message) {
          serverMessage = error.response.data.message;
        } else if (error.response.data.error === "Validation Error" && Array.isArray(error.response.data.details)) {
          serverMessage = `Validation Error: ${error.response.data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ')}`;
        } else if (error.response.data.error) {
          serverMessage = error.response.data.error;
        }
      }
      toast.error(serverMessage);
    }
  };

  const handleDelete = async (password?: string) => {
    if (!productToDelete) return;
    const baseRole = getUserBaseRole(user);
    const isAuthorizedRole = 
      baseRole === 'ADMIN' || 
      ['QA_CHEMIST', 'QA_INCHARGE', 'QA_MANAGER', 'QA'].includes(baseRole) || 
      ['PRODUCTION_INCHARGE', 'PRODUCTION_MANAGER'].includes(baseRole) || 
      user?.permissions?.includes('product:deactivate') ||
      user?.permissions?.includes('edit:product') ||
      user?.email?.toLowerCase() === 'shakshay04@gmail.com';
    
    const userPermissions = user?.permissions || [];
    if (!isAuthorizedRole && !userPermissions.includes('product:deactivate') && !userPermissions.includes('edit:product')) {
      toast.error("Access Denied: You do not have 'Deactivate Product Master' or 'Edit Product Master' permission.");
      return;
    }
    if (deleteReason.length < 5) {
      toast.error('Reason for deactivation must be at least 5 characters');
      return;
    }

    if (!password) {
      setSigDialogConfig({
        title: 'Confirm Deactivation',
        description: `You are deactivating the product "${productToDelete?.title}". This requires an electronic signature.`,
        meaning: 'I certify that I am deactivating this product. This action is logged.',
      });
      setShowSignatureDialog(true);
      return;
    }

    setIsDeleting(true);
    try {
      await api.delete(`/product-masters/${productToDelete.id}`, {
        data: { 
          changeReason: deleteReason,
          password
        }
      });
      toast.success('Product deactivated successfully');
      setProductToDelete(null);
      setDeleteReason('');
      setShowSignatureDialog(false);
      fetchProducts();
    } catch (error: any) {
      console.error('Deactivation error:', error);
      toast.error(error.response?.data?.message || 'Failed to deactivate product. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Triggers the workflow actions & popups
   */
  const handleWorkflowAction = async (
    action: 'submit' | 'start-review' | 'approve' | 'reject' | 'return-correction' | 'forward-review', 
    password?: string,
    targetProduct?: ProductMaster
  ) => {
    const product = targetProduct || viewingProduct;
    if (!product) return;

    // Check permissions
    const baseRole = getUserBaseRole(user);
    const isSystemAdmin = baseRole === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com';
    const userPermissions = user?.permissions || [];
    
    if (!isSystemAdmin) {
      if (action === 'submit') {
        if (!userPermissions.includes('product:submit')) {
          toast.error("Access Denied: You do not have 'Submit Product Master (GAMP Review)' permission.");
          return;
        }
      } else if (action === 'start-review') {
        if (!userPermissions.includes('product:review')) {
          toast.error("Access Denied: You do not have 'Review Product Master' permission.");
          return;
        }
      } else if (action === 'forward-review') {
        if (!userPermissions.includes('product:review')) {
          toast.error("Access Denied: You do not have 'Review Product Master' permission.");
          return;
        }
      } else if (action === 'approve') {
        if (!userPermissions.includes('product:approve')) {
          toast.error("Access Denied: You do not have 'Approve Product Master' permission.");
          return;
        }
      } else if (action === 'reject') {
        if (!userPermissions.includes('product:reject') && !userPermissions.includes('product:review')) {
          toast.error("Access Denied: You do not have 'Reject Product Master' permission.");
          return;
        }
      } else if (action === 'return-correction') {
        if (!userPermissions.includes('product:return') && !userPermissions.includes('product:review')) {
          toast.error("Access Denied: You do not have 'Return Product Master' permission.");
          return;
        }
      } else {
        if (!userPermissions.includes('product:review')) {
          toast.error("Access Denied: You do not have 'Review Product Master' permission.");
          return;
        }
      }
    }

    if (!password) {
      setPendingActionType(action);
      let title = '';
      let description = '';
      let meaning = '';

      if (action === 'submit') {
        title = "Confirm Specification Submission";
        description = `You are performing an electronic signature to formally submit Product Master specifications for "${product.title}" version V${product.version || 1}.`;
        meaning = "I confirm that this Product Master is accurate and ready for review. This action is electronic signature under 21 CFR Part 11 and GAMP guidelines.";
      } else if (action === 'start-review') {
        title = "Confirm Review Acquisition";
        description = `You are performing an electronic signature to formally acquire and begin reviewing Product Master specifications for "${product.title}" version V${product.version || 1}.`;
        meaning = "I confirm that I am acquiring and beginning the formal review of this Product Master record. This action represents my electronic signature under 21 CFR Part 11.";
      } else if (action === 'forward-review') {
        title = "Confirm GAMP GxP Review";
        description = `You are performing an electronic signature to recommend approval of Product Master "${product.title}" version V${product.version || 1}.`;
        meaning = "I confirm that I have reviewed this Product Master and am recording my recommendation/decision. This action is electronic signature under 21 CFR Part 11 and GAMP guidelines.";
      } else if (action === 'return-correction') {
        title = "Confirm Return for Correction";
        description = `You are performing an electronic signature to return Product Master "${product.title}" version V${product.version || 1} for adjustments.`;
        meaning = "I confirm that I have reviewed this Product Master and am returning it for correction. This action is electronic signature under 21 CFR Part 11 and GAMP guidelines.";
      } else if (action === 'approve') {
        title = "Confirm Product Master Approval";
        description = `You are performing an electronic signature to approve Product Master "${product.title}" version V${product.version || 1}, making it active/effective immediately.`;
        meaning = "I confirm approval of Product Master. This action is electronic signature under 21 CFR Part 11 and GAMP guidelines.";
      } else if (action === 'reject') {
        title = "Confirm Product Master Rejection";
        description = `You are performing an electronic signature to formally reject Product Master "${product.title}" version V${product.version || 1}.`;
        meaning = "I confirm rejection of Product Master. This action is electronic signature under 21 CFR Part 11 and GAMP guidelines.";
      }

      setSigDialogConfig({ title, description, meaning });
      setShowSignatureDialog(true);
      return;
    }

    setWorkflowActionLoading(true);
    try {
      let response;
      if (action === 'submit') {
        response = await api.post(`/product-masters/${product.id}/submit`, { password });
      } else if (action === 'start-review') {
        response = await api.post(`/product-masters/${product.id}/start-review`, { password });
      } else if (action === 'forward-review') {
        response = await api.post(`/product-masters/${product.id}/review`, { decision: 'forward', comments: workflowComments, password });
      } else if (action === 'return-correction') {
        if (product.workflowStatus === 'Rejected') {
          response = await api.post(`/product-masters/${product.id}/correction`, { comments: workflowComments, password });
        } else {
          response = await api.post(`/product-masters/${product.id}/review`, { decision: 'return', comments: workflowComments, password });
        }
      } else if (action === 'approve') {
        response = await api.post(`/product-masters/${product.id}/approve`, { comments: workflowComments, password });
      } else if (action === 'reject') {
        response = await api.post(`/product-masters/${product.id}/reject`, { comments: workflowComments, password });
      }

      toast.success(response?.data?.message || 'Workflow step executed successfully!');
      setViewingProduct(null);
      setIsWorkflowCommentsOpen(false);
      setWorkflowComments('');
      setPendingActionType(null);
      setShowSignatureDialog(false);
      fetchProducts();
    } catch (error: any) {
      console.error('Workflow error:', error);
      toast.error(error.response?.data?.message || 'Workflow step failed.');
    } finally {
      setWorkflowActionLoading(false);
    }
  };

  const openEditDialog = (product: ProductMaster) => {
    setEditingProduct(product);
    form.reset({
      title: product.title,
      type: product.type,
      stage: product.stage,
      batchNumberSeries: product.batchNumberSeries || '',
      description: product.description || '',
      status: product.status,
      changeReason: '',
    });
    setIsDialogOpen(true);
  };

  const getWorkflowBadgeColor = (status: string) => {
    const raw = status || "Active";
    switch (raw) {
      case 'Draft': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Pending for Review': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Under Review': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Active':
      case 'Approved': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Rejected': return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'Returned for Correction': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'Obsolete': return 'bg-orange-50 text-orange-700 border-orange-100';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const baseRole = getUserBaseRole(user);
  const isAdmin = baseRole === 'ADMIN' || user?.permissions?.includes('user:manage');
  const isProduction = user?.permissions?.includes('create:product') || user?.permissions?.includes('edit:product') || ['PRODUCTION_INCHARGE', 'PRODUCTION_MANAGER'].includes(baseRole);
  const isQA = user?.permissions?.includes('product:review') || user?.permissions?.includes('product:approve') || ['QA_CHEMIST', 'QA_INCHARGE', 'QA_MANAGER', 'QA'].includes(baseRole);
  // Submit Product Master is assigned strictly to QA Chemist (users holding product:submit)
  const canSubmitProduct = !!user?.permissions?.includes('product:submit');

  const getProductActionStatus = (product: ProductMaster, action: string) => {
    return getWorkflowActionStatus({
      user,
      entityType: 'PRODUCT_MASTER',
      currentStatus: product.workflowStatus || 'Draft',
      action,
      record: product
    });
  };

  // Check duty segregation rules
  const getSegregationError = (product: ProductMaster) => {
    if (product.createdBy === user?.uid) {
      return "(Duty Segregation: You are the Creator of this master document. Reviewer/Approver actions must be performed by a secondary user per GAMP 5)";
    }
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm tracking-wider uppercase">
            <Package className="w-4 h-4" />
            Controlled GAMP Workflow
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            Product Masters Catalog
          </h1>
          <p className="text-slate-500 text-lg max-w-2xl">
            Pharmaceutical Product Masters, versioned and audited under 21 CFR Part 11 requirements.
          </p>
        </div>
        {(isAdmin || isProduction) && (
          <Button 
            onClick={() => {
              setEditingProduct(null);
              form.reset({
                title: '',
                type: '',
                stage: '',
                batchNumberSeries: '',
                description: '',
                status: 'active',
                changeReason: '',
              });
              setIsDialogOpen(true);
            }} 
            className="bg-slate-900 hover:bg-slate-800 text-white px-6 h-12 rounded-full transition-all hover:scale-105 active:scale-95 shadow-xl shadow-slate-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product Draft
          </Button>
        )}
      </header>

      {/* Tabs list representing the review workflow stages */}
      <div className="border-b border-slate-200">
        <div className="flex flex-wrap gap-2 -mb-px">
          {[
            { id: 'active', label: 'Approved & Active', count: products.filter(p => (p.workflowStatus || "Active") === 'Active' || p.status === 'active' && p.workflowStatus !== 'Obsolete').length },
            { id: 'draft', label: 'Draft Product Masters', count: products.filter(p => p.workflowStatus === 'Draft').length },
            { id: 'pending_review', label: 'Pending Review', count: products.filter(p => p.workflowStatus === 'Pending for Review').length },
            { id: 'pending_approval', label: 'Pending Approval', count: products.filter(p => p.workflowStatus === 'Under Review').length },
            { id: 'rejected', label: 'Rejected / Returned', count: products.filter(p => p.workflowStatus === 'Rejected' || p.workflowStatus === 'Returned for Correction').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 px-5 text-sm font-semibold border-b-2 active:scale-95 transition-all outline-none rounded-t-xl ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              {tab.label}
              <Badge variant="secondary" className="bg-slate-100 hover:bg-slate-100 border-none shrink-0 font-bold ml-1">
                {tab.count}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search by title, series, or product code..." 
            className="pl-10 h-11 bg-slate-50 border-none rounded-xl focus-visible:ring-2 focus-visible:ring-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {activeTab === 'active' && (
            <>
              {/* Sort By Filter */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Label className="text-xs font-bold text-slate-400 uppercase shrink-0">Sort By</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full sm:w-36 h-11 bg-slate-50 border-none rounded-xl">
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="a-z">A - Z</SelectItem>
                    <SelectItem value="z-a">Z - A</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* View Mode Toggle Buttons */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setViewMode('tiles')}
                  className={cn(
                    "p-2 rounded-lg transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer",
                    viewMode === 'tiles' 
                      ? "bg-white text-indigo-600 shadow-sm font-semibold" 
                      : "text-slate-500 hover:text-slate-900"
                  )}
                  title="View as Tiles"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>Tiles</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "p-2 rounded-lg transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer",
                    viewMode === 'list' 
                      ? "bg-white text-indigo-600 shadow-sm font-semibold" 
                      : "text-slate-500 hover:text-slate-900"
                  )}
                  title="View as Details"
                >
                  <List className="w-4 h-4" />
                  <span>Details</span>
                </button>
              </div>
            </>
          )}

          <p className="text-xs text-slate-400 font-medium font-mono shrink-0">
            Total items under filter: {sortedAndFilteredProducts.length}
          </p>
        </div>
      </div>

      {/* Product Grid / Details Table */}
      {loading ? (
        <LoadingPage label="Loading product workflow records..." />
      ) : sortedAndFilteredProducts.length > 0 ? (
        activeTab === 'active' && viewMode === 'list' ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Title</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Version</th>
                    <th className="py-3.5 px-4">Active Since</th>
                    <th className="py-3.5 px-4">Created By</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  <AnimatePresence mode="popLayout">
                    {sortedAndFilteredProducts.map((product) => {
                      const creatorName = product.createdByEmail || "Creator";
                      const currentWStatus = product.workflowStatus || "Active";
                      return (
                        <motion.tr 
                          key={product.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-slate-50/80 transition-colors group"
                        >
                          <td className="py-4 px-4 font-bold text-slate-900 group-hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => setViewingProduct(product)}>
                            <HighlightText text={product.title} search={searchQuery} />
                          </td>
                          <td className="py-4 px-4">
                            <Badge className={`${getWorkflowBadgeColor(currentWStatus)} border font-semibold px-2 py-0.5 rounded-lg text-xs inline-flex items-center gap-1`}>
                              {currentWStatus} {product.version ? `V${product.version}` : ''}
                            </Badge>
                          </td>
                          <td className="py-4 px-4 font-mono text-xs text-slate-500">
                            v{product.version || 1}.{product.revisionNo || 0}
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-500 whitespace-nowrap">
                            {new Date(product.activeSince || product.effectiveDate || product.approvedDate || product.updatedAt || product.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-600">
                            <HighlightText text={creatorName.split('@')[0]} search={searchQuery} />
                          </td>
                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg h-8 px-3 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                                onClick={() => {
                                  setViewingProduct(product);
                                  setWorkflowComments('');
                                }}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </Button>
                              {((isAdmin || isProduction) && (currentWStatus === 'Draft' || currentWStatus === 'Returned for Correction' || currentWStatus === 'Active')) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger className="rounded-lg hover:bg-slate-100 p-1.5 transition-colors outline-none cursor-pointer">
                                    <MoreVertical className="w-4 h-4 text-slate-400" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-xl w-48 p-2">
                                    <DropdownMenuItem onClick={() => openEditDialog(product)} className="gap-2 cursor-pointer font-medium text-slate-700">
                                      <Edit2 className="w-4 h-4 text-indigo-600" /> Edit / Create Revision
                                    </DropdownMenuItem>
                                    {currentWStatus === 'Active' && (
                                      <DropdownMenuItem 
                                        onClick={() => setProductToDelete(product)} 
                                        className="gap-2 text-red-600 font-medium focus:text-red-600 cursor-pointer"
                                      >
                                        <Trash2 className="w-4 h-4" /> Deactivate Product
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {sortedAndFilteredProducts.map((product) => {
                const creatorName = product.createdByEmail || "Creator";
                const currentWStatus = product.workflowStatus || "Active";
                const isCurrentUserCreator = product.createdBy === user?.uid;
                return (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="group border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.03)] rounded-3xl p-6 hover:shadow-xl transition-all h-full flex flex-col relative overflow-hidden">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                          <Package className="w-6 h-6" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`${getWorkflowBadgeColor(currentWStatus)} border font-semibold px-2 py-0.5 rounded-lg text-xs`}>
                            {currentWStatus} {product.version ? `V${product.version}` : ''}
                          </Badge>
                          
                          {/* More Menu controls depending on roles */}
                          {((isAdmin || isProduction) && (currentWStatus === 'Draft' || currentWStatus === 'Returned for Correction' || currentWStatus === 'Active')) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger className="rounded-full hover:bg-slate-50 p-2 transition-colors outline-none cursor-pointer">
                                <MoreVertical className="w-4 h-4 text-slate-400" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-xl">
                                <DropdownMenuItem onClick={() => openEditDialog(product)} className="gap-2 cursor-pointer font-medium text-slate-700">
                                  <Edit2 className="w-4 h-4 text-indigo-600" /> Edit / Create Revision
                                </DropdownMenuItem>
                                {currentWStatus === 'Active' && (
                                  <DropdownMenuItem 
                                    onClick={() => setProductToDelete(product)} 
                                    className="gap-2 text-red-600 font-medium focus:text-red-600 cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" /> Deactivate Product
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-slate-900 mb-1 leading-snug group-hover:text-indigo-600 transition-colors">
                          <HighlightText text={product.title} search={searchQuery} />
                        </h3>
                        <p className="text-xs font-mono text-slate-400 mb-3 flex items-center gap-1">
                          <span>Ver: {product.version || 1}.{product.revisionNo || 0}</span>
                          <span>•</span>
                          <span>Created by: {creatorName.split('@')[0]}</span>
                        </p>

                        {/* Active Since / Deactivated Since Dates block */}
                        {product.status === 'active' ? (
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50/50 px-2.5 py-1 rounded-xl border border-emerald-100/40 mb-3 inline-flex">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
                            <span>Active Since: {new Date(product.activeSince || product.effectiveDate || product.approvedDate || product.updatedAt || product.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          </div>
                        ) : (currentWStatus === 'Inactive' || currentWStatus === 'Obsolete') ? (
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/60 mb-3 inline-flex">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full inline-block" />
                            <span>Deactivated Since: {new Date(product.deactivatedSince || product.updatedAt || product.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          </div>
                        ) : null}
                        
                        {product.description && (
                          <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">
                            <HighlightText text={product.description} search={searchQuery} />
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 mt-auto">
                        {/* Short action trigger right on the card to submit quickly */}
                        {(() => {
                          const submitStatus = getProductActionStatus(product, 'submit');
                          if (!submitStatus.visible) return null;
                          return (
                            <Button 
                              onClick={() => {
                                setViewingProduct(product);
                                handleWorkflowAction('submit', undefined, product);
                              }}
                              disabled={workflowActionLoading || !submitStatus.enabled}
                              title={submitStatus.tooltip}
                              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold h-9 flex items-center justify-center gap-1.5"
                            >
                              <Send className="w-3.5 h-3.5" /> Submit for GAMP Review
                            </Button>
                          );
                        })()}

                        {/* View details specifications drawer trigger */}
                        <Button 
                          variant="secondary" 
                          className="w-full justify-between hover:bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold h-9"
                          onClick={() => {
                            setViewingProduct(product);
                            setWorkflowComments('');
                          }}
                        >
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> Specifications & Workflow History
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-dashed border-slate-200">
          <div className="p-4 bg-slate-50 rounded-full mb-4">
            <Package className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No products found in this tab</h3>
          <p className="text-slate-500 max-w-xs text-center mt-1">
            Try switching workflow filter tabs or searching titles/codes.
          </p>
          {searchQuery && (
            <Button variant="link" onClick={() => setSearchQuery('')} className="mt-2 text-indigo-600">
              Clear search query
            </Button>
          )}
        </div>
      )}

      {/* Specifications & Workflow History Detail Modal */}
      <Dialog open={!!viewingProduct} onOpenChange={(open) => {
        if (!open) {
          setViewingProduct(null);
          setIsWorkflowCommentsOpen(false);
          setWorkflowComments('');
          setPendingActionType(null);
        }
      }}>
        <DialogContent className="max-w-3xl rounded-3xl max-h-[90vh] overflow-y-auto custom-scrollbar p-0" showCloseButton={false}>
          {viewingProduct && (
            <div className="space-y-0">
              {/* Header */}
              <div className="p-6 border-b border-slate-100 bg-slate-50 rounded-t-3xl flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                      {viewingProduct.title}
                    </h2>
                    <Badge className={`${getWorkflowBadgeColor(viewingProduct.workflowStatus || "Active")} border font-semibold px-2 py-0.5 rounded-lg text-[10px]`}>
                      {viewingProduct.workflowStatus || "Active"} V{viewingProduct.version || 1}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Product Details and 21 CFR Part 11 Electronic Signature History Trail</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setViewingProduct(null)}
                  className="rounded-full bg-white hover:bg-slate-100 border border-slate-100 shadow-sm"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </Button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6">
                {/* Specifications Grid */}
                <div className="grid grid-cols-1 gap-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Branch Location</p>
                    <p className="text-sm font-semibold text-slate-800 mb-1">{viewingProduct.branch || "Masulkhana"}</p>
                  </div>
                  {viewingProduct.status === 'active' ? (
                    <div className="space-y-1 pt-3 border-t border-slate-200/60">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Active Since</p>
                      <p className="text-sm font-semibold text-slate-800 bg-white inline-block px-3 py-1.5 rounded-xl border border-slate-200">
                        {new Date(viewingProduct.activeSince || viewingProduct.effectiveDate || viewingProduct.approvedDate || viewingProduct.updatedAt || viewingProduct.createdAt).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ) : (viewingProduct.workflowStatus === 'Inactive' || viewingProduct.workflowStatus === 'Obsolete') ? (
                    <div className="space-y-1 pt-3 border-t border-slate-200/60">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Deactivated Since</p>
                      <p className="text-sm font-semibold text-slate-800 bg-white inline-block px-3 py-1.5 rounded-xl border border-slate-200">
                        {new Date(viewingProduct.deactivatedSince || viewingProduct.updatedAt || viewingProduct.createdAt).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ) : null}
                  {viewingProduct.description && (
                    <div className="space-y-1 pt-3 border-t border-slate-200/60">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Product Description</p>
                      <p className="text-sm text-slate-600 leading-relaxed bg-white p-3 rounded-xl border border-slate-100">
                        {viewingProduct.description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Info Metadata Block */}
                <div className="grid grid-cols-2 gap-4 text-xs bg-indigo-50/30 p-4 rounded-2xl border border-indigo-50/50">
                  <div className="space-y-1 text-left">
                    <span className="text-slate-400 block">Creator Context:</span>
                    <span className="font-semibold text-indigo-900 block">{viewingProduct.createdByEmail || "system@internal"}</span>
                    <span className="text-[10px] text-slate-400 block">{viewingProduct.createdAt ? new Date(viewingProduct.createdAt).toLocaleString() : 'N/A'}</span>
                  </div>
                  {viewingProduct.approvedByEmail && (
                    <div className="space-y-1 border-l border-indigo-100 pl-4 text-left">
                      <span className="text-slate-400 block">QA Approver context:</span>
                      <span className="font-semibold text-emerald-950 block">{viewingProduct.approvedByEmail}</span>
                      <span className="text-[10px] text-slate-400 block">{viewingProduct.approvedDate ? new Date(viewingProduct.approvedDate).toLocaleString() : 'N/A'}</span>
                    </div>
                  )}
                </div>

                {/* Workflow Timeline / Compliance History View */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500" />
                    21 CFR Part 11 Audit Trail History
                  </h3>
                  
                  <div className="relative border-l-2 border-slate-100 pl-4 space-y-5 py-2 ml-2">
                    {viewingProduct.history && viewingProduct.history.length > 0 ? (
                      viewingProduct.history.map((step: any, idx: number) => (
                        <div key={idx} className="relative text-left">
                          <span className="absolute -left-[23px] top-0.5 bg-white p-0.5 rounded-full border border-slate-200">
                            <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full block" />
                          </span>
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between gap-4">
                              <p className="text-sm font-bold text-slate-800">{step.action}</p>
                              <span className="text-[10px] text-slate-400">{step.timestamp ? new Date(step.timestamp).toLocaleString() : ''}</span>
                            </div>
                            <p className="text-xs text-slate-500">Performed by: <span className="font-medium text-slate-700">{step.performedBy}</span></p>
                            {step.reason && (
                              <p className="text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-150 inline-block font-sans mt-1">
                                {step.reason}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">No workflow history captured for legacy elements.</p>
                    )}
                  </div>
                </div>

                {/* Action Blocks for Transitions */}
                <div className="border-t border-slate-100 pt-6 space-y-4">
                  {getSegregationError(viewingProduct) ? (
                    <div className="flex items-start gap-2 text-xs text-amber-700 font-semibold bg-amber-50 p-3 rounded-xl border border-amber-100">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{getSegregationError(viewingProduct)}</span>
                    </div>
                  ) : (
                    <>
                      {/* Submission trigger for Draft or Returned for Correction records */}
                      {(() => {
                        const submitStatus = getProductActionStatus(viewingProduct, 'submit');
                        if (!submitStatus.visible) return null;
                        return (
                          <div className="flex items-center justify-between bg-indigo-50/80 p-3.5 rounded-2xl border border-indigo-100 mb-4 text-left">
                            <div>
                              <h4 className="text-xs font-bold text-indigo-950">Specification Ready for GAMP Review</h4>
                              <p className="text-[11px] text-indigo-700">Submit drafted or corrected product specifications for formal GAMP review (QA Chemist authority).</p>
                            </div>
                            <Button
                              onClick={() => handleWorkflowAction('submit')}
                              disabled={workflowActionLoading || !submitStatus.enabled}
                              title={submitStatus.tooltip}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-4 h-9 font-semibold shrink-0 flex items-center gap-1.5"
                            >
                              {workflowActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5" />}
                              Submit for GAMP Review
                            </Button>
                          </div>
                        );
                      })()}

                      {/* Active workflows transition options */}
                      {(viewingProduct.workflowStatus === 'Pending for Review' || viewingProduct.workflowStatus === 'Under Review') && (
                        <div className="space-y-4 text-left">
                          {(() => {
                            const startReviewStatus = getProductActionStatus(viewingProduct, 'start-review');
                            if (!startReviewStatus.visible) return null;
                            return (
                              <div className="flex items-center justify-between bg-indigo-50/80 p-3.5 rounded-2xl border border-indigo-100 mb-2">
                                <div>
                                  <h4 className="text-xs font-bold text-indigo-950">Pending QA / GAMP Review Acquisition</h4>
                                  <p className="text-[11px] text-indigo-700">Acquire review lock or return directly to creator for adjustments.</p>
                                </div>
                                <Button
                                  onClick={() => handleWorkflowAction('start-review')}
                                  disabled={workflowActionLoading || !startReviewStatus.enabled}
                                  title={startReviewStatus.tooltip}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-4 h-9 font-semibold shrink-0"
                                >
                                  {workflowActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                                  Acquire / Begin Review
                                </Button>
                              </div>
                            );
                          })()}

                          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
                              <span>Review & Approver Control Board</span>
                              <span className="text-[10px] text-slate-400 font-normal normal-case">* Reason required for Return, Reject, or Approval</span>
                            </h4>
                            
                            <textarea
                              placeholder="Add review feedback / compliance notes or approval/rejection details (Mandatory for Return/Reject/Approve)..."
                              className="w-full text-xs min-h-[70px] bg-white border border-slate-200 outline-none p-2.5 rounded-xl text-slate-700 focus:border-indigo-500 transition-colors"
                              value={workflowComments}
                              onChange={(e) => setWorkflowComments(e.target.value)}
                            />

                            <div className="flex gap-2 flex-wrap pt-1">
                              {/* Ultimate Approvals */}
                              {(() => {
                                const approveStatus = getProductActionStatus(viewingProduct, 'approve');
                                if (!approveStatus.visible) return null;
                                return (
                                  <Button
                                    onClick={() => {
                                      if (workflowComments.length < 5) {
                                        toast.error('Please type compliance comments mapping your approval (minimum 5 chars)');
                                        return;
                                      }
                                      handleWorkflowAction('approve');
                                    }}
                                    disabled={workflowActionLoading || !approveStatus.enabled}
                                    title={approveStatus.tooltip}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold px-4 h-9"
                                  >
                                    Sign-off Approve
                                  </Button>
                                );
                              })()}

                              {/* Reject */}
                              {(() => {
                                const rejectStatus = getProductActionStatus(viewingProduct, 'reject');
                                if (!rejectStatus.visible) return null;
                                return (
                                  <Button
                                    onClick={() => {
                                      if (workflowComments.length < 5) {
                                        toast.error('Please input a rejection comment explanation');
                                        return;
                                      }
                                      handleWorkflowAction('reject');
                                    }}
                                    disabled={workflowActionLoading || !rejectStatus.enabled}
                                    title={rejectStatus.tooltip}
                                    className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold px-4 h-9"
                                  >
                                    Reject
                                  </Button>
                                );
                              })()}

                              {/* Return for Correction */}
                              {(() => {
                                const returnStatus = getProductActionStatus(viewingProduct, 'return-correction');
                                if (!returnStatus.visible) return null;
                                return (
                                  <Button
                                    onClick={() => {
                                      if (workflowComments.length < 5) {
                                        toast.error('Please insert return instructions for the creator in comments');
                                        return;
                                      }
                                      handleWorkflowAction('return-correction');
                                    }}
                                    disabled={workflowActionLoading || !returnStatus.enabled}
                                    title={returnStatus.tooltip}
                                    className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold px-4 h-9 flex items-center gap-1.5"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" /> Return to Creator (Draft)
                                  </Button>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Option to correction-move Rejected masters */}
                      {viewingProduct.workflowStatus === 'Rejected' && (isAdmin || isQA) && (
                        <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 flex flex-col gap-2 text-left">
                          <p className="text-xs font-bold text-rose-950">Rejected product masters must be forwarded back to correction state before creators can edit.</p>
                          <textarea
                            placeholder="Return explanation comments..."
                            className="bg-white border border-slate-100 text-xs p-2.5 rounded-lg outline-none min-h-[50px] focus:border-indigo-500"
                            value={workflowComments}
                            onChange={(e) => setWorkflowComments(e.target.value)}
                          />
                          <Button
                            onClick={() => {
                              if (workflowComments.length < 5) {
                                toast.error('Comments explaining return reason is mandatory');
                                return;
                              }
                              handleWorkflowAction('return-correction');
                            }}
                            disabled={workflowActionLoading}
                            className="bg-rose-600 hover:bg-rose-700 text-white max-w-xs text-xs rounded-xl h-9 font-semibold"
                          >
                            Return for Correction
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog with warning coach for Active revisions */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl rounded-3xl max-h-[90vh] overflow-y-auto custom-scrollbar p-0" showCloseButton={false}>
          <div className="sticky top-0 bg-white z-20 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold">
                {editingProduct 
                  ? (editingProduct.workflowStatus === 'Active' ? 'Edit Active Master (Create Revision)' : 'Edit Draft Requisition') 
                  : 'Add New Product Draft'}
              </DialogTitle>
              <DialogDescription>
                {editingProduct?.workflowStatus === 'Active' 
                  ? 'Note: Modifying this active product master will auto-generate a new workflow version (e.g., Version ' + ((editingProduct.version || 1) + 1) + '). The current version remains fully active until approved.'
                  : 'Fill the required product specs. New records will initially save in status Draft.'}
              </DialogDescription>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsDialogOpen(false)}
              className="rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="px-6 py-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => onSubmit(v as ProductFormValues))} className="space-y-6">
                <div className="grid grid-cols-1 gap-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Loratadine, Montelukast" {...field} value={field.value || ''} className="rounded-xl h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Description</FormLabel>
                      <FormControl>
                        <textarea 
                          className="flex min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                          placeholder="Additional detailed specification comments..."
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {editingProduct && (
                  <FormField
                    control={form.control}
                    name="changeReason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reason for Change / Edit Requisition *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Updating standard batch series pattern" {...field} value={field.value || ''} className="rounded-xl h-11 border-amber-200 focus:border-amber-500" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <DialogFooter className="gap-2 pt-4 border-t border-slate-100">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => setIsDialogOpen(false)}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 rounded-xl"
                  >
                    {editingProduct ? 'Update Product master' : 'Create Product draft'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Deactivation dialog */}
      <Dialog open={!!productToDelete} onOpenChange={(open) => {
        if (!open) {
          setProductToDelete(null);
          setDeleteReason('');
        }
      }}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Confirm Deactivation
            </DialogTitle>
            <DialogDescription className="py-2">
              Are you sure you want to deactivate <span className="font-bold text-slate-900">{productToDelete?.title}</span>? 
              This will mark the product as inactive. This action cannot be undone if linked to historical records.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Reason for Deactivation *</label>
              <Input 
                placeholder="Minimum 5 characters required..." 
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="rounded-xl bg-slate-50 border-none focus-visible:ring-red-500"
              />
              <p className="text-[10px] text-slate-400">This action will be logged in the system audit trail for compliance.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="ghost" 
              onClick={() => {
                setProductToDelete(null);
                setDeleteReason('');
              }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => handleDelete()} 
              disabled={isDeleting || deleteReason.length < 5}
              className="bg-red-600 hover:bg-red-700 text-white px-8 rounded-xl"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Proceed to Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature dialogue mapping to user actions (Deactivation, Approval, Rejection) */}
      <SignatureDialog 
        isOpen={showSignatureDialog}
        onClose={() => setShowSignatureDialog(false)}
        onConfirm={(password) => {
          if (productToDelete) {
            handleDelete(password);
          } else if (pendingActionType) {
            handleWorkflowAction(pendingActionType, password);
          }
        }}
        title={sigDialogConfig.title}
        description={sigDialogConfig.description}
        meaning={sigDialogConfig.meaning}
        isLoading={isDeleting || workflowActionLoading}
      />
    </div>
  );
}
