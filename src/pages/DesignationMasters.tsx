import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { toast } from 'sonner';
import api from '../services/api';
import { 
  Plus, 
  Search, 
  CheckCircle2, 
  FileText, 
  ShieldCheck, 
  History, 
  Clock, 
  Users,
  AlertTriangle,
  Eye,
  Edit2,
  X,
  ChevronRight,
  TrendingUp,
  User,
  Info,
  Sliders,
  Sparkles
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { HighlightText } from '../components/HighlightText';

export default function DesignationMasters() {
  const { user } = useAuth();
  const { selectedBranch } = useBranch();

  const checkPermission = (action: 'create' | 'submit' | 'approve' | 'edit') => {
    if (user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com') {
      return true;
    }
    const userPermissions = user?.permissions || [];
    if (action === 'create' && !userPermissions.includes('designation:create')) {
      toast.error("Access Denied: You do not have 'Create Designation Master' permission.");
      return false;
    }
    if (action === 'edit' && !userPermissions.includes('designation:create')) {
      toast.error("Access Denied: You do not have 'Create Designation Master' permission to edit records.");
      return false;
    }
    if (action === 'submit' && !userPermissions.includes('designation:submit')) {
      toast.error("Access Denied: You do not have 'Submit Designation Master' permission.");
      return false;
    }
    if (action === 'approve' && !userPermissions.includes('designation:approve')) {
      toast.error("Access Denied: You do not have 'Approve Designation Master' permission.");
      return false;
    }
    return true;
  };

  // Core Data State
  const [designations, setDesignations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats Counters
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    review: 0,
    approval: 0,
    obsolete: 0
  });

  // Filter States
  const [searchName, setSearchName] = useState('');
  const [searchDeptId, setSearchDeptId] = useState('ALL');
  const [searchStatus, setSearchStatus] = useState('ALL');

  // Interactive Total Designations Modal States
  const [isTotalListOpen, setIsTotalListOpen] = useState(false);
  const [isDesignationUsersOpen, setIsDesignationUsersOpen] = useState(false);
  const [selectedTotalDesig, setSelectedTotalDesig] = useState<any | null>(null);

  // Designation Detail & Logs Modal State
  const [detailDesig, setDetailDesig] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'audit'>('details');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [timelineLogs, setTimelineLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Form (Create/Edit) States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    designationId: '',
    designationName: '',
    departmentId: '',
    description: '',
    remarks: '',
    changeReason: ''
  });

  // eSignature Modal State
  const [isSigOpen, setIsSigOpen] = useState(false);
  const [sigAction, setSigAction] = useState<string>(''); // submit, approve, activate, obsolete
  const [sigPassword, setSigPassword] = useState('');
  const [sigReason, setSigReason] = useState('');
  const [sigTargetId, setSigTargetId] = useState('');
  const [sigLoading, setSigLoading] = useState(false);

  // Load basic data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch designations
      const desigRes = await api.get('/designations');
      const desigData = desigRes.data?.success ? desigRes.data.data : [];
      setDesignations(desigData);

      // Fetch active departments for selection & filters
      let deptsList: any[] = [];
      try {
        const deptRes = await api.get('/departments');
        if (deptRes.data?.success) {
          deptsList = deptRes.data.data || [];
        }
      } catch (err) {
        console.warn("Failed to fetch full departments, trying /departments/active:", err);
        const deptRes = await api.get('/departments/active');
        if (deptRes.data?.success) {
          deptsList = deptRes.data.data || [];
        }
      }
      setDepartments(deptsList);

      // Fetch users for designated users drilldown
      try {
        const usersRes = await api.get('/users');
        if (usersRes.data) {
          setUsersList(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data.data || []);
        }
      } catch (err) {
        console.warn("Could not fetch users list:", err);
      }

      calculateStats(desigData);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to load master dataset");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedBranch]);

  const calculateStats = (list: any[]) => {
    const statsObj = {
      total: list.length,
      active: list.filter((d: any) => d.status === "Active").length,
      review: list.filter((d: any) => d.status === "Review").length,
      approval: list.filter((d: any) => d.status === "Approval").length,
      obsolete: list.filter((d: any) => d.status === "Obsolete").length,
    };
    setStats(statsObj);
  };

  // Filter application
  const filteredDesignations = designations.filter((d: any) => {
    const sTerm = searchName.trim().toLowerCase();
    const matchName = !sTerm || 
      d.designationName?.toLowerCase().includes(sTerm) ||
      d.departmentName?.toLowerCase().includes(sTerm) ||
      d.description?.toLowerCase().includes(sTerm);
    const matchDept = searchDeptId === "ALL" || d.departmentId === searchDeptId;
    const matchStatus = searchStatus === "ALL" || d.status === searchStatus;
    return matchName && matchDept && matchStatus;
  });

  // Fetch log components for detail modal
  const loadLogsAndTimeline = async (id: string) => {
    try {
      setLogsLoading(true);
      const auditRes = await api.get(`/designations/${id}/audit-logs`);
      const timelineRes = await api.get(`/designations/${id}/timeline`);

      if (auditRes.data?.success) setAuditLogs(auditRes.data.data || []);
      if (timelineRes.data?.success) setTimelineLogs(timelineRes.data.data || []);
    } catch (err: any) {
      toast.error("Failed to load logs details");
    } finally {
      setLogsLoading(false);
    }
  };

  const handleOpenViewDetails = (desig: any) => {
    setDetailDesig(desig);
    setActiveTab('details');
    loadLogsAndTimeline(desig.designationId);
  };

  // Form Reset / Open
  const handleOpenForm = (mode: 'create' | 'edit', desig?: any) => {
    if (mode === 'create') {
      if (!checkPermission('create')) return;
    } else {
      if (!checkPermission('edit')) return;
    }
    setFormMode(mode);
    if (mode === 'create') {
      setFormData({
        designationId: '',
        designationName: '',
        departmentId: '',
        description: '',
        remarks: '',
        changeReason: ''
      });
    } else {
      setFormData({
        designationId: desig.designationId,
        designationName: desig.designationName,
        departmentId: desig.departmentId,
        description: desig.description || '',
        remarks: desig.remarks || '',
        changeReason: ''
      });
    }
    setIsFormOpen(true);
  };

  // Submit Designation Form direct save (Draft)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formMode === 'create') {
      if (!checkPermission('create')) return;
    } else {
      if (!checkPermission('edit')) return;
    }
    if (!formData.designationName || !formData.departmentId) {
      toast.error("Please fill in all mandatory fields.");
      return;
    }

    try {
      setLoading(true);
      if (formMode === 'create') {
        const payload = {
          designationName: formData.designationName,
          departmentId: formData.departmentId,
          description: formData.description,
          remarks: formData.remarks
        };
        const res = await api.post('/designations', payload);
        if (res.data?.success) {
          toast.success("Designation created as Draft successfully");
          setIsFormOpen(false);
          fetchData();
        }
      } else {
        const payload = {
          designationName: formData.designationName,
          description: formData.description,
          remarks: formData.remarks,
          changeReason: formData.changeReason || "Master details updated"
        };
        const res = await api.put(`/designations/${formData.designationId}`, payload);
        if (res.data?.success) {
          toast.success(res.data.message || "Designation updated successfully");
          setIsFormOpen(false);
          fetchData();
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to save Designation");
    } finally {
      setLoading(false);
    }
  };

  // Handle Simple Transitions (no Part 11 electronic signature for Draft->Review)
  const handleStandardTransition = async (id: string, action: string, comments: string = "") => {
    if (action === 'submit') {
      if (!checkPermission('submit')) return;
    }
    try {
      setLoading(true);
      const res = await api.post(`/designations/${id}/${action}`, { remarks: comments });
      if (res.data?.success) {
        toast.success(res.data.message || `Successfully completed workflow transition: ${action}`);
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to process workflow action");
    } finally {
      setLoading(false);
    }
  };

  // Open electronic signature workflow challenge
  const handleOpenSignatureChallenge = (id: string, action: string) => {
    if (!checkPermission('approve')) return;
    setSigTargetId(id);
    setSigAction(action);
    setSigPassword('');
    setSigReason('');
    setIsSigOpen(true);
  };

  // Submit electronic signature transition
  const handleSignatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sigPassword) {
      toast.error("Please enter your account password to verify electronic signature.");
      return;
    }

    try {
      setSigLoading(true);
      const payload = {
        password: sigPassword,
        reason: sigReason || `GMP Electronic signature authorized for designation state transition to ${sigAction}`
      };

      const res = await api.post(`/designations/${sigTargetId}/${sigAction}`, payload);
      if (res.data?.success) {
        toast.success(`Authenticated signature accepted. Designation master transition approved.`);
        setIsSigOpen(false);
        setSigPassword('');
        setSigReason('');
        
        // If details modal was open, refresh details too
        if (detailDesig && detailDesig.designationId === sigTargetId) {
          setDetailDesig(null);
        }
        
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Signature verification failed. Invalid credentials.");
    } finally {
      setSigLoading(false);
    }
  };

  // Total Designations widget users lookup list
  const usersForDesignation = (desigName: string) => {
    if (!desigName) return [];
    return usersList.filter((u: any) => {
      const matchDesig = u.designation?.trim().toLowerCase() === desigName.trim().toLowerCase();
      return matchDesig;
    });
  };

  // Get active designations count per department
  const deptsSummary = departments.map((dept: any, idx: number) => {
    const deptUniqueId = dept.departmentId || dept.id || `dept-sum-${idx}`;
    const matchActiveCount = designations.filter((d: any) => (d.departmentId === deptUniqueId || d.departmentId === dept.departmentId || d.departmentId === dept.id) && d.status === "Active").length;
    return {
      id: deptUniqueId,
      code: dept.departmentCode || 'N/A',
      name: dept.departmentName || 'Unnamed Department',
      activeCount: matchActiveCount
    };
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto" id="designation-master-root">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-[#FF6321]" id="header-icon" />
            Designation Master
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm max-w-2xl">
            GMP compliant database for system designators. Create definitions, manage multi-level reviews and 21 CFR Part 11 Electronic signature logs linked directly to active department lines.
          </p>
        </div>
        
        {/* Branch / Current User Meta Indicator */}
        <div className="bg-[#1E293B] text-slate-100 px-4 py-2.5 rounded-xl border border-slate-700/80 text-xs shadow-md shadow-slate-900/10 flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1.5 font-semibold text-[#FF6321]">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            PART 11 COMPLIANT SITE
          </div>
          <div className="text-slate-400 text-[10px]">
             User: <span className="text-slate-200">{user?.displayName || user?.email}</span> ({user?.role})
          </div>
        </div>
      </div>

      {/* Dashboard KPI Panels (Grid of 5 counters with active interactivity) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5" id="designation-dashboard-kpis">
        {/* Total Designations (Interactive modal trigger) */}
        <div 
          onClick={() => setIsTotalListOpen(true)}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer group relative overflow-hidden"
          id="kpi-total"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-105" />
          <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Designations</span>
              <div className="p-2 rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-[#FF6321]/10 group-hover:text-[#FF6321]">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-black tracking-tight text-slate-800">{stats.total}</div>
              <p className="text-[10px] text-[#FF6321] font-semibold mt-1 flex items-center gap-0.5">
                Click to view drilldown users <ChevronRight className="w-3 h-3" />
              </p>
            </div>
          </div>
        </div>

        {/* Active Designations */}
        <div 
          onClick={() => { setSearchStatus('Active'); setSearchDeptId('ALL'); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-emerald-300 transition-all duration-200 cursor-pointer group relative overflow-hidden"
          id="kpi-active"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 rounded-bl-full -mr-4 -mt-4" />
          <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Designations</span>
              <div className="p-2 rounded-xl bg-emerald-100/50 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-black tracking-tight text-slate-800">{stats.active}</div>
              <p className="text-[10px] text-slate-400 mt-1">Operational status cards</p>
            </div>
          </div>
        </div>

        {/* Pending Reviews */}
        <div 
          onClick={() => { setSearchStatus('Review'); setSearchDeptId('ALL'); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-amber-300 transition-all duration-200 cursor-pointer group relative overflow-hidden"
          id="kpi-pending-reviews"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 rounded-bl-full -mr-4 -mt-4" />
          <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Reviews</span>
              <div className="p-2 rounded-xl bg-amber-100/60 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-black tracking-tight text-slate-800">{stats.review}</div>
              <p className="text-[10px] text-amber-600 font-medium mt-1">Required line review</p>
            </div>
          </div>
        </div>

        {/* Pending Approvals */}
        <div 
          onClick={() => { setSearchStatus('Approval'); setSearchDeptId('ALL'); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-indigo-300 transition-all duration-200 cursor-pointer group relative overflow-hidden"
          id="kpi-pending-approvals"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-bl-full -mr-4 -mt-4" />
          <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Approvals</span>
              <div className="p-2 rounded-xl bg-indigo-100/60 text-indigo-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-black tracking-tight text-slate-800">{stats.approval}</div>
              <p className="text-[10px] text-indigo-600 font-medium mt-1">Requires 21 CFR Signature</p>
            </div>
          </div>
        </div>

        {/* Obsolete Designations */}
        <div 
          onClick={() => { setSearchStatus('Obsolete'); setSearchDeptId('ALL'); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-rose-300 transition-all duration-200 cursor-pointer group relative overflow-hidden"
          id="kpi-obsolete"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50/50 rounded-bl-full -mr-4 -mt-4" />
          <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Obsolete</span>
              <div className="p-2 rounded-xl bg-rose-100/50 text-rose-600">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-black tracking-tight text-slate-800">{stats.obsolete}</div>
              <p className="text-[10px] text-slate-400 mt-1">Disabled record catalogs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Structural Layout Grid of Left & Right content modules */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 align-start">
        {/* Left column (4 / 12 width Span) - Summary logs and quick actions */}
        <div className="lg:col-span-4 space-y-8">
          {/* Quick Actions Panel */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4" id="quick-actions-panel">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Sliders className="w-5 h-5 text-[#FF6321]" />
              <h2 className="text-base font-bold text-slate-800">Operational Actions</h2>
            </div>
            <div className="flex flex-col gap-2.5">
              <Button 
                onClick={() => handleOpenForm('create')}
                className="w-full bg-[#FF6321] hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all shadow-orange-500/10"
                id="btn-add-designation"
              >
                <Plus className="w-4 h-4" /> Add Designation
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => { setSearchStatus('Review'); setSearchDeptId('ALL'); }}
                  className="rounded-xl text-xs font-medium border-slate-200/80 hover:bg-slate-50"
                  id="btn-view-quick-reviews"
                >
                  Pending Reviews
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => { setSearchStatus('Approval'); setSearchDeptId('ALL'); }}
                  className="rounded-xl text-xs font-medium border-slate-200/80 hover:bg-slate-50"
                  id="btn-view-quick-approvals"
                >
                  Pending Approvals
                </Button>
              </div>

              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setSearchName('');
                  setSearchDeptId('ALL');
                  setSearchStatus('ALL');
                }}
                className="w-full text-slate-500 hover:text-slate-800 hover:bg-slate-50 text-xs py-2 rounded-xl border border-dashed border-slate-200"
                id="btn-clear-filters"
              >
                Reset All Filters
              </Button>
            </div>
          </div>

          {/* Department-wise Designation Summary */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3" id="department-summary-panel">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#FF6321]" />
                <h2 className="text-base font-bold text-slate-800">Departments Lookup</h2>
              </div>
              <span className="text-[10px] font-bold bg-[#FF6321]/10 text-[#FF6321] px-2 py-0.5 rounded-full">ACTIVE LINES</span>
            </div>
            <div className="overflow-hidden border border-slate-100 rounded-xl">
              <Table id="department-active-totals-table">
                <TableHeader className="bg-slate-50/70">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-500 py-2.5">Department Name</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500 text-right py-2.5">Active Designations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deptsSummary.length === 0 ? (
                    <TableRow key="empty-depts-summary">
                      <TableCell colSpan={2} className="text-center text-xs text-slate-400 py-4">No active departments found</TableCell>
                    </TableRow>
                  ) : (
                    deptsSummary.map((deptSummary: any, idx: number) => (
                      <TableRow key={`dept-summary-row-${deptSummary.id || idx}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="py-2.5 text-xs text-slate-700 font-medium">
                          {deptSummary.name} <span className="text-[10px] text-slate-400">({deptSummary.code})</span>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-bold text-right text-[#FF6321]">
                          <span className="bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">{deptSummary.activeCount}</span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Right column (8 / 12 width Span) - Listing, Search & Filters, Recent Designations */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 overflow-hidden space-y-6" id="designations-list-container">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-800">System Designations List</h2>
              <p className="text-slate-400 text-xs mt-1">Filters apply globally across code parameters and departments.</p>
            </div>
            
            <span className="text-xs font-bold bg-[#1E293B] text-slate-200 px-3 py-1 rounded-full uppercase tracking-wider">
               Showing {filteredDesignations.length} items
            </span>
          </div>

          {/* Filtering Block */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150/80 grid grid-cols-1 sm:grid-cols-3 gap-3.5" id="designations-filter-block">
            {/* Name Search */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-name-search" className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Designation Name</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                <Input 
                  id="filter-name-search"
                  type="text" 
                  placeholder="e.g. Operator" 
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl border-slate-200 focus-visible:ring-[#FF6321]"
                />
              </div>
            </div>

            {/* Department select */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-department-select" className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Department Line</Label>
              <Select value={searchDeptId} onValueChange={setSearchDeptId}>
                <SelectTrigger id="filter-department-select" className="h-9 text-xs rounded-xl border-slate-200 focus:ring-[#FF6321]">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Departments</SelectItem>
                  {departments.map((d: any, idx: number) => {
                    const idVal = d.departmentId || d.id || `filter-dept-${idx}`;
                    return (
                      <SelectItem key={`filter-dept-opt-${idVal}-${idx}`} value={idVal}>{d.departmentName}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Status select */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-status-select" className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Status Workflow</Label>
              <Select value={searchStatus} onValueChange={setSearchStatus}>
                <SelectTrigger id="filter-status-select" className="h-9 text-xs rounded-xl border-slate-200 focus:ring-[#FF6321]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Review">Review</SelectItem>
                  <SelectItem value="Approval">Approval</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Obsolete">Obsolete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Designations Main Table */}
          <div className="border border-slate-150/80 rounded-2xl overflow-hidden shadow-sm">
            <Table id="designations-records-table">
              <TableHeader className="bg-slate-50/80 select-none">
                <TableRow>
                  <TableHead className="font-bold text-slate-600 text-xs">Designation Name</TableHead>
                  <TableHead className="font-bold text-slate-600 text-xs">Department Line</TableHead>
                  <TableHead className="font-bold text-slate-600 text-xs text-center">Version</TableHead>
                  <TableHead className="font-bold text-slate-600 text-xs text-center font-medium">Status</TableHead>
                  <TableHead className="font-bold text-slate-600 text-xs text-right pr-6">Operations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow key="loading-designations-row">
                    <TableCell colSpan={5} className="text-center py-12 text-xs text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-[#FF6321] border-t-transparent rounded-full animate-spin" />
                        Loading designations database...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredDesignations.length === 0 ? (
                  <TableRow key="empty-designations-row">
                    <TableCell colSpan={5} className="text-center py-12 text-slate-400 bg-slate-50/10">
                      <div className="flex flex-col items-center gap-2">
                        <AlertTriangle className="w-8 h-8 text-slate-300" />
                        <p className="text-xs font-semibold text-slate-500">No matching designation masters found.</p>
                        <p className="text-[11px] text-slate-400">Try adjusting your filters or search options.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDesignations.map((desig: any, idx: number) => {
                    // Decide state badges
                    let statusColor = "bg-slate-100 text-slate-600 border-slate-200";
                    if (desig.status === "Active") statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    else if (desig.status === "Review") statusColor = "bg-amber-50 text-amber-700 border-amber-200";
                    else if (desig.status === "Approval") statusColor = "bg-indigo-50 text-indigo-700 border-indigo-200";
                    else if (desig.status === "Obsolete") statusColor = "bg-rose-50 text-rose-700 border-rose-200";

                    const desigUniqueKey = desig.designationId || desig.id || `desig-${idx}`;

                    return (
                      <TableRow key={`desig-table-row-${desigUniqueKey}-v${desig.version || 1}-${idx}`} className="hover:bg-slate-50/50 transition-all font-sans select-none">
                        <TableCell className="font-semibold text-slate-700 text-xs py-3 max-w-xs truncate">
                          <HighlightText text={desig.designationName} search={searchName} />
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs py-3">
                          <HighlightText text={desig.departmentName || "N/A"} search={searchName} />
                        </TableCell>
                        <TableCell className="text-center py-3 text-xs">
                          <span className="bg-slate-50 border border-slate-150 px-2 py-0.5 rounded font-mono text-xs font-medium text-slate-600">v{desig.version || 1}</span>
                        </TableCell>
                        <TableCell className="text-center py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusColor}`}>
                            {desig.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-3 pr-6 space-x-1.5">
                          {/* VIEW details dialog */}
                          <button 
                            onClick={() => handleOpenViewDetails(desig)}
                            title="View history and timeline"
                            className="p-1.5 rounded-lg border border-slate-150 hover:bg-slate-50 text-slate-600 transition-colors inline-flex items-center gap-1 text-xs font-medium"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-400" /> View
                          </button>

                          {/* EDIT handler */}
                          {desig.status !== 'Obsolete' && (
                            <button 
                              onClick={() => handleOpenForm('edit', desig)}
                              title="Modify data (Active & review states will spawn new version)"
                              className="p-1.5 rounded-lg border border-slate-150 hover:bg-slate-50 text-slate-600 transition-colors inline-flex items-center gap-1 text-xs font-medium"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-400" /> Edit
                            </button>
                          )}

                          {/* SUBMIT transition */}
                          {desig.status === 'Draft' && (
                            <button 
                              onClick={() => handleStandardTransition(desig.designationId, "submit")}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] roundedU uppercase tracking-wider transition-colors shadow-sm rounded-md"
                            >
                              Submit
                            </button>
                          )}

                          {/* REVIEW -> APPROVAL transition with signature */}
                          {desig.status === 'Review' && (
                            <button 
                              onClick={() => handleOpenSignatureChallenge(desig.designationId, "approve")}
                              className="px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-[10px] roundedU uppercase tracking-wider transition-colors shadow-sm rounded-md"
                            >
                              Approve
                            </button>
                          )}

                          {/* APPROVAL -> ACTIVE transition with signature */}
                          {desig.status === 'Approval' && (
                            <button 
                              onClick={() => handleOpenSignatureChallenge(desig.designationId, "activate")}
                              className="px-2 py-1 bg-[#FF6321] hover:bg-orange-600 text-white font-bold text-[10px] roundedU uppercase tracking-wider transition-colors shadow-sm rounded-md"
                            >
                              Activate
                            </button>
                          )}

                          {/* ACTIVE -> OBSOLETE transition with signature */}
                          {desig.status === 'Active' && (
                            <button 
                              onClick={() => handleOpenSignatureChallenge(desig.designationId, "obsolete")}
                              className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white font-bold text-[10px] roundedU uppercase tracking-wider transition-colors shadow-sm rounded-md"
                            >
                              Obsolete
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* MODAL 1: ADD / EDIT DESIGNATION */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg p-6 bg-white rounded-3xl max-h-[90vh] overflow-y-auto font-sans select-none">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-5 h-5 text-[#FF6321]" />
              {formMode === 'create' ? 'Add Designation Master Record' : 'Modify Designation Master'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 mt-1">
              GMP rules are enforced automatically. Modifying Active, Review, or Approval designations initiates a fork spawning a new Draft version.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="form-desig-name" className="text-xs font-bold text-slate-600">Designation Name <span className="text-rose-500">*</span></Label>
              <Input 
                id="form-desig-name"
                type="text"
                placeholder="e.g. Production Operator"
                required
                value={formData.designationName}
                onChange={(e) => setFormData(prev => ({ ...prev, designationName: e.target.value }))}
                className="rounded-xl mt-1 border-slate-200 text-xs focus-visible:ring-[#FF6321]"
              />
            </div>

            {/* Department (Select matching active departments) */}
            <div className="space-y-1.5">
              <Label htmlFor="form-desig-department" className="text-xs font-bold text-slate-600">Active Department Base <span className="text-rose-500">*</span></Label>
              <Select 
                disabled={formMode === 'edit'}
                value={formData.departmentId} 
                onValueChange={(val) => setFormData(prev => ({ ...prev, departmentId: val }))}
              >
                <SelectTrigger id="form-desig-department" className="rounded-xl mt-1 border-slate-200 text-xs focus:ring-[#FF6321]">
                  <SelectValue placeholder="Select active department Base" />
                </SelectTrigger>
                <SelectContent>
                  {departments.filter((d: any) => d.status === "Active").map((d: any, idx: number) => {
                    const idVal = d.departmentId || d.id || `form-active-dept-${idx}`;
                    return (
                      <SelectItem key={`form-active-dept-${idVal}-${idx}`} value={idVal}>{d.departmentName} ({d.departmentCode})</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="form-desig-desc" className="text-xs font-bold text-slate-600">Job Description / Scope</Label>
              <Input 
                id="form-desig-desc"
                type="text"
                placeholder="Core role duties and GMP expectations"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="rounded-xl mt-1 border-slate-200 text-xs focus-visible:ring-[#FF6321]"
              />
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label htmlFor="form-desig-remarks" className="text-xs font-bold text-slate-600">Compliance Remarks</Label>
              <Textarea 
                id="form-desig-remarks"
                placeholder="Optional qualification requirements or safety training SOP indicators"
                value={formData.remarks}
                onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                className="rounded-xl mt-1 border-slate-200 text-xs min-h-[60px] focus-visible:ring-[#FF6321]"
              />
            </div>

            {/* Change Reason for Edit Spawns */}
            {formMode === 'edit' && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1.5">
                <Label htmlFor="form-desig-reason" className="text-xs font-bold text-amber-800 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" /> GxP Change Reason Validation <span className="text-rose-500">*</span>
                </Label>
                <Input 
                  id="form-desig-reason"
                  type="text"
                  required
                  placeholder="Specify GxP reason (e.g. Updating qualifications requirement)"
                  value={formData.changeReason}
                  onChange={(e) => setFormData(prev => ({ ...prev, changeReason: e.target.value }))}
                  className="rounded-xl border-amber-300 text-xs bg-white focus-visible:ring-amber-500 text-slate-800"
                />
              </div>
            )}

            <DialogFooter className="border-t border-slate-100 pt-4 mt-6">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} className="rounded-xl text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-[#FF6321] hover:bg-orange-600 text-white font-semibold rounded-xl text-xs px-5">
                {loading ? "Saving..." : formMode === 'create' ? "Save Draft" : "Commit Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: INTERACTIVE TOTAL DESIGNATIONS LIST & MEMBERS */}
      <Dialog open={isTotalListOpen} onOpenChange={setIsTotalListOpen}>
        <DialogContent className="max-w-2xl bg-white p-6 rounded-3xl max-h-[90vh] overflow-y-auto select-none font-sans">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#FF6321]" />
              BRIMS Designations Drilldown List
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Click on any Designation row inside this drilldown catalog to isolate matching users from the profile registry panel.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4 max-h-[400px] overflow-y-auto">
            <div className="border border-slate-150 rounded-2xl overflow-hidden shadow-sm">
              <Table id="total-designations-list-drilldown-table">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-600">Designation Name</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600">Department</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-center">Version</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-center">Members</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {designations.length === 0 ? (
                    <TableRow key="empty-drilldown-desigs">
                      <TableCell colSpan={4} className="text-center text-xs text-slate-400 py-4">No designations found</TableCell>
                    </TableRow>
                  ) : (
                    designations.map((desig: any, idx: number) => {
                      const matchUserCount = usersForDesignation(desig.designationName).length;
                      const desigKey = desig.designationId || desig.id || `drilldown-desig-${idx}`;
                      return (
                        <TableRow 
                          key={`drilldown-desig-row-${desigKey}-v${desig.version || 1}-${idx}`} 
                          onClick={() => {
                            setSelectedTotalDesig(desig);
                            setIsDesignationUsersOpen(true);
                          }}
                          className="hover:bg-[#FF6321]/5 cursor-pointer transition-colors"
                        >
                        <TableCell className="text-xs font-semibold text-slate-700 py-3">{desig.designationName}</TableCell>
                        <TableCell className="text-xs text-slate-500 py-3">{desig.departmentName}</TableCell>
                        <TableCell className="text-xs text-center py-3">v{desig.version}</TableCell>
                        <TableCell className="text-xs text-center py-3 font-bold text-[#FF6321]">
                          <span className="bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-lg flex items-center gap-1 justify-center w-12 mx-auto">
                            <Users className="w-3 h-3 text-[#FF6321]/80" /> {matchUserCount}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl text-xs" onClick={() => setIsTotalListOpen(false)}>
              Close list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DRILLDOWN MODAL 2A: USERS UNDER SPECIFIC DESIGNATION */}
      <Dialog open={isDesignationUsersOpen} onOpenChange={setIsDesignationUsersOpen}>
        <DialogContent className="max-w-lg bg-white p-6 rounded-3xl max-h-[90vh] overflow-y-auto select-none font-sans border border-slate-200">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <User className="w-5 h-5 text-[#FF6321]" />
              Staff Registry For: {selectedTotalDesig?.designationName}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Department Line: <span className="text-slate-600 font-bold">{selectedTotalDesig?.departmentName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 max-h-[350px] overflow-y-auto space-y-3">
            {selectedTotalDesig && usersForDesignation(selectedTotalDesig.designationName).length === 0 ? (
              <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-2">
                <AlertTriangle className="w-7 h-7 text-slate-300" />
                <p className="text-xs font-semibold text-slate-500">No active staff members are currently registered with this designation.</p>
                <p className="text-[10px] text-slate-400">Assign this designation value to a user profile in the Admin Panel to link them.</p>
              </div>
            ) : (
              <div className="space-y-2 mt-2">
                {selectedTotalDesig && usersForDesignation(selectedTotalDesig.designationName).map((u: any, idx: number) => (
                  <div key={`user-reg-${u.uid || u.id || u.employeeId || u.email || idx}-${idx}`} className="flex justify-between items-center bg-slate-100/50 p-3 rounded-2xl border border-slate-200/50 hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="text-xs font-bold text-slate-800">{u.displayName || u.username}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{u.email}</div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <span className="text-[10px] bg-slate-100 font-semibold px-2 py-0.5 rounded border border-slate-200 text-slate-600 uppercase tracking-wide">
                        ID: {u.employeeId || 'N/A'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[9px] font-bold ${u.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                        <span className={`w-1 h-1 rounded-full ${u.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {u.status || 'Active'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 pt-2 border-t border-slate-50">
            <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => setIsDesignationUsersOpen(false)}>
              Back to Catalog
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: VIEW DETAILS (With Tabs for Metadata, Approval Timeline, and Audit Trail logs) */}
      <Dialog open={detailDesig !== null} onOpenChange={() => setDetailDesig(null)}>
        <DialogContent className="max-w-3xl bg-white p-6 rounded-3xl max-h-[90vh] overflow-y-auto select-none font-sans border border-slate-200">
          <DialogHeader className="border-b border-slate-100 pb-3 flex flex-row justify-between items-start">
            <div>
              <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#FF6321]" />
                {detailDesig?.designationName} DETAILS
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-1">
                Isolate historical updates, approval checkpoints, and deep 21 CFR Part 11 audit records for designation ID: {detailDesig?.designationId}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Toggle Tabs */}
          <div className="flex border-b border-slate-100 py-2 gap-4">
            <button
              onClick={() => setActiveTab('details')}
              className={`pb-2 text-xs font-bold border-b-2 transition-all px-2 ${activeTab === 'details' ? 'border-[#FF6321] text-[#FF6321]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              id="details-tab"
            >
              General Info
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`pb-2 text-xs font-bold border-b-2 transition-all px-2 ${activeTab === 'timeline' ? 'border-[#FF6321] text-[#FF6321]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              id="timeline-tab"
            >
              Approval Timeline ({timelineLogs.length})
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`pb-2 text-xs font-bold border-b-2 transition-all px-2 ${activeTab === 'audit' ? 'border-[#FF6321] text-[#FF6321]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              id="audit-tab"
            >
              GxP Audit Logs ({auditLogs.length})
            </button>
          </div>

          <div className="py-4 overflow-y-auto max-h-[420px]" id="detail-modal-tab-wrapper">
            {/* TAB Details */}
            {activeTab === 'details' && detailDesig && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-2">
                <div className="space-y-3.5 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Specifications</h3>
                  
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Designation Name</span>
                    <span className="text-xs font-semibold text-slate-700">{detailDesig.designationName}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Parent Department Line</span>
                    <span className="text-xs text-slate-700 font-medium">{detailDesig.departmentName}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Catalog Version</span>
                    <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded bg-white text-xs border border-slate-200 font-mono text-slate-600 font-bold">
                       v{detailDesig.version || 1}
                    </span>
                  </div>
                </div>

                <div className="space-y-3.5 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Workflow Metadata</h3>
                  
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Current Lifecycle Status</span>
                    <span className="inline-flex mt-1 items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-slate-100 text-[#FF6321] border-[#FF6321]/30">
                      {detailDesig.status}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Initial Drafted By</span>
                    <span className="text-xs text-slate-600 font-medium">{detailDesig.createdBy}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Drafted On</span>
                    <span className="text-xs text-slate-500 font-mono">{detailDesig.createdOn ? new Date(detailDesig.createdOn).toLocaleString() : 'N/A'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Scope Details</span>
                    <p className="text-xs text-slate-600 leading-relaxed mt-0.5 italic">{detailDesig.description || 'No direct scope configured in this version'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB Timeline (Approval lifecycle tracing) */}
            {activeTab === 'timeline' && (
              <div className="space-y-4 py-2">
                {logsLoading ? (
                  <div className="text-center py-8 text-xs text-slate-400">Loading timeline logging...</div>
                ) : timelineLogs.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 italic">No timeline entries found.</div>
                ) : (
                  <div className="relative pl-6 border-l border-slate-200 space-y-6">
                    {timelineLogs.map((log: any, idx: number) => (
                      <div key={`timeline-item-${log.timelineId || log.id || idx}-${idx}`} className="relative">
                        {/* Dot */}
                        <div className="absolute -left-[30px] top-1 w-4 h-4 rounded-full bg-white border-2 border-[#FF6321] flex items-center justify-center z-10">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#FF6321]" />
                        </div>
                        
                        {/* Box */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150 shadow-sm space-y-1.5">
                          <div className="flex justify-between items-start gap-4">
                            <span className="text-xs font-black text-[#FF6321]">{log.action || 'Workflow Entry'}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-[11px] text-slate-500 border-t border-slate-100 pt-1.5">
                            <div>
                              <span className="font-semibold text-slate-400">By:</span> {log.userName} (ID: {log.userId})
                            </div>
                            <div>
                              <span className="font-semibold text-slate-400">Department:</span> {log.department}
                            </div>
                          </div>

                          <div className="text-xs text-slate-600 mt-1.5 bg-white p-2 rounded-lg border border-slate-100 font-medium italic">
                            Comments: {log.comments || log.reason || "N/A"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB Audit Log Triggers */}
            {activeTab === 'audit' && (
              <div className="space-y-3.5 py-1">
                {logsLoading ? (
                  <div className="text-center py-8 text-xs text-slate-400">Loading GxP audit parameters...</div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 italic">No audit log records located.</div>
                ) : (
                  <div className="space-y-3 select-text">
                    {auditLogs.map((log: any, idx: number) => (
                      <div key={`audit-log-item-${log.logId || log.id || idx}-${idx}`} className="p-4 rounded-2xl border border-slate-150 bg-slate-50 space-y-2">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-2">
                          <span className="text-xs bg-slate-200 font-bold px-2.5 py-0.5 rounded text-slate-700">ACTION: {log.action || "Log"}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="text-slate-400 text-[10px] font-bold uppercase">Authorized User</p>
                            <p className="font-semibold text-slate-700 text-xs truncate mt-0.5">{log.user}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-[10px] font-bold uppercase">Change Reason</p>
                            <p className="text-xs font-medium text-slate-600 mt-0.5">{log.reason || "N/A"}</p>
                          </div>
                        </div>

                        {log.signatureId && (
                          <div className="bg-[#1E293B] text-slate-200 p-2.5 rounded-xl border border-slate-700/80 text-[10px] flex justify-between items-center gap-2">
                            <span className="font-bold text-[#FF6321] flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> 21 CFR COMPLIANT ELECTRONIC SIGNATURE RECORD
                            </span>
                            <span className="font-mono text-slate-400">ID: {log.signatureId}</span>
                          </div>
                        )}

                        {/* If old and new values differ, show delta in a technical expand block */}
                        {log.oldValue && (
                          <div className="text-[10px] bg-slate-150 p-2.5 rounded-xl border border-slate-200 mt-1 text-slate-600 space-y-1">
                            <span className="font-bold uppercase text-[9px] block text-slate-500">Record Delta</span>
                            <div className="grid grid-cols-2 gap-4 font-mono text-[9px] bg-white p-2 rounded-lg border border-slate-100">
                              <div>
                                <span className="font-bold text-rose-600 text-[8px] block uppercase">PREVIOUS VALUE:</span>
                                <span className="block truncate">Name: {log.oldValue.designationName}</span>
                                <span className="block">Status: {log.oldValue.status}</span>
                                <span className="block">Version: v{log.oldValue.version}</span>
                              </div>
                              <div>
                                <span className="font-bold text-emerald-600 text-[8px] block uppercase">NEW UPDATE VALUE:</span>
                                <span className="block truncate">Name: {log.newValue?.designationName}</span>
                                <span className="block">Status: {log.newValue?.status}</span>
                                <span className="block">Version: v{log.newValue?.version}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Part 11 CFR Electronic Signature Challenge Dialog */}
      <Dialog open={isSigOpen} onOpenChange={setIsSigOpen}>
        <DialogContent className="max-w-md bg-white p-6 rounded-3xl max-h-[90vh] overflow-y-auto select-none font-sans border-2 border-orange-500/30">
          <DialogHeader className="border-b border-orange-100 pb-3">
            <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-[#FF6321]" />
              Double-Verified Electronic Signature
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
               Compliant with 21 CFR Part 11 electronic records regulatory directives. Sign-off credentials are authenticated live.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSignatureSubmit} className="space-y-4 py-4">
            <div className="bg-[#1E293B] text-slate-200 p-4 rounded-2xl border border-slate-700/80 text-xs leading-relaxed space-y-2">
              <p className="font-bold text-[#FF6321] uppercase tracking-wider text-[10px]">Part 11 Declaration Statement</p>
              <p className="italic font-medium text-slate-300">
                "I certify that my password confirmation below matches my biometric electronic footprint. Signing this item binds me legally to the status change of this Designation Master catalog."
              </p>
            </div>

            {/* Email (Disabled display of current logged-in user email) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">Authorized Signatory Email</Label>
              <Input 
                type="email"
                disabled
                value={user?.email || "N/A"}
                className="rounded-xl mt-1 bg-slate-50 border-slate-200 text-xs text-slate-500 font-bold"
              />
            </div>

            {/* GxP Change/Activation Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="sig-reason-input" className="text-xs font-bold text-slate-600">Compliance Reason / Remarks <span className="text-rose-500">*</span></Label>
              <Input 
                id="sig-reason-input"
                type="text"
                required
                placeholder="e.g. Validated credentials update, Obsoleting old role..."
                value={sigReason}
                onChange={(e) => setSigReason(e.target.value)}
                className="rounded-xl mt-1 border-slate-200 text-xs focus-visible:ring-[#FF6321]"
              />
            </div>

            {/* Password verification challenge */}
            <div className="space-y-1.5">
              <Label htmlFor="sig-password-challenge" className="text-xs font-bold text-[#FF6321]">Enter Account Password To Complete Signature <span className="text-rose-500">*</span></Label>
              <Input 
                id="sig-password-challenge"
                type="password"
                required
                placeholder="••••••••••••"
                value={sigPassword}
                onChange={(e) => setSigPassword(e.target.value)}
                className="rounded-xl mt-1 border-slate-200 text-xs tracking-widest focus-visible:ring-[#FF6321]"
              />
            </div>

            <DialogFooter className="border-t border-slate-100 pt-4 mt-6">
              <Button type="button" variant="outline" onClick={() => setIsSigOpen(false)} className="rounded-xl text-xs">
                Decline
              </Button>
              <Button type="submit" disabled={sigLoading} className="bg-[#FF6321] hover:bg-orange-600 text-white font-semibold rounded-xl text-xs px-5 shadow-sm shadow-orange-500/20">
                {sigLoading ? "Verifying..." : "Validate & Sign"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
