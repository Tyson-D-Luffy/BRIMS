import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Shield, 
  Key, 
  UserPlus, 
  UserMinus, 
  UserCheck, 
  MoreVertical,
  Search,
  Filter,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Calendar,
  Settings as SettingsIcon,
  Briefcase,
  Building,
  Lock,
  Network,
  Check,
  HelpCircle,
  FileText,
  AlertCircle,
  Phone,
  Clock,
  Unlock,
  AlertOctagon,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../components/ui/table';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Label } from '../components/ui/label';
import { User, UserRole } from '../types';
import api from '../services/api';
import { toast } from 'sonner';
import { LoadingPage } from '../components/LoadingSpinner';
import { DesignationProfilesManager } from '../components/admin/DesignationProfilesManager';
import { getDefaultPermissionsForDesignation } from '../constants/designationProfiles';

// DEPARTMENTS list has been retired in favor of dynamic lookup of active master departments

// USER_ROLES constant has been retired as roles are now dynamically determined by designations.

const PERMISSIONS_LIST = [
  { id: "create:product", name: "Create Product Master", category: "Product Master" },
  { id: "edit:product", name: "Edit Product Master", category: "Product Master" },
  { id: "product:submit", name: "Submit Product Master (GAMP Review)", category: "Product Master", description: "Submit drafted or returned Product Master records for GAMP review." },
  { id: "product:review", name: "Review Product Master", category: "Product Master", derivedReturnInfo: "✓ Includes derived authority to Return record to Creator (Draft)" },
  { id: "product:approve", name: "Approve Product Master", category: "Product Master", derivedReturnInfo: "✓ Includes derived authority to Return record to Reviewer / Creator" },
  { id: "batch:create", name: "Create New Batch Request", category: "Batch Issuance" },
  { id: "batch:review", name: "Pending for Review Batch Request", category: "Batch Issuance", derivedReturnInfo: "✓ Includes derived authority to Return record to Requisitioner (Draft)" },
  { id: "batch:approve", name: "Approve Batch Request", category: "Batch Issuance", derivedReturnInfo: "✓ Includes derived authority to Return record to Reviewer / Requisitioner" },
  { id: "batch:issue", name: "Issue Batch Sheet", category: "Batch Issuance" },
  { id: "batch:print", name: "Print Batch Sheet", category: "Batch Issuance" },
  { id: "batch:preview", name: "Preview PDF", category: "Batch Issuance" },
  { id: "audit:view", name: "View Audit Trail", category: "Compliance & System" },
  { id: "user:manage", name: "Manage Users", category: "Compliance & System", derivedReturnInfo: "✓ Includes authority to Return user account to Initiator" },

  // Department Master Permissions
  { id: "department:create", name: "Create Department Master", category: "Department Master" },
  { id: "department:submit", name: "Submit Department Master", category: "Department Master", derivedReturnInfo: "✓ Includes derived authority to Return record to Creator" },
  { id: "department:approve", name: "Approve Department Master", category: "Department Master", derivedReturnInfo: "✓ Includes derived authority to Return record to Submitter" },

  // Designation Master Permissions
  { id: "designation:create", name: "Create Designation Master", category: "Designation Master" },
  { id: "designation:submit", name: "Submit Designation Master", category: "Designation Master", derivedReturnInfo: "✓ Includes derived authority to Return record to Creator" },
  { id: "designation:approve", name: "Approve Designation Master", category: "Designation Master", derivedReturnInfo: "✓ Includes derived authority to Return record to Reviewer" },

  // Batch Number Creator Permissions
  { id: "batch_number:create", name: "Create Batch Number", category: "Batch Number Creator" },
  { id: "batch_number:submit", name: "Submit Batch Number", category: "Batch Number Creator", derivedReturnInfo: "✓ Includes derived authority to Return record to Creator" },
  { id: "batch_number:approve", name: "Approve Batch Number", category: "Batch Number Creator", derivedReturnInfo: "✓ Includes derived authority to Return record to Submitter" },

  // Format Builder Permissions
  { id: "format:create", name: "Create/Edit Format Layout", category: "Format Builder" },
  { id: "format:submit", name: "Submit Format Layout", category: "Format Builder", derivedReturnInfo: "✓ Includes derived authority to Return layout to Creator" },
  { id: "format:approve", name: "Approve Format Layout", category: "Format Builder", derivedReturnInfo: "✓ Includes derived authority to Return layout to Submitter" },

  // Master Lookups Permissions
  { id: "lookup:create", name: "Create Master Lookup", category: "Master Lookups" },
  { id: "lookup:edit", name: "Edit Master Lookup", category: "Master Lookups", derivedReturnInfo: "✓ Includes derived authority to Return lookup to Creator" },
  { id: "lookup:submit", name: "Submit Master Lookup", category: "Master Lookups", derivedReturnInfo: "✓ Includes derived authority to Return lookup to Creator" },
  { id: "lookup:approve", name: "Approve Master Lookup", category: "Master Lookups", derivedReturnInfo: "✓ Includes derived authority to Return lookup to Submitter" },

  // Operations Permissions
  { id: "product:reject", name: "Reject Product Master", category: "Product Master" },
  { id: "product:return", name: "Return Product Master", category: "Product Master", derivedReturnInfo: "✓ Explicit authority to Return Product Master to preceding step" },
  { id: "product:deactivate", name: "Deactivate Product Master", category: "Product Master" },
  { id: "batch_sheet_master:create", name: "Create Batch Sheet Master", category: "Batch Sheet Master" },
  { id: "batch_sheet_master:edit", name: "Edit Batch Sheet Master", category: "Batch Sheet Master" },
  { id: "batch_sheet_master:submit", name: "Submit Batch Sheet Master", category: "Batch Sheet Master" },
  { id: "batch_sheet_master:review", name: "Review Batch Sheet Master", category: "Batch Sheet Master", derivedReturnInfo: "✓ Includes derived authority to Return record to Author (Draft)" },
  { id: "batch_sheet_master:approve", name: "Approve Batch Sheet Master", category: "Batch Sheet Master", derivedReturnInfo: "✓ Includes derived authority to Return record to Reviewer / Author" },
  { id: "batch_sheet_master:reject", name: "Reject Batch Sheet Master", category: "Batch Sheet Master" },
  { id: "batch_sheet_master:return", name: "Return Batch Sheet Master", category: "Batch Sheet Master", derivedReturnInfo: "✓ Explicit authority to Return Batch Sheet Master to preceding step" },
  { id: "batch_sheet_master:deactivate", name: "Deactivate Batch Sheet Master", category: "Batch Sheet Master" },
  { id: "lookup:deactivate", name: "Deactivate Master Lookups", category: "Master Lookups" },
  { id: "lookup:activate", name: "Activate Master Lookups", category: "Master Lookups" },
  { id: "op:issued", name: "Issued", category: "Batch Issuance" },
  { id: "op:ready_for_handover", name: "Ready for Handover", category: "Batch Issuance" },
  { id: "op:production_in_progress", name: "Received by Production", category: "Batch Issuance" },
  { id: "op:ready_for_qa_review", name: "Send for QA Review", category: "Batch Issuance", derivedReturnInfo: "✓ Includes authority to send back for QA Review" },
  { id: "op:completed", name: "QA Received", category: "Batch Issuance", derivedReturnInfo: "✓ Includes authority to Return execution to Production" },
  { id: "op:return_for_correction", name: "Return Batch Sheet For Correction", category: "Batch Issuance", derivedReturnInfo: "✓ Explicit authority to Return Batch Sheet for correction" },
];

export default function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDepartments, setActiveDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Password fields visibility & highlights states for Add New User form
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [showAddConfirmPassword, setShowAddConfirmPassword] = useState(false);
  const [isAddPasswordFocused, setIsAddPasswordFocused] = useState(false);
  const [isAddConfirmPasswordFocused, setIsAddConfirmPasswordFocused] = useState(false);
  const [isPasswordDirty, setIsPasswordDirty] = useState(false);
  const [confirmPasswordClicked, setConfirmPasswordClicked] = useState(false);
  const [isSecurityExpanded, setIsSecurityExpanded] = useState(false);

  const getMissingPasswordRequirements = (pass: string) => {
    const missing = [];
    if (pass.length < 8) missing.push("Minimum 8 characters");
    if (!/[A-Z]/.test(pass)) missing.push("at least 1 uppercase letter");
    if (!/[a-z]/.test(pass)) missing.push("at least 1 lowercase letter");
    if (!/[0-9]/.test(pass)) missing.push("at least 1 number");
    if (!/[^A-Za-z0-9]/.test(pass)) missing.push("at least 1 special character/symbol");
    return missing;
  };

  const [newUser, setNewUser] = useState({
    employeeId: '',
    name: '',
    designation: '',
    department: '',
    email: '',
    mobileNumber: '',
    status: 'active' as 'active' | 'inactive',
    username: '',
    password: '',
    confirmPassword: '',
    passwordExpiry: '30 Days',
    forcePasswordReset: true,
    mfaEnabled: false,
    role: 'Viewer' as any,
    permissions: ['batch:view'] as string[],
    permissionSource: 'DESIGNATION_DEFAULT' as 'DESIGNATION_DEFAULT' | 'USER_OVERRIDE',
    designationPermissionProfileId: '',
    designationPermissionProfileVersion: '',
    defaultBranch: 'Masulkhana' as 'Masulkhana' | 'Baddi',
    allowedBranches: ['Masulkhana'] as string[],
    multiBranchAccess: false,
    esignatureRequiredApprovals: false,
    esignatureRequiredStatusChanges: false,
    sessionTimeout: 15,
    maxLoginAttempts: 5,
    accountLockAfterFailedAttempts: true,
    remarks: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: ''
  });

  const [editingUser, setEditingUser] = useState<any>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');

  const getPermissionPresetForRole = (roleName: string) => {
    const { permissions } = getDefaultPermissionsForDesignation(roleName);
    return permissions;
  };

  const handleDesignationChangeForNewUser = (designationVal: string) => {
    const { permissions, profile } = getDefaultPermissionsForDesignation(designationVal);
    setNewUser({
      ...newUser,
      designation: designationVal,
      role: designationVal,
      permissions: permissions,
      permissionSource: 'DESIGNATION_DEFAULT',
      designationPermissionProfileId: profile?.profileId || 'custom',
      designationPermissionProfileVersion: profile?.version || '1.0'
    });
  };

  const handleDesignationChangeForEditUser = (designationVal: string) => {
    const { permissions, profile } = getDefaultPermissionsForDesignation(designationVal);
    setEditingUser({
      ...editingUser,
      designation: designationVal,
      role: designationVal,
      permissions: permissions,
      permissionSource: 'DESIGNATION_DEFAULT',
      designationPermissionProfileId: profile?.profileId || 'custom',
      designationPermissionProfileVersion: profile?.version || '1.0'
    });
  };

  const handleResetUserToDesignationDefaults = async (targetUser: any) => {
    if (!targetUser || !targetUser.uid) return;
    try {
      const res = await api.post(`/designation-profiles/users/${targetUser.uid}/reset-defaults`, {
        reason: 'Reset to standard designation profile defaults via Admin Console'
      });
      if (res.data && res.data.success) {
        toast.success(res.data.message || `Reset permissions for ${targetUser.displayName || targetUser.name}`);
        fetchUsers();
      }
    } catch (err: any) {
      console.error("Failed to reset user permissions:", err);
      toast.error(err.response?.data?.message || "Failed to reset user permissions");
    }
  };

  const resetNewUserState = () => {
    setNewUser({
      employeeId: '',
      name: '',
      designation: '',
      department: '',
      email: '',
      mobileNumber: '',
      status: 'active',
      username: '',
      password: '',
      confirmPassword: '',
      passwordExpiry: '30 Days',
      forcePasswordReset: true,
      mfaEnabled: false,
      role: 'Viewer',
      permissions: ['batch:view'],
      permissionSource: 'DESIGNATION_DEFAULT',
      designationPermissionProfileId: '',
      designationPermissionProfileVersion: '',
      defaultBranch: 'Masulkhana',
      allowedBranches: ['Masulkhana'],
      multiBranchAccess: false,
      esignatureRequiredApprovals: false,
      esignatureRequiredStatusChanges: false,
      sessionTimeout: 15,
      maxLoginAttempts: 5,
      accountLockAfterFailedAttempts: true,
      remarks: '',
      effectiveFrom: new Date().toISOString().split('T')[0],
      effectiveTo: ''
    });
    setShowAddPassword(false);
    setShowAddConfirmPassword(false);
    setIsAddPasswordFocused(false);
    setIsAddConfirmPasswordFocused(false);
    setIsPasswordDirty(false);
    setConfirmPasswordClicked(false);
    setIsSecurityExpanded(false);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/users');
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch users', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    const fetchActiveDepts = async () => {
      try {
        const res = await api.get('/departments/active');
        if (res.data && res.data.success && res.data.data) {
          setActiveDepartments(res.data.data);
        }
      } catch (err) {
        console.error("Failed to load active departments for dropdown:", err);
      }
    };
    fetchActiveDepts();
    const fetchDesignations = async () => {
      try {
        const res = await api.get('/designations');
        if (res.data && res.data.success) {
          setDesignations(res.data.data || []);
        }
      } catch (err) {
        console.error("Failed to load designations list inside AdminPanel:", err);
      }
    };
    fetchDesignations();
  }, []);

  const getFilteredDesignations = (deptVal: string) => {
    if (!deptVal) return [];
    return designations.filter((d: any) => {
      const matchStatus = d.status === 'Active';
      const matchDept = d.departmentName?.trim().toLowerCase() === deptVal.trim().toLowerCase() || 
                        d.departmentCode?.trim().toLowerCase() === deptVal.trim().toLowerCase();
      return matchStatus && matchDept;
    });
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.department) {
      toast.error("Department selection is mandatory");
      return;
    }
    if (!newUser.role) {
      toast.error("User functional role is mandatory");
      return;
    }
    const missingPasswordRequirements = getMissingPasswordRequirements(newUser.password);
    if (missingPasswordRequirements.length > 0) {
      toast.error(`Temporary password is not compliant. Missing: ${missingPasswordRequirements.join(", ")}`);
      setIsPasswordDirty(true);
      return;
    }
    if (newUser.password !== newUser.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!newUser.employeeId) {
      toast.error("Employee ID is mandatory");
      return;
    }
    if (!newUser.username) {
      toast.error("Username is mandatory");
      return;
    }
    if (newUser.allowedBranches.length === 0) {
      toast.error("At least one branch must be assigned to the user");
      return;
    }
    if (newUser.permissions.length === 0) {
      toast.error("At least one permission must be assigned");
      return;
    }

    try {
      const response = await api.post('/users', newUser);
      if (response.data.success) {
        toast.success('User added successfully');
        setIsAddUserOpen(false);
        fetchUsers();
        resetNewUserState();
      }
    } catch (error: any) {
      console.error('Detailed Add User error:', error);
      const errorData = error.response?.data;
      let message = 'Failed to add user';
      if (errorData) {
        message = errorData.message || errorData.error || message;
        if (errorData.details && Array.isArray(errorData.details)) {
          const detailMsgs = errorData.details
            .map((d: any) => {
              if (typeof d === 'string') return d;
              if (d && typeof d === 'object') {
                const fieldName = d.field ? d.field.replace('body.', '') : '';
                return fieldName ? `${fieldName}: ${d.message}` : (d.message || JSON.stringify(d));
              }
              return JSON.stringify(d);
            })
            .join(', ');
          if (detailMsgs) message = `${message} (${detailMsgs})`;
        }
      } else if (error.message) {
        message = error.message;
      }
      toast.error(message);
    }
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser.department) {
      toast.error("Department is mandatory");
      return;
    }
    if (editPassword && editPassword !== editConfirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (!editingUser.employeeId) {
      toast.error("Employee ID is mandatory");
      return;
    }
    if (!editingUser.allowedBranches || editingUser.allowedBranches.length === 0) {
      toast.error("User must be assigned to at least one branch");
      return;
    }
    if (!editingUser.permissions || editingUser.permissions.length === 0) {
      toast.error("At least one permission must be selected");
      return;
    }
    if (!editingUser.changeReason || editingUser.changeReason.trim().length < 5) {
      toast.error("Change Reason / Remarks is mandatory and must be at least 5 characters for GAMP / GxP compliance trails.");
      return;
    }

    try {
      const payload = {
        ...editingUser,
        password: editPassword || undefined,
        confirmPassword: editConfirmPassword || undefined
      };
      
      const response = await api.put(`/users/${editingUser.uid}`, payload);
      if (response.data.success) {
        toast.success('User updated successfully');
        setIsEditUserOpen(false);
        fetchUsers();
        setEditingUser(null);
        setEditPassword('');
        setEditConfirmPassword('');
      }
    } catch (error: any) {
      console.error('Detailed Edit User error:', error, error.response?.data);
      const errorData = error.response?.data;
      if (errorData?.details && Array.isArray(errorData.details)) {
        const detailsMsg = errorData.details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
        toast.error(`Validation Error: ${detailsMsg}`);
      } else {
        toast.error(errorData?.message || errorData?.error || error?.message || 'Failed to update user');
      }
    }
  };

  const handleToggleStatus = async (uid: string, currentStatus: string) => {
    const newStatus = (currentStatus === 'inactive' || currentStatus === 'locked') ? 'active' : 'inactive';
    const reasonPrompt = prompt(`Enter reason for ${newStatus === 'active' ? 'activating/unlocking' : 'deactivating'} this account (mandatory):`);
    if (!reasonPrompt || reasonPrompt.trim().length === 0) {
      toast.error("A comment/reason is required to log the GxP audit action!");
      return;
    }

    try {
      const response = await api.put(`/users/${uid}`, { 
        status: newStatus,
        changeReason: `Account status toggled. ${reasonPrompt.trim()}`
      });
      if (response.data.success) {
        toast.success(`User ${newStatus === 'active' ? 'enabled/unlocked' : 'disabled'} successfully`);
        fetchUsers();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }
    
    const reasonPrompt = prompt("Enter justification for password change (mandatory):");
    if (!reasonPrompt || reasonPrompt.trim().length === 0) {
      toast.error("GAMP / GxP Audits mandate a comment/reason for system password updates!");
      return;
    }

    try {
      const response = await api.put(`/users/${selectedUser.uid}`, { 
        password: newPassword,
        changeReason: `Manual password reset: ${reasonPrompt}`
      });
      if (response.data.success) {
        toast.success('Password updated successfully');
        setIsChangePasswordOpen(false);
        setNewPassword('');
        setConfirmNewPassword('');
        setSelectedUser(null);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update password');
    }
  };

  const handleTogglePermission = (id: string, isCreate: boolean) => {
    if (isCreate) {
      const current = [...newUser.permissions];
      const index = current.indexOf(id);
      if (index > -1) {
        current.splice(index, 1);
      } else {
        current.push(id);
      }
      setNewUser({ ...newUser, permissions: current, permissionSource: 'USER_OVERRIDE' });
    } else {
      const current = [...(editingUser.permissions || [])];
      const index = current.indexOf(id);
      if (index > -1) {
        current.splice(index, 1);
      } else {
        current.push(id);
      }
      setEditingUser({ ...editingUser, permissions: current, permissionSource: 'USER_OVERRIDE' });
    }
  };

  const handleToggleBranch = (branch: string, isCreate: boolean) => {
    if (isCreate) {
      const current = [...newUser.allowedBranches];
      const index = current.indexOf(branch);
      if (index > -1) {
        current.splice(index, 1);
      } else {
        current.push(branch);
      }
      const bothSelected = current.includes("Masulkhana") && current.includes("Baddi");
      setNewUser({ 
        ...newUser, 
        allowedBranches: current,
        multiBranchAccess: bothSelected ? true : newUser.multiBranchAccess
      });
    } else {
      const current = [...(editingUser.allowedBranches || [])];
      const index = current.indexOf(branch);
      if (index > -1) {
        current.splice(index, 1);
      } else {
        current.push(branch);
      }
      const bothSelected = current.includes("Masulkhana") && current.includes("Baddi");
      setEditingUser({ 
        ...editingUser, 
        allowedBranches: current,
        multiBranchAccess: bothSelected ? true : editingUser.multiBranchAccess
      });
    }
  };

  const filteredUsers = users.filter(user => 
    (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (user.displayName && user.displayName.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (user.employeeId && user.employeeId.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (user.username && user.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (user.department && user.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getFunctionalRoleLabel = (user: User) => {
    return (user as any).functionalRole || user.role || 'N/A';
  };

  if (loading && users.length === 0) return <LoadingPage label="Loading admin panel..." />;

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Panel</h1>
          <p className="text-slate-500 mt-1">GAMP &amp; 21 CFR Part 11 Compliant user governance and security management.</p>
        </div>
        
        <Dialog open={isAddUserOpen} onOpenChange={(open) => { setIsAddUserOpen(open); if (open) resetNewUserState(); }}>
          <DialogTrigger
            render={
              <Button id="add-user-btn" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 h-12 shadow-lg shadow-indigo-100 font-bold transition-transform active:scale-95">
                <UserPlus className="w-5 h-5 mr-2" />
                Add New User
              </Button>
            }
          />
          <DialogContent className="sm:max-w-[750px] max-h-[85vh] overflow-y-auto rounded-3xl p-6">
            <DialogHeader className="pb-4 border-b border-slate-100">
              <DialogTitle className="text-2xl font-bold text-slate-900">Add New User</DialogTitle>
              <DialogDescription>
                Create a compliant electronic identity record. All user creations are logged in the immutable audit trail.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-8 py-4">
              
              {/* Section 1: Employee Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <Briefcase className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">1. Employee Information</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="employeeId" className="text-slate-700 font-medium">Employee ID <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="employeeId" 
                      placeholder="EMP-10294" 
                      value={newUser.employeeId}
                      onChange={(e) => setNewUser({...newUser, employeeId: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-slate-700 font-medium">Full Name <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="name" 
                      placeholder="Jane Doe" 
                      value={newUser.name}
                      onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department" className="text-slate-700 font-medium font-bold">Department <span className="text-rose-500">*</span></Label>
                    <Select 
                      value={newUser.department} 
                      onValueChange={(val) => setNewUser({...newUser, department: val, designation: ''})}
                    >
                      <SelectTrigger id="dept-select-trigger" className="rounded-xl border-slate-200 h-11">
                        <SelectValue placeholder="Select Department" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {activeDepartments.map((dept: any, idx: number) => {
                          const deptKey = dept.departmentId || dept.id || `add-dept-${idx}`;
                          return (
                            <SelectItem key={`add-user-dept-opt-${deptKey}-${idx}`} value={dept.departmentName}>
                              {dept.departmentName} ({dept.departmentCode})
                            </SelectItem>
                          );
                        })}
                        {activeDepartments.length === 0 && (
                          <SelectItem disabled value="_none_">
                            No active departments found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="designation" className="text-slate-700 font-medium font-bold">Designation <span className="text-rose-500">*</span></Label>
                    <Select 
                      value={newUser.designation} 
                      onValueChange={handleDesignationChangeForNewUser}
                      disabled={!newUser.department}
                    >
                      <SelectTrigger id="designation" className={cn("rounded-xl border-slate-200 h-11", !newUser.department && "opacity-50 bg-slate-50 cursor-not-allowed")}>
                        <SelectValue placeholder={newUser.department ? "Select Designation" : "Select Department First"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {getFilteredDesignations(newUser.department).map((des: any, idx: number) => {
                          const desKey = des.designationId || des.id || `add-desig-${idx}`;
                          return (
                            <SelectItem key={`add-user-desig-opt-${desKey}-${idx}`} value={des.designationName}>
                              {des.designationName}{des.designationCode ? ` (${des.designationCode})` : ""}
                            </SelectItem>
                          );
                        })}
                        {getFilteredDesignations(newUser.department).length === 0 && (
                          <SelectItem disabled value="_none_">
                            No active designations under {newUser.department || 'Selected Department'}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-700 font-medium">Email Address <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="jane.doe@pharma.com" 
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mobileNumber" className="text-slate-700 font-medium">Mobile Number</Label>
                    <Input 
                      id="mobileNumber" 
                      placeholder="+91 XXXXX XXXXX" 
                      value={newUser.mobileNumber}
                      onChange={(e) => setNewUser({...newUser, mobileNumber: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-status" className="text-slate-700 font-medium">Employee Status</Label>
                    <Select 
                      value={newUser.status} 
                      onValueChange={(val: any) => setNewUser({...newUser, status: val})}
                    >
                      <SelectTrigger id="status-select" className="rounded-xl border-slate-200 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="locked">Locked Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Section 2: Login & Authentication */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <Lock className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">2. Login &amp; Authentication</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-slate-700 font-medium">Username <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="username" 
                      placeholder="jdoe_qa" 
                      value={newUser.username}
                      onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passwordExpiry" className="text-slate-700 font-medium">Password Expiry Period</Label>
                    <Select 
                      value={newUser.passwordExpiry} 
                      onValueChange={(val) => setNewUser({...newUser, passwordExpiry: val})}
                    >
                      <SelectTrigger className="rounded-xl border-slate-200 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30 Days">30 Days</SelectItem>
                        <SelectItem value="60 Days">60 Days</SelectItem>
                        <SelectItem value="90 Days">90 Days</SelectItem>
                        <SelectItem value="180 Days">180 Days</SelectItem>
                        <SelectItem value="No Expiry">No Expiry</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-700 font-medium">Temporary Password <span className="text-rose-500">*</span></Label>
                    <div className="relative">
                      <Input 
                        id="password" 
                        type={showAddPassword ? "text" : "password"} 
                        placeholder={isAddPasswordFocused ? "" : "••••••••"} 
                        value={newUser.password}
                        onChange={(e) => {
                          setNewUser({...newUser, password: e.target.value});
                          setIsPasswordDirty(true);
                        }}
                        onFocus={() => {
                          setIsAddPasswordFocused(true);
                          setIsPasswordDirty(true);
                        }}
                        onBlur={() => setIsAddPasswordFocused(false)}
                        className={cn(
                          "rounded-xl border-slate-200 h-11 pr-11 transition-all duration-200",
                          isPasswordDirty && getMissingPasswordRequirements(newUser.password).length > 0 && "border-rose-500 ring-rose-500 ring-1 focus-visible:ring-rose-500 bg-rose-50/10"
                        )}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddPassword(!showAddPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">Policy: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol</p>
                    {isPasswordDirty && getMissingPasswordRequirements(newUser.password).length > 0 && (
                      <p className="text-[10px] text-rose-500 font-bold bg-rose-50/50 p-2 rounded-xl border border-rose-100 flex flex-wrap gap-1 mt-1">
                        <span>Missing:</span>
                        {getMissingPasswordRequirements(newUser.password).map((req, rid) => (
                          <Badge key={`new-pwd-missing-${rid}-${req}`} className="bg-rose-100 hover:bg-rose-100/80 text-rose-700 border-none text-[9px] py-0.5 px-1.5 font-bold rounded">
                            {req}
                          </Badge>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-slate-700 font-medium">Confirm Password <span className="text-rose-500">*</span></Label>
                    <div className="relative">
                      <Input 
                        id="confirmPassword" 
                        type={showAddConfirmPassword ? "text" : "password"} 
                        placeholder={isAddConfirmPasswordFocused ? "" : "••••••••"} 
                        value={newUser.confirmPassword}
                        onChange={(e) => setNewUser({...newUser, confirmPassword: e.target.value})}
                        onFocus={() => {
                          setIsAddConfirmPasswordFocused(true);
                          setConfirmPasswordClicked(true);
                        }}
                        onBlur={() => setIsAddConfirmPasswordFocused(false)}
                        className={cn(
                          "rounded-xl border-slate-200 h-11 pr-11 transition-all duration-200",
                          confirmPasswordClicked && newUser.confirmPassword !== newUser.password && "border-rose-500 ring-rose-500 ring-1 focus-visible:ring-rose-500 bg-rose-50/10"
                        )}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddConfirmPassword(!showAddConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        {showAddConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPasswordClicked && newUser.confirmPassword !== newUser.password && (
                      <p className="text-[10px] text-rose-500 font-bold bg-rose-50/50 p-2 rounded-xl border border-rose-100 mt-1">
                        Passwords do not match with the Temporary Password.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center space-x-3">
                    <Checkbox 
                      id="forcePasswordReset" 
                      checked={newUser.forcePasswordReset}
                      onCheckedChange={(checked) => setNewUser({ ...newUser, forcePasswordReset: !!checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <Label htmlFor="forcePasswordReset" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                      Force password reset on first login
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox 
                      id="mfaEnabled" 
                      checked={newUser.mfaEnabled}
                      onCheckedChange={(checked) => setNewUser({ ...newUser, mfaEnabled: !!checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <Label htmlFor="mfaEnabled" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                      Enable Multi-factor Authentication (MFA)
                    </Label>
                  </div>
                </div>
              </div>

              {/* Section 3: Role & Permission Management */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <Shield className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">3. Role &amp; Permission Management</h3>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase">
                    Role and preset permissions determined by selected designation
                  </span>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-700 font-medium">Roles/Permissions Matrix</Label>
                  <div className="border border-slate-100 rounded-2xl bg-white overflow-hidden shadow-inner">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 max-h-[220px] overflow-y-auto">
                      {PERMISSIONS_LIST.map((permission, idx) => {
                        const isChecked = newUser.permissions.includes(permission.id);
                        return (
                          <div 
                            key={`new-user-perm-item-${permission.id || idx}-${idx}`} 
                            onClick={() => handleTogglePermission(permission.id, true)}
                            className={`flex items-center space-x-3 p-2.5 rounded-xl border transition-colors cursor-pointer select-none ${
                              isChecked 
                                ? 'bg-indigo-50/40 border-indigo-100 text-indigo-900' 
                                : 'hover:bg-slate-50/50 border-slate-50 text-slate-700'
                            }`}
                          >
                            <span className="shrink-0 text-indigo-600">
                              {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-300" />}
                            </span>
                            <div className="flex flex-col text-left">
                              <span className="text-xs font-bold leading-tight">{permission.name}</span>
                              <span className="text-[9px] text-slate-400 capitalize bg-slate-100/50 px-1.5 py-0.5 rounded w-max mt-1 font-mono font-medium">{permission.category}</span>
                              {permission.derivedReturnInfo && (
                                <span className="text-[9.5px] font-semibold text-emerald-700 bg-emerald-50/80 px-1.5 py-0.5 rounded mt-1 border border-emerald-100/60">
                                  {permission.derivedReturnInfo}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Branch Access Control */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <Network className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">4. Branch Access Control</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="defaultBranch" className="text-slate-700 font-medium">Default Branch <span className="text-rose-500">*</span></Label>
                    <Select 
                      value={newUser.defaultBranch} 
                      onValueChange={(val: any) => setNewUser({...newUser, defaultBranch: val})}
                    >
                      <SelectTrigger className="rounded-xl border-slate-200 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Masulkhana">Masulkhana</SelectItem>
                        <SelectItem value="Baddi">Baddi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-medium">Allowed Branches <span className="text-rose-500">*</span></Label>
                    <div className="flex gap-4 pt-2.5">
                      {["Masulkhana", "Baddi"].map((branch, idx) => {
                        const isChecked = newUser.allowedBranches.includes(branch);
                        return (
                          <div 
                            key={`new-user-branch-${branch}-${idx}`}
                            onClick={() => handleToggleBranch(branch, true)}
                            className={`flex items-center space-x-2 border rounded-xl px-4 py-2 cursor-pointer select-none font-medium text-xs ${
                              isChecked 
                                ? 'bg-indigo-50/50 border-indigo-200 text-indigo-700' 
                                : 'border-slate-100 text-slate-500'
                            }`}
                          >
                            <span>{isChecked ? "● " : "○ "}</span>
                            <span>{branch}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 pt-1">
                  <Checkbox 
                    id="multiBranchAccess" 
                    checked={newUser.multiBranchAccess}
                    onCheckedChange={(checked) => setNewUser({ ...newUser, multiBranchAccess: !!checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <Label htmlFor="multiBranchAccess" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                    Enable Dual / Multi-Branch concurrent access context
                  </Label>
                </div>
              </div>

              {/* Section 5: Electronic Signature & Security Controls */}
              <div className="space-y-4">
                <div 
                  className="flex items-center justify-between pb-1 border-b border-slate-50 cursor-pointer hover:opacity-80 select-none"
                  onClick={() => setIsSecurityExpanded(!isSecurityExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">5. Security, Session &amp; Signatures</h3>
                  </div>
                  <span className="text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded">
                    {isSecurityExpanded ? "[- Collapse]" : "[+ Expand]"}
                  </span>
                </div>
                
                {isSecurityExpanded && (
                  <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sessionTimeout" className="text-xs font-bold text-slate-600">Session Timeout (Minutes)</Label>
                        <Input 
                          id="sessionTimeout" 
                          type="number"
                          min={5}
                          max={1440}
                          value={newUser.sessionTimeout}
                          onChange={(e) => setNewUser({...newUser, sessionTimeout: Number(e.target.value)})}
                          className="rounded-xl border-slate-200 h-10 bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="maxLoginAttempts" className="text-xs font-bold text-slate-600">Max Failed Login Attempts</Label>
                        <Input 
                          id="maxLoginAttempts" 
                          type="number"
                          min={3}
                          max={10}
                          value={newUser.maxLoginAttempts}
                          onChange={(e) => setNewUser({...newUser, maxLoginAttempts: Number(e.target.value)})}
                          className="rounded-xl border-slate-200 h-10 bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-2">
                      <div className="flex items-center space-x-3">
                        <Checkbox 
                          id="accountLockAfterFailedAttempts" 
                          checked={newUser.accountLockAfterFailedAttempts}
                          onCheckedChange={(checked) => setNewUser({ ...newUser, accountLockAfterFailedAttempts: !!checked })}
                          className="rounded border-slate-300 text-indigo-600 h-4 w-4"
                        />
                        <Label htmlFor="accountLockAfterFailedAttempts" className="text-xs font-medium text-slate-700 select-none cursor-pointer">
                          Lock account automatically when consecutive failures is reached
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Checkbox 
                          id="esignatureRequiredApprovals" 
                          checked={newUser.esignatureRequiredApprovals}
                          onCheckedChange={(checked) => setNewUser({ ...newUser, esignatureRequiredApprovals: !!checked })}
                          className="rounded border-slate-300 text-indigo-600 h-4 w-4"
                        />
                        <Label htmlFor="esignatureRequiredApprovals" className="text-xs font-medium text-slate-700 select-none cursor-pointer">
                          Require secondary password verification for GMP critical approvals (eSignature workflow)
                        </Label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 6: Additional Controls */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">6. Compliance Validity &amp; Remarks</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="effectiveFrom" className="text-slate-700 font-medium">Effective From <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="effectiveFrom" 
                      type="date"
                      value={newUser.effectiveFrom}
                      onChange={(e) => setNewUser({...newUser, effectiveFrom: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="effectiveTo" className="text-slate-700 font-medium">Effective To (Leave blank if permanent)</Label>
                    <Input 
                      id="effectiveTo" 
                      type="date"
                      value={newUser.effectiveTo}
                      onChange={(e) => setNewUser({...newUser, effectiveTo: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="remarks" className="text-slate-700 font-medium">Remarks / Justification For Provisioning</Label>
                  <Textarea 
                    id="remarks" 
                    placeholder="Provide onboarding authorization details or comments here..." 
                    value={newUser.remarks}
                    onChange={(e) => setNewUser({...newUser, remarks: e.target.value})}
                    className="rounded-xl border-slate-200 min-h-[70px]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-4">
                <Button type="button" variant="ghost" onClick={resetNewUserState} className="rounded-xl h-11 flex-1 font-bold">
                  Reset Form
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 flex-2 font-bold shadow-lg shadow-indigo-100">
                  Save Account Metadata
                </Button>
              </div>

            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Tabs defaultValue="users" className="w-full font-sans">
        <TabsList className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm mb-8 h-14 w-max">
          <TabsTrigger value="users" className="rounded-xl px-8 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600 font-bold">
            <Users className="w-4 h-4 mr-2" />
            Active Credentials Directory
          </TabsTrigger>
          <TabsTrigger value="roles" className="rounded-xl px-8 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600 font-bold">
            <Shield className="w-4 h-4 mr-2" />
            Designation Profiles &amp; RBAC
          </TabsTrigger>
          <TabsTrigger value="permissions" className="rounded-xl px-8 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600 font-bold">
            <Key className="w-4 h-4 mr-2" />
            Operations Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
            <CardHeader className="p-8 border-b border-slate-50">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">User Management Console</CardTitle>
                  <CardDescription className="text-slate-500">Conduct identity governance, monitor status, and enforce strict CFR branch settings.</CardDescription>
                </div>
                <div className="relative w-full lg:w-96">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Search by Employee ID, Name, Username, Dept..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-11 rounded-xl bg-slate-50 border-none focus-visible:ring-indigo-500 h-11 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/60 border-b border-slate-100">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-8 py-4 text-slate-700 font-bold text-xs uppercase tracking-wider">Employee Information</TableHead>
                      <TableHead className="text-slate-700 font-bold text-xs uppercase tracking-wider">Functional Role</TableHead>
                      <TableHead className="text-slate-700 font-bold text-xs uppercase tracking-wider">Permissions &amp; Source</TableHead>
                      <TableHead className="text-slate-700 font-bold text-xs uppercase tracking-wider mr-2">Department</TableHead>
                      <TableHead className="text-slate-700 font-bold text-xs uppercase tracking-wider">Branch Access</TableHead>
                      <TableHead className="text-slate-700 font-bold text-xs uppercase tracking-wider">Status</TableHead>
                      <TableHead className="text-slate-700 font-bold text-xs uppercase tracking-wider text-right pr-8">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow key="no-matching-personnel-row">
                        <TableCell colSpan={7} className="h-48 text-center text-slate-400 italic">
                          No matching personnel records found in database.
                        </TableCell>
                      </TableRow>
                    ) : filteredUsers.map((user, idx) => {
                      const userKey = user.uid || (user as any).id || user.employeeId || user.email || user.username || `user-${idx}`;
                      return (
                      <TableRow key={`admin-user-row-${userKey}-${idx}`} className="hover:bg-slate-50/30 transition-colors border-b border-slate-50">
                        <TableCell className="pl-8 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold uppercase shrink-0">
                              {(user.displayName?.[0] || user.email?.[0] || user.username?.[0] || 'U').toUpperCase()}
                            </div>
                            <div className="space-y-0.5">
                              <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                {user.displayName || 'Unnamed Employee'}
                                {user.employeeId && (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono font-bold text-indigo-600 bg-indigo-50/20 border-indigo-100">
                                    {user.employeeId}
                                  </Badge>
                                )}
                              </p>
                              <div className="flex flex-col gap-0.5 text-xs text-slate-500 font-medium">
                                <span>@{user.username || (user.email ? user.email.split('@')[0] : 'unknown')} ({user.email || 'No Email'})</span>
                                {user.designation && <span className="italic text-[11px] text-slate-400">{user.designation}</span>}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-slate-800 text-xs">
                              {user.designation || user.role || 'N/A'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] font-mono font-bold bg-indigo-50/50 text-indigo-700 border-indigo-200">
                                {(user.permissions || []).length} Rights
                              </Badge>
                            </div>
                            <span className={`text-[10px] font-medium ${user.permissionSource === 'USER_OVERRIDE' ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                              {user.permissionSource === 'USER_OVERRIDE' ? '● Custom Override' : '✓ Default Profile'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Building className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full">{user.department || 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs">
                              <Network className="w-3.5 h-3.5 text-indigo-400" />
                              <span>{user.defaultBranch || 'Masulkhana'}</span>
                              <span className="text-[10px] text-slate-400 font-normal font-mono">(default)</span>
                            </div>
                            <div className="flex gap-1 flex-wrap max-w-[200px]">
                              {(user.allowedBranches || []).map((b, bIdx) => (
                                <Badge key={`user-${userKey}-branch-${b}-${bIdx}`} className="bg-slate-55 border-none hover:bg-slate-100 text-[9px] font-bold text-slate-600 rounded px-1.5 py-0">
                                  {b}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border",
                            user.status === 'active' 
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                              : user.status === 'locked'
                                ? "bg-amber-50 text-amber-600 border-amber-100"
                                : "bg-rose-50 text-rose-500 border-rose-100"
                          )}>
                            {user.status || 'active'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-8">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100 h-8 w-8">
                                  <MoreVertical className="w-4 h-4 text-slate-500" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end" className="rounded-xl w-56 shadow-xl border-slate-100">
                              <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-slate-500 text-[10px] uppercase font-bold">User Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => {
                                  const rawU = { ...user };
                                  setEditingUser({
                                    uid: rawU.uid,
                                    employeeId: rawU.employeeId || '',
                                    name: rawU.displayName || '',
                                    displayName: rawU.displayName || '',
                                    designation: rawU.designation || '',
                                    department: rawU.department || '',
                                    email: rawU.email || '',
                                    mobileNumber: rawU.mobileNumber || '',
                                    status: rawU.status || 'active',
                                    username: rawU.username || '',
                                    passwordExpiry: rawU.passwordExpiry || '90 Days',
                                    forcePasswordReset: rawU.forcePasswordReset ?? true,
                                    mfaEnabled: !!rawU.mfaEnabled,
                                    role: rawU.designation || rawU.role || 'Viewer',
                                    permissions: rawU.permissions || [],
                                    permissionSource: rawU.permissionSource || 'DESIGNATION_DEFAULT',
                                    defaultBranch: rawU.defaultBranch || 'Masulkhana',
                                    allowedBranches: rawU.allowedBranches || ['Masulkhana'],
                                    multiBranchAccess: !!rawU.multiBranchAccess,
                                    esignatureRequiredApprovals: !!rawU.esignatureRequiredApprovals,
                                    esignatureRequiredStatusChanges: !!rawU.esignatureRequiredStatusChanges,
                                    sessionTimeout: rawU.sessionTimeout || 30,
                                    maxLoginAttempts: rawU.maxLoginAttempts || 5,
                                    accountLockAfterFailedAttempts: rawU.accountLockAfterFailedAttempts ?? true,
                                    remarks: rawU.remarks || '',
                                    effectiveFrom: rawU.effectiveFrom || new Date().toISOString().split('T')[0],
                                    effectiveTo: rawU.effectiveTo || '',
                                    changeReason: ''
                                  });
                                  setEditPassword('');
                                  setEditConfirmPassword('');
                                  setIsEditUserOpen(true);
                                }} className="font-semibold text-slate-700">
                                  <SettingsIcon className="w-4 h-4 mr-2 text-slate-500" /> Complete Metadata view
                                </DropdownMenuItem>
                                
                                <DropdownMenuItem onClick={() => handleResetUserToDesignationDefaults(user)} className="font-semibold text-indigo-700">
                                  <RotateCcw className="w-4 h-4 mr-2 text-indigo-500" /> Reset to Profile Defaults
                                </DropdownMenuItem>

                                <DropdownMenuItem onClick={() => handleToggleStatus(user.uid, user.status || 'active')} className="font-semibold">
                                  {user.status === 'inactive' || user.status === 'locked' ? (
                                    <><UserCheck className="w-4 h-4 mr-2 text-emerald-500" /> Revoke Suspension / Unlock</>
                                  ) : (
                                    <><UserMinus className="w-4 h-4 mr-2 text-rose-500" /> Suspend Credentials</>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setSelectedUser(user);
                                  setNewPassword('');
                                  setConfirmNewPassword('');
                                  setIsChangePasswordOpen(true);
                                }} className="font-semibold text-slate-700">
                                  <Key className="w-4 h-4 mr-2 text-amber-500" /> Force Change Password
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <DesignationProfilesManager onRefreshUsers={fetchUsers} />
        </TabsContent>


        <TabsContent value="permissions">
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
            <CardHeader className="p-8 border-b border-slate-50">
              <CardTitle className="text-xl font-bold text-slate-900 font-sans">Granular System Operation Rights</CardTitle>
              <CardDescription>Review available operations permissions associated with standard chemical batches.</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {PERMISSIONS_LIST.map((p, idx) => (
                  <div key={`permissions-tab-card-${p.id || idx}-${idx}`} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/40 hover:bg-indigo-50/10 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase font-mono text-indigo-700 bg-indigo-50 border border-indigo-100/30 shrink-0">
                        {p.category}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono font-medium">{p.id}</span>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm mt-1">{p.name}</h4>
                    {p.derivedReturnInfo && (
                      <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md mt-2 border border-emerald-100">
                        {p.derivedReturnInfo}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit User Modal */}
      <Dialog open={isEditUserOpen} onOpenChange={(open) => { setIsEditUserOpen(open); if (!open) setEditingUser(null); }}>
        <DialogContent className="sm:max-w-[750px] max-h-[85vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader className="pb-4 border-b border-slate-100">
            <DialogTitle className="text-2xl font-bold text-slate-900">Edit User Details: {editingUser?.name}</DialogTitle>
            <DialogDescription>
              Modify compliance parameters, roles, permissions, or branch bindings. Validations protect electronic signature states.
            </DialogDescription>
          </DialogHeader>
          
          {editingUser && (
            <form onSubmit={handleEditUserSubmit} className="space-y-8 py-4">
              
              {/* Change Justification Required */}
              <div className="space-y-2 bg-amber-50/50 p-4 border border-amber-100 rounded-2xl flex flex-col gap-1.5">
                <Label htmlFor="changeReason" className="text-slate-800 font-bold flex items-center gap-1.5 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Reason for Change <span className="text-rose-500">*</span>
                </Label>
                <Input 
                  id="changeReason" 
                  placeholder="e.g. Employee promoted, department transferred, role alignment." 
                  value={editingUser.changeReason}
                  onChange={(e) => setEditingUser({...editingUser, changeReason: e.target.value})}
                  className="rounded-xl border-amber-200 h-11 focus-visible:ring-amber-500 bg-white"
                  required
                />
                <p className="text-[10px] text-amber-700 italic">21 CFR Part 11 Audit trails require this reason to be recorded alongside modified records.</p>
              </div>

              {/* Section 1: Employee Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <Briefcase className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">1. Employee Information</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-employeeId" className="text-slate-700 font-medium">Employee ID <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="edit-employeeId" 
                      placeholder="EMP-10294" 
                      value={editingUser.employeeId}
                      onChange={(e) => setEditingUser({...editingUser, employeeId: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-name" className="text-slate-700 font-medium">Full Name <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="edit-name" 
                      placeholder="Jane Doe" 
                      value={editingUser.name}
                      onChange={(e) => setEditingUser({...editingUser, name: e.target.value, displayName: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-department" className="text-slate-700 font-medium font-bold">Department <span className="text-rose-500">*</span></Label>
                    <Select 
                      value={editingUser.department} 
                      onValueChange={(val) => setEditingUser({...editingUser, department: val, designation: ''})}
                    >
                      <SelectTrigger id="edit-dept-select-trigger" className="rounded-xl border-slate-200 h-11">
                        <SelectValue placeholder="Select Department" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {activeDepartments.map((dept: any, idx: number) => {
                          const deptKey = dept.departmentId || dept.id || `edit-dept-${idx}`;
                          return (
                            <SelectItem key={`edit-user-dept-opt-${deptKey}-${idx}`} value={dept.departmentName}>
                              {dept.departmentName} ({dept.departmentCode})
                            </SelectItem>
                          );
                        })}
                        {activeDepartments.length === 0 && (
                          <SelectItem disabled value="_none_">
                            No active departments found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-designation" className="text-slate-700 font-medium font-bold">Designation <span className="text-rose-500">*</span></Label>
                    <Select 
                      value={editingUser.designation} 
                      onValueChange={handleDesignationChangeForEditUser}
                    >
                      <SelectTrigger id="edit-designation" className="rounded-xl border-slate-200 h-11">
                        <SelectValue placeholder="Select Designation" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {getFilteredDesignations(editingUser.department).map((des: any, idx: number) => {
                          const desKey = des.designationId || des.id || `edit-desig-${idx}`;
                          return (
                            <SelectItem key={`edit-user-desig-opt-${desKey}-${idx}`} value={des.designationName}>
                              {des.designationName}{des.designationCode ? ` (${des.designationCode})` : ""}
                            </SelectItem>
                          );
                        })}
                        {getFilteredDesignations(editingUser.department).length === 0 && (
                          <SelectItem disabled value="_none_">
                            No active designations under {editingUser.department || 'Selected Department'}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-email" className="text-slate-700 font-medium">Email Address <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="edit-email" 
                      type="email" 
                      placeholder="jane.doe@pharma.com" 
                      value={editingUser.email}
                      onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-mobileNumber" className="text-slate-700 font-medium">Mobile Number</Label>
                    <Input 
                      id="edit-mobileNumber" 
                      placeholder="+91 XXXXX XXXXX" 
                      value={editingUser.mobileNumber}
                      onChange={(e) => setEditingUser({...editingUser, mobileNumber: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-status" className="text-slate-700 font-medium">Employee Status</Label>
                    <Select 
                      value={editingUser.status} 
                      onValueChange={(val: any) => setEditingUser({...editingUser, status: val})}
                    >
                      <SelectTrigger id="edit-status-select" className="rounded-xl border-slate-200 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="locked">Locked Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Section 2: Login & Authentication Defaults */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <Lock className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">2. Login &amp; Authentication Control</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-username" className="text-slate-700 font-medium">Username <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="edit-username" 
                      placeholder="jdoe_qa" 
                      value={editingUser.username}
                      onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-passwordExpiry" className="text-slate-700 font-medium">Password Expiry Period</Label>
                    <Select 
                      value={editingUser.passwordExpiry} 
                      onValueChange={(val) => setEditingUser({...editingUser, passwordExpiry: val})}
                    >
                      <SelectTrigger className="rounded-xl border-slate-200 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30 Days">30 Days</SelectItem>
                        <SelectItem value="60 Days">60 Days</SelectItem>
                        <SelectItem value="90 Days">90 Days</SelectItem>
                        <SelectItem value="180 Days">180 Days</SelectItem>
                        <SelectItem value="No Expiry">No Expiry</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label htmlFor="edit-newPassword" className="text-slate-700 font-medium">Reset Password (leave empty to keep current)</Label>
                    <Input 
                      id="edit-newPassword" 
                      type="password" 
                      placeholder="••••••••" 
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="rounded-xl border-slate-200 h-11"
                    />
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label htmlFor="edit-newPasswordConfirm" className="text-slate-700 font-medium">Confirm New Password</Label>
                    <Input 
                      id="edit-newPasswordConfirm" 
                      type="password" 
                      placeholder="••••••••" 
                      value={editConfirmPassword}
                      onChange={(e) => setEditConfirmPassword(e.target.value)}
                      className="rounded-xl border-slate-200 h-11"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center space-x-3">
                    <Checkbox 
                      id="edit-forcePasswordReset" 
                      checked={editingUser.forcePasswordReset}
                      onCheckedChange={(checked) => setEditingUser({ ...editingUser, forcePasswordReset: !!checked })}
                      className="rounded border-slate-300 text-indigo-600 h-4 w-4"
                    />
                    <Label htmlFor="edit-forcePasswordReset" className="text-xs font-medium text-slate-700 select-none cursor-pointer">
                      Force password reset on next login
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox 
                      id="edit-mfaEnabled" 
                      checked={editingUser.mfaEnabled}
                      onCheckedChange={(checked) => setEditingUser({ ...editingUser, mfaEnabled: !!checked })}
                      className="rounded border-slate-300 text-indigo-600 h-4 w-4"
                    />
                    <Label htmlFor="edit-mfaEnabled" className="text-xs font-medium text-slate-700 select-none cursor-pointer">
                      Enable Multi-factor Authentication (MFA)
                    </Label>
                  </div>
                </div>
              </div>

              {/* Section 3: Role & Permission Management */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <Shield className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">3. Role &amp; Permission Management</h3>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase ${
                    editingUser.permissionSource === 'USER_OVERRIDE'
                      ? 'text-amber-700 bg-amber-50 border border-amber-200'
                      : 'text-indigo-600 bg-indigo-50'
                  }`}>
                    {editingUser.permissionSource === 'USER_OVERRIDE' ? '● Custom Overrides Active' : '✓ Using Designation Default Profile'}
                  </span>
                  
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      if (editingUser?.designation) {
                        const { permissions, profile } = getDefaultPermissionsForDesignation(editingUser.designation);
                        setEditingUser({
                          ...editingUser,
                          permissions,
                          permissionSource: 'DESIGNATION_DEFAULT',
                          designationPermissionProfileId: profile?.profileId || 'custom',
                          designationPermissionProfileVersion: profile?.version || '1.0'
                        });
                        toast.info(`Reset permissions to Profile v${profile?.version || '1.0'} defaults for ${editingUser.designation}`);
                      }
                    }}
                    className="text-xs h-7 rounded-xl border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Reset to Profile Defaults
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-700 font-medium">Roles/Permissions Matrix</Label>
                  <div className="border border-slate-100 rounded-2xl bg-white overflow-hidden shadow-inner">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 max-h-[220px] overflow-y-auto font-sans">
                      {PERMISSIONS_LIST.map((permission, idx) => {
                        const isChecked = (editingUser.permissions || []).includes(permission.id);
                        return (
                          <div 
                            key={`edit-user-perm-item-${permission.id || idx}-${idx}`} 
                            onClick={() => handleTogglePermission(permission.id, false)}
                            className={`flex items-center space-x-3 p-2.5 rounded-xl border transition-colors cursor-pointer select-none ${
                              isChecked 
                                ? 'bg-indigo-50/40 border-indigo-100 text-indigo-900' 
                                : 'hover:bg-slate-50/50 border-slate-50 text-slate-700'
                            }`}
                          >
                            <span className="shrink-0 text-indigo-600">
                              {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-300" />}
                            </span>
                            <div className="flex flex-col text-left">
                              <span className="text-xs font-bold leading-tight">{permission.name}</span>
                              <span className="text-[9px] text-slate-400 capitalize bg-slate-100/50 px-1.5 py-0.5 rounded w-max mt-1 font-mono font-medium">{permission.category}</span>
                              {permission.derivedReturnInfo && (
                                <span className="text-[9.5px] font-semibold text-emerald-700 bg-emerald-50/80 px-1.5 py-0.5 rounded mt-1 border border-emerald-100/60">
                                  {permission.derivedReturnInfo}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Branch Access Control */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <Network className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">4. Branch Access Control</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-defaultBranch" className="text-slate-700 font-medium">Default Branch <span className="text-rose-500">*</span></Label>
                    <Select 
                      value={editingUser.defaultBranch} 
                      onValueChange={(val: any) => setEditingUser({...editingUser, defaultBranch: val})}
                    >
                      <SelectTrigger className="rounded-xl border-slate-200 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Masulkhana">Masulkhana</SelectItem>
                        <SelectItem value="Baddi">Baddi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-medium">Allowed Branches <span className="text-rose-500">*</span></Label>
                    <div className="flex gap-4 pt-2.5">
                      {["Masulkhana", "Baddi"].map((branch, idx) => {
                        const isChecked = (editingUser.allowedBranches || []).includes(branch);
                        return (
                          <div 
                            key={`edit-user-branch-${branch}-${idx}`}
                            onClick={() => handleToggleBranch(branch, false)}
                            className={`flex items-center space-x-2 border rounded-xl px-4 py-2 cursor-pointer select-none font-medium text-xs ${
                              isChecked 
                                ? 'bg-indigo-50/50 border-indigo-200 text-indigo-700' 
                                : 'border-slate-100 text-slate-500'
                            }`}
                          >
                            <span>{isChecked ? "● " : "○ "}</span>
                            <span>{branch}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 pt-1">
                  <Checkbox 
                    id="edit-multiBranchAccess" 
                    checked={editingUser.multiBranchAccess}
                    onCheckedChange={(checked) => setEditingUser({ ...editingUser, multiBranchAccess: !!checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <Label htmlFor="edit-multiBranchAccess" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                    Enable Dual / Multi-Branch concurrent access context
                  </Label>
                </div>
              </div>

              {/* Section 5: Electronic Signatures & Security */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <ShieldCheck className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">5. Security, Session &amp; Signatures</h3>
                </div>
                
                <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-sessionTimeout" className="text-xs font-bold text-slate-600">Session Timeout (Minutes)</Label>
                      <Input 
                        id="edit-sessionTimeout" 
                        type="number"
                        min={5}
                        max={1440}
                        value={editingUser.sessionTimeout}
                        onChange={(e) => setEditingUser({...editingUser, sessionTimeout: Number(e.target.value)})}
                        className="rounded-xl border-slate-200 h-10 bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-maxLoginAttempts" className="text-xs font-bold text-slate-600">Max Failed Login Attempts</Label>
                      <Input 
                        id="edit-maxLoginAttempts" 
                        type="number"
                        min={3}
                        max={10}
                        value={editingUser.maxLoginAttempts}
                        onChange={(e) => setEditingUser({...editingUser, maxLoginAttempts: Number(e.target.value)})}
                        className="rounded-xl border-slate-200 h-10 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex items-center space-x-3">
                      <Checkbox 
                        id="edit-accountLockAfterFailedAttempts" 
                        checked={editingUser.accountLockAfterFailedAttempts}
                        onCheckedChange={(checked) => setEditingUser({ ...editingUser, accountLockAfterFailedAttempts: !!checked })}
                        className="rounded border-slate-300 text-indigo-600 h-4 w-4"
                      />
                      <Label htmlFor="edit-accountLockAfterFailedAttempts" className="text-xs font-medium text-slate-700 select-none cursor-pointer">
                        Lock account automatically when consecutive failures is reached
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Checkbox 
                        id="edit-esignatureRequiredApprovals" 
                        checked={editingUser.esignatureRequiredApprovals}
                        onCheckedChange={(checked) => setEditingUser({ ...editingUser, esignatureRequiredApprovals: !!checked })}
                        className="rounded border-slate-300 text-indigo-600 h-4 w-4"
                      />
                      <Label htmlFor="edit-esignatureRequiredApprovals" className="text-xs font-medium text-slate-700 select-none cursor-pointer">
                        Require secondary password verification for GMP critical approvals (eSignature workflow)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Checkbox 
                        id="edit-esignatureRequiredStatusChanges" 
                        checked={editingUser.esignatureRequiredStatusChanges}
                        onCheckedChange={(checked) => setEditingUser({ ...editingUser, esignatureRequiredStatusChanges: !!checked })}
                        className="rounded border-slate-300 text-indigo-600 h-4 w-4"
                      />
                      <Label htmlFor="edit-esignatureRequiredStatusChanges" className="text-xs font-medium text-slate-700 select-none cursor-pointer">
                        Require secondary verification for record workflow status changes (Formulations, Batches)
                      </Label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 6: Validity & Remarks */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">6. Compliance Validity &amp; Remarks</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-effectiveFrom" className="text-slate-700 font-medium">Effective From <span className="text-rose-500">*</span></Label>
                    <Input 
                      id="edit-effectiveFrom" 
                      type="date"
                      value={editingUser.effectiveFrom}
                      onChange={(e) => setEditingUser({...editingUser, effectiveFrom: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-effectiveTo" className="text-slate-700 font-medium">Effective To (Leave blank if permanent)</Label>
                    <Input 
                      id="edit-effectiveTo" 
                      type="date"
                      value={editingUser.effectiveTo || ''}
                      onChange={(e) => setEditingUser({...editingUser, effectiveTo: e.target.value})}
                      className="rounded-xl border-slate-200 h-11"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-remarks" className="text-slate-700 font-medium">Remarks / Justification For Provisioning</Label>
                  <Textarea 
                    id="edit-remarks" 
                    placeholder="Provide onboarding authorization details or comments here..." 
                    value={editingUser.remarks}
                    onChange={(e) => setEditingUser({...editingUser, remarks: e.target.value})}
                    className="rounded-xl border-slate-200 min-h-[70px]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-4">
                <Button type="button" variant="ghost" onClick={() => setIsEditUserOpen(false)} className="rounded-xl h-11 flex-1 font-bold">
                  Cancel
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 flex-2 font-bold shadow-lg shadow-indigo-100">
                  Save Changes
                </Button>
              </div>

            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Set a new password for {selectedUser?.displayName || selectedUser?.email}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input 
                id="newPassword" 
                type="password" 
                placeholder="••••••••" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-xl"
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
              <Input 
                id="confirmNewPassword" 
                type="password" 
                placeholder="••••••••" 
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="rounded-xl"
                required
                minLength={8}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsChangePasswordOpen(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold px-4">
                Update Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
