import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { toast } from 'sonner';
import api from '../services/api';
import { 
  Building2, 
  Plus, 
  Search, 
  CheckCircle2, 
  FileText, 
  ShieldCheck, 
  History, 
  Info, 
  ArrowUpDown, 
  TrendingUp, 
  Clock, 
  Lock, 
  Users,
  GitPullRequest,
  Check,
  AlertTriangle,
  Eye,
  Edit2,
  Trash2
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

// Standard Suggested Departments
const SUGGESTED_DEPARTMENTS = [
  { code: "PROD", name: "Production", desc: "Core manufacturing and secondary assembly lines" },
  { code: "QA", name: "Quality Assurance (QA)", desc: "Quality compliance, GAMP, and product batch validation" },
  { code: "QC", name: "Quality Control (QC)", desc: "Material testing, assays, and final product evaluation" },
  { code: "WH", name: "Warehouse", desc: "Raw supply transit, inbound logistics, and final distribution" },
  { code: "ENG", name: "Engineering", desc: "Equipment upgrades, equipment calibration, and industrial systems" },
  { code: "EHS", name: "EHS", desc: "Environment, Health, and Operational Safety compliance" },
  { code: "IT", name: "IT", desc: "System administration, cloud network infrastructure, and computer security" },
  { code: "PUR", name: "Purchase", desc: "Vendor relations, item procurement, and raw supply contracts" },
  { code: "STR", name: "Stores", desc: "Brims inventory tracking and component allocation" },
  { code: "PLN", name: "Planning", desc: "Production scheduling and delivery timeline coordination" },
  { code: "MNT", name: "Maintenance", desc: "Preventive plant service and machinery upkeep operations" },
  { code: "ADM", name: "Administration", desc: "Corporate support, plant permits, and global office supervision" },
  { code: "HR", name: "Human Resources (HR)", desc: "Employee records, personnel training verification, and recruiting" },
  { code: "FIN", name: "Finance", desc: "Accounting systems, plant expenditures, and general audit reviews" },
  { code: "RA", name: "Regulatory Affairs", desc: "FDA protocols, GMP certifications, and global submissions" },
  { code: "MIC", name: "Microbiology", desc: "Sterility checks, bioburden assessments, and assay analyses" },
  { code: "RD", name: "Research & Development (R&D)", desc: "Experimental formulations, material testing, and research" },
  { code: "VAL", name: "Validation", desc: "Machine certifications, computer system validation, and process protocols" },
  { code: "PRJ", name: "Projects", desc: "Plant expansions, industrial projects, and utility upgrades" },
  { code: "SEC", name: "Security", desc: "In-plant patrol and access tracking" },
  { code: "UTL", name: "Utilities", desc: "Purified water, power systems, steam grids, and HVAC networks" },
  { code: "TRN", name: "Training", desc: "Employee SOP training and certification verification" },
  { code: "DOC", name: "Document Control", desc: "Master archives and physical batch sheet version records" }
];

export default function DepartmentMasters() {
  const { user } = useAuth();
  const { selectedBranch } = useBranch();

  const checkPermission = (action: 'create' | 'submit' | 'approve' | 'edit') => {
    if (user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com') {
      return true;
    }
    const userPermissions = user?.permissions || [];
    if (action === 'create' && !userPermissions.includes('department:create')) {
      toast.error("Access Denied: You do not have 'Create Department Master' permission.");
      return false;
    }
    if (action === 'edit' && !userPermissions.includes('department:create')) {
      toast.error("Access Denied: You do not have 'Create Department Master' permission to edit records.");
      return false;
    }
    if (action === 'submit' && !userPermissions.includes('department:submit')) {
      toast.error("Access Denied: You do not have 'Submit Department Master' permission.");
      return false;
    }
    if (action === 'approve' && !userPermissions.includes('department:approve')) {
      toast.error("Access Denied: You do not have 'Approve Department Master' permission.");
      return false;
    }
    return true;
  };

  // Users state for mapping usernames and employee ids
  const [users, setUsers] = useState<any[]>([]);

  // Departments & Audit state
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    review: 0,
    approval: 0,
    obsolete: 0
  });

  // Filters State
  const [searchCode, setSearchCode] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchStatus, setSearchStatus] = useState<string>('ALL');
  
  // Table Sorting & Pagination State
  const [sortField, setSortField] = useState('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Selected Department / Dialogs
  const [selectedDept, setSelectedDept] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'audit'>('details');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Suggested Standard Tile State
  const [isSuggestHovered, setIsSuggestHovered] = useState(false);

  // Create/Edit form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    departmentCode: '',
    departmentName: '',
    description: '',
    branchType: 'Single' as 'Single' | 'Multi',
    allowedBranches: [] as string[],
    changeReason: ''
  });

  // eSignature Modal State
  const [isSigOpen, setIsSigOpen] = useState(false);
  const [sigAction, setSigAction] = useState<string>(''); // approve, activate, obsolete
  const [sigPassword, setSigPassword] = useState('');
  const [sigReason, setSigReason] = useState('');
  const [sigLoading, setSigLoading] = useState(false);

  // Fetch departments data
  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/departments');
      if (res.data && res.data.success) {
        const list = res.data.data || [];
        setDepartments(list);
        calculateStats(list);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
    api.get('/users')
      .then(res => {
        if (res.data && res.data.success) {
          setUsers(res.data.data || []);
        }
      })
      .catch(err => console.warn("Failed to load users for format mappings", err));
  }, [selectedBranch]);

  const getUserDisplay = (uidOrStr: string) => {
    if (!uidOrStr) return 'System';
    if (uidOrStr.includes(' - ')) return uidOrStr;

    const found = users.find(u => u.uid === uidOrStr || u.id === uidOrStr || u.email?.toLowerCase() === uidOrStr.toLowerCase() || u.username?.toLowerCase() === uidOrStr.toLowerCase());
    if (found) {
      if (found.employeeId && (found.username || found.displayName)) {
        return `${found.employeeId} - ${found.username || found.displayName}`;
      }
      if (found.employeeId) {
        return `${found.employeeId} - ${found.email?.split('@')[0] || 'user'}`;
      }
      return found.username || found.displayName || found.email?.split('@')[0] || uidOrStr;
    }
    if (uidOrStr.includes('@')) {
      if (uidOrStr.toLowerCase() === 'shakshay04@gmail.com' || uidOrStr.toLowerCase() === 'shakshay04@brims.com') {
        return "Admin - admin";
      }
      return uidOrStr.split('@')[0];
    }
    return uidOrStr;
  };

  // Recalculate Dashboard counters (branch filtered)
  const calculateStats = (list: any[]) => {
    // Current branch check
    const filtered = list.filter((d: any) => {
      if (!selectedBranch) return true;
      return d.allowedBranches?.includes(selectedBranch);
    });

    const active = filtered.filter((d: any) => d.status === 'Active').length;
    const review = filtered.filter((d: any) => d.status === 'Review').length;
    const approval = filtered.filter((d: any) => d.status === 'Approval').length;
    const obsolete = filtered.filter((d: any) => d.status === 'Obsolete').length;

    setStats({
      total: filtered.length,
      active,
      review,
      approval,
      obsolete
    });
  };

  // Fetch Audit Logs for selected department
  const fetchAuditLogs = async (id: string) => {
    try {
      setAuditLoading(true);
      const res = await api.get(`/departments/${id}/audit-logs`);
      if (res.data && res.data.success) {
        setAuditLogs(res.data.data || []);
      }
    } catch (err: any) {
      toast.error("Failed to load audit trail");
    } finally {
      setAuditLoading(false);
    }
  };

  // Trigger loading details of record
  const handleSelectDept = (dept: any) => {
    setSelectedDept(dept);
    setActiveTab('details');
    fetchAuditLogs(dept.departmentId);
  };

  // Suggest Hover Card Handler: Auto-fill fields inside creation form
  const handleSelectSuggested = (item: any) => {
    if (!checkPermission('create')) return;
    setFormData(prev => ({
      ...prev,
      departmentCode: item.code,
      departmentName: item.name,
      description: item.desc
    }));
    toast.success(`Preloaded suggested standard department: ${item.name}`);
  };

  // Create Mode Trigger
  const handleOpenCreate = () => {
    if (!checkPermission('create')) return;
    setFormMode('create');
    setFormData({
      departmentCode: '',
      departmentName: '',
      description: '',
      branchType: 'Single',
      allowedBranches: selectedBranch ? [selectedBranch] : ['Masulkhana'],
      changeReason: 'Initial setup draft'
    });
    setIsFormOpen(true);
  };

  // Edit Mode Trigger (with safety for Active state)
  const handleOpenEdit = (dept: any) => {
    if (!checkPermission('edit')) return;
    setFormMode('edit');
    setFormData({
      departmentCode: dept.departmentCode,
      departmentName: dept.departmentName,
      description: dept.description,
      branchType: dept.branchType || 'Single',
      allowedBranches: dept.allowedBranches || [dept.branch],
      changeReason: dept.status === 'Active' ? '' : 'Modifying draft record'
    });
    setIsFormOpen(true);
  };

  // Handle Create or Edit Form Submission
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formMode === 'create') {
      if (!checkPermission('create')) return;
    } else {
      if (!checkPermission('edit')) return;
    }

    if (!formData.departmentCode.trim()) {
      toast.error("Department Code is mandatory");
      return;
    }
    if (!formData.departmentName.trim()) {
      toast.error("Department Name is mandatory");
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Department Description is mandatory");
      return;
    }
    if (formData.allowedBranches.length === 0) {
      toast.error("Please assign at least one branch");
      return;
    }

    try {
      if (formMode === 'create') {
        const payload = {
          departmentCode: formData.departmentCode.toUpperCase(),
          departmentName: formData.departmentName,
          description: formData.description,
          branchType: formData.branchType,
          allowedBranches: formData.allowedBranches,
          branch: formData.allowedBranches[0]
        };
        const res = await api.post('/departments', payload);
        if (res.data && res.data.success) {
          toast.success("Department Draft created successfully");
          fetchDepartments();
          setIsFormOpen(false);
          // Highlight new record
          if (res.data.data) {
            handleSelectDept(res.data.data);
          }
        }
      } else {
        // Edit Mode
        const payload = {
          departmentName: formData.departmentName,
          description: formData.description,
          branchType: formData.branchType,
          allowedBranches: formData.allowedBranches,
          changeReason: formData.changeReason || "Draft update"
        };
        const res = await api.put(`/departments/${selectedDept.departmentId}`, payload);
        if (res.data && res.data.success) {
          if (selectedDept.status === 'Active') {
            toast.success("Active records cannot be directly edited. A new Draft version (V" + res.data.data.version + ") has been successfully spawned!");
          } else {
            toast.success("Department draft updated successfully");
          }
          fetchDepartments();
          setIsFormOpen(false);
          if (res.data.data) {
            handleSelectDept(res.data.data);
          }
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Operation failed");
    }
  };

  // Submit Draft for Review
  const handleSubmitForReview = async (dept: any) => {
    if (!checkPermission('submit')) return;
    try {
      const res = await api.post(`/departments/${dept.departmentId}/submit`, {
        reason: "Submitting draft department specs for QA review"
      });
      if (res.data && res.data.success) {
        toast.success("Department submitted for QA review successfully");
        fetchDepartments();
        if (res.data.data) {
          handleSelectDept(res.data.data);
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to submit department");
    }
  };

  // Trigger eSignature Verification Modal
  const triggerSignatureModal = (action: string, deptToUse?: any) => {
    const isDelete = action === 'delete';
    const isAdminUser = user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com';
    
    if (isDelete) {
      if (!isAdminUser) {
        toast.error("Access Denied: Only Administrators can delete department records.");
        return;
      }
    } else {
      if (!checkPermission('approve')) return;
    }

    if (deptToUse) {
      setSelectedDept(deptToUse);
    }

    setSigAction(action);
    setSigPassword('');
    setSigReason('');
    setIsSigOpen(true);
  };

  // Complete eSignature with verification and execute transition
  const handleSignatureConfirm = async () => {
    if (!sigPassword) {
      toast.error("Password confirmation is required");
      return;
    }
    if (sigAction !== 'approve' && !sigReason.trim()) {
      toast.error("Signature reason is required");
      return;
    }

    try {
      setSigLoading(true);
      const isDelete = sigAction === 'delete';
      const endpoint = `/departments/${selectedDept.departmentId}${isDelete ? '' : '/' + sigAction}`;
      const payload = {
        password: sigPassword,
        reason: sigAction === 'approve' ? 'Approved Department Master' : sigReason
      };

      const res = isDelete 
        ? await api.delete(endpoint, { data: payload }) 
        : await api.post(endpoint, payload);

      if (res.data && res.data.success) {
        if (isDelete) {
          toast.success("Department Master deleted successfully with E-sign control.");
          setSelectedDept(null);
        } else {
          toast.success(`Electronic Signature validated under 21 CFR Part 11. Department state changed successfully.`);
        }
        setIsSigOpen(false);
        fetchDepartments();
        if (!isDelete && res.data.data) {
          handleSelectDept(res.data.data);
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Signature validation failed");
    } finally {
      setSigLoading(false);
    }
  };

  // Sorting Handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Branch Selector toggle
  const toggleBranchSelection = (branchName: string) => {
    if (formData.branchType === 'Single') {
      setFormData(prev => ({
        ...prev,
        allowedBranches: [branchName]
      }));
    } else {
      const current = [...formData.allowedBranches];
      if (current.includes(branchName)) {
        if (current.length > 1) {
          setFormData(prev => ({
            ...prev,
            allowedBranches: current.filter(b => b !== branchName)
          }));
        } else {
          toast.warning("A multi-branch department must support at least one branch.");
        }
      } else {
        setFormData(prev => ({
          ...prev,
          allowedBranches: [...current, branchName]
        }));
      }
    }
  };

  // Process data with filtering, sorting and pagination
  const filteredDepartments = departments.filter((dept) => {
    // Branch Filter (Always respect chosen top-bar header context branch!)
    if (selectedBranch && !dept.allowedBranches?.includes(selectedBranch)) {
      return false;
    }

    // Search filters
    if (searchCode && !dept.departmentCode.toLowerCase().includes(searchCode.toLowerCase().trim())) {
      return false;
    }
    if (searchName && !dept.departmentName.toLowerCase().includes(searchName.toLowerCase().trim())) {
      return false;
    }
    if (searchStatus !== 'ALL' && dept.status !== searchStatus) {
      return false;
    }
    return true;
  });

  const sortedDepartments = [...filteredDepartments].sort((a, b) => {
    let orderA = a[sortField] || '';
    let orderB = b[sortField] || '';
    
    if (typeof orderA === 'string') {
      orderA = orderA.toLowerCase();
      orderB = orderB.toLowerCase();
    }
    
    if (orderA < orderB) return sortDirection === 'asc' ? -1 : 1;
    if (orderA > orderB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const pageCount = Math.ceil(sortedDepartments.length / itemsPerPage);
  const paginatedDepartments = sortedDepartments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl border border-slate-800 text-white shadow-xl shadow-indigo-950/10 relative">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-radial-gradient from-orange-500/10 to-transparent pointer-events-none opacity-50 rounded-r-2xl" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight font-sans">Department Master Module</h1>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              GMP compliant plant organizational taxonomy master. Standardizes routing configurations across batches, user roles, signatures, and quality controls.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 relative z-10 self-start md:self-center">
          {/* hovering Standard Suggested list */}
          <div 
            className="relative"
            onMouseEnter={() => setIsSuggestHovered(true)}
            onMouseLeave={() => setIsSuggestHovered(false)}
          >
            <button className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all max-w-[170px] whitespace-nowrap">
              <Users className="w-4 h-4 text-orange-500" />
              Standard Suggestion
            </button>
            
            {isSuggestHovered && (
              <div className="absolute z-50 right-0 mt-2 w-72 max-h-96 overflow-y-auto bg-white rounded-2xl border border-slate-100 shadow-2xl p-4 text-slate-800 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                <div className="border-b border-slate-50 pb-2 mb-2">
                  <p className="text-[11px] font-black text-indigo-600 uppercase tracking-wider">Suggested Standard Departments</p>
                  <p className="text-[10px] text-slate-400">Hover expand - Click to pre-fill draft creation form</p>
                </div>
                <div className="space-y-1">
                  {SUGGESTED_DEPARTMENTS.map((item) => (
                    <button
                      key={item.code}
                      onClick={() => handleSelectSuggested(item)}
                      className="w-full text-left p-2 rounded-xl hover:bg-orange-50 hover:text-orange-950 transition-colors group flex items-start gap-2"
                    >
                      <span className="text-[10px] font-black font-mono bg-slate-100 group-hover:bg-orange-100 text-slate-600 group-hover:text-orange-700 px-1.5 py-0.5 rounded uppercase mt-0.5">{item.code}</span>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-700 group-hover:text-orange-900 leading-snug">{item.name}</p>
                        <p className="text-[10px] text-slate-400 group-hover:text-orange-800 leading-normal">{item.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button 
            onClick={handleOpenCreate} 
            className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-lg shadow-orange-500/10 px-4 py-5 font-bold text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Department
          </Button>
        </div>
      </div>

      {/* 2. Dashboard Widget */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Building2 className="w-16 h-16 text-slate-900" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Departments</span>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="text-3xl font-black tracking-tight text-slate-900">{stats.total}</span>
            <span className="text-[10px] text-slate-400 font-mono">Site taxonomy</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col justify-between shadow-sm relative overflow-hidden ring-1 ring-emerald-100">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <CheckCircle2 className="w-16 h-16 text-emerald-600" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Departments</span>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="text-3xl font-black tracking-tight text-emerald-600">{stats.active}</span>
            <span className="text-[10px] text-emerald-500 font-medium">GMP Ready</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col justify-between shadow-sm relative overflow-hidden ring-1 ring-amber-100">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Clock className="w-16 h-16 text-amber-500" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Review</span>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="text-3xl font-black tracking-tight text-amber-500">{stats.review}</span>
            <span className="text-[10px] text-amber-500 font-medium">Under Review</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col justify-between shadow-sm relative overflow-hidden ring-1 ring-amber-100">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <GitPullRequest className="w-16 h-16 text-amber-600" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Approval</span>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="text-3xl font-black tracking-tight text-amber-600">{stats.approval}</span>
            <span className="text-[10px] text-amber-600 font-medium">Needs QA Approver</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col justify-between shadow-sm col-span-2 md:col-span-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <AlertTriangle className="w-16 h-16 text-slate-500" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Obsolete Departments</span>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="text-3xl font-black tracking-tight text-slate-400">{stats.obsolete}</span>
            <span className="text-[10px] text-slate-400 font-mono">Archived</span>
          </div>
        </div>
      </div>

      {/* 3. Main Data Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Filters and Table */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search Filters Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
              <Search className="w-4 h-4 text-[#FF6321]" />
              <p className="text-sm font-black text-slate-800">Search Filters</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="searchCode" className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Department Code</Label>
                <div className="relative">
                  <Input 
                    id="searchCode" 
                    placeholder="Search Code..." 
                    value={searchCode}
                    onChange={(e) => { setSearchCode(e.target.value); setCurrentPage(1); }}
                    className="rounded-xl h-10 border-slate-100 pr-8"
                  />
                  {searchCode && (
                    <button onClick={() => setSearchCode('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600">×</button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="searchName" className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Department Name</Label>
                <div className="relative">
                  <Input 
                    id="searchName" 
                    placeholder="Search Name..." 
                    value={searchName}
                    onChange={(e) => { setSearchName(e.target.value); setCurrentPage(1); }}
                    className="rounded-xl h-10 border-slate-100 pr-8"
                  />
                  {searchName && (
                    <button onClick={() => setSearchName('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600">×</button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="searchStatus" className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Workflow Status</Label>
                <Select value={searchStatus} onValueChange={(val) => { setSearchStatus(val); setCurrentPage(1); }}>
                  <SelectTrigger id="searchStatus" className="rounded-xl h-10 border-slate-100">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
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
          </div>

          {/* Table Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-fade-in">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Masters...</p>
              </div>
            ) : paginatedDepartments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-4 text-slate-300">
                  <Building2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700">No Department masters match criteria</p>
                <p className="text-xs text-slate-400 max-w-sm mt-1">Try resetting search parameters or create a draft department for {selectedBranch || 'any site branch'}.</p>
                <Button onClick={handleOpenCreate} variant="outline" className="mt-4 rounded-xl text-xs gap-1">
                  <Plus className="w-4 h-4" /> Create First Draft
                </Button>
              </div>
            ) : (
              <div>
                <Table>
                  <TableHeader className="bg-slate-50/70 border-b border-slate-100">
                    <TableRow>
                      <TableHead onClick={() => handleSort('departmentCode')} className="cursor-pointer hover:bg-slate-100 transition-colors py-4">
                        <div className="flex items-center gap-1.5 text-slate-700 font-bold text-[10px] tracking-wider uppercase">
                          Code <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </TableHead>
                      <TableHead onClick={() => handleSort('departmentName')} className="cursor-pointer hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-1.5 text-slate-700 font-bold text-[10px] tracking-wider uppercase">
                          Department Name <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </TableHead>
                      <TableHead>
                        <span className="text-slate-700 font-bold text-[10px] tracking-wider uppercase">Branches</span>
                      </TableHead>
                      <TableHead className="text-center">
                        <span className="text-slate-700 font-bold text-[10px] tracking-wider uppercase">Version</span>
                      </TableHead>
                      <TableHead onClick={() => handleSort('status')} className="cursor-pointer hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-1.5 text-slate-700 font-bold text-[10px] tracking-wider uppercase">
                          Status <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="text-slate-700 font-bold text-[10px] tracking-wider uppercase pr-4">Action</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDepartments.map((dept) => {
                      const isSelected = selectedDept?.departmentId === dept.departmentId;
                      return (
                        <TableRow 
                          key={dept.departmentId}
                          onClick={() => handleSelectDept(dept)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-orange-50/20 hover:bg-orange-50/30' : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <TableCell className="py-3.5">
                            <span className="text-xs font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded uppercase">
                              {dept.departmentCode}
                            </span>
                          </TableCell>
                          
                          <TableCell>
                            <div>
                              <p className="text-xs font-bold text-slate-800 leading-tight">{dept.departmentName}</p>
                              <p className="text-[10px] text-slate-400 max-w-[200px] truncate leading-normal">{dept.description}</p>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1">
                              {dept.allowedBranches?.map((b: string) => (
                                <span key={b} className="text-[9px] font-extrabold uppercase bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                                  {b}
                                </span>
                              )) || (
                                <span className="text-[9px] font-extrabold uppercase bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded">
                                  {dept.branch}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="text-center">
                            <span className="text-xs font-bold text-slate-600 font-mono">
                              V{dept.version || 1}
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="flex justify-start">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                dept.status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                                dept.status === 'Review' ? 'bg-amber-100 text-amber-800' :
                                dept.status === 'Approval' ? 'bg-indigo-100 text-indigo-800' :
                                dept.status === 'Obsolete' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {dept.status}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="text-right py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1 px-2">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleSelectDept(dept)}
                                className="w-8 h-8 p-0 rounded-lg hover:bg-slate-100"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                              </Button>
                              
                              {/* Edit triggers draft cloning automatically for Active! */}
                              {dept.status !== 'Obsolete' && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => handleOpenEdit(dept)}
                                  className="w-8 h-8 p-0 rounded-lg hover:bg-slate-100"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-[#FF6321]" />
                                </Button>
                              )}

                              {/* Delete button visible only to Admin-Akshay Sharma */}
                              {user?.email?.toLowerCase() === 'shakshay04@gmail.com' && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => triggerSignatureModal('delete', dept)}
                                  className="w-8 h-8 p-0 rounded-lg hover:bg-rose-50 hover:text-rose-600 text-slate-500"
                                  title="Delete Department with E-Sign"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination Controls */}
                {pageCount > 1 && (
                  <div className="flex items-center justify-between p-4 border-t border-slate-50 bg-slate-50/30">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Page {currentPage} of {pageCount} ({filteredDepartments.length} total)
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        className="rounded-xl h-8 px-3 text-xs"
                      >
                        Prev
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentPage === pageCount}
                        onClick={() => setCurrentPage(prev => Math.min(pageCount, prev + 1))}
                        className="rounded-xl h-8 px-3 text-xs"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Workflow Control, Details & Audit timeline */}
        <div className="lg:col-span-1">
          {selectedDept ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden max-h-[85vh] overflow-y-auto">
              {/* Header Details */}
              <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest">
                    Version V{selectedDept.version || 1} • {selectedDept.branchType === 'Single' ? 'Single Branch' : 'Multi-Branch'}
                  </span>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                    selectedDept.status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                    selectedDept.status === 'Review' ? 'bg-amber-100 text-amber-800' :
                    selectedDept.status === 'Approval' ? 'bg-indigo-100 text-indigo-800' :
                    'bg-slate-100 text-slate-800'
                  }`}>
                    {selectedDept.status}
                  </span>
                </div>
                <h2 className="text-lg font-black text-slate-900 mt-2 tracking-tight">{selectedDept.departmentName}</h2>
                <p className="text-xs font-semibold text-slate-500 font-mono mt-0.5">{selectedDept.departmentCode}</p>
                
                {/* Branch Badges */}
                <div className="flex flex-wrap gap-1 mt-3">
                  {selectedDept.allowedBranches?.map((b: string) => (
                    <span key={b} className="text-[9px] font-extrabold uppercase bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                      {b}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tabs selector */}
              <div className="flex border-b border-slate-100 text-xs">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`flex-1 py-3 text-center font-bold relative transition-colors ${
                    activeTab === 'details' ? 'text-[#FF6321]' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Details & Controls
                  {activeTab === 'details' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#FF6321]" />}
                </button>
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`flex-1 py-3 text-center font-bold relative transition-colors ${
                    activeTab === 'audit' ? 'text-[#FF6321]' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  GMP Audit Trail
                  {activeTab === 'audit' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#FF6321]" />}
                </button>
              </div>

              {/* Tab Contents */}
              <div className="p-5 space-y-6">
                {activeTab === 'details' ? (
                  <>
                    {/* Basic Info */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</span>
                        <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                          {selectedDept.description || 'No description provided.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created By</p>
                          <p className="font-bold text-slate-700 truncate mt-1">{getUserDisplay(selectedDept.createdBy) || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created Date</p>
                          <p className="font-medium text-slate-600 mt-1">{selectedDept.createdAt ? new Date(selectedDept.createdAt).toLocaleDateString() : 'N/A'}</p>
                        </div>
                      </div>

                      {/* Approver Details */}
                      {(selectedDept.reviewedBy || selectedDept.approvedBy) && (
                        <div className="pt-3 border-t border-slate-50 grid grid-cols-2 gap-4 text-xs">
                          {selectedDept.reviewedBy && (
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reviewed By</p>
                              <p className="font-bold text-slate-700 truncate mt-1">{getUserDisplay(selectedDept.reviewedBy)}</p>
                            </div>
                          )}
                          {selectedDept.approvedBy && (
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Approved By</p>
                              <p className="font-bold text-slate-700 truncate mt-1">{getUserDisplay(selectedDept.approvedBy)}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons with electronic signature constraints */}
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Department Workflow Action</span>
                      
                      {/* Workflow Draft -> Review */}
                      {selectedDept.status === 'Draft' && (
                        <Button 
                          onClick={() => handleSubmitForReview(selectedDept)}
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-10 font-bold text-xs"
                        >
                          Submit For QA Review
                        </Button>
                      )}

                      {/* Review -> Approve */}
                      {selectedDept.status === 'Review' && (
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => triggerSignatureModal('approve')}
                            className="flex-1 bg-[#FF6321] hover:bg-orange-600 text-white rounded-xl h-10 font-bold text-xs flex items-center gap-1.5"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            Approve (E-Sign)
                          </Button>
                        </div>
                      )}

                      {/* Approval -> Activate */}
                      {selectedDept.status === 'Approval' && (
                        <Button 
                          onClick={() => triggerSignatureModal('activate')}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10"
                        >
                          <Check className="w-4 h-4" />
                          Activate for Site (E-Sign)
                        </Button>
                      )}

                      {/* Active -> Obsolete */}
                      {selectedDept.status === 'Active' && (
                        <Button 
                          onClick={() => triggerSignatureModal('obsolete')}
                          variant="outline"
                          className="w-full text-rose-600 border-rose-100 hover:border-rose-200 hover:bg-rose-50 rounded-xl h-10 font-bold text-xs flex items-center justify-center gap-1.5"
                        >
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                          Mark Obsolete (E-Sign)
                        </Button>
                      )}

                      {/* Obsolete Info State */}
                      {selectedDept.status === 'Obsolete' && (
                        <div className="p-3.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-xl flex items-center gap-3">
                          <Info className="w-4 h-4 text-slate-400 shrink-0" />
                          <p className="text-[11px] leading-relaxed">
                            This department master version is retired. No modifications or approvals are applicable.
                          </p>
                        </div>
                      )}

                      {/* General Edit warning if active/workflow is selected */}
                      {selectedDept.status !== 'Obsolete' && (
                        <Button
                          variant="outline"
                          onClick={() => handleOpenEdit(selectedDept)}
                          className="w-full rounded-xl text-xs h-10 font-bold border-slate-200"
                        >
                          Modify Department Specs
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  /* Immutable Audit Trail Timeline View */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Site Audit Logs</span>
                      <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">Immutable</span>
                    </div>

                    {auditLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing logs...</p>
                      </div>
                    ) : auditLogs.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-6">No historical audit logs found</p>
                    ) : (
                      <div className="relative border-l border-indigo-50 pl-4 ml-2 space-y-6">
                        {auditLogs.map((log) => (
                          <div key={log.logId} className="relative text-xs">
                            {/* Cron circle marker */}
                            <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white ring-4 ring-indigo-50/50" />
                            
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-extrabold text-slate-800 uppercase text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{log.action || 'Log Entry'}</span>
                                <span className="text-[9px] font-semibold text-slate-400 font-mono flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-300" />
                                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 font-medium">User: <strong className="text-slate-700">{getUserDisplay(log.user)}</strong></p>
                              <p className="text-[11px] text-indigo-950 font-bold italic leading-relaxed py-1 px-2.5 bg-slate-50 border-l-2 border-indigo-500 rounded-r-md">"{log.reason || 'SOP compliance change'}"</p>
                              
                              {/* Show revision count / version increments */}
                              {log.newValue && (
                                <p className="text-[9px] font-mono font-bold text-indigo-400 lowercase italic">
                                  + version increment: V{log.newValue?.version || 1}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                <Building2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">Select a Department Master</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
                Click any row in the department ledger to review its compliance records, check 21 CFR signatures, and transition statuses.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. Add/Edit Department Master Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && setIsFormOpen(false)}>
        <DialogContent className="rounded-3xl max-w-lg overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-sans">
              {formMode === 'create' ? 'Create Department Master Draft' : 'Modify Department Specifications'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Department structures dictate approval rules and user authorization permissions across operations. Ensure alignment with site validation master plans.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-5 py-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="formCode" className="text-slate-600 text-xs font-bold">Department Code <span className="text-rose-500">*</span></Label>
                <Input 
                  id="formCode"
                  placeholder="e.g. QA, QC, PROD"
                  value={formData.departmentCode}
                  onChange={(e) => setFormData(prev => ({ ...prev, departmentCode: e.target.value }))}
                  className="rounded-xl h-11 uppercase"
                  disabled={formMode === 'edit'} // Immutable once saved to prevent ID break
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="formName" className="text-slate-600 text-xs font-bold">Department Name <span className="text-rose-500">*</span></Label>
                <Input 
                  id="formName"
                  placeholder="e.g. Quality Assurance"
                  value={formData.departmentName}
                  onChange={(e) => setFormData(prev => ({ ...prev, departmentName: e.target.value }))}
                  className="rounded-xl h-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="formDesc" className="text-slate-600 text-xs font-bold">Plant Description <span className="text-rose-500">*</span></Label>
              <Textarea 
                id="formDesc"
                placeholder="Declare active scope of operations, personnel capabilities and approval rights under SOP specs..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="rounded-xl min-h-[80px]"
                required
              />
            </div>

            {/* Branch Segregation config */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-wider">Branch Setup Segregation</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Filter visibility according to current user access rights</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      branchType: 'Single', 
                      allowedBranches: [selectedBranch || 'Masulkhana'] 
                    }))}
                    className={`px-3 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-colors ${
                      formData.branchType === 'Single' 
                        ? 'bg-[#FF6321] text-white' 
                        : 'bg-white hover:bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    Single Branch
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      branchType: 'Multi', 
                      allowedBranches: ['Masulkhana', 'Baddi'] 
                    }))}
                    className={`px-3 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-colors ${
                      formData.branchType === 'Multi' 
                        ? 'bg-[#FF6321] text-white' 
                        : 'bg-white hover:bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    Multi Branch
                  </button>
                </div>
              </div>

              {/* Individual Branch selectors */}
              <div className="grid grid-cols-2 gap-3 pb-1">
                {['Masulkhana', 'Baddi'].map((branchName) => {
                  const isChecked = formData.allowedBranches.includes(branchName);
                  return (
                    <button
                      key={branchName}
                      type="button"
                      onClick={() => toggleBranchSelection(branchName)}
                      className={`flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                        isChecked 
                          ? 'border-[#FF6321] bg-orange-50/10 text-orange-950 font-bold' 
                          : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-xs font-extrabold uppercase tracking-wide">{branchName}</span>
                      {isChecked ? (
                        <div className="w-4 h-4 rounded-full bg-[#FF6321] flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-200" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Change reason logs */}
            <div className="space-y-1.5">
              <Label htmlFor="formReason" className="text-slate-600 text-xs font-bold">
                {selectedDept?.status === 'Active' ? 'Revision Change Reason (Mandatory for compliance)' : 'Additional Comments'}
                {selectedDept?.status === 'Active' && <span className="text-rose-500"> *</span>}
              </Label>
              <Input 
                id="formReason"
                placeholder={selectedDept?.status === 'Active' ? "Provide reasons for updating master definitions..." : "Provide any additional comments or notes..."}
                value={formData.changeReason}
                onChange={(e) => setFormData(prev => ({ ...prev, changeReason: e.target.value }))}
                className="rounded-xl h-11"
                required={selectedDept?.status === 'Active'}
              />
              {selectedDept?.status === 'Active' && (
                <p className="text-[10px] text-rose-500 flex items-center gap-1.5 mt-1 font-semibold px-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  Updating an Active master automatically creates a new Draft (V{(selectedDept.version || 1) + 1}), requiring authorization review before activation.
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" className="bg-[#FF6321] hover:bg-orange-600 font-bold text-xs rounded-xl px-6">
                {formMode === 'create' ? 'Save as Draft' : (selectedDept?.status === 'Active' ? 'Save & Spawn Draft version' : 'Confirm Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. 21 CFR Part 11 Electronic Signature Dialog */}
      <Dialog open={isSigOpen} onOpenChange={(open) => !open && setIsSigOpen(false)}>
        <DialogContent className="rounded-3xl max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-[#FF6321]" />
              </div>
              <DialogTitle className="text-xl font-bold font-sans text-slate-800 leading-tight">Apply Electronic Signature</DialogTitle>
            </div>
            <DialogDescription className="text-slate-500 text-xs mt-1">
              Confirm your identity, entered credentials, and the reason for this action to authorize compliance transition under 21 CFR Part 11.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2.5 space-y-5">
            <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1.5">
              <span className="text-[9px] font-black uppercase text-indigo-500 tracking-widest">Meaning of and Intent for Signature</span>
              <p className="text-[11px] text-slate-700 italic leading-relaxed">
                "{sigAction === 'approve' 
                  ? 'I confirm that I have reviewed, verified, and approved this Department Master definition. This action represents my electronic signature.'
                  : sigAction === 'activate'
                  ? 'I certify that I am activating this Department Master record for live site operations. This action represents my electronic signature.'
                  : sigAction === 'delete'
                  ? 'I certify that I am deleting this Department Master record. This action represents my electronic signature and is logged irreversibly.'
                  : 'I certify that I am retirement-marking/obsoleting this Department Master record. This action represents my electronic signature.'
                }"
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-xs font-bold">User Identity ID</Label>
                <Input 
                  value={user?.email || ''} 
                  disabled 
                  className="rounded-xl h-11 bg-slate-50 text-slate-400 font-mono text-xs border-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sig-password" className="text-slate-600 text-xs font-bold">Password Re-entry <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    id="sig-password"
                    type="password"
                    placeholder="Enter your BRIMS account password"
                    value={sigPassword}
                    onChange={(e) => setSigPassword(e.target.value)}
                    className="rounded-xl h-11 pl-10 border-slate-200 focus-visible:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              {sigAction !== 'approve' && (
                <div className="space-y-1.5">
                  <Label htmlFor="sig-reason" className="text-slate-600 text-xs font-bold">Reason for Action <span className="text-rose-500">*</span></Label>
                  <Input 
                    id="sig-reason"
                    placeholder="Provide brief reason for workflow state change..."
                    value={sigReason}
                    onChange={(e) => setSigReason(e.target.value)}
                    className="rounded-xl h-11 border-slate-200"
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5 text-xs text-slate-400 flex items-center justify-between px-1">
                <span>Timestamp</span>
                <span className="font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {new Date().toISOString()}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button type="button" variant="ghost" onClick={() => setIsSigOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button 
              type="button" 
              onClick={handleSignatureConfirm} 
              disabled={sigLoading || !sigPassword || (sigAction !== 'approve' && !sigReason.trim())}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl px-6 min-w-[130px]"
            >
              {sigLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Sign & Execute'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
