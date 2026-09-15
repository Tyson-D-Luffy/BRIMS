import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart4, 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  ChevronRight, 
  ArrowRight,
  Database,
  Layers,
  Sparkles,
  FileText,
  Copy,
  Printer,
  ChevronDown,
  ChevronUp,
  Settings,
  HelpCircle,
  Bell,
  Archive,
  Lock,
  ArrowUp,
  ArrowDown,
  Code2,
  Calendar,
  UserCheck,
  LayoutDashboard,
  CornerDownRight,
  ListTodo,
  Eye,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import api from '../services/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { SignatureDialog } from '../components/SignatureDialog';
import { HighlightText } from '../components/HighlightText';
import { getUserFullNameWithDesignation, setGlobalUsersCache, getGlobalUsersCache } from '../lib/batch-sheets';

import { 
  BatchNumberFormat, 
  FormatToken, 
  FormatStatus, 
  BatchNumberRecord, 
  RecordStatus, 
  MasterItem, 
  TokenCategory,
  TokenBreakdownItem
} from '../types/batchNumberEngine';

// Year suffix helper: returns '26' for 2026, '27' for 2027 etc.
const getYearCode = () => {
  return new Date().getFullYear().toString().substring(2);
};

export const getFormatTokens = (f?: BatchNumberFormat | null): FormatToken[] => {
  if (!f) return [];
  if (Array.isArray(f.tokens) && f.tokens.length > 0) return f.tokens;
  if (Array.isArray((f as any).elements) && (f as any).elements.length > 0) {
    return (f as any).elements.map((el: any) => ({
      id: el.id || `tok-${Math.random().toString(36).substring(4)}`,
      name: el.label || el.value || el.type || 'Token',
      type: el.type === 'fixed_text' || el.type === 'separator' ? 'static_text' : (el.type === 'year' || el.type === 'serial_number' ? 'auto_generated' : 'master_lookup'),
      source: el.value || el.type || 'base_batch_number',
      mandatory: true
    }));
  }
  return [];
};

export default function BatchNumberEngine() {
  const { user } = useAuth();
  const { selectedBranch } = useBranch();

  const checkPermission = (permId: string, customMessage?: string) => {
    if (user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com') {
      return true;
    }
    const userPermissions = user?.permissions || [];
    if (!userPermissions.includes(permId)) {
      toast.error(customMessage || `Access Denied: You do not have permission for this action.`);
      return false;
    }
    return true;
  };
  
  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'formats' | 'creator' | 'masters' | 'active-batches'>('dashboard');

  // Preloading states for metrics redirects
  const [formatsInitialFilter, setFormatsInitialFilter] = useState<'ALL' | 'UNDER_REVIEW'>('ALL');
  const [creatorInitialRecord, setCreatorInitialRecord] = useState<BatchNumberRecord | null>(null);
  const [creatorInitialStep, setCreatorInitialStep] = useState<number>(1);

  const handleTabChange = (tab: 'dashboard' | 'formats' | 'creator' | 'masters' | 'active-batches') => {
    setActiveTab(tab);
  };

  const [selectedViewRecord, setSelectedViewRecord] = useState<BatchNumberRecord | null>(null);

  // Master Data State
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [masters, setMasters] = useState<MasterItem[]>([]);
  const [mastersLoading, setMastersLoading] = useState(false);

  // Formats state
  const [formats, setFormats] = useState<BatchNumberFormat[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [editingFormat, setEditingFormat] = useState<BatchNumberFormat | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  // Generated Records state
  const [records, setRecords] = useState<BatchNumberRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [users, setUsers] = useState<any[]>(() => getGlobalUsersCache());

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      const userList = Array.isArray(res.data) 
        ? res.data 
        : (Array.isArray(res.data?.data) ? res.data.data : []);
      if (userList.length > 0) {
        setUsers(userList);
        setGlobalUsersCache(userList);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  // Shared Master addition state
  const [showAddMasterModal, setShowAddMasterModal] = useState(false);
  const [newMasterType, setNewMasterType] = useState<MasterItem['type']>('stage');
  const [newMasterCode, setNewMasterCode] = useState('');
  const [newMasterName, setNewMasterName] = useState('');
  const [newMasterProductId, setNewMasterProductId] = useState('');

  // 21 CFR Electronic Signature state
  const [showSignature, setShowSignature] = useState(false);
  const [sigConfig, setSigConfig] = useState({
    title: '',
    description: '',
    meaning: '',
    onVerify: (password: string) => {}
  });

  // Audit trail function
  const logAudit = async (action: string, entityId: string, entityType: string, oldValue: any, newValue: any, changeReason: string) => {
    try {
      await api.post('/batch-number-engine/audit', {
        action,
        entityId,
        entityType,
        oldValue: oldValue || null,
        newValue: newValue || null,
        changeReason: changeReason || '',
      });
    } catch (err) {
      console.error('Audit Trail capture failed:', err);
    }
  };

  // Pre-seed mock database if empty to provide gorgeous content
  const checkAndPreseed = async () => {
    try {
      await api.post('/batch-number-engine/seed');
    } catch (err) {
      console.error('Error seeding DB:', err);
    }
  };

  // Real-time getters
  const fetchMasters = async () => {
    setMastersLoading(true);
    try {
      const res = await api.get('/batch-number-engine/masters');
      if (res.data.success) {
        setMasters(res.data.data);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Unknown error';
      toast.error(`Failed to load masters: ${errMsg}`);
      console.error('Failed to load masters:', err);
    } finally {
      setMastersLoading(false);
    }
  };

  const fetchFormats = async () => {
    setFormatsLoading(true);
    try {
      const res = await api.get('/batch-number-engine/formats');
      if (res.data.success) {
        setFormats(res.data.data);
      } else {
        toast.error(`Failed to load formats: ${res.data.message || 'API error'}`);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Unknown error';
      toast.error(`Failed to load formats: ${errMsg}`);
      console.error('Failed to load formats:', err);
    } finally {
      setFormatsLoading(false);
    }
  };

  const fetchRecords = async () => {
    setRecordsLoading(true);
    try {
      const res = await api.get('/batch-number-engine/records');
      if (res.data.success) {
        setRecords(res.data.data);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Unknown error';
      toast.error(`Failed to load records: ${errMsg}`);
      console.error('Failed to load records:', err);
    } finally {
      setRecordsLoading(false);
    }
  };

  // Get external products from existing product masters to keep system synchronized
  const fetchProductMasters = async () => {
    try {
      const res = await api.get('/product-masters');
      if (res.data.success) {
        // Only get active or approved product masters
        setAllProducts(res.data.data.filter((doc: any) => doc.status === 'active' || doc.workflowStatus === 'Approved'));
      }
    } catch (err) {
      console.warn('Could not load products:', err);
    }
  };

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      try {
        // Fetch product masters, masters, formats, and records in robust parallel tracks.
        // Even if some elements take longer, they will load as fast as possible.
        await Promise.all([
          fetchUsers(),
          fetchProductMasters(),
          fetchMasters(),
          (async () => {
            await checkAndPreseed();
            await Promise.all([
              fetchFormats(),
              fetchRecords()
            ]);
          })()
        ]);
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };
    init();
  }, [selectedBranch, user]);

  // Master addition logic
  const handleAddMasterItem = async () => {
    if (!checkPermission('lookup:create', "Access Denied: You do not have 'Create Master Lookup' permission.")) return;
    const rawTrimmedCode = newMasterCode.trim();
    if (!rawTrimmedCode) {
      toast.error('Value/Code cannot be empty');
      return;
    }
    if (newMasterType === 'stage' && !newMasterProductId) {
      toast.error('Please select an Active Product for the Stage Master');
      return;
    }

    // Allow lower case / mixed case for recovery_component, generic, and process lookups
    const isCaseFlexible = ['recovery_component', 'generic', 'process'].includes(newMasterType);
    const formattedCode = isCaseFlexible ? rawTrimmedCode : rawTrimmedCode.toUpperCase();

    // Client-side duplicate check (case-insensitive comparison)
    const isDuplicate = masters.some((m: any) => {
      if (m.type !== newMasterType) return false;
      if (newMasterType === 'stage') {
        return (m.code || '').toUpperCase() === formattedCode.toUpperCase() && m.productId === newMasterProductId;
      } else {
        return (m.code || '').toUpperCase() === formattedCode.toUpperCase();
      }
    });

    if (isDuplicate) {
      toast.error(`Duplicate value error: A master record for ${newMasterType.replace('_', ' ')} with value "${formattedCode}" already exists.`);
      return;
    }

    try {
      const userDisplayName = getUserFullNameWithDesignation(user, users);
      const item: any = {
        type: newMasterType,
        code: formattedCode,
        status: 'DRAFT',
        ...(newMasterName.trim() ? { name: newMasterName.trim() } : {}),
        ...(newMasterType === 'stage' ? { productId: newMasterProductId } : {}),
        history: [
          {
            action: 'CREATED',
            user: userDisplayName,
            timestamp: new Date().toISOString(),
            meaning: 'Created master item as DRAFT under GMP compliance',
            status: 'DRAFT'
          }
        ]
      };

      await api.post('/batch-number-engine/masters', item);
      toast.success('Value added as DRAFT successfully');

      setNewMasterCode('');
      setNewMasterName('');
      setNewMasterProductId('');
      setShowAddMasterModal(false);
      fetchMasters();
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message || 'Failed to add master value';
      toast.error(errMsg);
    }
  };

  // Master deletion logic
  const handleDeleteMasterItem = (item: MasterItem) => {
    if (!checkPermission('lookup:create', "Access Denied: You do not have 'Create Master Lookup' permission to delete records.")) return;
    const meaning = `I certify and authorize the deletion of the master option value "${item.code}" under category "${item.type}"`;
    setSigConfig({
      title: 'Authorize Master Lookup Deletion',
      description: `Enter your password to authorize the deletion of "${item.code}" master lookup record. This action is irreversible.`,
      meaning,
      onVerify: async (password: string) => {
        try {
          await api.delete(`/batch-number-engine/masters/${item.id}`, {
            data: {
              password,
              signatureMeaning: meaning
            }
          });
          setShowSignature(false);
          toast.success('Value removed from Master successfully');
          fetchMasters();
        } catch (error: any) {
          const errMsg = error.response?.data?.message || 'Failed to delete master value';
          toast.error(`Deletion failed: ${errMsg}`);
        }
      }
    });
    setShowSignature(true);
  };

  // Master update logic for approvals workflow
  const handleUpdateMasterItem = async (id: string, updateData: any) => {
    try {
      await api.put(`/batch-number-engine/masters/${id}`, updateData);
      fetchMasters();
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message || 'Failed to update master option state';
      toast.error(`Update failed: ${errMsg}`);
      throw error;
    }
  };

  const handleDeleteBatchRecord = async (r: BatchNumberRecord) => {
    setSigConfig({
      title: 'Confirm Deletion of Batch Number',
      description: `You are requesting to permanently delete the generated batch number "${r.batchNumber}". This action is audited and irreversible.`,
      meaning: 'I confirm and certify that this batch number deletion is authorized under 21 CFR regulations.',
      onVerify: async (password: string) => {
        try {
          await api.delete(`/batch-number-engine/records/${r.id}`, {
            data: {
              password,
              signatureMeaning: 'I confirm and certify that this batch number deletion is authorized under 21 CFR regulations.'
            }
          });
          await logAudit('DELETE_BATCH_NUMBER', r.batchNumber, 'BATCH_NUMBER', r, null, 'Authorized deletion of batch number registration');
          toast.success(`Batch number "${r.batchNumber}" deleted successfully.`);
          setShowSignature(false);
          fetchRecords();
        } catch (err: any) {
          const errMsg = err.response?.data?.message || err.message || 'Unknown error';
          toast.error(`Deletion failed: ${errMsg}`);
        }
      }
    });
    setShowSignature(true);
  };

  // 1. Dashboard Metrics Summary
  const countActiveFormats = formats.filter(f => f.status === 'ACTIVE').length;
  const countPendingReviews = formats.filter(f => f.status === 'UNDER_REVIEW').length + records.filter(r => r.status === 'DRAFT').length;
  const countPendingApprovals = records.filter(r => r.status === 'PENDING_APPROVAL').length;
  const countTotalGenerated = records.filter(r => r.status === 'APPROVED').length;
  const countActiveScenarios = formats.length; // Active scenarios equals total number formats configured

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 animate-in fade-in duration-500">
      
      {/* Dynamic Compliance Banner with real time UTC */}
      <div className="bg-indigo-900 text-white rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-indigo-950">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-indigo-200 font-bold tracking-widest uppercase">GMP SYSTEM STABILITY</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
            GMP Batch Engine <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-3 py-0.5 rounded-full text-xs font-semibold">21 CFR Part 11</span>
          </h1>
          <p className="text-sm text-indigo-200">
            Compliant Sequence Builder, Token Repositories, and Electronic Signature Approvals. Filtered dynamically for <span className="underline font-bold">{selectedBranch || 'All branches'}</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-mono text-indigo-200 bg-black/20 p-4 rounded-2xl border border-white/5">
          <div><span className="text-slate-400 font-bold">User:</span> <span className="text-white font-medium">{user?.email}</span></div>
          <div className="hidden md:block mx-1">|</div>
          <div><span className="text-slate-400 font-bold">Role:</span> <span className="text-white font-medium">{user?.role}</span></div>
        </div>
      </div>

      {/* Main Tabs Segment */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap border-slate-200 gap-1 bg-slate-100 p-1 rounded-full border">
          <TabButton active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
          <TabButton active={activeTab === 'masters'} onClick={() => { handleTabChange('masters'); fetchMasters(); }} icon={<Database className="w-4 h-4" />} label="Master Lookups" />
          <TabButton active={activeTab === 'formats'} onClick={() => { handleTabChange('formats'); fetchFormats(); }} icon={<Layers className="w-4 h-4" />} label="Format Builder" />
          <TabButton active={activeTab === 'creator'} onClick={() => { handleTabChange('creator'); fetchFormats(); }} icon={<ListTodo className="w-4 h-4" />} label="Batch Number Creator" />
          <TabButton active={activeTab === 'active-batches'} onClick={() => { handleTabChange('active-batches'); fetchRecords(); }} icon={<CheckCircle2 className="w-4 h-4" />} label="Active Batch Numbers" />
        </div>
        <div>
          <Badge variant="outline" className="text-xs bg-white text-indigo-600 border-indigo-200 px-4 py-1 rounded-full shadow-sm font-semibold">
            {selectedBranch || 'Branch unselected'}
          </Badge>
        </div>
      </div>

      {/* Render selected screen view (kept mounted to preserve tabs sessions and state) */}
      <div className="mt-6">
        <motion.div
          style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}
          animate={{ opacity: activeTab === 'dashboard' ? 1 : 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <DashboardScreen 
            formats={formats}
            allProducts={allProducts}
            countActiveFormats={countActiveFormats}
            countActiveScenarios={countActiveScenarios}
            countPendingReviews={countPendingReviews}
            countPendingApprovals={countPendingApprovals}
            countTotalGenerated={countTotalGenerated}
            records={records}
            loading={recordsLoading}
            onNavigate={handleTabChange}
            onRefresh={async () => {
              await Promise.all([fetchRecords(), fetchFormats()]);
            }}
            setSigConfig={setSigConfig}
            setShowSignature={setShowSignature}
            user={user}
            onActiveFormatsClick={() => { setFormatsInitialFilter('ALL'); handleTabChange('formats'); }}
            onPendingReviewsClick={() => { setFormatsInitialFilter('UNDER_REVIEW'); handleTabChange('formats'); }}
            onPendingApprovalsClick={() => { 
              const pendingRecs = records.filter(r => r.status === 'PENDING_APPROVAL');
              if (pendingRecs.length > 0) {
                setCreatorInitialRecord(pendingRecs[0]);
                setCreatorInitialStep(5);
              } else {
                setCreatorInitialRecord(null);
                setCreatorInitialStep(1);
              }
              handleTabChange('creator');
            }}
            onBatchesGeneratedClick={() => { handleTabChange('active-batches'); }}
            onDeleteRecord={handleDeleteBatchRecord}
            onViewRecord={(r) => setSelectedViewRecord(r)}
            setCreatorInitialRecord={setCreatorInitialRecord}
            setCreatorInitialStep={setCreatorInitialStep}
            setFormatsInitialFilter={setFormatsInitialFilter}
            logAudit={logAudit}
          />
        </motion.div>

        <motion.div
          style={{ display: activeTab === 'formats' ? 'block' : 'none' }}
          animate={{ opacity: activeTab === 'formats' ? 1 : 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <FormatsScreen 
            formats={formats}
            loading={formatsLoading}
            masters={masters}
            allProducts={allProducts}
            selectedBranch={selectedBranch}
            user={user}
            onRefresh={fetchFormats}
            logAudit={logAudit}
            setSigConfig={setSigConfig}
            setShowSignature={setShowSignature}
            initialStatusFilter={formatsInitialFilter}
            users={users}
          />
        </motion.div>

        <motion.div
          style={{ display: activeTab === 'creator' ? 'block' : 'none' }}
          animate={{ opacity: activeTab === 'creator' ? 1 : 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <CreatorScreen 
            formats={formats}
            records={records}
            masters={masters}
            allProducts={allProducts}
            selectedBranch={selectedBranch}
            user={user}
            onRefresh={fetchRecords}
            logAudit={logAudit}
            setSigConfig={setSigConfig}
            setShowSignature={setShowSignature}
            initialRecord={creatorInitialRecord}
            initialStep={creatorInitialStep}
            users={users}
          />
        </motion.div>

        <motion.div
          style={{ display: activeTab === 'active-batches' ? 'block' : 'none' }}
          animate={{ opacity: activeTab === 'active-batches' ? 1 : 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ActiveBatchesScreen 
            records={records}
            loading={recordsLoading}
            masters={masters}
            allProducts={allProducts}
            onRefresh={fetchRecords}
            onDeleteRecord={handleDeleteBatchRecord}
            onViewRecord={(r) => setSelectedViewRecord(r)}
            onNavigate={handleTabChange}
            setCreatorInitialRecord={setCreatorInitialRecord}
            setCreatorInitialStep={setCreatorInitialStep}
          />
        </motion.div>

        <motion.div
          style={{ display: activeTab === 'masters' ? 'block' : 'none' }}
          animate={{ opacity: activeTab === 'masters' ? 1 : 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <MastersScreen 
            masters={masters}
            loading={mastersLoading}
            onAdd={(defaultType) => {
              setNewMasterType(defaultType);
              setShowAddMasterModal(true);
            }}
            onDelete={handleDeleteMasterItem}
            onUpdate={handleUpdateMasterItem}
            setSigConfig={setSigConfig}
            setShowSignature={setShowSignature}
            user={user}
            allProducts={allProducts}
            logAudit={logAudit}
            users={users}
          />
        </motion.div>
      </div>

      {/* Electronic Password confirmation re-entry dialog matching 21 CFR */}
      <SignatureDialog 
        isOpen={showSignature}
        onClose={() => setShowSignature(false)}
        title={sigConfig.title}
        description={sigConfig.description}
        meaning={sigConfig.meaning}
        onConfirm={(password) => {
          sigConfig.onVerify(password);
        }}
      />

      {/* Master lookups insertion dialogues */}
      <AnimatePresence>
        {showAddMasterModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Add Option to Lookup</h3>
                <p className="text-sm text-slate-500">Configure lookup values available across the generation rules.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Lookup category</Label>
                  <select 
                    value={newMasterType} 
                    onChange={(e: any) => setNewMasterType(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value="process">Process Master</option>
                    <option value="stage">Stage Master</option>
                    <option value="recovery_component">Recovery Component Master</option>
                    <option value="generic">Generic Code Master</option>
                    <option value="base_batch_number">Base Batch Number Master</option>
                  </select>
                </div>

                {newMasterType === 'stage' && (
                  <div className="space-y-2 animate-in slide-in-from-top-1 duration-200">
                    <Label>Product (Active list) *</Label>
                    <select
                      value={newMasterProductId}
                      onChange={(e) => setNewMasterProductId(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    >
                      <option value="">-- Select Active Product --</option>
                      {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Value / Code ID</Label>
                  <Input 
                    type="text" 
                    placeholder={
                      newMasterType === 'base_batch_number'
                        ? "e.g. 26001, 26501, 260001"
                        : newMasterType === 'stage'
                          ? "e.g. LH10, MK11, DS"
                          : newMasterType === 'recovery_component'
                            ? "e.g. RM09, ACN, toluene, acetone"
                            : newMasterType === 'generic'
                              ? "e.g. A, Aq., aq., II, REC., rec."
                              : "e.g. Manufacturing, micronization, milling"
                    } 
                    value={newMasterCode} 
                    onChange={(e) => {
                      const isCaseFlexible = ['recovery_component', 'generic', 'process'].includes(newMasterType);
                      setNewMasterCode(isCaseFlexible ? e.target.value : e.target.value.toUpperCase());
                    }}
                    className={`h-12 rounded-xl focus-visible:ring-indigo-500 ${
                      ['recovery_component', 'generic', 'process'].includes(newMasterType) ? '' : 'uppercase'
                    }`}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description / Name (Optional)</Label>
                  <Input 
                    type="text" 
                    placeholder="e.g. Optional description or full title" 
                    value={newMasterName} 
                    onChange={(e) => setNewMasterName(e.target.value)}
                    className="h-12 rounded-xl focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" className="rounded-full" onClick={() => setShowAddMasterModal(false)}>
                  Cancel
                </Button>
                <Button className="bg-[#FF6321] hover:bg-[#e05419] text-white rounded-full px-6" onClick={handleAddMasterItem}>
                  Add Value
                </Button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* View Details Modal displaying Approval History and Approved Batch Number details */}
      <AnimatePresence>
        {selectedViewRecord && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-8 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
              <button 
                className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 font-bold text-lg"
                onClick={() => setSelectedViewRecord(null)}
              >
                ✕
              </button>
              
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-2xl font-black text-slate-900 animate-pulse">Batch Number Details</h3>
                <p className="text-sm text-slate-500 font-medium">Comprehensive configuration history, metadata, and electronic signatures under 21 CFR Part 11 rules.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Left side: Approval History */}
                <div className="md:col-span-1 space-y-6">
                  <div className="border border-slate-100 bg-slate-50/50 rounded-2xl p-6 self-start">
                    <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 mb-4">Approval History</h3>
                    
                    <div className="space-y-6 relative pl-4 border-l border-slate-200">
                      {selectedViewRecord.timeline && selectedViewRecord.timeline.length > 0 ? (
                        selectedViewRecord.timeline.map((item, idx) => (
                          <TimelineNode 
                            key={idx}
                            title={`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} by ${getUserFullNameWithDesignation(item.user, users)}`}
                            time={new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            date={new Date(item.timestamp).toLocaleDateString()}
                            comments={item.comments || ''}
                            active={true}
                          />
                        ))
                      ) : (
                        <>
                          <TimelineNode 
                            title={`Submitted by ${getUserFullNameWithDesignation(selectedViewRecord.generatedBy || user, users)}`} 
                            time={new Date(selectedViewRecord.generatedOn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                            date={new Date(selectedViewRecord.generatedOn).toLocaleDateString()} 
                            comments="Submitted for approval" 
                            active={true}
                          />
                          <TimelineNode 
                            title={selectedViewRecord.approvedBy ? `Approved by ${getUserFullNameWithDesignation(selectedViewRecord.approvedBy, users)}` : "Awaiting QA Approval"} 
                            time={selectedViewRecord.approvedDate ? new Date(selectedViewRecord.approvedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Pending"} 
                            date={selectedViewRecord.approvedDate ? new Date(selectedViewRecord.approvedDate).toLocaleDateString() : ""} 
                            comments={selectedViewRecord.approvedDate ? "Batch number approved" : "Awaiting electronic sign-off"} 
                            active={selectedViewRecord.status === 'APPROVED'}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Approved Batch number panel */}
                <div className="md:col-span-2 space-y-6">
                  <div className="border border-slate-200 rounded-2xl p-6 space-y-6">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                      <div>
                        <h4 className="text-base font-bold text-slate-900">Approved Batch Number (Read Only)</h4>
                        <p className="text-xs text-slate-500 font-medium">Fully authorized and ready to apply to production records.</p>
                      </div>
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        selectedViewRecord.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {selectedViewRecord.status}
                      </span>
                    </div>

                    {/* Styled Batch Display block */}
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-150 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Batch Number</span>
                      <div className="flex items-center justify-between">
                        <span className="text-3xl font-mono font-black text-[#FF6321] select-all leading-none">
                          {selectedViewRecord.batchNumber}
                        </span>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-10 w-10 text-slate-500 hover:bg-white" 
                          onClick={() => {
                            navigator.clipboard.writeText(selectedViewRecord.batchNumber);
                            toast.success('Batch number copied to clipboard!');
                          }}
                        >
                          <Copy className="w-5.5 h-5.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Details grid matching layout */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm py-4 border-y border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Status</span>
                        <span className="font-extrabold text-slate-900 uppercase text-xs">{selectedViewRecord.status}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Product</span>
                        <span className="font-bold text-slate-800">{selectedViewRecord.product}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Scenario</span>
                        <span className="font-bold text-slate-800">{selectedViewRecord.scenario}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Format Used</span>
                        <span className="font-bold text-indigo-600 font-mono text-xs">{selectedViewRecord.formatCode}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Approved By</span>
                        <span className="font-extrabold text-slate-800">{selectedViewRecord.approvedBy ? getUserFullNameWithDesignation(selectedViewRecord.approvedBy, users) : 'Pending'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Approved On</span>
                        <span className="font-medium text-slate-500 text-xs">
                          {selectedViewRecord.approvedDate ? new Date(selectedViewRecord.approvedDate).toLocaleDateString() : 'Pending'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 text-xs">
                      <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Remarks / Comments</span>
                      <p className="text-slate-700 font-medium">
                        {selectedViewRecord.status === 'APPROVED' ? "Approved as per SOP RM-05 standard requirements." : "Verification pending visual check and e-signature authorization."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
                <Button 
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-6 text-xs h-10 font-bold"
                  onClick={() => setSelectedViewRecord(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// Subcomponents definitions

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold tracking-wider uppercase transition-all duration-300 ${
        active 
          ? 'bg-slate-900 text-white shadow-md font-black' 
          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ==========================================
      SCREEN 1: DASHBOARD IMPLEMENTATION
   ========================================== */interface DashboardScreenProps {
  formats: BatchNumberFormat[];
  allProducts: any[];
  countActiveFormats: number;
  countActiveScenarios: number;
  countPendingReviews: number;
  countPendingApprovals: number;
  countTotalGenerated: number;
  records: BatchNumberRecord[];
  loading: boolean;
  onNavigate: (tab: any) => void;
  onRefresh: () => void;
  setSigConfig: any;
  setShowSignature: any;
  user: any;
  onActiveFormatsClick: () => void;
  onPendingReviewsClick: () => void;
  onPendingApprovalsClick: () => void;
  onBatchesGeneratedClick: () => void;
  onDeleteRecord: (r: BatchNumberRecord) => void;
  onViewRecord: (r: BatchNumberRecord) => void;
  setCreatorInitialRecord: (r: BatchNumberRecord | null) => void;
  setCreatorInitialStep: (step: number) => void;
  setFormatsInitialFilter: (filter: 'ALL' | 'UNDER_REVIEW') => void;
  logAudit: any;
}

function DashboardScreen({
  formats,
  allProducts,
  countActiveFormats,
  countActiveScenarios,
  countPendingReviews,
  countPendingApprovals,
  countTotalGenerated,
  records,
  loading,
  onNavigate,
  onRefresh,
  setSigConfig,
  setShowSignature,
  user,
  onActiveFormatsClick,
  onPendingReviewsClick,
  onPendingApprovalsClick,
  onBatchesGeneratedClick,
  onDeleteRecord,
  onViewRecord,
  setCreatorInitialRecord,
  setCreatorInitialStep,
  setFormatsInitialFilter,
  logAudit
}: DashboardScreenProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [dashboardView, setDashboardView] = useState<'APPROVED' | 'PENDING_APPROVAL' | 'UNDER_REVIEW'>('APPROVED');

  const fetchActivities = async () => {
    setActivitiesLoading(true);
    try {
      const res = await api.get('/batch-number-engine/audits');
      if (res.data.success) {
        setActivities(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load batch engine audit activities:', err);
    } finally {
      setActivitiesLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [records]);

  const formatActivity = (log: any) => {
    let title = log.changeReason || log.action || "Active event";
    let subtitle = `Action executed by ${log.userName || log.userEmail || "System"}`;
    
    if (log.action === 'ISSUE_NEW_BATCH_NUMBER') {
      title = `Batch Number ${log.newValue?.batchNumber || ""} Generated`;
      subtitle = `Derived using format ${log.newValue?.formatCode || ""}`;
    } else if (log.action === 'ACTIVATE_FORMAT') {
      title = `Format sequence ${log.newValue?.formatCode || ""} Activated`;
      subtitle = `Authorized by ${log.userName || log.userEmail || "System"}`;
    } else if (log.action === 'CREATE_FORMAT_DRAFT') {
      title = `Draft Format sequence created`;
      subtitle = `Saved by ${log.userName || log.userEmail || "System"}`;
    } else if (log.action === 'SUBMIT_FORMAT_REVIEW') {
      title = `Format sequence ${log.newValue?.formatCode || ""} submitted for Review`;
      subtitle = `Submitted by ${log.userName || log.userEmail || "System"}`;
    } else if (log.action === 'ADD_MASTER_ITEM') {
      title = `Option value added to lookup masters`;
      subtitle = `Added master code: ${log.newValue?.code || ""}`;
    } else if (log.action === 'DELETE_MASTER_ITEM') {
      title = `Option value deleted from lookup masters`;
      subtitle = `Deleted master code: ${log.oldValue?.code || ""}`;
    } else if (log.action === 'DELETE_BATCH_RECORD') {
      title = `Batch Number deleted`;
      subtitle = `Permanently deleted by ${log.userName || log.userEmail || "System"}`;
    } else if (log.action === 'APPROVE_BATCH_NUMBER') {
      title = `Batch Number approved`;
      subtitle = `Authorized by ${log.userName || log.userEmail || "System"}`;
    }
    
    return { title, subtitle };
  };

  const formatRelativeTime = (isoString: string) => {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    const now = new Date();
    const formatTime = (date: Date) => {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };
    
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    
    if (isToday) {
      return `Today, ${formatTime(d)}`;
    } else if (isYesterday) {
      return `Yesterday, ${formatTime(d)}`;
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const p = (num: number) => num.toString().padStart(2, '0');
      return `${p(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()}, ${formatTime(d)}`;
    }
  };

  const approvedRecords = records.filter(r => r.status === 'APPROVED');
  const pendingApprovalRecords = records.filter(r => r.status === 'PENDING_APPROVAL');
  const pendingReviewFormats = formats.filter(f => f.status === 'UNDER_REVIEW');
  const draftRecords = records.filter(r => r.status === 'DRAFT');

  const handleSubmitRecordForApproval = async (rec: BatchNumberRecord) => {
    const checkPermission = (permId: string, customMessage?: string) => {
      if (user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com') {
        return true;
      }
      const userPermissions = user?.permissions || [];
      if (!userPermissions.includes(permId)) {
        toast.error(customMessage || `Access Denied: You do not have permission for this action.`);
        return false;
      }
      return true;
    };

    if (!checkPermission('batch_number:submit', "Access Denied: You do not have 'Submit Batch Number' permission.")) return;

    setSigConfig({
      title: 'Submit Batch Number for Review',
      description: `You are submitting batch number "${rec.batchNumber}" for formal QA confirmation and approval.`,
      meaning: 'I certify that the selected values align with floor batch documents',
      onVerify: async (password: string) => {
        try {
          const updatedTimeline = [
            ...rec.timeline,
            { 
              type: 'submitted' as const, 
              user: user?.displayName || user?.email || 'QA Submitter', 
              role: user?.role || 'QA', 
              timestamp: new Date().toISOString(), 
              comments: 'Submitted for final QA Approval' 
            }
          ];

          await api.put(`/batch-number-engine/records/${rec.id}`, {
            status: 'PENDING_APPROVAL',
            timeline: updatedTimeline,
            password,
            signatureMeaning: 'I certify that the selected values align with floor batch documents'
          });

          const freshRecord = { 
            ...rec, 
            status: 'PENDING_APPROVAL' as const, 
            timeline: updatedTimeline 
          };
          
          await logAudit(
            'SUBMIT_BATCH_APPROVAL',
            rec.batchNumber,
            'BATCH_NUMBER',
            rec,
            freshRecord,
            'Submitted batch number layout for review'
          );

          toast.success('Successfully submitted layout for approval');
          setShowSignature(false);
          onRefresh();
        } catch (err) {
          toast.error('Signature validation failed');
        }
      }
    });
    setShowSignature(true);
  };

  const handleDashboardActivateFormat = async (f: BatchNumberFormat) => {
    const checkPermission = (permId: string, customMessage?: string) => {
      if (user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com') {
        return true;
      }
      const userPermissions = user?.permissions || [];
      if (!userPermissions.includes(permId)) {
        toast.error(customMessage || `Access Denied: You do not have permission for this action.`);
        return false;
      }
      return true;
    };

    if (!checkPermission('format:approve', "Access Denied: You do not have 'Approve Format Layout' permission.")) return;

    setSigConfig({
      title: 'E-Sign Format Activation',
      description: `You are authorizing the activation of sequence "${f.formatCode}" as the official batch number layout for this scenario.`,
      meaning: 'This electronic signature confirms authorization and makes this sequence rule live',
      onVerify: async (password: string) => {
        try {
          await api.post('/batch-number-engine/formats', {
            ...f,
            status: 'ACTIVE',
            updatedBy: user?.displayName || user?.email,
            updatedAt: new Date().toISOString(),
            password,
            signatureMeaning: 'This electronic signature confirms authorization and makes this sequence rule live'
          });

          await logAudit('ACTIVATE_FORMAT', f.formatCode, 'BATCH_FORMAT', f, { ...f, status: 'ACTIVE' }, 'Authorized sequence format');
          toast.success(`Format "${f.formatCode}" is now active and live.`);
          setShowSignature(false);
          onRefresh();
        } catch (err) {
          toast.error('Signature verification error');
        }
      }
    });
    setShowSignature(true);
  };

  return (
    <div className="space-y-8">
      {/* Metrics Cards Grid exactly matching the mockup with selection status feedback */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          label="Active Formats" 
          value={countActiveFormats} 
          icon={<Layers className="w-5 h-5 text-indigo-500" />} 
          onClick={() => {
            setFormatsInitialFilter('ALL');
            onNavigate('formats');
          }} 
        />
        <StatCard 
          label="Active Scenarios" 
          value={countActiveScenarios} 
          icon={<Sparkles className="w-5 h-5 text-indigo-500" />} 
          onClick={() => {
            setFormatsInitialFilter('ALL');
            onNavigate('formats');
          }} 
        />
        <StatCard 
          label="Pending Reviews" 
          value={countPendingReviews} 
          icon={<Clock className="w-5 h-5 text-indigo-500" />} 
          isActive={dashboardView === 'UNDER_REVIEW'}
          onClick={() => setDashboardView('UNDER_REVIEW')} 
        />
        <StatCard 
          label="Pending Approvals" 
          value={countPendingApprovals} 
          icon={<UserCheck className="w-5 h-5 text-indigo-500" />} 
          isActive={dashboardView === 'PENDING_APPROVAL'}
          onClick={() => setDashboardView('PENDING_APPROVAL')} 
        />
        <StatCard 
          label="Batches Generated" 
          value={countTotalGenerated} 
          icon={<CheckCircle2 className="w-5 h-5 text-indigo-500" />} 
          isActive={dashboardView === 'APPROVED'}
          onClick={() => setDashboardView('APPROVED')} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dynamic Interactive Table Panel based on dashboardView */}
        <Card className="lg:col-span-2 border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl overflow-hidden self-start">
          <CardHeader className="p-6 pb-2 border-b border-slate-50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold text-slate-900">
                  {dashboardView === 'APPROVED' && 'Active Approved Batch Numbers'}
                  {dashboardView === 'PENDING_APPROVAL' && 'Batch Numbers Pending Approval'}
                  {dashboardView === 'UNDER_REVIEW' && 'Format Sequences Under Review'}
                </CardTitle>
                <CardDescription className="text-slate-500">
                  {dashboardView === 'APPROVED' && 'Track and monitor approved, GMP-compliant batch numbers.'}
                  {dashboardView === 'PENDING_APPROVAL' && 'Verify and authorize pending batch numbers via 21 CFR Part 11 Electronic Signature.'}
                  {dashboardView === 'UNDER_REVIEW' && 'QA review queue for proposed batch number format templates.'}
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="rounded-full px-4 text-xs font-semibold text-slate-500 border-slate-200 hover:bg-slate-50" onClick={() => {
                if (dashboardView === 'UNDER_REVIEW') {
                  setFormatsInitialFilter('UNDER_REVIEW');
                  onNavigate('formats');
                } else if (dashboardView === 'PENDING_APPROVAL') {
                  const pendingRecs = records.filter(r => r.status === 'PENDING_APPROVAL');
                  if (pendingRecs.length > 0) {
                    setCreatorInitialRecord(pendingRecs[0]);
                    setCreatorInitialStep(5);
                  }
                  onNavigate('creator');
                } else {
                  onNavigate('active-batches');
                }
              }}>
                View Panel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading details...</div>
            ) : (
              <>
                {dashboardView === 'APPROVED' && (
                  approvedRecords.length === 0 ? (
                    <div className="p-16 text-center text-slate-400 italic">No approved active batch numbers issued for this branch yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                            <th className="p-4 px-6">Batch Number</th>
                            <th className="p-4">Product</th>
                            <th className="p-4">Scenario</th>
                            <th className="p-4">Generated On</th>
                            <th className="p-4 px-6">By</th>
                            <th className="p-4 px-6 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {approvedRecords.map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="p-4 px-6 font-mono text-xs font-bold text-[#FF6321]">{r.batchNumber}</td>
                              <td className="p-4 text-slate-700 font-medium">{r.product}</td>
                              <td className="p-4 text-slate-600 text-xs">{r.scenario}</td>
                              <td className="p-4 text-slate-400 text-xs">{r.generatedOn ? new Date(r.generatedOn).toLocaleDateString() : 'N/A'}</td>
                              <td className="p-4 px-6 text-slate-500 text-xs font-semibold">{r.generatedBy}</td>
                              <td className="p-4 px-6 text-center space-x-2 whitespace-nowrap">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="rounded-full text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50/80 px-4 py-1"
                                  onClick={() => onViewRecord(r)}
                                >
                                  View details
                                </Button>
                                {user?.email?.toLowerCase() === 'shakshay04@gmail.com' && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="rounded-full text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                                    onClick={() => onDeleteRecord(r)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {dashboardView === 'PENDING_APPROVAL' && (
                  pendingApprovalRecords.length === 0 ? (
                    <div className="p-16 text-center text-slate-400 italic">No batch numbers awaiting approval.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-amber-50/30 text-[10px] font-bold text-amber-800 uppercase tracking-wider border-b border-amber-100/30">
                            <th className="p-4 px-6">Batch Number</th>
                            <th className="p-4">Product</th>
                            <th className="p-4">Scenario</th>
                            <th className="p-4">Generated On</th>
                            <th className="p-4 px-6">By</th>
                            <th className="p-4 px-6 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {pendingApprovalRecords.map((r, i) => (
                            <tr key={i} className="hover:bg-amber-50/10 transition-colors group">
                              <td className="p-4 px-6 font-mono text-xs font-bold text-amber-700">{r.batchNumber}</td>
                              <td className="p-4 text-slate-700 font-medium">{r.product}</td>
                              <td className="p-4 text-slate-600 text-xs">{r.scenario}</td>
                              <td className="p-4 text-slate-400 text-xs">{r.generatedOn ? new Date(r.generatedOn).toLocaleDateString() : 'N/A'}</td>
                              <td className="p-4 px-6 text-slate-500 text-xs font-semibold">{r.generatedBy}</td>
                              <td className="p-4 px-6 text-center space-x-2 whitespace-nowrap">
                                <Button 
                                  size="sm" 
                                  className="bg-amber-600 hover:bg-amber-700 text-white rounded-full text-xs font-bold px-4 py-1"
                                  onClick={() => {
                                    setCreatorInitialRecord(r);
                                    setCreatorInitialStep(5);
                                    onNavigate('creator');
                                  }}
                                >
                                  Verify & Sign
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="rounded-full text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50/80 px-4 py-1"
                                  onClick={() => onViewRecord(r)}
                                >
                                  Details
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {dashboardView === 'UNDER_REVIEW' && (
                  (pendingReviewFormats.length === 0 && draftRecords.length === 0) ? (
                    <div className="p-16 text-center text-slate-400 italic">No formats or generated batch numbers awaiting review.</div>
                  ) : (
                    <div className="space-y-6">
                      {pendingReviewFormats.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-6 pt-4">Proposed Format Sequences</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-indigo-50/30 text-[10px] font-bold text-indigo-800 uppercase tracking-wider border-b border-indigo-100/30">
                                  <th className="p-4 px-6">Format Code</th>
                                  <th className="p-4">Format Name</th>
                                  <th className="p-4">Representative Layout</th>
                                  <th className="p-4 px-6">Proposed By</th>
                                  <th className="p-4 px-6 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-sm">
                                {pendingReviewFormats.map((f, i) => (
                                  <tr key={i} className="hover:bg-indigo-50/10 transition-colors group">
                                    <td className="p-4 px-6 font-mono text-xs font-bold text-indigo-700">{f.formatCode}</td>
                                    <td className="p-4 text-slate-700 font-medium">{f.formatName}</td>
                                    <td className="p-4 font-mono text-xs text-slate-500">
                                      {getFormatTokens(f).map(tok => {
                                        if (tok.type === 'auto_generated') return '[Sequence]';
                                        if (tok.type === 'static_text') return tok.source;
                                        if (tok.type === 'master_lookup') return `[${tok.name}]`;
                                        if (tok.type === 'collection') return `[${tok.name}]`;
                                        return '...';
                                      }).join('')}
                                    </td>
                                    <td className="p-4 px-6 text-slate-500 text-xs font-semibold">{f.createdBy}</td>
                                    <td className="p-4 px-6 text-center space-x-2 whitespace-nowrap">
                                      <Button 
                                        size="sm" 
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold px-4 py-1"
                                        onClick={() => handleDashboardActivateFormat(f)}
                                      >
                                        Approve & Activate
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="rounded-full text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50/80 px-4 py-1"
                                        onClick={() => {
                                          setFormatsInitialFilter('UNDER_REVIEW');
                                          onNavigate('formats');
                                        }}
                                      >
                                        View in Panel
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {draftRecords.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-6">Generated Batch Numbers Awaiting Submission</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-amber-50/30 text-[10px] font-bold text-amber-800 uppercase tracking-wider border-b border-amber-100/30">
                                  <th className="p-4 px-6">Batch Number</th>
                                  <th className="p-4">Product</th>
                                  <th className="p-4">Scenario</th>
                                  <th className="p-4">Generated On</th>
                                  <th className="p-4 px-6">By</th>
                                  <th className="p-4 px-6 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-sm">
                                {draftRecords.map((r, i) => (
                                  <tr key={i} className="hover:bg-amber-50/10 transition-colors group">
                                    <td className="p-4 px-6 font-mono text-xs font-bold text-amber-700">{r.batchNumber}</td>
                                    <td className="p-4 text-slate-700 font-medium">{r.product}</td>
                                    <td className="p-4 text-slate-600 text-xs">{r.scenario}</td>
                                    <td className="p-4 text-slate-400 text-xs">{r.generatedOn ? new Date(r.generatedOn).toLocaleDateString() : 'N/A'}</td>
                                    <td className="p-4 px-6 text-slate-500 text-xs font-semibold">{r.generatedBy}</td>
                                    <td className="p-4 px-6 text-center space-x-2 whitespace-nowrap">
                                      <Button 
                                        size="sm" 
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-xs font-bold px-4 py-1"
                                        onClick={() => handleSubmitRecordForApproval(r)}
                                      >
                                        Submit for Approval
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="rounded-full text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50/80 px-4 py-1"
                                        onClick={() => {
                                          setCreatorInitialRecord(r);
                                          setCreatorInitialStep(4);
                                          onNavigate('creator');
                                        }}
                                      >
                                        Details
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Live Recent Activities Audit log panel */}
        <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl overflow-hidden self-start">
          <CardHeader className="p-6 pb-2 border-b border-slate-50">
            <CardTitle className="text-xl font-bold text-slate-900">Recent Activities</CardTitle>
            <CardDescription className="text-slate-500">Live feed of active events and operations.</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              {activitiesLoading ? (
                <div className="text-sm text-slate-400 italic py-4 text-center">Loading live feed...</div>
              ) : activities.length === 0 ? (
                <div className="text-sm text-slate-400 italic py-4 text-center">No recent engine activities recorded.</div>
              ) : (
                <>
                  {(showAllActivities ? activities : activities.slice(0, 5)).map((log) => {
                    const info = formatActivity(log);
                    return (
                      <ActivityItem 
                        key={log.id || log.auditId || `act-${log.timestamp}-${Math.random()}`}
                        title={info.title} 
                        subtitle={info.subtitle} 
                        time={formatRelativeTime(log.timestamp)} 
                      />
                    );
                  })}
                  {activities.length > 5 && (
                    <div className="pt-4 border-t border-slate-100 flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs font-bold text-indigo-600 border-indigo-100 hover:bg-indigo-50/50"
                        onClick={() => setShowAllActivities(!showAllActivities)}
                      >
                        {showAllActivities ? "Show Less" : "View All"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon, 
  isActive,
  onClick 
}: { 
  label: string; 
  value: number | string; 
  icon: React.ReactNode; 
  isActive?: boolean;
  onClick?: () => void; 
}) {
  return (
    <Card 
      onClick={onClick}
      className={`bg-white rounded-3xl p-6 group transition-all duration-300 border-2 ${
        isActive 
          ? 'border-indigo-600 shadow-xl ring-2 ring-indigo-600/10' 
          : 'border-transparent shadow-lg shadow-slate-100/40 hover:border-slate-300 hover:shadow-xl'
      } ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex justify-between items-center mb-4">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{label}</span>
        <div className={`p-2 rounded-xl group-hover:scale-110 transition-transform ${isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50'}`}>
          {icon}
        </div>
      </div>
      <h3 className={`text-3xl font-black tracking-tight transition-colors ${isActive ? 'text-indigo-600' : 'text-[#FF6321]'}`}>{value}</h3>
    </Card>
  );
}

function ActivityItem({ title, subtitle, time }: { title: string; subtitle: string; time: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-2.5 h-2.5 rounded-full bg-[#FF6321] mt-1.5 flex-shrink-0 animate-pulse" />
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 leading-snug">{title}</p>
        <p className="text-xs text-slate-500 leading-normal">{subtitle}</p>
        <p className="text-[10px] text-slate-400 font-medium">{time}</p>
      </div>
    </div>
  );
}


/* ==========================================
      SCREEN 2: FORMAT BUILDER PANEL
   ========================================== */
interface FormatsScreenProps {
  formats: BatchNumberFormat[];
  loading: boolean;
  masters: MasterItem[];
  allProducts: any[];
  selectedBranch: string;
  user: any;
  onRefresh: () => void;
  logAudit: any;
  setSigConfig: any;
  setShowSignature: any;
  initialStatusFilter?: 'ALL' | 'UNDER_REVIEW';
  users?: any[];
}

function FormatsScreen({
  formats,
  loading,
  masters,
  allProducts,
  selectedBranch,
  user,
  onRefresh,
  logAudit,
  setSigConfig,
  setShowSignature,
  initialStatusFilter,
  users = []
}: FormatsScreenProps) {
  const checkPermission = (permId: string, customMessage?: string) => {
    if (user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com') {
      return true;
    }
    const userRole = (user?.role || '').toUpperCase();
    const designation = (user?.designation || '').toUpperCase();
    // Grant Edit Format Layout authority to QA Chemist and QA Incharge
    if (permId === 'format:edit' || permId === 'format:create') {
      if (
        userRole.includes('QA_CHEMIST') ||
        userRole.includes('QA_INCHARGE') ||
        userRole.includes('QA_SUPERVISOR') ||
        userRole.includes('QA_LEAD') ||
        userRole.includes('QA_MANAGER') ||
        designation.includes('QA CHEMIST') ||
        designation.includes('QA INCHARGE') ||
        designation.includes('QA IN-CHARGE') ||
        designation.includes('QUALITY ASSURANCE') ||
        userRole.includes('QA')
      ) {
        return true;
      }
    }
    const userPermissions = user?.permissions || [];
    if (!userPermissions.includes(permId)) {
      toast.error(customMessage || `Access Denied: You do not have permission for this action.`);
      return false;
    }
    return true;
  };

  const hasEditPermission = () => {
    if (user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com') {
      return true;
    }
    const userRole = (user?.role || '').toUpperCase();
    const designation = (user?.designation || '').toUpperCase();
    if (
      userRole.includes('QA_CHEMIST') ||
      userRole.includes('QA_INCHARGE') ||
      userRole.includes('QA_SUPERVISOR') ||
      userRole.includes('QA_LEAD') ||
      userRole.includes('QA_MANAGER') ||
      designation.includes('QA CHEMIST') ||
      designation.includes('QA INCHARGE') ||
      designation.includes('QA IN-CHARGE') ||
      designation.includes('QUALITY ASSURANCE') ||
      userRole.includes('QA')
    ) {
      return true;
    }
    const userPermissions = user?.permissions || [];
    return userPermissions.includes('format:edit') || userPermissions.includes('format:create');
  };

  const [isCreating, setIsCreating] = useState(false);
  const [editingFormat, setEditingFormat] = useState<BatchNumberFormat | null>(null);
  const [selectedFormatWorkflow, setSelectedFormatWorkflow] = useState<BatchNumberFormat | null>(null);
  const [formatCode, setFormatCode] = useState('');
  const [formatName, setFormatName] = useState('');
  const [formatTokens, setFormatTokens] = useState<FormatToken[]>([]);
  const [searchTokenTab, setSearchTokenTab] = useState('');

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'UNDER_REVIEW' | 'ACTIVE'>(initialStatusFilter || 'ALL');

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  // Draft Format edit trigger
  const triggerCreateNew = () => {
    setEditingFormat(null);
    setFormatCode('');
    setFormatName('');
    setFormatTokens([
      { id: 't-1', name: 'Base Batch Number', type: 'master_lookup', source: 'base_batch_number', mandatory: true }
    ]);
    setIsCreating(true);
  };

  const handleEditFormat = (f: BatchNumberFormat) => {
    if (!hasEditPermission()) {
      toast.error("Access Denied: You do not have 'Edit Format Layout' permission. Only QA Chemist, QA Incharge, and Authorized QA/Admin roles can edit format layouts.");
      return;
    }
    setEditingFormat(f);
    setFormatCode(f.formatCode);
    setFormatName(f.formatName);
    setFormatTokens(getFormatTokens(f));
    setIsCreating(true);
  };

  const handleSaveEditedFormat = async () => {
    if (!editingFormat) return;
    if (!hasEditPermission()) {
      toast.error("Access Denied: You do not have 'Edit Format Layout' permission.");
      return;
    }
    if (!formatCode.trim() || !formatName.trim()) {
      toast.error('Format Code and Format Name are required');
      return;
    }
    if (formatTokens.length === 0) {
      toast.error('At least one token is required in the format sequence layout');
      return;
    }

    const userDisplayName = getUserFullNameWithDesignation(user, users);
    const meaning = `I certify under 21 CFR Part 11 and GMP guidelines that I have reviewed and authorized the layout modifications for format "${formatCode.trim()}".`;

    setSigConfig({
      title: `E-Signature Required: Edit Format Layout (${formatCode.trim()})`,
      description: `You are modifying batch number format layout "${formatCode.trim()}". This action will be recorded with your electronic signature in the Batch Process Audit Logs.`,
      meaning,
      onVerify: async (password: string) => {
        try {
          const updatedTokens = formatTokens;
          const updatedHistory = [
            ...(editingFormat.history || editingFormat.approvalHistory || []),
            {
              status: editingFormat.status,
              action: 'EDIT_FORMAT_LAYOUT',
              user: userDisplayName,
              timestamp: new Date().toISOString(),
              comments: `Authorized modification of format layout "${formatCode.trim()}" sequence.`,
              meaning: meaning
            }
          ];

          const payload = {
            id: editingFormat.id,
            formatCode: formatCode.trim(),
            formatName: formatName.trim(),
            tokens: updatedTokens,
            status: editingFormat.status,
            branch: selectedBranch || editingFormat.branch || 'Masulkhana',
            updatedBy: userDisplayName,
            updatedAt: new Date().toISOString(),
            isEditing: true,
            action: 'EDIT_FORMAT_LAYOUT',
            changeReason: `Authorized modification of format layout "${formatCode.trim()}" sequence by QA Chemist/QA Incharge`,
            password,
            signatureMeaning: meaning,
            history: updatedHistory,
            approvalHistory: updatedHistory
          };

          await api.post('/batch-number-engine/formats', payload);

          if (logAudit) {
            await logAudit(
              'EDIT_FORMAT_LAYOUT',
              formatCode.trim(),
              'Batch Number Generation Engine',
              editingFormat,
              payload,
              `Authorized edit of format layout "${formatCode.trim()}" layout sequence under GMP compliance`
            );
          }

          toast.success(`Format layout "${formatCode.trim()}" updated successfully and logged in Batch Process Audit Trail.`);
          setIsCreating(false);
          setEditingFormat(null);
          setShowSignature(false);
          onRefresh();
        } catch (err: any) {
          console.error('Failed to update format layout:', err);
          const msg = err?.response?.data?.message || 'E-Signature verification failed or API error';
          toast.error(msg);
        }
      }
    });
    setShowSignature(true);
  };

  // Add token from Library
  const addTokenToSequence = (tokenName: string, type: TokenCategory, source: string, separator?: string) => {
    // Generate a clean representation
    const newToken: FormatToken = {
      id: `tok-${Date.now()}-${Math.random().toString(36).substring(4)}`,
      name: tokenName,
      type,
      source,
      separator: separator || undefined,
      mandatory: true
    };
    setFormatTokens([...formatTokens, newToken]);
    toast.success(`Token "${tokenName}" added to sequence`);
  };

  // Deletions / Swaps and up-downs
  const deleteToken = (id: string) => {
    setFormatTokens(formatTokens.filter(t => t.id !== id));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const items = [...formatTokens];
    const target = items[index];
    items[index] = items[index - 1];
    items[index - 1] = target;
    setFormatTokens(items);
  };

  const moveDown = (index: number) => {
    if (index === formatTokens.length - 1) return;
    const items = [...formatTokens];
    const target = items[index];
    items[index] = items[index + 1];
    items[index + 1] = target;
    setFormatTokens(items);
  };

  // Static token customized input state
  const [customText, setCustomText] = useState('');

  // Calculate the live representation exactly similar to mockup
  const getFormatLivePreview = () => {
    return formatTokens.map(tok => {
      if (tok.type === 'auto_generated') return `${getYearCode()}001`;
      if (tok.type === 'static_text') return tok.source;
      if (tok.type === 'master_lookup') {
        if (tok.source === 'stage_code') return 'LH10';
        if (tok.source === 'product_code') return 'L';
        if (tok.source === 'generic_code') return 'A';
        if (tok.source === 'base_batch_number') return '26001';
        return 'VAL';
      }
      if (tok.type === 'collection') {
        return 'RM807';
      }
      return '...';
    }).join('');
  };

  // Save actions
  const handleSaveDraft = async () => {
    if (!checkPermission('format:create', "Access Denied: You do not have 'Create/Edit Format Layout' permission.")) return;
    if (!formatCode || !formatName) {
      toast.error('Format Code and Format Name are mandatory');
      return;
    }
    try {
      const fData: Omit<BatchNumberFormat, 'id'> = {
        formatCode,
        formatName,
        status: 'DRAFT',
        branch: selectedBranch || 'Masulkhana',
        tokens: formatTokens,
        createdBy: user?.displayName || user?.email || 'QA Admin',
        createdAt: new Date().toISOString()
      };

      // Check if code already exists under this branch (updates draft in that case)
      const ex = formats.find(f => f.formatCode === formatCode && f.status === 'DRAFT');
      await api.post('/batch-number-engine/formats', { ...fData, id: ex?.id });
      
      if (ex) {
        toast.success(`Draft Format "${formatCode}" updated successfully`);
      } else {
        toast.success(`Draft Format "${formatCode}" saved successfully`);
      }

      await logAudit('CREATE_FORMAT_DRAFT', formatCode, 'BATCH_FORMAT', null, fData, 'Stored draft format.');
      setIsCreating(false);
      onRefresh();
    } catch (err) {
      toast.error('Failed to save draft format');
    }
  };

  const handleSubmitForReview = async () => {
    if (!checkPermission('format:submit', "Access Denied: You do not have 'Submit Format Layout' permission.")) return;
    if (!formatCode || !formatName) {
      toast.error('Format Code and Name are required');
      return;
    }
    // E-signature trigger
    setSigConfig({
      title: 'Sign for Layout Review Submission',
      description: `You are submitting batch number layout "${formatCode}" for verification and administrative approval.`,
      meaning: 'I certify that this layout is compliant with local and CFR 11 expectations',
      onVerify: async (password: string) => {
        try {
          const fData: Omit<BatchNumberFormat, 'id'> = {
            formatCode,
            formatName,
            status: 'UNDER_REVIEW',
            branch: selectedBranch || 'Masulkhana',
            tokens: formatTokens,
            createdBy: user?.displayName || user?.email || 'QA Admin',
            createdAt: new Date().toISOString()
          };

          const ex = formats.find(f => f.formatCode === formatCode);
          await api.post('/batch-number-engine/formats', { 
            ...fData, 
            id: ex?.id,
            password,
            signatureMeaning: 'I certify that this layout is compliant with local and CFR 11 expectations'
          });

          await logAudit('SUBMIT_FORMAT_REVIEW', formatCode, 'BATCH_FORMAT', null, fData, 'Submitted format layout for QA authorization');
          toast.success('Format layout submitted for review successfully');
          setIsCreating(false);
          setShowSignature(false);
          onRefresh();
        } catch (err) {
          toast.error('Credential verification failed or api error');
        }
      }
    });
    setShowSignature(true);
  };

  const handleActivateFormat = async (f: BatchNumberFormat) => {
    if (!checkPermission('format:approve', "Access Denied: You do not have 'Approve Format Layout' permission.")) return;
    setSigConfig({
      title: 'E-Sign Format Activation',
      description: `You are authorizing the activation of sequence "${f.formatCode}" as the official batch number layout for this scenario.`,
      meaning: 'This electronic signature confirms authorization and makes this sequence rule live',
      onVerify: async (password: string) => {
        try {
          await api.post('/batch-number-engine/formats', {
            ...f,
            status: 'ACTIVE',
            updatedBy: user?.displayName || user?.email,
            updatedAt: new Date().toISOString(),
            password,
            signatureMeaning: 'This electronic signature confirms authorization and makes this sequence rule live'
          });

          await logAudit('ACTIVATE_FORMAT', f.formatCode, 'BATCH_FORMAT', f, { ...f, status: 'ACTIVE' }, 'Authorized sequence format');
          toast.success(`Format "${f.formatCode}" is now active and live.`);
          setShowSignature(false);
          onRefresh();
        } catch (err) {
          toast.error('Signature verification error');
        }
      }
    });
    setShowSignature(true);
  };

  const handleDeleteFormat = async (f: BatchNumberFormat) => {
    if (!checkPermission('format:create', "Access Denied: You do not have 'Create/Edit Format Layout' permission to delete records.")) return;
    setSigConfig({
      title: 'E-Sign Format Deletion',
      description: `You are permanently deleting sequence format "${f.formatCode}". This operation cannot be undone.`,
      meaning: 'I certify that deleting this layout is authorized and compliant with CFR Part 11 requirements.',
      onVerify: async (password: string) => {
        try {
          await api.delete(`/batch-number-engine/formats/${f.id}`, {
            data: {
              password,
              signatureMeaning: 'I certify that deleting this layout is authorized and compliant with CFR Part 11 requirements.'
            }
          });

          toast.success(`Format "${f.formatCode}" deleted successfully.`);
          setShowSignature(false);
          onRefresh();
        } catch (err: any) {
          console.error(err);
          const msg = err.response?.data?.message || 'Signature verification error or deletion failed';
          toast.error(msg);
        }
      }
    });
    setShowSignature(true);
  };

  // Compute filtered layouts based on selected status tab
  const filteredFormats = useMemo(() => {
    if (statusFilter === 'ALL') return formats;
    return formats.filter(f => f.status === statusFilter);
  }, [formats, statusFilter]);

  return (
    <div className="space-y-6">
      
      {!isCreating ? (
        <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl overflow-hidden">
          <CardHeader className="p-6 pb-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold text-slate-900">Format Library</CardTitle>
                <CardDescription className="text-slate-500">QA configured layouts for automatic sequence generation.</CardDescription>
              </div>
              <Button onClick={triggerCreateNew} className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-6 h-11 transition-transform hover:scale-103 shadow-lg shadow-slate-200">
                <Plus className="w-4 h-4 mr-2" /> Create Format Layout
              </Button>
            </div>
          </CardHeader>

          {/* Status filter tabs for layout reviews */}
          <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 px-6 gap-2 flex-wrap">
            {(['ALL', 'DRAFT', 'UNDER_REVIEW', 'ACTIVE'] as const).map((status) => {
              const count = status === 'ALL' ? formats.length : formats.filter(f => f.status === status).length;
              const labels: Record<string, string> = {
                ALL: 'All Layouts',
                DRAFT: 'Drafts',
                UNDER_REVIEW: 'Under Review',
                ACTIVE: 'Active Layouts'
              };
              const activeColors: Record<string, string> = {
                ALL: 'bg-indigo-600 text-white shadow-sm font-black',
                DRAFT: 'bg-slate-700 text-white shadow-sm font-black',
                UNDER_REVIEW: 'bg-amber-600 text-white shadow-sm font-black',
                ACTIVE: 'bg-emerald-600 text-white shadow-sm font-black'
              };

              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
                    statusFilter === status
                      ? activeColors[status]
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <span>{labels[status]}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                    statusFilter === status ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading formats list...</div>
            ) : filteredFormats.length === 0 ? (
              <div className="p-16 text-center text-slate-400 italic">No formats configured matching status "{statusFilter.replace('_', ' ')}".</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                      <th className="p-4 px-6">Format Code</th>
                      <th className="p-4">Format Name</th>
                      <th className="p-4">Representative Layout</th>
                      <th className="p-4">Batch Number Preview</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredFormats.map((f, i) => (
                      <tr 
                        key={i} 
                        className={`transition-colors duration-200 ${
                          f.status === 'UNDER_REVIEW' 
                            ? 'cursor-pointer hover:bg-amber-50/30' 
                            : 'hover:bg-slate-50/20'
                        }`}
                        onClick={() => {
                          if (f.status === 'UNDER_REVIEW') {
                            handleActivateFormat(f);
                          }
                        }}
                      >
                        <td className="p-4 px-6 font-bold text-slate-900">{f.formatCode}</td>
                        <td className="p-4 text-slate-700 font-medium">{f.formatName}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            {getFormatTokens(f).map((tok, ti) => {
                              let bg = 'bg-slate-100 text-slate-600 border border-slate-200';
                              if (tok.type === 'auto_generated') bg = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                              if (tok.type === 'master_lookup') bg = 'bg-indigo-50 text-indigo-700 border border-indigo-100';
                              if (tok.type === 'collection') bg = 'bg-purple-50 text-purple-700 border border-purple-100';
                              if (tok.type === 'static_text') bg = 'bg-amber-50 text-amber-700 border border-amber-100';
                              return (
                                <span key={ti} className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-tight ${bg}`}>
                                  {tok.name}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="font-mono text-xs font-extrabold text-[#FF6321] tracking-wider bg-orange-50/50 border border-orange-100/50 px-2.5 py-1 rounded-md inline-block">
                            {getFormatTokens(f).map((tok: any) => {
                              if (tok.type === 'auto_generated') return `${getYearCode()}001`;
                              if (tok.type === 'static_text') return tok.source;
                              if (tok.type === 'master_lookup') {
                                if (tok.source === 'stage_code') return 'LH10';
                                if (tok.source === 'product_code') return 'L';
                                if (tok.source === 'generic_code') return 'A';
                                if (tok.source === 'base_batch_number') return '26001';
                                return 'VAL';
                              }
                              if (tok.type === 'collection') {
                                return 'RM807';
                              }
                              return '...';
                            }).join('') || "----"}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            f.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            f.status === 'UNDER_REVIEW' ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse' :
                            'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}>
                            {f.status}
                          </span>
                        </td>
                        <td className="p-4 px-6 text-right space-x-2 whitespace-nowrap">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-full inline-flex items-center justify-center transition-colors"
                            title="View Format Workflow Details"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFormatWorkflow(f);
                            }}
                          >
                            <Eye className="w-4.5 h-4.5" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 px-3 rounded-full border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900 font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
                            title="Edit Format Layout"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditFormat(f);
                            }}
                          >
                            <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Edit</span>
                          </Button>
                          {f.status === 'UNDER_REVIEW' && (
                            <Button 
                              size="sm" 
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-4 font-bold" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleActivateFormat(f);
                              }}
                            >
                              Approve & Activate
                            </Button>
                          )}
                          {user?.email?.toLowerCase() === 'shakshay04@gmail.com' && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-full inline-flex items-center justify-center transition-colors"
                              title="Delete Format Layout"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFormat(f);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* The Comprehensive Builder screen exactly matching image 2 */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl p-6 space-y-6">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" className="rounded-full pl-2" onClick={() => { setIsCreating(false); setEditingFormat(null); }}>
                    ← Back to Formats
                  </Button>
                  {editingFormat && (
                    <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 font-semibold rounded-full">
                      Editing Layout: {editingFormat.formatCode} ({editingFormat.status})
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingFormat ? (
                    <>
                      <Button variant="outline" className="rounded-full text-slate-600 border-slate-200" onClick={() => { setIsCreating(false); setEditingFormat(null); }}>
                        Cancel
                      </Button>
                      <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-md shadow-indigo-200 font-bold inline-flex items-center gap-2" onClick={handleSaveEditedFormat}>
                        <Edit2 className="w-4 h-4" />
                        <span>Save & E-Sign Layout</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" className="rounded-full text-slate-500" onClick={handleSaveDraft}>
                        Save Draft
                      </Button>
                      <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-md shadow-indigo-200" onClick={handleSubmitForReview}>
                        Submit for Review
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Upper inputs matching precisely layout 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Format Code <span className="text-red-500">*</span></Label>
                  <Input 
                    placeholder="e.g. RM-007" 
                    value={formatCode} 
                    onChange={(e) => setFormatCode(e.target.value)}
                    className="h-12 rounded-xl focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Format Name <span className="text-red-500">*</span></Label>
                  <Input 
                    placeholder="e.g. Recovery Material Standard" 
                    value={formatName} 
                    onChange={(e) => setFormatName(e.target.value)}
                    className="h-12 rounded-xl focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Tokens Table sequence */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-bold text-slate-900">Token Sequence (Drag & Drop to reorder)</Label>
                  <span className="text-xs text-slate-400 font-medium">Reorder tokens to design output pattern</span>
                </div>

                <div className="overflow-hidden border border-slate-100 rounded-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-150">
                        <th className="p-3 pl-4">Seq</th>
                        <th className="p-3">Token Name</th>
                        <th className="p-3">Token Type</th>
                        <th className="p-3">Source / Properties</th>
                        <th className="p-3 text-center">Mandatory</th>
                        <th className="p-3 pr-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {formatTokens.map((tok, idx) => (
                        <tr key={tok.id} className="hover:bg-slate-50/50">
                          <td className="p-3 pl-4 font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3">
                            <span className="font-bold text-slate-800 font-mono text-xs">{tok.name}</span>
                          </td>
                          <td className="p-3">
                            <span className="text-xs text-slate-500 capitalize">{tok.type.replace('_', ' ')}</span>
                          </td>
                          <td className="p-3 font-mono text-xs text-slate-400">
                            {tok.type === 'auto_generated' && "Generator Rule (GR-001)"}
                            {tok.type === 'master_lookup' && `Lookup: ${tok.source}`}
                            {tok.type === 'collection' && `Collector (Separator: ${tok.separator || '+'})`}
                            {tok.type === 'static_text' && `Static Text: "${tok.source}"`}
                          </td>
                          <td className="p-3 text-center">
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-[10px]">✓</span>
                          </td>
                          <td className="p-3 pr-4 text-right space-x-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => moveUp(idx)} disabled={idx === 0}>
                              <ArrowUp className="w-3.5 h-3.5 text-slate-400" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => moveDown(idx)} disabled={idx === formatTokens.length - 1}>
                              <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-rose-500 hover:text-rose-600 hover:bg-rose-50/40" onClick={() => deleteToken(tok.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {formatTokens.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 italic">Select tokens from Token Library panel to construct layout sequence.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dynamic Live Preview below sequence */}
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Preview</span>
                <div className="flex flex-col items-center justify-center py-6 bg-white rounded-xl border border-slate-100 shadow-sm space-y-4">
                  {/* Sequence pills preview */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {formatTokens.map((tok, idx) => (
                      <span key={tok.id} className="px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-lg uppercase shadow-sm">
                        {(tok.type === 'auto_generated' || tok.source === 'base_batch_number') ? "26001 (Base)" : tok.name}
                      </span>
                    ))}
                  </div>
                  {/* Rendered output pattern */}
                  <div className="text-3xl font-black text-[#FF6321] tracking-wider font-mono">
                    {getFormatLivePreview() || "---- / -- / ----"}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Auto-rendered template using sequence values.</span>
                </div>
              </div>

            </Card>
          </div>

          {/* Token Library panel matching layout 2 right sidebar */}
          <div className="space-y-6">
            <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl p-6 space-y-6 self-start">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Token Library</CardTitle>
                <CardDescription className="text-slate-500">Pick tokens to insert in sequence.</CardDescription>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search token..." 
                  value={searchTokenTab}
                  onChange={(e) => setSearchTokenTab(e.target.value)}
                  className="pl-10 h-10 bg-slate-50 border-none rounded-xl text-xs"
                />
              </div>

              {/* Categories */}
              <div className="space-y-6">
                
                {/* 1. Master Lookups */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master Lookup</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-10 text-xs font-bold text-[#FF6321] border-[#FF6321]/25 hover:bg-[#FF6321]/5 rounded-xl" onClick={() => addTokenToSequence('Base Batch Number', 'master_lookup', 'base_batch_number')}>
                      Base Batch Number
                    </Button>
                    <Button variant="outline" className="h-10 text-xs font-bold text-slate-600 rounded-xl" onClick={() => addTokenToSequence('Stage Code', 'master_lookup', 'stage_code')}>
                      Stage Code
                    </Button>
                    <Button variant="outline" className="h-10 text-xs font-bold text-slate-600 rounded-xl" onClick={() => addTokenToSequence('Generic Code', 'master_lookup', 'generic_code')}>
                      Generic Code
                    </Button>
                    <Button variant="outline" className="h-10 text-xs font-bold text-slate-600 rounded-xl" onClick={() => addTokenToSequence('Recovery Material', 'master_lookup', 'recovery_component')}>
                      Recovery Material
                    </Button>
                  </div>
                </div>

                {/* 3. Collection multi */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Collection (Multi Selected)</span>
                  <div className="space-y-2">
                    <TokenLibraryItem 
                      name="Recovery Material (Multi)" 
                      desc="Combines values with configurable separator" 
                      onClick={() => addTokenToSequence('Recovery Material (Multi)', 'collection', 'recovery_component')} 
                    />
                  </div>
                </div>

                {/* 4. Static Text and characters */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Static Char / Symbol</span>
                  
                  {/* Symbol Quick select buttons */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {['/', '-', '+', '&', '.'].map((sym, index) => (
                      <Button 
                        key={index} 
                        variant="ghost" 
                        className="h-8 p-0 text-xs font-black bg-slate-50 border border-slate-100 hover:bg-slate-200"
                        onClick={() => addTokenToSequence(sym, 'static_text', sym)}
                      >
                        {sym}
                      </Button>
                    ))}
                  </div>

                  {/* Manual Static Text creator */}
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Custom Static Char</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="e.g. * or #" 
                        value={customText} 
                        onChange={(e) => setCustomText(e.target.value.replace(/[a-zA-Z0-9]/g, ''))}
                        className="h-9 rounded-lg"
                      />
                      <Button 
                        size="sm" 
                        onClick={() => {
                          if (!customText) return;
                          addTokenToSequence(customText, 'static_text', customText);
                          setCustomText('');
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>

              </div>

            </Card>
          </div>

        </div>
      )}

      {/* Format Approval Workflow Details Modal */}
      {selectedFormatWorkflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 relative text-left"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] font-extrabold font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                  Layout Format Workflow
                </span>
                <p className="text-xl font-black text-slate-900 font-mono tracking-tight">{selectedFormatWorkflow.formatCode}</p>
                <p className="text-xs text-slate-500 mt-0.5">{selectedFormatWorkflow.formatName}</p>
              </div>
              <Button 
                size="icon" 
                variant="ghost" 
                className="rounded-full w-9 h-9 text-slate-400 hover:text-slate-650 hover:bg-slate-50"
                onClick={() => setSelectedFormatWorkflow(null)}
              >
                <span className="text-xl font-bold">×</span>
              </Button>
            </div>

            {/* Scrollable Container with scrollbars */}
            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-6 scrollbar-thin scrollbar-thumb-slate-200">
              
              {/* Stepper showing 3-Stage Approval Cycle progression for Format Layout */}
              <div className="space-y-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-150">
                <p className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono">Format Layout Approval Pipeline</p>
                <div className="relative pl-6 space-y-6 border-l-2 border-slate-200">
                  {/* Stage 1: DRAFT */}
                  <div className="relative">
                    <span className={`absolute -left-[31px] top-0 w-4.5 h-4.5 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${
                      ['DRAFT', 'UNDER_REVIEW', 'ACTIVE'].includes(selectedFormatWorkflow.status)
                        ? 'bg-indigo-600'
                        : 'bg-slate-300'
                    }`} />
                    <div className="pl-2">
                      <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        Stage 1: DRAFT
                        {selectedFormatWorkflow.status === 'DRAFT' && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-indigo-100 text-indigo-700 font-black rounded-full uppercase scale-90 origin-left">Current</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Initial layout design and token configuration. Changes allowed without authorization locks.</p>
                    </div>
                  </div>

                  {/* Stage 2: UNDER REVIEW */}
                  <div className="relative">
                    <span className={`absolute -left-[31px] top-0 w-4.5 h-4.5 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${
                      ['UNDER_REVIEW', 'ACTIVE'].includes(selectedFormatWorkflow.status)
                        ? 'bg-amber-500'
                        : 'bg-slate-200'
                    }`} />
                    <div className="pl-2">
                      <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        Stage 2: UNDER REVIEW
                        {selectedFormatWorkflow.status === 'UNDER_REVIEW' && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-750 font-black rounded-full uppercase scale-90 origin-left animate-pulse">Pending Sign-off</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Submitted with dual e-signature for Quality and Regulatory verification. Layout locked for edits.</p>
                    </div>
                  </div>

                  {/* Stage 3: ACTIVE */}
                  <div className="relative">
                    <span className={`absolute -left-[31px] top-0 w-4.5 h-4.5 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${
                      selectedFormatWorkflow.status === 'ACTIVE'
                        ? 'bg-emerald-500'
                        : 'bg-slate-200'
                    }`} />
                    <div className="pl-2">
                      <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        Stage 3: ACTIVE & LOCKED
                        {selectedFormatWorkflow.status === 'ACTIVE' && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-700 font-black rounded-full uppercase scale-90 origin-left">Active</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Formally authorized layout configuration. Promoted as official rule for batch sequence generation.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Electronic Signatures, Comments & Audit Trail Logs */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-450 uppercase tracking-wider font-mono">21 CFR Part 11 Audit Trail & Signatures</h4>
                
                {(() => {
                  const historyList = selectedFormatWorkflow.approvalHistory && selectedFormatWorkflow.approvalHistory.length > 0
                    ? selectedFormatWorkflow.approvalHistory
                    : [
                        {
                          status: 'DRAFT',
                          user: selectedFormatWorkflow.createdBy || (user?.username || 'Current User'),
                          timestamp: selectedFormatWorkflow.createdAt || new Date().toISOString(),
                          comments: 'Initial layout design and token configuration.'
                        },
                        ...(selectedFormatWorkflow.status === 'UNDER_REVIEW' || selectedFormatWorkflow.status === 'ACTIVE'
                          ? [{
                              status: 'UNDER_REVIEW',
                              user: selectedFormatWorkflow.createdBy || (user?.username || 'Current User'),
                              timestamp: selectedFormatWorkflow.updatedAt || selectedFormatWorkflow.createdAt || new Date().toISOString(),
                              comments: 'Submitted layout format for QA authorization.',
                              meaning: 'I certify that this layout is compliant with local and CFR 11 expectations'
                            }]
                          : []),
                        ...(selectedFormatWorkflow.status === 'ACTIVE'
                          ? [{
                              status: 'ACTIVE',
                              user: selectedFormatWorkflow.updatedBy || selectedFormatWorkflow.approvedBy || (user?.username || 'Current User'),
                              timestamp: selectedFormatWorkflow.updatedAt || selectedFormatWorkflow.createdAt || new Date().toISOString(),
                              comments: 'Approved layout configuration. Sequence rule live.',
                              meaning: 'This electronic signature confirms authorization and makes this sequence rule live'
                            }]
                          : [])
                      ];

                  return (
                    <div className="space-y-3.5">
                      {historyList.map((h: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <Badge className={`text-[9px] font-black uppercase ${
                                h.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' :
                                h.status === 'UNDER_REVIEW' ? 'bg-amber-100 text-amber-800 hover:bg-amber-100' :
                                'bg-slate-200 text-slate-700 hover:bg-slate-200'
                              }`}>
                                {h.status}
                              </Badge>
                              <p className="text-xs font-bold text-slate-950 mt-1">{getUserFullNameWithDesignation(h.user, users)}</p>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium font-mono">{new Date(h.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-slate-600 italic">"{h.comments || 'No comment provided'}"</p>
                          {h.meaning && (
                            <div className="pt-2 border-t border-slate-200/60 flex items-center gap-1 text-[9px] text-indigo-600 font-mono font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                              <span>Signature Meaning: {h.meaning}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}

function TokenLibraryItem({ name, desc, onClick }: { name: string; desc: string; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full text-left p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-100 flex items-center justify-between group transition-colors"
    >
      <div className="min-w-0 pr-4">
        <p className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">{name}</p>
        <p className="text-[10px] text-slate-500 truncate mt-0.5">{desc}</p>
      </div>
      <span className="text-xs font-black text-indigo-600 bg-white border border-slate-200 px-2 py-1 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-all">+ Add</span>
    </button>
  );
}


/* ==========================================
      SCREEN 3: BATCH NUMBER CREATOR PANEL
   ========================================== */
interface CreatorScreenProps {
  formats: BatchNumberFormat[];
  records: BatchNumberRecord[];
  masters: MasterItem[];
  allProducts: any[];
  selectedBranch: string;
  user: any;
  onRefresh: () => void;
  logAudit: any;
  setSigConfig: any;
  setShowSignature: any;
  initialRecord?: BatchNumberRecord | null;
  initialStep?: number;
  users?: any[];
}

function CreatorScreen({
  formats,
  records,
  masters,
  allProducts,
  selectedBranch,
  user,
  onRefresh,
  logAudit,
  setSigConfig,
  setShowSignature,
  initialRecord,
  initialStep,
  users = []
}: CreatorScreenProps) {
  const checkPermission = (permId: string, customMessage?: string) => {
    if (user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com') {
      return true;
    }
    const userPermissions = user?.permissions || [];
    if (!userPermissions.includes(permId)) {
      toast.error(customMessage || `Access Denied: You do not have permission for this action.`);
      return false;
    }
    return true;
  };
  
  // Creation stepper stage (from 1 to 5)
  // Step 1: Select branch, product, scenario -> load format
  // Step 2: Populate required value inputs based on loaded layout
  // Step 3: Batch Number Preview and Token breakdown
  // Step 4: Confirm and Generate -> display read-only + copy/print/submit approvals
  const [step, setStep] = useState(1);

  // Selection state
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedFormatCode, setSelectedFormatCode] = useState('');

  // Active processes from lookup master
  const activeProcesses = useMemo(() => {
    return masters.filter(m => m.type === 'process' && m.status === 'ACTIVE');
  }, [masters]);

  // Sync selectedCategory only if it is no longer valid
  useEffect(() => {
    if (selectedCategory) {
      const isStillValid = activeProcesses.some(p => p.code === selectedCategory);
      if (!isStillValid) {
        setSelectedCategory('');
      }
    }
  }, [activeProcesses, selectedCategory]);

  // Loaded format representation
  const [activeFormat, setActiveFormat] = useState<BatchNumberFormat | null>(null);

  // Dynamic populated inputs
  const [inputs, setInputs] = useState<Record<string, any>>({});
  // Collection multi items lists holding (allow unlimited additions)
  const [collectionValueLists, setCollectionValueLists] = useState<Record<string, string[]>>({});

  // Generated state result
  const [generatedBatchNumber, setGeneratedBatchNumber] = useState('');
  const [activeCreatedRecord, setActiveCreatedRecord] = useState<BatchNumberRecord | null>(null);

  // Synchronize when initialRecord/initialStep are mapped from metrics card redirect click
  useEffect(() => {
    if (initialRecord) {
      setActiveCreatedRecord(initialRecord);
      setStep(initialStep || 5);
    }
  }, [initialRecord, initialStep]);

  // Load appropriate active format based on scenario
  useEffect(() => {
    if (selectedFormatCode) {
      const found = formats.find(f => f.formatCode === selectedFormatCode && f.status === 'ACTIVE');
      if (found) {
        setActiveFormat(found);
      } else {
        setActiveFormat(null);
      }
    } else {
      setActiveFormat(null);
    }
  }, [selectedFormatCode, formats]);

  const handleReset = () => {
    setSelectedProduct('');
    setSelectedCategory('');
    setSelectedFormatCode('');
    setActiveFormat(null);
    setInputs({});
    setCollectionValueLists({});
    setGeneratedBatchNumber('');
    setActiveCreatedRecord(null);
    setStep(1);
    toast.success('Creator values have been reset to default.');
  };

  const handleStep1Next = () => {
    if (!selectedCategory) {
      toast.error('Process is required. If none exists, configure one in Master Lookups.');
      return;
    }
    if (!selectedProduct || !selectedFormatCode) {
      toast.error('Product and Scenario format are required');
      return;
    }
    if (!activeFormat) {
      toast.error('The selected scenario layout does not have an approved ACTIVE format.');
      return;
    }

    // Prepare inputs: pre-populate year sequence base batch code
    const initialInputs: Record<string, any> = {};
    const activeBBNList = masters.filter(m => m.type === 'base_batch_number' && m.status === 'ACTIVE');
    const baseVal = activeBBNList.length > 0 ? activeBBNList[0].code : `${getYearCode()}001`; // Dynamic year format base sequence or first active from lookup
    initialInputs['Base Batch Number'] = baseVal;
    
    // Clear collections lists
    const initialCollections: Record<string, string[]> = {};
    getFormatTokens(activeFormat).forEach(tok => {
      if (tok.type === 'auto_generated') {
        initialInputs[tok.id] = baseVal;
      }
      if (tok.type === 'collection') {
        initialCollections[tok.id] = ['']; // one empty input value box
      }
    });

    setInputs(initialInputs);
    setCollectionValueLists(initialCollections);
    setStep(2);
  };

  // Add multi collector inputs
  const addCollectionInputBox = (tokenId: string) => {
    setCollectionValueLists({
      ...collectionValueLists,
      [tokenId]: [...(collectionValueLists[tokenId] || []), '']
    });
  };

  const updateCollectionInputBox = (tokenId: string, index: number, value: string) => {
    const list = [...(collectionValueLists[tokenId] || [])];
    list[index] = value;
    setCollectionValueLists({
      ...collectionValueLists,
      [tokenId]: list
    });
  };

  const removeCollectionInputBox = (tokenId: string, index: number) => {
    const list = [...(collectionValueLists[tokenId] || [])];
    if (list.length <= 1) return; // Keep at least one
    list.splice(index, 1);
    setCollectionValueLists({
      ...collectionValueLists,
      [tokenId]: list
    });
  };

  // Render format preview dynamically using populated inputs
  const compileFinalBatchNumberString = () => {
    if (!activeFormat) return '';
    return getFormatTokens(activeFormat).map(tok => {
      if (tok.type === 'auto_generated') {
        return inputs[tok.id] || inputs['Base Batch Number'] || '';
      }
      if (tok.type === 'static_text') {
        return tok.source;
      }
      if (tok.type === 'master_lookup') {
        return inputs[tok.id] || '';
      }
      if (tok.type === 'collection') {
        // Filter out empty options
        const list = (collectionValueLists[tok.id] || []).filter(Boolean);
        return list.join(tok.separator || '+');
      }
      return '';
    }).join('');
  };

  const handleStep2Preview = () => {
    // Check mandatory fields re populated
    let valid = true;
    if (activeFormat) {
      getFormatTokens(activeFormat).forEach(tok => {
        if (tok.mandatory) {
          if (tok.type === 'auto_generated' && !inputs[tok.id] && !inputs['Base Batch Number']) {
            toast.error(`Please select key value: "${tok.name}"`);
            valid = false;
          }
          if (tok.type === 'master_lookup' && !inputs[tok.id]) {
            toast.error(`Please select key lookup value: "${tok.name}"`);
            valid = false;
          }
          if (tok.type === 'collection') {
            const list = (collectionValueLists[tok.id] || []).filter(Boolean);
            if (list.length === 0) {
              toast.error(`Please select at least one item for collector: "${tok.name}"`);
              valid = false;
            }
          }
        }
      });
    }

    if (valid) {
      setGeneratedBatchNumber(compileFinalBatchNumberString());
      setStep(3);
    }
  };

  // Generate sequence number and log audit + e-signature
  const handleGenerateBatchNumber = async () => {
    if (!checkPermission('batch_number:create', "Access Denied: You do not have 'Create Batch Number' permission.")) return;
    if (!activeFormat) return;

    // Build the structural breakdown details
    const breakdown: TokenBreakdownItem[] = getFormatTokens(activeFormat).map(tok => {
      let val = '';
      if (tok.type === 'auto_generated') val = inputs[tok.id] || inputs['Base Batch Number'] || '';
      else if (tok.type === 'static_text') val = tok.source;
      else if (tok.type === 'master_lookup') val = inputs[tok.id] || '';
      else if (tok.type === 'collection') val = (collectionValueLists[tok.id] || []).filter(Boolean).join(tok.separator || '+');

      let typeLabel = 'Auto Generated';
      if (tok.type === 'static_text') typeLabel = 'Static Text';
      else if (tok.type === 'master_lookup') typeLabel = 'Master Lookup';
      else if (tok.type === 'collection') typeLabel = 'Collection';

      return {
        token: tok.name,
        value: val,
        type: typeLabel
      };
    });

    try {
      const newRecord: Omit<BatchNumberRecord, 'id'> = {
        batchNumber: generatedBatchNumber,
        branch: selectedBranch || 'Masulkhana',
        product: selectedProduct,
        category: selectedCategory,
        scenario: `${selectedCategory} Batch (${selectedFormatCode})`,
        formatCode: selectedFormatCode,
        status: 'DRAFT', // Holds draft layout until submitted
        generatedOn: new Date().toISOString(),
        generatedBy: user?.displayName || user?.email || 'Anita Verma',
        tokenValues: {
          ...inputs,
          ...collectionValueLists
        },
        tokenBreakdown: breakdown,
        timeline: [
          { 
            type: 'draft', 
            user: user?.displayName || user?.email || 'Operator User', 
            role: user?.role || 'OPERATOR', 
            timestamp: new Date().toISOString(), 
            comments: 'Batch number generated locally' 
          }
        ]
      };

      const res = await api.post('/batch-number-engine/records', newRecord);
      const savedRecord = res.data.data;
      setActiveCreatedRecord(savedRecord);
      
      await logAudit(
        'GENERATE_BATCH_NUMBER',
        generatedBatchNumber,
        'BATCH_NUMBER',
        null,
        savedRecord,
        'Auto-compelled sequence formulation completed'
      );

      toast.success('Batch Number Generated Successfully');
      setStep(4);
      onRefresh();
    } catch (err) {
      toast.error('Generation error, please verify permissions');
    }
  };

  // Submit Generated Batch number for QA Authorized approvals
  const handleSubmitForApproval = async () => {
    if (!checkPermission('batch_number:submit', "Access Denied: You do not have 'Submit Batch Number' permission.")) return;
    if (!activeCreatedRecord) return;

    setSigConfig({
      title: 'Submit Batch Number for Review',
      description: `You are submitting batch number "${activeCreatedRecord.batchNumber}" for formal QA confirmation and approval.`,
      meaning: 'I certify that the selected values align with floor batch documents',
      onVerify: async (password: string) => {
        try {
          const updatedTimeline = [
            ...activeCreatedRecord.timeline,
            { 
              type: 'submitted' as const, 
              user: user?.displayName || user?.email || 'QA Submitter', 
              role: user?.role || 'QA', 
              timestamp: new Date().toISOString(), 
              comments: 'Submitted for final QA Approval' 
            }
          ];

          await api.put(`/batch-number-engine/records/${activeCreatedRecord.id}`, {
            status: 'PENDING_APPROVAL',
            timeline: updatedTimeline,
            password,
            signatureMeaning: 'I certify that the selected values align with floor batch documents'
          });

          const freshRecord = { 
            ...activeCreatedRecord, 
            status: 'PENDING_APPROVAL' as const, 
            timeline: updatedTimeline 
          };
          setActiveCreatedRecord(freshRecord);
          
          await logAudit(
            'SUBMIT_BATCH_APPROVAL',
            activeCreatedRecord.batchNumber,
            'BATCH_NUMBER',
            activeCreatedRecord,
            freshRecord,
            'Submitted batch number layout for review'
          );

          toast.success('Successfully submitted layout for approval');
          setShowSignature(false);
          setStep(5);
          onRefresh();
        } catch (err) {
          toast.error('Signature validation failed');
        }
      }
    });
    setShowSignature(true);
  };

  // Authorize / Approve Batch numbers timeline
  const handleApproveBatchNumber = async () => {
    if (!checkPermission('batch_number:approve', "Access Denied: You do not have 'Approve Batch Number' permission.")) return;
    if (!activeCreatedRecord) return;

    setSigConfig({
      title: 'QA Approve Batch Number',
      description: `You are applying a legally binding electronic signature to approve batch number "${activeCreatedRecord.batchNumber}".`,
      meaning: 'I certify that I have verified this batch number registration under 21 CFR regulations',
      onVerify: async (password: string) => {
        try {
          const updatedTimeline = [
            ...activeCreatedRecord.timeline,
            { 
              type: 'approved' as const, 
              user: user?.displayName || user?.email || 'QA Head', 
              role: 'QA_APPROVER', 
              timestamp: new Date().toISOString(), 
              comments: 'Verified sequence compliant as per SOP' 
            }
          ];

          await api.put(`/batch-number-engine/records/${activeCreatedRecord.id}`, {
            status: 'APPROVED',
            timeline: updatedTimeline,
            approvedBy: user?.displayName || user?.email || 'QA Head',
            approvedDate: new Date().toISOString(),
            password,
            signatureMeaning: 'I certify that I have verified this batch number registration under 21 CFR regulations'
          });

          const freshRecord = { 
            ...activeCreatedRecord, 
            status: 'APPROVED' as const, 
            timeline: updatedTimeline,
            approvedBy: user?.displayName || user?.email || 'QA Head',
            approvedDate: new Date().toISOString()
          };
          setActiveCreatedRecord(freshRecord);
          
          await logAudit(
            'APPROVE_BATCH_NUMBER',
            activeCreatedRecord.batchNumber,
            'BATCH_NUMBER',
            activeCreatedRecord,
            freshRecord,
            'QA Approved batch record configuration'
          );

          toast.success('Batch sequence APPROVED successfully!');
          setShowSignature(false);
          onRefresh();
        } catch (err) {
          toast.error('Approval validation error');
        }
      }
    });
    setShowSignature(true);
  };

  // Copy batch code to clipboard
  const copyToClipboard = () => {
    if (activeCreatedRecord) {
      navigator.clipboard.writeText(activeCreatedRecord.batchNumber);
      toast.success('Batch number copied to clipboard!');
    }
  };

  // Print Batch code layout matching mockup view
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">

      {/* Creator panel visual stepper bar */}
      <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 flex items-center justify-between overflow-x-auto gap-4">
        <StepIndicator num={1} label="Select Scenario" active={step === 1} done={step > 1} />
        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
        <StepIndicator num={2} label="Enter Details" active={step === 2} done={step > 2} />
        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
        <StepIndicator num={3} label="Preview Layout" active={step === 3} done={step > 3} />
        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
        <StepIndicator num={4} label="Confirm & Generate" active={step === 4} done={step > 4} />
        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
        <StepIndicator num={5} label="Security Sign-off" active={step === 5} done={step > 5 || (step === 5 && activeCreatedRecord?.status === 'APPROVED')} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2 }}
        >
          
          {/* STEP 1: Select Format Layout Scenario */}
          {step === 1 && (
            <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl p-8 max-w-2xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Create Batch Number - Step 1</h2>
                <p className="text-sm text-slate-500">Pick the target product and scenario format to run automatic calculations.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Branch Code <span className="text-red-500">*</span></Label>
                  <Input value={selectedBranch || 'unselected'} disabled className="h-12 rounded-xl bg-slate-50 text-slate-500 border border-slate-100" />
                </div>

                <div className="space-y-1">
                  <Label>Target Product <span className="text-red-500">*</span></Label>
                  <select 
                    value={selectedProduct} 
                    onChange={(e: any) => setSelectedProduct(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-250 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="">--Choose Product--</option>
                    {allProducts.map((p, i) => (
                      <option key={i} value={p.title}>{p.title}</option>
                    ))}
                    {/* Fallback if product masters can't load */}
                    {allProducts.length === 0 && (
                      <>
                        <option value="Loratadine">Loratadine</option>
                        <option value="Loperamide">Loperamide</option>
                        <option value="Melatonin">Melatonin</option>
                        <option value="Donepezil">Donepezil</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label>Process <span className="text-red-500">*</span></Label>
                  <select 
                    value={selectedCategory} 
                    onChange={(e: any) => setSelectedCategory(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                  >
                    {activeProcesses.length === 0 ? (
                      <option value="">No Active Processes found. Please configure one in Master Lookups.</option>
                    ) : (
                      <>
                        <option value="">--Choose Process--</option>
                        {activeProcesses.map((m, i) => (
                          <option key={i} value={m.code}>{m.name ? `${m.name} (${m.code})` : m.code}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label>Scenario Rules layout <span className="text-red-500">*</span></Label>
                  <select 
                    value={selectedFormatCode} 
                    onChange={(e: any) => setSelectedFormatCode(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="">--Choose Layout--</option>
                    {formats.filter(f => f.status === 'ACTIVE').map((f, i) => (
                      <option key={i} value={f.formatCode}>{f.formatName} ({f.formatCode})</option>
                    ))}
                  </select>
                </div>
              </div>

              {activeFormat && (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" /> Layout Loaded Successfully
                    </div>
                    <p className="text-xs text-slate-500">Format: <span className="font-bold text-slate-800">{activeFormat.formatCode}</span></p>
                  </div>
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 font-mono tracking-wider font-extrabold rounded-lg py-1 px-3">
                    {getFormatTokens(activeFormat).map(t => {
                      if (t.type === 'auto_generated') return 'YEAR###';
                      return t.name;
                    }).join('/')}
                  </Badge>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                <Button 
                  variant="outline" 
                  className="rounded-full px-6 h-12 border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 flex items-center gap-2 font-semibold"
                  onClick={handleReset}
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset Defaults
                </Button>
                <Button className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-8 h-12" onClick={handleStep1Next}>
                  Next →
                </Button>
              </div>
            </Card>
          )}

          {/* STEP 2: Populate required token details based on layout shape */}
          {step === 2 && activeFormat && (
            <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl p-8 max-w-2xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-sans tracking-tight">Populate Details Based on Format</h2>
                <p className="text-sm text-slate-500">Please provide options for only the required sequence placeholders.</p>
              </div>

              <div className="space-y-6">
                
                {/* Dynamically render only required input fields */}
                {getFormatTokens(activeFormat).map((tok) => {
                  if (tok.type === 'auto_generated') {
                    const optionsList = masters.filter(m => m.type === 'base_batch_number' && m.status === 'ACTIVE');

                    return (
                      <div key={tok.id} className="space-y-1.5">
                        <div className="flex justify-between">
                          <Label className="font-bold text-slate-700">{tok.name} {tok.mandatory && <span className="text-red-500">*</span>}</Label>
                          <span className="text-[10px] uppercase font-bold text-indigo-600">Master Lookup</span>
                        </div>
                        <select
                          value={inputs[tok.id] || inputs['Base Batch Number'] || ''}
                          onChange={(e: any) => setInputs({ ...inputs, [tok.id]: e.target.value, 'Base Batch Number': e.target.value })}
                          className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                        >
                          <option value="">-- Select {tok.name} --</option>
                          {optionsList.map((opt) => (
                            <option key={opt.id} value={opt.code}>{opt.code} {opt.name ? `(${opt.name})` : ''}</option>
                          ))}
                          {optionsList.length === 0 && (
                            <option value={`${getYearCode()}001`}>{getYearCode()}001 (Default)</option>
                          )}
                        </select>
                      </div>
                    );
                  }

                  if (tok.type === 'master_lookup') {
                    // Filter masters matching this type (e.g. stage, generic, or product code)
                    let lookupType = 'stage';
                    if (tok.source === 'product_code') lookupType = 'product';
                    if (tok.source === 'generic_code') lookupType = 'generic';
                    if (tok.source === 'recovery_component') lookupType = 'recovery_component';
                    if (tok.source === 'base_batch_number') lookupType = 'base_batch_number';

                    const optionsList = masters.filter(m => m.type === lookupType && m.status === 'ACTIVE');

                    return (
                      <div key={tok.id} className="space-y-1.5">
                        <Label className="font-bold text-slate-700">{tok.name} {tok.mandatory && <span className="text-red-500">*</span>}</Label>
                        <select
                          value={inputs[tok.id] || ''}
                          onChange={(e: any) => setInputs({ ...inputs, [tok.id]: e.target.value })}
                          className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                        >
                          <option value="">-- Select {tok.name} --</option>
                          {optionsList.map((opt, oi) => (
                            <option key={opt.id} value={opt.code}>{opt.code} {opt.name ? `(${opt.name})` : ''}</option>
                          ))}
                          {/* Fail-safe placeholder options if lookup list is thin */}
                          {optionsList.length === 0 && (
                            <>
                              {tok.source === 'stage_code' && (
                                <>
                                  <option value="L07">L07</option>
                                  <option value="L08">L08</option>
                                  <option value="LH10">LH10</option>
                                  <option value="MT09">MT09</option>
                                </>
                              )}
                              {tok.source === 'generic_code' && (
                                <>
                                  <option value="A">A</option>
                                  <option value="R">R</option>
                                  <option value="T">T</option>
                                  <option value="P">P</option>
                                </>
                              )}
                              {tok.source === 'recovery_component' && (
                                <>
                                  <option value="RM01">RM01 (Isopropyl Alcohol)</option>
                                  <option value="RM02">RM02 (Acetone)</option>
                                  <option value="RM03">RM03 (Ethanol)</option>
                                </>
                              )}
                              {tok.source === 'base_batch_number' && (
                                <>
                                  <option value={`${getYearCode()}001`}>{getYearCode()}001 (Default)</option>
                                </>
                              )}
                            </>
                          )}
                        </select>
                      </div>
                    );
                  }

                  if (tok.type === 'collection') {
                    // Unlimited multi selectors for collection based on components master
                    const optionsList = masters.filter(m => m.type === 'recovery_component' && m.status === 'ACTIVE');

                    return (
                      <div key={tok.id} className="space-y-3.5 p-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                        <div className="flex justify-between items-center">
                          <Label className="font-bold text-slate-900">{tok.name} Selector {tok.mandatory && <span className="text-red-500">*</span>}</Label>
                          <Button size="sm" variant="outline" className="rounded-full text-xs font-semibold px-4 border-slate-200" onClick={() => addCollectionInputBox(tok.id)}>
                            + Add More Selection
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {(collectionValueLists[tok.id] || []).map((val, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                              <select
                                value={val}
                                onChange={(e: any) => updateCollectionInputBox(tok.id, idx, e.target.value)}
                                className="flex-1 h-11 px-4 rounded-xl bg-white border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                              >
                                <option value="">-- Choose Material --</option>
                                {optionsList.map((opt) => (
                                  <option key={opt.id} value={opt.code}>{opt.code}</option>
                                ))}
                                {optionsList.length === 0 && (
                                  <>
                                    <option value="EA">EA</option>
                                    <option value="IPE">IPE</option>
                                    <option value="RM807">RM807</option>
                                    <option value="Hexane">Hexane</option>
                                    <option value="Toluene">Toluene</option>
                                  </>
                                )}
                              </select>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-10 w-10 text-rose-500 hover:text-rose-600 rounded-full" 
                                onClick={() => removeCollectionInputBox(tok.id, idx)}
                                disabled={(collectionValueLists[tok.id] || []).length <= 1}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">Selected values will join using "{tok.separator || '+'}" automatically.</span>
                      </div>
                    );
                  }

                  return null;
                })}

              </div>

              <div className="flex justify-between pt-6 border-t border-slate-100">
                <Button variant="ghost" className="rounded-full" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 h-12" onClick={handleStep2Preview}>
                  Preview Output
                </Button>
              </div>
            </Card>
          )}

          {/* STEP 3: Preview Output exactly similar to mockup */}
          {step === 3 && (
            <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl p-8 max-w-2xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-sans tracking-tight">Batch Number Preview</h2>
                <p className="text-sm text-slate-500">Carefully verify layout placement and compliance codes before saving.</p>
              </div>

              {/* Layout view pill representation */}
              <div className="bg-slate-55 rounded-2xl p-6 border border-slate-100 text-center space-y-4">
                <span className="text-xs uppercase font-bold text-slate-400 tracking-widest block">Formatted Sequence</span>
                <span className="text-3xl font-black text-[#FF6321] tracking-wider font-mono bg-white inline-block px-8 py-4 rounded-xl border border-slate-100 shadow-sm leading-none">
                  {generatedBatchNumber}
                </span>
              </div>

              {/* Token table breakdown matching Step 5 exactly */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900">Token Breakdown</h4>
                <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                        <th className="p-3 pl-4">Token Name</th>
                        <th className="p-3">Matched Value</th>
                        <th className="p-3">Source / Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {getFormatTokens(activeFormat).map((tok, i) => {
                        let matchedVal = '';
                        if (tok.type === 'auto_generated') matchedVal = inputs[tok.id] || inputs['Base Batch Number'];
                        else if (tok.type === 'static_text') matchedVal = tok.source;
                        else if (tok.type === 'master_lookup') matchedVal = inputs[tok.id];
                        else if (tok.type === 'collection') matchedVal = (collectionValueLists[tok.id] || []).filter(Boolean).join(tok.separator || '+');

                        return (
                          <tr key={i}>
                            <td className="p-3 pl-4 font-bold text-slate-800">{tok.name}</td>
                            <td className="p-3 font-mono font-black text-indigo-700">{matchedVal || '-'}</td>
                            <td className="p-3 text-slate-500 font-medium capitalize">{tok.type.replace('_', ' ')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between pt-6 border-t border-slate-100">
                <Button variant="ghost" className="rounded-full" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button className="bg-[#FF6321] hover:bg-[#e05419] text-white rounded-full px-8 h-12 shadow-lg shadow-orange-100" onClick={handleGenerateBatchNumber}>
                  Generate Batch Number
                </Button>
              </div>
            </Card>
          )}

          {/* STEP 4: Confirm and Generate -> Display Completed read-only number layout */}
          {step === 4 && activeCreatedRecord && (
            <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl p-8 max-w-2xl mx-auto space-y-6">
              
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-bold text-slate-900">Batch Number Generated Successfully!</h4>
                  <p className="text-xs text-slate-500">Layout constraints verified by dynamic system evaluation.</p>
                </div>
              </div>

              {/* Large copyable number */}
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Completed Batch Number</span>
                  <span className="text-3xl font-black text-[#FF6321] font-mono select-all tracking-wider">{activeCreatedRecord.batchNumber}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl border-slate-200" onClick={copyToClipboard}>
                    <Copy className="w-5 h-5 text-slate-600" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm py-4 border-y border-slate-50">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Product</span>
                  <span className="font-bold text-slate-800">{activeCreatedRecord.product}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Scenario</span>
                  <span className="font-bold text-slate-800">{activeCreatedRecord.scenario}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Format Used</span>
                  <span className="font-bold text-indigo-600 font-mono text-xs">{activeCreatedRecord.formatCode}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Generated On</span>
                  <span className="font-medium text-slate-500 text-xs">{new Date(activeCreatedRecord.generatedOn).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="rounded-full px-6 border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold" onClick={() => setStep(1)}>
                  Generate Another
                </Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 shadow-lg shadow-indigo-100 h-11" onClick={handleSubmitForApproval}>
                  Submit for Approval
                </Button>
              </div>
            </Card>
          )}

          {/* STEP 5: Final Review, Approvals, and Approved Batch Number screen */}
          {step === 5 && activeCreatedRecord && (
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Timeline list matching mockup exactly on left */}
              <div className="md:col-span-1 space-y-6">
                <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl p-6 self-start">
                  <h3 className="text-base font-extrabold text-slate-900 border-b border-slate-50 pb-3 mb-4">Approval History</h3>
                  
                  <div className="space-y-6 relative pl-4 border-l border-slate-150">
                    {activeCreatedRecord.timeline && activeCreatedRecord.timeline.length > 0 ? (
                      activeCreatedRecord.timeline.map((item, idx) => (
                        <TimelineNode 
                          key={idx}
                          title={`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} by ${getUserFullNameWithDesignation(item.user, users)}`}
                          time={new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          date={new Date(item.timestamp).toLocaleDateString()}
                          comments={item.comments || ''}
                          active={true}
                        />
                      ))
                    ) : (
                      <>
                        <TimelineNode 
                          title={`Submitted by ${getUserFullNameWithDesignation(activeCreatedRecord.generatedBy || user, users)}`} 
                          time={new Date(activeCreatedRecord.generatedOn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                          date={new Date(activeCreatedRecord.generatedOn).toLocaleDateString()} 
                          comments="Submitted for approval" 
                          active={true}
                        />

                        <TimelineNode 
                          title={activeCreatedRecord.approvedBy ? `Approved by ${getUserFullNameWithDesignation(activeCreatedRecord.approvedBy, users)}` : "Awaiting QA Approval"} 
                          time={activeCreatedRecord.approvedDate ? new Date(activeCreatedRecord.approvedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Pending"} 
                          date={activeCreatedRecord.approvedDate ? new Date(activeCreatedRecord.approvedDate).toLocaleDateString() : ""} 
                          comments={activeCreatedRecord.approvedDate ? "Batch number approved" : "Awaiting electronic sign-off"} 
                          active={activeCreatedRecord.status === 'APPROVED'}
                        />
                      </>
                    )}
                  </div>
                </Card>
              </div>

              {/* Approved Batch number panel exactly as mockup 8 */}
              <div className="md:col-span-2 space-y-6">
                <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl p-8 self-start space-y-6">
                  
                  <div className="flex justify-between items-center border-b border-slate-50 pb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Approved Batch Number (Read Only)</h3>
                      <p className="text-xs text-slate-500">Fully authorized and ready to apply to production records.</p>
                    </div>
                    <Badge className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      activeCreatedRecord.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {activeCreatedRecord.status}
                    </Badge>
                  </div>

                  {/* Batch label Display block 8 */}
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-150 relative space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Batch Number</span>
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-mono font-black text-[#FF6321] select-all leading-none">
                        {activeCreatedRecord.batchNumber}
                      </span>
                      <Button size="icon" variant="ghost" className="h-10 w-10 text-slate-500 hover:bg-white" onClick={copyToClipboard}>
                        <Copy className="w-5.5 h-5.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Read only info boxes matching panel 8 */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm py-4 border-y border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Status</span>
                      <span className="font-extrabold text-slate-900 uppercase text-xs">{activeCreatedRecord.status}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Product</span>
                      <span className="font-bold text-slate-800">{activeCreatedRecord.product}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Scenario</span>
                      <span className="font-bold text-slate-800">{activeCreatedRecord.scenario}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Format Used</span>
                      <span className="font-bold text-indigo-600 font-mono text-xs">{activeCreatedRecord.formatCode}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Approved By</span>
                      <span className="font-extrabold text-slate-800">{activeCreatedRecord.approvedBy ? getUserFullNameWithDesignation(activeCreatedRecord.approvedBy, users) : 'Pending'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Approved On</span>
                      <span className="font-medium text-slate-500 text-xs">
                        {activeCreatedRecord.approvedDate ? new Date(activeCreatedRecord.approvedDate).toLocaleDateString() : 'Pending'}
                      </span>
                    </div>
                  </div>

                  {/* Comments / Remarks block matching image 8 */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 text-xs">
                    <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Remarks / Comments</span>
                    <p className="text-slate-700 font-medium font-sans">
                      {activeCreatedRecord.status === 'APPROVED' ? "Approved as per SOP RM-05 standard requirements." : "Verification pending visual check and e-signature authorization."}
                    </p>
                  </div>

                  <div className="flex gap-2 justify-end pt-4">
                    <Button variant="ghost" className="rounded-full text-slate-500" onClick={() => setStep(1)}>
                      Create Another
                    </Button>
                    {activeCreatedRecord.status !== 'APPROVED' && (
                      <Button className="bg-[#FF6321] hover:bg-[#e05419] text-white rounded-full px-8 shadow-lg shadow-orange-100" onClick={handleApproveBatchNumber}>
                        E-Sign & Approve
                      </Button>
                    )}
                  </div>

                </Card>
              </div>

            </div>
          )}

        </motion.div>
      </AnimatePresence>

    </div>
  );
}

function StepIndicator({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-3 flex-shrink-0 transition-opacity ${!active && !done ? 'opacity-55' : 'opacity-100'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${
        done ? 'bg-emerald-500 border-emerald-500 text-white' : 
        active ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100' :
        'bg-slate-50 border-slate-200 text-slate-500'
      }`}>
        {done ? '✓' : num}
      </div>
      <span className={`text-xs font-bold leading-none ${done ? 'text-emerald-600' : active ? 'text-indigo-600 font-black' : 'text-slate-500'}`}>
        {label}
      </span>
    </div>
  );
}

function TimelineNode({ title, time, date, comments, active }: { title: string; time: string; date: string; comments: string; active: boolean }) {
  return (
    <div className="relative pb-6 last:pb-0">
      <div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 bg-white ${active ? 'border-emerald-500 bg-emerald-500 animate-ping shadow' : 'border-slate-300'}`} />
      <div className="space-y-1">
        <div className="flex justify-between text-xs font-bold">
          <span className={active ? 'text-slate-900 font-extrabold' : 'text-slate-400'}>{title}</span>
          <span className="text-slate-400 font-mono font-medium">{date} {time}</span>
        </div>
        <p className={`text-xs ${active ? 'text-slate-600' : 'text-slate-400 italic'}`}>
          {comments}
        </p>
      </div>
    </div>
  );
}


/* ==========================================
      SCREEN 3.5: ACTIVE BATCH NUMBERS LIST
   ========================================== */
interface ActiveBatchesScreenProps {
  records: BatchNumberRecord[];
  loading: boolean;
  masters: MasterItem[];
  allProducts: any[];
  onRefresh: () => void;
  onDeleteRecord: (r: BatchNumberRecord) => void;
  onViewRecord: (r: BatchNumberRecord) => void;
  onNavigate?: (tab: any) => void;
  setCreatorInitialRecord?: (r: BatchNumberRecord | null) => void;
  setCreatorInitialStep?: (step: number) => void;
}

function ActiveBatchesScreen({
  records,
  loading,
  masters,
  allProducts,
  onRefresh,
  onDeleteRecord,
  onViewRecord,
  onNavigate,
  setCreatorInitialRecord,
  setCreatorInitialStep
}: ActiveBatchesScreenProps) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [selectedProcess, setSelectedProcess] = useState('ALL');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [selectedRecovery, setSelectedRecovery] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'APPROVED' | 'PENDING_APPROVAL'>('ALL');

  // Master options
  const activeProducts = useMemo(() => {
    // get unique product titles from records or products master
    const set = new Set<string>();
    allProducts.forEach(p => { if (p.title) set.add(p.title); });
    records.forEach(r => { if (r.product) set.add(r.product); });
    return Array.from(set);
  }, [allProducts, records]);

  const activeProcesses = useMemo(() => {
    return masters.filter(m => m.type === 'process' && m.status === 'ACTIVE').map(m => m.code);
  }, [masters]);

  const activeStages = useMemo(() => {
    return masters.filter(m => m.type === 'stage' && m.status === 'ACTIVE').map(m => m.code);
  }, [masters]);

  const activeRecoveries = useMemo(() => {
    return masters.filter(m => m.type === 'recovery_component' && m.status === 'ACTIVE').map(m => m.code);
  }, [masters]);

  // Filters computed records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // Must be approved active or pending approval
      if (r.status !== 'APPROVED' && r.status !== 'PENDING_APPROVAL') return false;

      // Status filter
      if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;

      // Search matching batchNumber, product, scenario, generatedBy
      const term = searchTerm.toLowerCase().trim();
      const matchSearch = !term || 
        r.batchNumber.toLowerCase().includes(term) ||
        r.product.toLowerCase().includes(term) ||
        r.scenario.toLowerCase().includes(term) ||
        (r.generatedBy && r.generatedBy.toLowerCase().includes(term));

      if (!matchSearch) return false;

      // Product filter
      if (selectedProduct !== 'ALL' && r.product !== selectedProduct) return false;

      // Process filter (usually stored in record's category field)
      if (selectedProcess !== 'ALL' && r.category !== selectedProcess) return false;

      // Stage filter: match any token value that equals selected stage ID
      if (selectedStage !== 'ALL') {
        const values = r.tokenValues ? Object.values(r.tokenValues) : [];
        const matches = values.some(val => typeof val === 'string' && val === selectedStage);
        if (!matches) return false;
      }

      // Recovery material filter: match any item in collection or lookup token values
      if (selectedRecovery !== 'ALL') {
        const values = r.tokenValues ? Object.values(r.tokenValues) : [];
        const matches = values.some(val => {
          if (typeof val === 'string') return val === selectedRecovery;
          if (Array.isArray(val)) return val.includes(selectedRecovery);
          return false;
        });
        if (!matches) return false;
      }

      return true;
    });
  }, [records, searchTerm, selectedProduct, selectedProcess, selectedStage, selectedRecovery, selectedStatus]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedProduct('ALL');
    setSelectedProcess('ALL');
    setSelectedStage('ALL');
    setSelectedRecovery('ALL');
    setSelectedStatus('ALL');
  };

  return (
    <div className="space-y-6">
      {/* Header section with description */}
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-lg shadow-slate-100/40">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Batch Number Registry
            <Badge className="bg-indigo-600 text-white border-none font-bold text-[10px]">
              {filteredRecords.length} Records
            </Badge>
          </h2>
          <p className="text-sm text-slate-500">Search, filter, inspect and authorize batch numbers generated for master workflow execution.</p>
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm" className="rounded-full px-4 text-xs font-bold border-slate-200">
          Sync Registry
        </Button>
      </div>

      {/* Grid of Interactive Filters on top, perfectly structured */}
      <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 animate-fadeIn">
          
          {/* Query Search Bar */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Query Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input 
                type="text" 
                placeholder="Search..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-11 rounded-xl text-xs border-slate-200 focus-visible:ring-indigo-500"
              />
            </div>
          </div>

          {/* Product Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Product Filter</Label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Products</option>
              {activeProducts.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Process Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Process Filter</Label>
            <select
              value={selectedProcess}
              onChange={(e) => setSelectedProcess(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Processes</option>
              {activeProcesses.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Stage Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Stage Filter</Label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Stages</option>
              {activeStages.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Status Filter</Label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
            </select>
          </div>

          {/* Recovery Material Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recovery Components</Label>
            <div className="flex gap-2">
              <select
                value={selectedRecovery}
                onChange={(e) => setSelectedRecovery(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Components</option>
                {activeRecoveries.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {(searchTerm || selectedProduct !== 'ALL' || selectedProcess !== 'ALL' || selectedStage !== 'ALL' || selectedRecovery !== 'ALL' || selectedStatus !== 'ALL') && (
                <Button 
                  onClick={handleResetFilters} 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-xl h-11 w-11 bg-slate-100 hover:bg-slate-200 shrink-0 text-slate-500"
                  title="Reset Filter Criteria"
                >
                  ✕
                </Button>
              )}
            </div>
          </div>

        </div>
      </Card>

      {/* Main Results Table */}
      <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-16 text-center text-slate-400">Querying Compliant Records...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-20 text-center text-slate-400 italic">
              No batch numbers match your current query and filter criteria.
              <p className="text-xs mt-2 not-italic text-indigo-400">Try running a different query or relaxing the active selector filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-150">
                    <th className="p-4 px-6">Batch Number</th>
                    <th className="p-4">Product</th>
                    <th className="p-4">Process Category</th>
                    <th className="p-4">Scenario Format</th>
                    <th className="p-4">Generated On</th>
                    <th className="p-4 px-6">By</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 px-6 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredRecords.map((r, i) => (
                    <tr key={i} className={`transition-colors duration-150 ${r.status === 'PENDING_APPROVAL' ? 'bg-amber-50/10 hover:bg-amber-50/25' : 'hover:bg-slate-50/50'}`}>
                      <td className="p-4 px-6 font-mono text-xs font-black text-[#FF6321]">
                        <HighlightText text={r.batchNumber} search={searchTerm} />
                      </td>
                      <td className="p-4 text-slate-700 font-bold">
                        <HighlightText text={r.product} search={searchTerm} />
                      </td>
                      <td className="p-4 text-slate-600 font-medium">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-semibold text-slate-700">
                          <HighlightText text={r.category} search={searchTerm} />
                        </span>
                      </td>
                      <td className="p-4 text-slate-500 text-xs">
                        <HighlightText text={r.scenario} search={searchTerm} />
                      </td>
                      <td className="p-4 text-slate-400 text-xs">
                        {r.generatedOn ? new Date(r.generatedOn).toLocaleDateString() : 'N/A'}
                        <span className="text-[10px] block text-slate-300">
                          {r.generatedOn ? new Date(r.generatedOn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </td>
                      <td className="p-4 px-6 text-slate-500 text-xs font-semibold">
                        <HighlightText text={r.generatedBy} search={searchTerm} />
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          r.status === 'APPROVED' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                        }`}>
                          {r.status === 'APPROVED' ? 'Approved' : 'Pending Approval'}
                        </span>
                      </td>
                      <td className="p-4 px-6 text-center space-x-2 whitespace-nowrap">
                        {r.status === 'PENDING_APPROVAL' && onNavigate && setCreatorInitialRecord && setCreatorInitialStep && (
                          <Button 
                            size="sm" 
                            className="bg-amber-600 hover:bg-amber-700 text-white rounded-full text-xs font-bold px-4 py-1"
                            onClick={() => {
                              setCreatorInitialRecord(r);
                              setCreatorInitialStep(5);
                              onNavigate('creator');
                            }}
                          >
                            Verify & Sign
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="rounded-full text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50/80 px-4 py-1"
                          onClick={() => onViewRecord(r)}
                        >
                          View Details
                        </Button>
                        {user?.email?.toLowerCase() === 'shakshay04@gmail.com' && (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="rounded-full text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                            onClick={() => onDeleteRecord(r)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


/* ==========================================
      SCREEN 4: MASTER LOOKUPS MANAGEMENT
   ========================================== */
interface MastersScreenProps {
  masters: MasterItem[];
  loading: boolean;
  onAdd: (defaultType: MasterItem['type']) => void;
  onDelete: (item: MasterItem) => void;
  onUpdate: (id: string, updateData: any) => Promise<void>;
  setSigConfig: any;
  setShowSignature: any;
  user: any;
  allProducts: any[];
  logAudit?: any;
  users?: any[];
}

function MastersScreen({ 
  masters, 
  loading, 
  onAdd, 
  onDelete,
  onUpdate,
  setSigConfig,
  setShowSignature,
  user,
  allProducts,
  logAudit,
  users = []
}: MastersScreenProps) {
  const [filterType, setFilterType] = useState<'stage' | 'recovery_component' | 'generic' | 'process' | 'base_batch_number'>('stage');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCycleItem, setSelectedCycleItem] = useState<MasterItem | null>(null);

  const [internalUsers, setInternalUsers] = useState<any[]>(() => {
    if (Array.isArray(users) && users.length > 0) return users;
    return getGlobalUsersCache();
  });

  useEffect(() => {
    if (Array.isArray(users) && users.length > 0) {
      setInternalUsers(users);
    } else {
      api.get('/users').then(res => {
        const userList = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.data) ? res.data.data : []);
        if (userList.length > 0) {
          setInternalUsers(userList);
          setGlobalUsersCache(userList);
        }
      }).catch(err => console.warn('Failed to load users in MastersScreen:', err));
    }
  }, [users]);

  // Edit State for tiles that are not in fully active state
  const [editingItem, setEditingItem] = useState<MasterItem | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editProductId, setEditProductId] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  const handleOpenEditModal = (item: MasterItem) => {
    const isAdmin = user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com';
    const userPermissions = user?.permissions || [];
    if (!isAdmin && !userPermissions.includes('lookup:edit') && !userPermissions.includes('lookup:create')) {
      toast.error("Access Denied: You do not have 'Edit Master Lookup' permission.");
      return;
    }
    setEditingItem(item);
    setEditCode(item.code || '');
    setEditName(item.name || '');
    setEditProductId(item.productId || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    const rawTrimmedCode = editCode.trim();
    if (!rawTrimmedCode) {
      toast.error('Value/Code ID cannot be empty');
      return;
    }
    if (editingItem.type === 'stage' && !editProductId) {
      toast.error('Please select an Active Product for the Stage Master');
      return;
    }

    const isCaseFlexible = ['recovery_component', 'generic', 'process'].includes(editingItem.type);
    const formattedCode = isCaseFlexible ? rawTrimmedCode : rawTrimmedCode.toUpperCase();

    // Duplicate check excluding current item being edited (case-insensitive comparison)
    const isDuplicate = masters.some((m: any) => {
      if (m.id === editingItem.id || m.type !== editingItem.type) return false;
      if (editingItem.type === 'stage') {
        return (m.code || '').toUpperCase() === formattedCode.toUpperCase() && m.productId === editProductId;
      } else {
        return (m.code || '').toUpperCase() === formattedCode.toUpperCase();
      }
    });

    if (isDuplicate) {
      toast.error(`Duplicate value error: A master record for ${editingItem.type.replace('_', ' ')} with value "${formattedCode}" already exists.`);
      return;
    }

    const typeLabel = editingItem.type.replace('_', ' ');
    const title = `E-Signature Required: Edit Master Lookup (${typeLabel})`;
    const description = `Signing to authorize modification of master lookup value from "${editingItem.code}" to "${formattedCode}".`;
    const meaning = `I certify under 21 CFR Part 11 and GMP guidelines that I have authorized and updated this master lookup value.`;

    setSigConfig({
      title,
      description,
      meaning,
      onVerify: async (password: string) => {
        try {
          const userDisplayName = getUserFullNameWithDesignation(user, internalUsers);
          const existingHistory = editingItem.history || [];
          const newHistoryItem = {
            action: 'EDITED',
            user: userDisplayName,
            timestamp: new Date().toISOString(),
            meaning: `Modified ${typeLabel} value from "${editingItem.code}" to "${formattedCode}"`,
            status: 'DRAFT',
            previousCode: editingItem.code,
            newCode: formattedCode
          };

          const updateData: any = {
            code: formattedCode,
            status: 'DRAFT', // Reset status to DRAFT so same approval process (Submit -> Activate) is followed
            approvedBy: null,
            approvedDate: null,
            password,
            signatureMeaning: meaning,
            history: [...existingHistory, newHistoryItem]
          };

          if (editingItem.type === 'product' || editingItem.type === 'process' || editName.trim()) {
            updateData.name = editName.trim();
          } else {
            updateData.name = '';
          }

          if (editingItem.type === 'stage') {
            updateData.productId = editProductId;
          }

          await onUpdate(editingItem.id, updateData);

          if (logAudit) {
            await logAudit(
              'EDIT_MASTER_LOOKUP',
              formattedCode,
              'MASTER_LOOKUP',
              { code: editingItem.code, name: editingItem.name, status: editingItem.status, type: editingItem.type },
              { code: formattedCode, name: editName.trim(), status: 'DRAFT', type: editingItem.type },
              `Authorized edit of ${typeLabel} master lookup from "${editingItem.code}" to "${formattedCode}" under GMP compliance`
            );
          }

          setShowSignature(false);
          setShowEditModal(false);
          setEditingItem(null);
          toast.success(`Updated "${formattedCode}" successfully and set to DRAFT. Follow Submit -> Activate for approval.`);
        } catch (err: any) {
          toast.error('Signature verification failed');
        }
      }
    });

    setShowSignature(true);
  };

  const handleTabChange = (type: 'stage' | 'recovery_component' | 'generic' | 'process' | 'base_batch_number') => {
    setFilterType(type);
    setSearchQuery('');
  };

  const handleTransition = (item: MasterItem, nextStatus: 'DRAFT' | 'REVIEW' | 'ACTIVE' | 'DEACTIVATED') => {
    // Permission checks
    const isAdmin = user?.role === 'Admin' || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'shakshay04@gmail.com';
    const userPermissions = user?.permissions || [];
    const checkPerm = (permId: string, customMsg?: string) => {
      if (isAdmin) return true;
      if (!userPermissions.includes(permId)) {
        toast.error(customMsg || "Access Denied: Missing permissions");
        return false;
      }
      return true;
    };

    if (nextStatus === 'REVIEW') {
      if (!checkPerm('lookup:submit', "Access Denied: You do not have 'Submit Master Lookup' permission.")) return;
    } else if (nextStatus === 'ACTIVE') {
      if (!checkPerm('lookup:approve', "Access Denied: You do not have 'Approve Master Lookup' permission.")) return;
    } else if (nextStatus === 'DRAFT') {
      if (!checkPerm('lookup:approve', "Access Denied: You do not have 'Approve Master Lookup' permission to reject records.")) return;
    } else if (nextStatus === 'DEACTIVATED') {
      if (!checkPerm('lookup:deactivate', "Access Denied: You do not have 'Deactivate Master Lookups' permission.")) return;
    }

    let title = '';
    let description = '';
    let meaning = '';

    if (nextStatus === 'REVIEW') {
      title = 'Submit Master Lookup for Review';
      description = `Signing to request review and approval of the option value "${item.code}" under category "${item.type}".`;
      meaning = `I certify that this code is accurate and conforms to GMP requirements`;
    } else if (nextStatus === 'ACTIVE') {
      title = 'APPROVAL & Activate Master Lookup';
      description = `QA Electronic Approval and certification to release option value "${item.code}" as active and ready for use.`;
      meaning = `I certify that I have approved and activated this code for manufacturing operations under GMP guidelines`;
    } else if (nextStatus === 'DRAFT') {
      title = 'Reject Lookup back to Draft';
      description = `By signing, you are rejecting option value "${item.code}" and requesting revision.`;
      meaning = `I certify that this record is rejected back to draft for revision`;
    } else if (nextStatus === 'DEACTIVATED') {
      title = 'Deactivate Master Lookup';
      description = `QA Electronic Approval to deactivate master lookup value "${item.code}". Deactivating changes the state of the tile to Draft for revision and re-authorization.`;
      meaning = `I certify that I have deactivated this master lookup option value and returned it to Draft state in accordance with GAMP/GMP guidelines`;
    }

    setSigConfig({
      title,
      description,
      meaning,
      onVerify: async (password: string) => {
        try {
          const targetStatus = nextStatus === 'DEACTIVATED' ? 'DRAFT' : nextStatus;
          const userDisplayName = getUserFullNameWithDesignation(user, internalUsers);
          const existingHistory = item.history || [];
          const newHistoryItem = {
            action: nextStatus === 'DEACTIVATED' ? 'DEACTIVATED' : 
                    nextStatus === 'REVIEW' ? 'SUBMITTED' : 
                    nextStatus === 'ACTIVE' ? 'APPROVED' : 'REJECTED_DRAFT',
            user: userDisplayName,
            timestamp: new Date().toISOString(),
            meaning: meaning,
            status: targetStatus
          };

          const updateData: any = {
            status: targetStatus,
            isDeactivation: nextStatus === 'DEACTIVATED',
            password,
            signatureMeaning: meaning,
            history: [...existingHistory, newHistoryItem]
          };

          if (targetStatus === 'ACTIVE') {
            updateData.approvedBy = userDisplayName;
            updateData.approvedDate = new Date().toISOString();
          } else {
            updateData.approvedBy = null;
            updateData.approvedDate = null;
          }

          await onUpdate(item.id, updateData);
          setShowSignature(false);
          toast.success(nextStatus === 'DEACTIVATED' 
            ? `Lookup "${item.code}" deactivated and returned to Draft state` 
            : `Successfully transitioned to ${nextStatus}`);
        } catch (err: any) {
          toast.error('Signature verification failed');
        }
      }
    });
    setShowSignature(true);
  };

  const filtered = masters.filter(m => m.type === filterType);

  const searched = filtered.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const codeMatches = item.code.toLowerCase().includes(query);
    const nameMatches = item.name ? item.name.toLowerCase().includes(query) : false;
    const productItem = item.productId ? allProducts.find(p => p.id === item.productId) : null;
    const productMatches = productItem ? productItem.title.toLowerCase().includes(query) : false;
    return codeMatches || nameMatches || productMatches;
  });

  return (
    <Card className="border-none bg-white shadow-xl shadow-slate-100/40 rounded-3xl overflow-hidden animate-in fade-in duration-300">
      <CardHeader className="p-6 pb-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-bold text-slate-900">Lookup Configuration Panel</CardTitle>
            <CardDescription className="text-slate-500">Manage values available for drop downs and lists dynamically.</CardDescription>
          </div>
          <Button onClick={() => onAdd(filterType)} className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-6 h-11 transition-all shadow-lg shadow-slate-200">
            <Plus className="w-4 h-4 mr-2" /> Add Option Value
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6 border-b border-slate-100 pb-4">
          <div className="flex gap-1.5 bg-slate-50 p-1.5 rounded-2xl w-fit border border-slate-150 overflow-x-auto max-w-full">
            <FilterButton active={filterType === 'stage'} onClick={() => handleTabChange('stage')} label="Stages" />
            <FilterButton active={filterType === 'recovery_component'} onClick={() => handleTabChange('recovery_component')} label="Recovery Materials" />
            <FilterButton active={filterType === 'generic'} onClick={() => handleTabChange('generic')} label="Generic Codes" />
            <FilterButton active={filterType === 'process'} onClick={() => handleTabChange('process')} label="Processes" />
            <FilterButton active={filterType === 'base_batch_number'} onClick={() => handleTabChange('base_batch_number')} label="Base Batch Numbers" />
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              autoComplete="off"
              name="lookupMasterSearchQuery"
              placeholder={`Search ${filterType === 'stage' ? 'stages' : filterType === 'recovery_component' ? 'materials' : filterType === 'generic' ? 'codes' : filterType === 'process' ? 'processes' : 'base batch numbers'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs font-semibold text-slate-700"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading master items...</div>
        ) : searched.length === 0 ? (
          <div className="p-16 text-center text-slate-400 italic">
            {searchQuery 
              ? `No option values found matching "${searchQuery}"`
              : "No option values configured under this lookup. Click Add to insert."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 bg-slate-5/50">
            {searched.map((item) => {
              const rawStatus = item.status || 'DRAFT';
              const status = (rawStatus === 'DEACTIVATED' || rawStatus === 'INACTIVE') ? 'DRAFT' : rawStatus;
              
              return (
                <div key={item.id} className="bg-white rounded-2xl p-5 border border-slate-150 shadow-sm flex flex-col justify-between hover:border-slate-350 transition-all hover:shadow-md space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-2">
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider leading-none ${
                          item.type === 'stage' ? 'bg-indigo-50 text-indigo-700' :
                          item.type === 'recovery_component' ? 'bg-purple-50 text-purple-700' :
                          item.type === 'generic' ? 'bg-amber-50 text-amber-700' :
                          item.type === 'process' ? 'bg-emerald-50 text-emerald-700' :
                          item.type === 'base_batch_number' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-700'
                        }`}>
                          {item.type.replace('_', ' ')}
                        </span>
                        
                        <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider leading-none ${
                          status === 'DRAFT' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                          status === 'REVIEW' ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse' :
                          'bg-emerald-50 text-emerald-700 border border-emerald-250'
                        }`}>
                          {status}
                        </span>
                      </div>
                      
                      <p className="text-sm font-black font-mono text-slate-900 leading-none truncate">
                        <HighlightText text={item.code} search={searchQuery} />
                      </p>
                      {item.name && (
                        <p className="text-xs text-slate-400 mt-1 truncate">
                          <HighlightText text={item.name} search={searchQuery} />
                        </p>
                      )}
                      {item.type === 'stage' && item.productId && (
                        <div className="mt-1 flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded text-[10px] w-fit text-slate-600 border border-slate-100">
                          <span className="font-semibold text-slate-400">Product:</span>
                          <span className="font-medium truncate max-w-[150px]">
                            <HighlightText text={allProducts.find(p => p.id === item.productId)?.title || 'Unknown Product'} search={searchQuery} />
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      {status !== 'ACTIVE' && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="rounded-xl h-7 px-2.5 text-[11px] font-bold border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/70 flex items-center gap-1 shadow-2xs transition-all"
                          onClick={() => handleOpenEditModal(item)}
                        >
                          <Edit2 className="w-3 h-3 text-indigo-600" />
                          <span>Edit</span>
                        </Button>
                      )}
                      
                      {user?.email?.toLowerCase() === 'shakshay04@gmail.com' && (
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="rounded-full select-none h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50/50" 
                          onClick={() => onDelete(item)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Audit details when active */}
                  {status === 'ACTIVE' && item.approvedBy && (
                    <div className="pt-2 border-t border-slate-100 flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span className="truncate">By {getUserFullNameWithDesignation(item.approvedBy, internalUsers)} on {new Date(item.approvedDate!).toLocaleDateString()}</span>
                    </div>
                  )}

                  {/* Footer actions: View details on bottom left, workflow on bottom right */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 mt-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedCycleItem(item)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer select-none"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Details
                    </button>

                    <div className="flex gap-1.5 items-center">
                      {status === 'DRAFT' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full text-[10px] font-extrabold h-8 px-4 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-xs"
                          onClick={() => handleTransition(item, 'REVIEW')}
                        >
                          Submit
                        </Button>
                      )}
                      {status === 'REVIEW' && (
                        <div className="flex gap-2 items-center">
                          <button
                            className="text-[10px] text-slate-400 underline hover:text-slate-600"
                            onClick={() => handleTransition(item, 'DRAFT')}
                          >
                            Reject
                          </button>
                          <Button
                            size="sm"
                            className="rounded-full text-[10px] font-extrabold h-8 px-3 bg-[#FF6321] hover:bg-[#e05419] text-white"
                            onClick={() => handleTransition(item, 'ACTIVE')}
                          >
                            Activate
                          </Button>
                        </div>
                      )}
                      {status === 'ACTIVE' && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-50" /> Fully Active
                          </span>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-full text-[10px] font-extrabold h-8 px-3 bg-rose-600 hover:bg-rose-700 text-white"
                            onClick={() => handleTransition(item, 'DEACTIVATED')}
                          >
                            Deactivate
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Approval Cycle Popup Modals */}
      <AnimatePresence>
        {selectedCycleItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 relative"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[10px] font-extrabold font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                    {selectedCycleItem.type.replace('_', ' ')} lookup
                  </span>
                  <p className="text-xl font-black text-slate-900 font-mono tracking-tight">{selectedCycleItem.code}</p>
                  {selectedCycleItem.name && <p className="text-xs text-slate-500 mt-0.5">{selectedCycleItem.name}</p>}
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="rounded-full w-9 h-9 text-slate-400 hover:text-slate-650 hover:bg-slate-50"
                  onClick={() => setSelectedCycleItem(null)}
                >
                  <span className="text-xl font-bold">×</span>
                </Button>
              </div>

              {/* Scrollable Container with scrollbars */}
              <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-6 scrollbar-thin scrollbar-thumb-slate-200">
                
                {/* Stepper showing the dynamic 3-Stage Approval Cycle progression */}
                <div className="space-y-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-150">
                  <p className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono">3-Stage Approvals Pipeline</p>
                  <div className="relative pl-6 space-y-6 border-l-2 border-slate-200">
                    {/* Stage 1: DRAFT */}
                    <div className="relative">
                      <span className={`absolute -left-[31px] top-0 w-4.5 h-4.5 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${
                        selectedCycleItem.status === 'REVIEW' || selectedCycleItem.status === 'ACTIVE' || !selectedCycleItem.status || selectedCycleItem.status === 'DRAFT' || selectedCycleItem.status === 'DEACTIVATED'
                          ? 'bg-indigo-650'
                          : 'bg-slate-300'
                      }`} />
                      <div className="pl-2">
                        <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                          Stage 1: DRAFT 
                          {(selectedCycleItem.status === 'DRAFT' || selectedCycleItem.status === 'DEACTIVATED' || selectedCycleItem.status === 'INACTIVE' || !selectedCycleItem.status) && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-indigo-100 text-indigo-700 font-black rounded-full uppercase scale-90 origin-left">Current</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Value definition and configuration. QA Chemist can edit and submit for review. Deactivations return here.</p>
                      </div>
                    </div>

                    {/* Stage 2: REVIEW */}
                    <div className="relative">
                      <span className={`absolute -left-[31px] top-0 w-4.5 h-4.5 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${
                        selectedCycleItem.status === 'REVIEW' || selectedCycleItem.status === 'ACTIVE'
                          ? 'bg-amber-500'
                          : 'bg-slate-200'
                      }`} />
                      <div className="pl-2">
                        <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                          Stage 2: UNDER REVIEW
                          {selectedCycleItem.status === 'REVIEW' && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-700 font-black rounded-full uppercase scale-90 origin-left animate-pulse">Current</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Under verification by department supervisors. Reviewing accuracy & compliance.</p>
                      </div>
                    </div>

                    {/* Stage 3: ACTIVE */}
                    <div className="relative">
                      <span className={`absolute -left-[31px] top-0 w-4.5 h-4.5 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${
                        selectedCycleItem.status === 'ACTIVE'
                          ? 'bg-emerald-500'
                          : 'bg-slate-200'
                      }`} />
                      <div className="pl-2">
                        <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                          Stage 3: APPROVAL & ACTIVE (RELEASED)
                          {selectedCycleItem.status === 'ACTIVE' && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-700 font-black rounded-full uppercase scale-90 origin-left">Current</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Fully approved using electronic signatures. Released to Manufacturing for dropdown selections.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Electronic Sign-off verification panel */}
                <div className="p-4 rounded-xl border border-dashed border-slate-200/85 bg-slate-50/20 text-xs text-slate-600 space-y-2">
                  <p className="font-extrabold text-slate-800 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Electronic Signature Audit Trail
                  </p>
                  {selectedCycleItem.status === 'ACTIVE' ? (
                    <div className="space-y-1 font-mono text-[10px] text-slate-500">
                      <p><span className="font-semibold text-slate-700">Approved By:</span> {getUserFullNameWithDesignation(selectedCycleItem.approvedBy, internalUsers) || 'Authorized QA'}</p>
                      <p><span className="font-semibold text-slate-700">Signature Date:</span> {selectedCycleItem.approvedDate ? new Date(selectedCycleItem.approvedDate).toLocaleString() : 'N/A'}</p>
                      <p><span className="font-semibold text-slate-700">Regulations:</span> Verified in accordance with 21 CFR Part 11 electronic signature rules.</p>
                    </div>
                  ) : (selectedCycleItem.status === 'DEACTIVATED' || selectedCycleItem.history?.some((h: any) => (h.action || '').toUpperCase() === 'DEACTIVATED')) ? (
                    <p className="text-slate-600 font-mono text-[10px] leading-relaxed">
                      This lookup was deactivated under electronic signature and returned to Draft state for revision and re-authorization.
                    </p>
                  ) : (
                    <p className="text-slate-400 italic font-mono text-[10px]">Signature details will automatically populate once the QA manager approves and activates this lookup option value.</p>
                  )}
                </div>

                {/* Lookup Process Flow / Revision History */}
                <div className="space-y-4 border-t border-slate-100 pt-5">
                  <p className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono">Process Flow / Workflow History</p>
                  {selectedCycleItem.history && selectedCycleItem.history.length > 0 ? (
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                      {selectedCycleItem.history.map((h, idx) => {
                        const actionUpper = (h.action || h.status || '').toUpperCase();
                        let actionLabel = 'By ';
                        if (actionUpper === 'CREATED' || (h.status === 'DRAFT' && idx === 0)) {
                           actionLabel = 'Created by ';
                        } else if (actionUpper === 'SUBMITTED' || actionUpper === 'REVIEW') {
                          actionLabel = 'Submitted by ';
                        } else if (actionUpper === 'APPROVED' || actionUpper === 'ACTIVE') {
                          actionLabel = 'Approved by ';
                        } else if (actionUpper === 'EDITED') {
                          actionLabel = 'Edited by ';
                        } else if (actionUpper === 'DEACTIVATED') {
                          actionLabel = 'Deactivated by ';
                        } else if (actionUpper.includes('RE_ACTIVATED')) {
                          actionLabel = 'Re-activated as Draft by ';
                        } else if (actionUpper.includes('REJECTED')) {
                          actionLabel = 'Returned to Draft by ';
                        }

                        const userFullNameWithDesignation = getUserFullNameWithDesignation(h.user, internalUsers);

                        return (
                          <div key={idx} className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 text-[11px] space-y-1">
                            <div className="flex justify-between items-center">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                h.status === 'DRAFT' ? 'bg-slate-100 text-slate-700' :
                                h.status === 'REVIEW' ? 'bg-amber-150 text-amber-800' :
                                h.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                                'bg-rose-100 text-rose-800'
                              }`}>
                                {h.action || h.status}
                              </span>
                              <span className="font-mono text-slate-400 text-[10px]">{new Date(h.timestamp).toLocaleString()}</span>
                            </div>
                            <p className="text-slate-600 font-medium">
                              {actionLabel}<span className="font-bold text-slate-800">{userFullNameWithDesignation}</span>
                            </p>
                            {h.meaning && (
                              <p className="text-slate-500 italic bg-white p-1.5 rounded border border-slate-100 font-mono text-[9px] leading-relaxed">
                                "{h.meaning}"
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">No historical lifecycle flow entries found for this record.</div>
                  )}
                </div>

              </div> {/* End of Scrollable Container */}

              <div className="mt-6 flex justify-end">
                <Button 
                  onClick={() => setSelectedCycleItem(null)} 
                  className="bg-slate-900 hover:bg-slate-800 rounded-full px-5 text-xs h-9 text-white font-bold"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Edit Master Lookup Dialog */}
        {showEditModal && editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 relative text-left"
            >
              <div className="flex justify-between items-start mb-5">
                <div>
                  <span className="text-[10px] font-extrabold font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                    Edit Master Lookup
                  </span>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    Edit {editingItem.type.replace('_', ' ')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Modify Code/Value ID. Updating resets status to DRAFT for approval pipeline.
                  </p>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="rounded-full w-8 h-8 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingItem(null);
                  }}
                >
                  <span className="text-lg font-bold">×</span>
                </Button>
              </div>

              <div className="space-y-4">
                {editingItem.type === 'stage' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Select Active Product *</Label>
                    <select
                      value={editProductId}
                      onChange={(e) => setEditProductId(e.target.value)}
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select a Product...</option>
                      {allProducts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({p.productCode || p.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Value / Code ID *</Label>
                  <Input 
                    value={editCode}
                    onChange={(e) => {
                      const isCaseFlexible = editingItem && ['recovery_component', 'generic', 'process'].includes(editingItem.type);
                      setEditCode(isCaseFlexible ? e.target.value : e.target.value.toUpperCase());
                    }}
                    placeholder={
                      editingItem?.type === 'recovery_component'
                        ? "e.g. RM09, ACN, toluene, acetone..."
                        : editingItem?.type === 'generic'
                          ? "e.g. A, Aq., aq., II, REC., rec..."
                          : editingItem?.type === 'process'
                            ? "e.g. Manufacturing, micronization, milling..."
                            : "e.g. STG-01, LH10..."
                    }
                    className={`h-10 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs font-bold font-mono text-slate-900 ${
                      editingItem && ['recovery_component', 'generic', 'process'].includes(editingItem.type) ? '' : 'uppercase'
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Description / Name (Optional)</Label>
                  <Input 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Optional description"
                    className="h-10 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
                <Button 
                  variant="ghost"
                  className="rounded-full text-xs font-bold text-slate-600 h-10 px-5"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingItem(null);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  className="bg-[#FF6321] hover:bg-[#e05419] text-white rounded-full text-xs font-extrabold h-10 px-6 shadow-md shadow-orange-500/20"
                  onClick={handleSaveEdit}
                >
                  Save & Enter E-Signature
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
        active 
          ? 'bg-white text-slate-900 shadow font-extrabold' 
          : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
    </button>
  );
}
