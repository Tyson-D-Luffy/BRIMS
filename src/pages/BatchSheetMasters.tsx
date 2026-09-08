import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Package,
  Lock,
  Edit3,
  CheckSquare,
  LayoutGrid,
  List
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HighlightText } from '../components/HighlightText';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '../lib/utils';
import { LoadingPage } from '../components/LoadingSpinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { SignatureDialog } from '../components/SignatureDialog';

import { BatchSheetMaster, getUserBaseRole } from '../types';

export default function BatchSheetMasters() {
  const [masters, setMasters] = useState<BatchSheetMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('latest');
  const [viewMode, setViewMode] = useState<'tiles' | 'list'>('tiles');
  const { user } = useAuth();
  const navigate = useNavigate();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [retireId, setRetireId] = useState<string | null>(null);
  const [retireReason, setRetireReason] = useState('');
  const [isRetiring, setIsRetiring] = useState(false);
  const [showSignature, setShowSignature] = useState(false);

  const baseRole = getUserBaseRole(user);
  const isAdmin = user?.permissions?.includes('batch_sheet_master:create') || user?.permissions?.includes('batch_sheet_master:edit') || baseRole === 'ADMIN';
  const canApprove = user?.permissions?.includes('batch_sheet_master:approve') || user?.permissions?.includes('batch_sheet_master:review') || baseRole === 'ADMIN';

  const fetchMasters = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (searchQuery) params.name = searchQuery;
      if (statusFilter !== 'all') params.status = statusFilter;
      
      const response = await api.get('/batch-sheet-masters', { params });
      if (response.data.success) {
        setMasters(response.data.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch masters', error);
      toast.error(error.response?.data?.message || 'Failed to load masters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMasters();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter]);

  const sortedAndFilteredMasters = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = masters.filter(m => {
      if (!q) return true;
      return (
        (m.masterName && m.masterName.toLowerCase().includes(q)) ||
        (m.documentNumber && m.documentNumber.toLowerCase().includes(q)) ||
        (m.stage && m.stage.toLowerCase().includes(q)) ||
        (m.type && m.type.toLowerCase().includes(q)) ||
        (m.batchNumberSeries && m.batchNumberSeries.toLowerCase().includes(q)) ||
        (m.product?.title && m.product.title.toLowerCase().includes(q))
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'a-z') {
        return (a.masterName || '').localeCompare(b.masterName || '');
      }
      if (sortBy === 'z-a') {
        return (b.masterName || '').localeCompare(a.masterName || '');
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      // default 'latest'
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [masters, sortBy, searchQuery]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200 ring-1 ring-inset ring-emerald-600/20';
      case 'PENDING_APPROVAL': return 'bg-indigo-500/10 text-indigo-600 border-indigo-200 ring-1 ring-inset ring-indigo-600/20';
      case 'UNDER_REVIEW': return 'bg-amber-500/10 text-amber-600 border-amber-200 ring-1 ring-inset ring-amber-600/20';
      case 'RETURNED': return 'bg-amber-500/10 text-amber-600 border-amber-200 ring-1 ring-inset ring-amber-600/20';
      case 'DRAFT': return 'bg-slate-500/10 text-slate-600 border-slate-200 ring-1 ring-inset ring-slate-600/20';
      case 'REJECTED': return 'bg-rose-500/10 text-rose-600 border-rose-200 ring-1 ring-inset ring-rose-600/20';
      case 'RETIRED': return 'bg-slate-500/10 text-slate-400 border-slate-200 ring-1 ring-inset ring-slate-400/20';
      case 'UNDER_UPDATE': return 'bg-blue-500/10 text-blue-600 border-blue-200 ring-1 ring-inset ring-blue-600/20';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle2 className="w-3 h-3 mr-1" />;
      case 'UNDER_REVIEW': return <Clock className="w-3 h-3 mr-1" />;
      case 'DRAFT': return <FileText className="w-3 h-3 mr-1" />;
      case 'REJECTED': return <AlertCircle className="w-3 h-3 mr-1" />;
      case 'RETIRED': return <Lock className="w-3 h-3 mr-1" />;
      case 'UNDER_UPDATE': return <Edit3 className="w-3 h-3 mr-1" />;
      default: return null;
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const response = await api.delete(`/batch-sheet-masters/${deleteId}`);
      if (response.data.success) {
        toast.success('Batch Sheet Master deleted successfully');
        fetchMasters();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete master');
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  const handleRetire = async (password?: string) => {
    if (!retireId) return;
    if (!retireReason.trim()) {
      toast.error('Please provide a reason for discontinuation');
      return;
    }

    if (!password) {
      setShowSignature(true);
      return;
    }

    setIsRetiring(true);
    try {
      const response = await api.post(`/batch-sheet-masters/${retireId}/retire`, {
        changeReason: retireReason,
        password
      });
      if (response.data.success) {
        toast.success('Batch Sheet Master retired successfully');
        setRetireId(null);
        setRetireReason('');
        setShowSignature(false);
        fetchMasters();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to retire master');
    } finally {
      setIsRetiring(false);
    }
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Batch Sheet Masters</h1>
          <p className="text-slate-500 mt-2 text-lg">Manage master sheet records.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canApprove && (
            <Button
              onClick={() => navigate('/batch-sheet-masters/approvals')}
              variant="outline"
              className="border-slate-200 text-slate-700 hover:bg-slate-50 px-6 h-12 rounded-full transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center font-semibold"
            >
              <CheckSquare className="w-4 h-4 mr-2 text-indigo-600" />
              Record Approvals
            </Button>
          )}
          {isAdmin && (
            <Button 
              onClick={() => navigate('/batch-sheet-masters/new')} 
              className="bg-slate-900 hover:bg-slate-800 text-white px-6 h-12 rounded-full transition-all hover:scale-105 active:scale-95 shadow-xl shadow-slate-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          )}
        </div>
      </header>

      {/* Filters & Search */}
      <div className="flex flex-col xl:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative w-full xl:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search masters or document numbers..." 
            className="pl-10 h-11 bg-slate-50 border-none rounded-xl focus-visible:ring-2 focus-visible:ring-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Label className="text-xs font-bold text-slate-400 uppercase shrink-0">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36 h-11 bg-slate-50 border-none rounded-xl">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="RETIRED">Retired</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
              title="View as List"
            >
              <List className="w-4 h-4" />
              <span>List</span>
            </button>
          </div>

          {(statusFilter !== 'all' || searchQuery || sortBy !== 'latest' || viewMode !== 'tiles') && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setStatusFilter('all');
                setSearchQuery('');
                setSortBy('latest');
                setViewMode('tiles');
              }}
              className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full h-11 px-4"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Master Display (Tiles vs List) */}
      {loading ? (
        <LoadingPage label="Loading masters..." />
      ) : sortedAndFilteredMasters.length > 0 ? (
        viewMode === 'tiles' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {sortedAndFilteredMasters.map((master) => (
                <motion.div
                  key={master.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group bg-white rounded-3xl border border-slate-100 p-6 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-300 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded-full hover:bg-slate-50 p-2 transition-colors outline-none cursor-pointer">
                        <MoreVertical className="w-4 h-4 text-slate-400" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl p-2">
                        <DropdownMenuItem onClick={() => navigate(`/batch-sheet-masters/${master.id}`)} className="rounded-lg gap-2 cursor-pointer">
                          <Eye className="w-4 h-4" /> View Details
                        </DropdownMenuItem>
                        {isAdmin && (
                          <DropdownMenuItem onClick={() => navigate(`/batch-sheet-masters/${master.id}/edit`)} className="rounded-lg gap-2 cursor-pointer">
                            <Edit2 className="w-4 h-4" /> Update Master
                          </DropdownMenuItem>
                        )}
                        {isAdmin && master.status === 'APPROVED' && (
                          <DropdownMenuItem 
                            onClick={() => setRetireId(master.id)} 
                            className="rounded-lg gap-2 text-rose-600 focus:text-rose-600 cursor-pointer"
                          >
                            <Lock className="w-4 h-4" /> Retire Master
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-col h-full">
                    <div className="mb-4">
                      <Badge className={cn("rounded-full px-3 py-1 border font-medium", getStatusColor(master.status))}>
                        {getStatusIcon(master.status)}
                        {master.status.replace('_', ' ')}
                      </Badge>
                    </div>

                    <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">
                      <HighlightText text={master.masterName} search={searchQuery} />
                    </h3>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs text-slate-500 font-mono">Ver {master.version || '1.0'}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                        <HighlightText text={master.product?.title || 'Unknown Product'} search={searchQuery} />
                      </span>
                    </div>

                    <div className="space-y-3 mb-6 flex-1">
                      <div className="flex items-center text-sm text-slate-600">
                        <FileText className="w-4 h-4 mr-2 text-slate-400" />
                        <span className="font-mono text-xs">
                          <HighlightText text={master.documentNumber || 'No Doc Number'} search={searchQuery} />
                        </span>
                      </div>
                      <div className="flex items-center text-sm text-slate-600">
                        <Clock className="w-4 h-4 mr-2 text-slate-400" />
                        <span>
                          <HighlightText text={master.stage || 'N/A'} search={searchQuery} /> / <HighlightText text={master.type || 'N/A'} search={searchQuery} />
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        Created {new Date(master.createdAt).toLocaleDateString()}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-full group/btn"
                        onClick={() => navigate(`/batch-sheet-masters/${master.id}`)}
                      >
                        View
                        <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover/btn:translate-x-1" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          /* List View */
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Title</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Product</th>
                    <th className="py-3.5 px-4">Stage</th>
                    <th className="py-3.5 px-4">Process</th>
                    <th className="py-3.5 px-4">Document Number</th>
                    <th className="py-3.5 px-4">Batch Number Series</th>
                    <th className="py-3.5 px-4">Version</th>
                    <th className="py-3.5 px-4">Created</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  <AnimatePresence mode="popLayout">
                    {sortedAndFilteredMasters.map((master) => (
                      <motion.tr 
                        key={master.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        <td className="py-4 px-4 font-bold text-slate-900 group-hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => navigate(`/batch-sheet-masters/${master.id}`)}>
                          <HighlightText text={master.masterName} search={searchQuery} />
                        </td>
                        <td className="py-4 px-4">
                          <Badge className={cn("rounded-full px-2.5 py-0.5 border text-[10px] shrink-0 inline-flex items-center gap-1", getStatusColor(master.status))}>
                            {getStatusIcon(master.status)}
                            {master.status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-4 px-4 font-medium text-slate-700">
                          <HighlightText text={master.product?.title || 'N/A'} search={searchQuery} />
                        </td>
                        <td className="py-4 px-4 text-slate-600">
                          <HighlightText text={master.stage || 'N/A'} search={searchQuery} />
                        </td>
                        <td className="py-4 px-4 text-slate-600">
                          <HighlightText text={master.type || master.stage || 'N/A'} search={searchQuery} />
                        </td>
                        <td className="py-4 px-4 font-mono text-xs text-slate-600">
                          <HighlightText text={master.documentNumber || 'N/A'} search={searchQuery} />
                        </td>
                        <td className="py-4 px-4 font-mono text-xs text-indigo-600 font-semibold">
                          <HighlightText text={master.batchNumberSeries || master.product?.batchNumberSeries || 'N/A'} search={searchQuery} />
                        </td>
                        <td className="py-4 px-4 font-mono text-xs text-slate-500">
                          v{master.version || '1.0'}
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(master.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg h-8 px-3 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                              onClick={() => navigate(`/batch-sheet-masters/${master.id}`)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="rounded-lg hover:bg-slate-100 p-1.5 transition-colors outline-none cursor-pointer">
                                <MoreVertical className="w-4 h-4 text-slate-400" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 rounded-xl p-2">
                                <DropdownMenuItem onClick={() => navigate(`/batch-sheet-masters/${master.id}`)} className="rounded-lg gap-2 cursor-pointer">
                                  <Eye className="w-4 h-4" /> View Details
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <DropdownMenuItem onClick={() => navigate(`/batch-sheet-masters/${master.id}/edit`)} className="rounded-lg gap-2 cursor-pointer">
                                    <Edit2 className="w-4 h-4" /> Update Master
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && master.status === 'APPROVED' && (
                                  <DropdownMenuItem 
                                    onClick={() => setRetireId(master.id)} 
                                    className="rounded-lg gap-2 text-rose-600 focus:text-rose-600 cursor-pointer"
                                  >
                                    <Lock className="w-4 h-4" /> Retire Master
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-20 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No masters found</h3>
          <p className="text-slate-500 max-w-xs mx-auto mb-8">
            {searchQuery || statusFilter !== 'all' 
              ? "Try adjusting your filters to find what you're looking for." 
              : "Get started by creating your first batch sheet master."}
          </p>
          {isAdmin && !searchQuery && statusFilter === 'all' && (
            <Button 
              onClick={() => navigate('/batch-sheet-masters/new')}
              className="bg-slate-900 hover:bg-slate-800 text-white px-8 h-12 rounded-full"
            >
              Create First Master
            </Button>
          )}
        </div>
      )}
      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the master record
              and remove its data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-full px-6"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Master'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Retire/Discontinue Confirmation */}
      <Dialog open={!!retireId && !showSignature} onOpenChange={(open) => !open && setRetireId(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Discontinue Master</DialogTitle>
            <DialogDescription>
              This action will permanently retire this master. It will no longer be available for new batch record issuance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="list-retire-reason">Reason for Discontinuation</Label>
              <Input 
                id="list-retire-reason" 
                placeholder="e.g. Obsolete document, replaced by new standard" 
                value={retireReason}
                onChange={(e) => setRetireReason(e.target.value)}
                className="rounded-xl bg-slate-50 border-none h-12"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRetireId(null)} className="rounded-full">Cancel</Button>
            <Button 
              onClick={() => handleRetire()} 
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-full px-6"
            >
              Proceed to Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignatureDialog 
        isOpen={showSignature}
        onClose={() => setShowSignature(false)}
        onConfirm={(password) => handleRetire(password)}
        title="Retire Master"
        description="You are permanently retiring this master record. This action requires an electronic signature and is irreversible."
        meaning="I certify that I am discontinuing this master record. This action is intentional and logged."
        isLoading={isRetiring}
      />
    </div>
  );
}
