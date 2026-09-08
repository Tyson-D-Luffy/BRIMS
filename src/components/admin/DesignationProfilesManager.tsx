import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  Edit3, 
  History, 
  RefreshCw, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Clock, 
  ChevronRight, 
  Layers, 
  Sparkles,
  Search,
  RotateCcw,
  Check,
  X
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { DesignationPermissionProfile } from '../../types';
import { ALL_SYSTEM_PERMISSIONS, DEFAULT_DESIGNATION_PROFILES } from '../../constants/designationProfiles';
import api from '../../services/api';
import { toast } from 'sonner';

interface DesignationProfilesManagerProps {
  onRefreshUsers?: () => void;
}

export const DesignationProfilesManager: React.FC<DesignationProfilesManagerProps> = ({ onRefreshUsers }) => {
  const [profiles, setProfiles] = useState<DesignationPermissionProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedProfile, setSelectedProfile] = useState<DesignationPermissionProfile | null>(null);
  
  // Edit Profile Modal States
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
  const [editReason, setEditReason] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Version History Modal States
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [historyProfile, setHistoryProfile] = useState<DesignationPermissionProfile | null>(null);

  // Sync Users Modal States
  const [isSyncOpen, setIsSyncOpen] = useState<boolean>(false);
  const [syncProfile, setSyncProfile] = useState<DesignationPermissionProfile | null>(null);
  const [affectedUsersData, setAffectedUsersData] = useState<{ users: any[]; totalCount: number; withOverridesCount: number } | null>(null);
  const [syncReason, setSyncReason] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const res = await api.get('/designation-profiles');
      if (res.data && res.data.success) {
        setProfiles(res.data.data);
      }
    } catch (err: any) {
      console.error("Failed to fetch designation permission profiles:", err);
      toast.error("Failed to load designation permission profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleOpenEdit = (profile: DesignationPermissionProfile) => {
    setSelectedProfile(profile);
    setEditingPermissions([...profile.permissions]);
    setEditReason('');
    setIsEditOpen(true);
  };

  const handleTogglePermission = (permId: string) => {
    setEditingPermissions(prev => 
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  const handleToggleCategory = (categoryPermIds: string[], selectAll: boolean) => {
    setEditingPermissions(prev => {
      const remaining = prev.filter(p => !categoryPermIds.includes(p));
      return selectAll ? [...remaining, ...categoryPermIds] : remaining;
    });
  };

  const handleResetToBaseline = (profileId: string) => {
    const defaultProf = DEFAULT_DESIGNATION_PROFILES.find(d => d.profileId === profileId);
    if (defaultProf) {
      setEditingPermissions([...defaultProf.permissions]);
      toast.info(`Reset to standard baseline permissions for ${defaultProf.designationName}`);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;
    if (!editReason.trim()) {
      toast.error("Please provide a valid compliance reason for updating the profile");
      return;
    }

    try {
      setIsSaving(true);
      const res = await api.put(`/designation-profiles/${selectedProfile.id || selectedProfile.profileId}`, {
        permissions: editingPermissions,
        reason: editReason
      });

      if (res.data && res.data.success) {
        toast.success(res.data.message || `Profile updated to Version ${res.data.data?.version}`);
        setIsEditOpen(false);
        fetchProfiles();
        if (onRefreshUsers) onRefreshUsers();
      }
    } catch (err: any) {
      console.error("Failed to update profile:", err);
      toast.error(err.response?.data?.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenHistory = (profile: DesignationPermissionProfile) => {
    setHistoryProfile(profile);
    setIsHistoryOpen(true);
  };

  const handleOpenSync = async (profile: DesignationPermissionProfile) => {
    setSyncProfile(profile);
    setSyncReason(`Align all ${profile.designationName} accounts to Profile v${profile.version}`);
    setIsSyncOpen(true);
    try {
      const res = await api.get(`/designation-profiles/designation/${encodeURIComponent(profile.designationName)}/affected-users`);
      if (res.data && res.data.success) {
        setAffectedUsersData(res.data.data);
      }
    } catch (err: any) {
      console.error("Failed to fetch affected users:", err);
    }
  };

  const handleExecuteSync = async () => {
    if (!syncProfile) return;
    if (!syncReason.trim()) {
      toast.error("Reason for synchronization is required");
      return;
    }

    try {
      setIsSyncing(true);
      const res = await api.post(`/designation-profiles/designation/${encodeURIComponent(syncProfile.designationName)}/sync-users`, {
        profileId: syncProfile.profileId || syncProfile.id,
        reason: syncReason
      });

      if (res.data && res.data.success) {
        toast.success(res.data.message || `Successfully synchronized users to Profile v${syncProfile.version}`);
        setIsSyncOpen(false);
        fetchProfiles();
        if (onRefreshUsers) onRefreshUsers();
      }
    } catch (err: any) {
      console.error("Failed to sync users:", err);
      toast.error(err.response?.data?.message || "User synchronization failed");
    } finally {
      setIsSyncing(false);
    }
  };

  // Group permissions by category
  const categories: string[] = Array.from(new Set(ALL_SYSTEM_PERMISSIONS.map(p => p.category)));

  return (
    <div className="space-y-8" id="designation-profiles-manager">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-indigo-900/90 via-slate-900 to-indigo-950 p-6 md:p-8 rounded-3xl text-white shadow-sm border border-indigo-800/40">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/20">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold font-mono uppercase tracking-widest text-indigo-300">
              Granular RBAC Architecture
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Designation Permission Profiles
          </h2>
          <p className="text-slate-300 text-sm max-w-2xl mt-1 leading-relaxed">
            Configure system default permissions for pharmaceutical roles. Any modifications increment the profile version, record audit trails, and enable 1-click user synchronization.
          </p>
        </div>

        <Button 
          onClick={fetchProfiles} 
          variant="outline" 
          size="sm"
          className="bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl text-xs font-semibold gap-2"
          id="btn-refresh-profiles"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Profiles
        </Button>
      </div>

      {/* Profiles Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={`prof-skel-${i}`} className="h-64 rounded-3xl bg-slate-100 animate-pulse border border-slate-200" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((profile, idx) => {
            const permissionCount = profile.permissions?.length || 0;
            const isITAdmin = profile.profileId === 'profile-it-admin' || profile.designationName.toUpperCase().includes('ADMIN');
            const isQA = profile.designationName.toUpperCase().includes('QA') || profile.departmentName?.toUpperCase().includes('QUALITY');

            return (
              <Card 
                key={`profile-card-${profile.id || profile.profileId || idx}`}
                className="border border-slate-200/80 shadow-sm rounded-3xl overflow-hidden bg-white hover:shadow-md transition-all flex flex-col justify-between"
                id={`card-profile-${profile.profileId || idx}`}
              >
                <div>
                  {/* Card Top Banner */}
                  <div className={`p-6 border-b ${
                    isITAdmin ? 'bg-purple-50/50 border-purple-100' :
                    isQA ? 'bg-indigo-50/50 border-indigo-100' :
                    'bg-amber-50/50 border-amber-100'
                  }`}>
                    <div className="flex justify-between items-start mb-3">
                      <Badge className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                        isITAdmin ? 'bg-purple-600 text-white' :
                        isQA ? 'bg-indigo-600 text-white' :
                        'bg-amber-600 text-white'
                      }`}>
                        v{profile.version || '1.0'}
                      </Badge>
                      
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                        {profile.status || 'Active'}
                      </Badge>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                      {profile.designationName}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Department: <span className="font-bold text-slate-700">{profile.departmentName || 'All Departments'}</span>
                    </p>
                  </div>

                  {/* Card Content & Stats */}
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                          {permissionCount}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800">Assigned Rights</div>
                          <div className="text-[10px] text-slate-400">Total operational permissions</div>
                        </div>
                      </div>

                      <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        {Math.round((permissionCount / ALL_SYSTEM_PERMISSIONS.length) * 100)}% Total
                      </span>
                    </div>

                    {profile.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {profile.description}
                      </p>
                    )}

                    <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-slate-50">
                      <div className="flex justify-between">
                        <span>Effective Date:</span>
                        <span className="font-mono text-slate-600 font-medium">{profile.effectiveDate || 'Immediate'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Approved By:</span>
                        <span className="font-semibold text-slate-700">{profile.approvedBy || 'System Admin'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleOpenHistory(profile)}
                      className="rounded-xl text-xs h-8 px-2.5 text-slate-600 hover:text-slate-900 border-slate-200"
                      title="View Version History & Audit Trail"
                    >
                      <History className="w-3.5 h-3.5 mr-1" /> History
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleOpenSync(profile)}
                      className="rounded-xl text-xs h-8 px-2.5 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 border-indigo-200"
                      title="Synchronize All Users with this Designation"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Sync Users
                    </Button>
                  </div>

                  <Button 
                    size="sm"
                    onClick={() => handleOpenEdit(profile)}
                    className="rounded-xl text-xs h-8 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold"
                    id={`btn-edit-profile-${profile.profileId || idx}`}
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit Rights
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Profile Permissions Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[850px] max-h-[88vh] overflow-y-auto rounded-3xl p-6" id="edit-profile-modal">
          <DialogHeader className="pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">
                  Edit Permissions: {selectedProfile?.designationName}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Update baseline rights for this designation. A minor version bump will be applied automatically.
                </DialogDescription>
              </div>
              <Badge className="bg-indigo-600 text-white font-mono text-xs px-3 py-1">
                Current: v{selectedProfile?.version || '1.0'}
              </Badge>
            </div>
          </DialogHeader>

          {selectedProfile && (
            <form onSubmit={handleSaveProfile} className="space-y-6 py-4">
              {/* Compliance Justification Input */}
              <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-2">
                <Label htmlFor="profile-edit-reason" className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Mandatory Compliance Justification / Reason for Change <span className="text-rose-500">*</span>
                </Label>
                <Input 
                  id="profile-edit-reason"
                  placeholder="e.g. Updated standard operating procedures (SOP-QA-042) to include format approval rights"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="rounded-xl border-amber-200 h-10 text-xs bg-white focus-visible:ring-amber-500"
                  required
                />
                <p className="text-[10px] text-amber-700">
                  21 CFR Part 11 Audit Trail will permanently record this modification with your user identity and timestamp.
                </p>
              </div>

              {/* Quick Actions Bar */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Total Selected: <span className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{editingPermissions.length} of {ALL_SYSTEM_PERMISSIONS.length}</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleResetToBaseline(selectedProfile.profileId)}
                    className="text-xs h-8 rounded-xl border-slate-200 hover:bg-slate-100"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Reset Factory Default
                  </Button>
                </div>
              </div>

              {/* Category-wise Permission Pickers */}
              <div className="space-y-6">
                {categories.map((category: string, catIdx: number) => {
                  const categoryPerms = ALL_SYSTEM_PERMISSIONS.filter(p => p.category === category);
                  const categoryPermIds = categoryPerms.map(p => p.id);
                  const selectedInCat = categoryPermIds.filter(id => editingPermissions.includes(id));
                  const isAllSelected = selectedInCat.length === categoryPermIds.length;
                  const isNoneSelected = selectedInCat.length === 0;

                  return (
                    <div key={`cat-block-${catIdx}`} className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                            {category}
                          </h4>
                          <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            {selectedInCat.length}/{categoryPermIds.length}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() => handleToggleCategory(categoryPermIds, true)}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-50"
                          >
                            Select All
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleToggleCategory(categoryPermIds, false)}
                            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-2 py-0.5 rounded hover:bg-slate-100"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {categoryPerms.map((perm) => {
                          const isChecked = editingPermissions.includes(perm.id);
                          return (
                            <label 
                              key={`perm-check-${perm.id}`}
                              className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                                isChecked 
                                  ? 'bg-indigo-50/40 border-indigo-200 text-slate-900' 
                                  : 'bg-slate-50/40 border-slate-100 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <Checkbox 
                                checked={isChecked}
                                onCheckedChange={() => handleTogglePermission(perm.id)}
                                className="mt-0.5 rounded-md data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                              />
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <div className="text-xs font-bold leading-tight">
                                  {perm.name}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 truncate">
                                  {perm.id}
                                </div>
                                {perm.derivedReturnInfo && (
                                  <div className="text-[10px] text-emerald-700 font-medium">
                                    {perm.derivedReturnInfo}
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <DialogFooter className="pt-4 border-t border-slate-100">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditOpen(false)}
                  className="rounded-xl border-slate-200"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSaving}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6"
                  id="btn-save-profile-changes"
                >
                  {isSaving ? "Saving & Incrementing Version..." : "Save & Publish Profile"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Version History Modal */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader className="pb-4 border-b border-slate-100">
            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              Version &amp; Audit History: {historyProfile?.designationName}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Immutable historical timeline of permission configuration changes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {historyProfile?.history && historyProfile.history.length > 0 ? (
              <div className="relative border-l-2 border-indigo-200 ml-4 space-y-6">
                {historyProfile.history.slice().reverse().map((entry, idx) => (
                  <div key={`hist-entry-${idx}`} className="relative pl-6">
                    <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-indigo-600 border-2 border-white shadow-sm" />
                    
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex justify-between items-start">
                        <Badge className="bg-slate-900 text-white font-mono text-xs">
                          Version {entry.version}
                        </Badge>
                        <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(entry.changedAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="text-xs font-medium text-slate-700">
                        Modified by: <span className="font-bold text-slate-900">{entry.changedBy}</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white border border-slate-150 text-xs text-slate-600">
                        <span className="font-bold text-slate-800">Reason:</span> {entry.reason}
                      </div>

                      <div className="text-[11px] text-slate-500 font-mono">
                        Assigned Permissions: <span className="font-bold text-indigo-600">{entry.permissions?.length || 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs italic">
                No past revisions recorded for this profile.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Synchronize Users Modal */}
      <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader className="pb-4 border-b border-slate-100">
            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-indigo-600" />
              Synchronize Designation Users: {syncProfile?.designationName}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Propagate active profile permissions (v{syncProfile?.version}) to all registered user accounts with this designation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Impact Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100">
                <div className="text-2xl font-black text-indigo-700">
                  {affectedUsersData?.totalCount ?? '...'}
                </div>
                <div className="text-xs font-bold text-slate-700 mt-0.5">Total Users Assigned</div>
                <div className="text-[10px] text-slate-400">Designation matches active profile</div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-100">
                <div className="text-2xl font-black text-amber-700">
                  {affectedUsersData?.withOverridesCount ?? '...'}
                </div>
                <div className="text-xs font-bold text-slate-700 mt-0.5">Users With Overrides</div>
                <div className="text-[10px] text-slate-400">Will be aligned to profile defaults</div>
              </div>
            </div>

            {/* Affected Users List Preview */}
            {affectedUsersData && affectedUsersData.users.length > 0 && (
              <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                <Table className="text-xs">
                  <TableHeader className="bg-slate-50 sticky top-0">
                    <TableRow>
                      <TableHead className="py-2 text-[11px] font-bold">Emp ID / Name</TableHead>
                      <TableHead className="py-2 text-[11px] font-bold">Email</TableHead>
                      <TableHead className="py-2 text-[11px] font-bold">Current Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {affectedUsersData.users.map((u, idx) => (
                      <TableRow key={`sync-usr-${u.uid || idx}`}>
                        <TableCell className="py-2 font-medium">
                          {u.displayName || u.name} <span className="text-[10px] text-slate-400 font-mono">({u.employeeId})</span>
                        </TableCell>
                        <TableCell className="py-2 text-slate-500 font-mono">{u.email}</TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className={`text-[10px] ${u.permissionSource === 'USER_OVERRIDE' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600'}`}>
                            {u.permissionSource || 'DEFAULT'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Sync Justification */}
            <div className="space-y-2">
              <Label htmlFor="sync-reason-input" className="text-xs font-bold text-slate-700">
                Synchronization Compliance Reason <span className="text-rose-500">*</span>
              </Label>
              <Input 
                id="sync-reason-input"
                value={syncReason}
                onChange={(e) => setSyncReason(e.target.value)}
                placeholder="e.g. Mandatory role realignment after QA Designation profile audit"
                className="rounded-xl border-slate-200 h-10 text-xs"
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsSyncOpen(false)}
              className="rounded-xl border-slate-200"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleExecuteSync}
              disabled={isSyncing || !affectedUsersData || affectedUsersData.totalCount === 0}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6"
              id="btn-confirm-sync-users"
            >
              {isSyncing ? "Synchronizing Users..." : `Synchronize ${affectedUsersData?.totalCount || 0} Users`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
