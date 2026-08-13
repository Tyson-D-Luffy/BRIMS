import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Download, 
  Clock, 
  Activity, 
  Database, 
  Calendar,
  Building2,
  RefreshCw,
  Fingerprint,
  Cpu
} from 'lucide-react';
import api from '../services/api';
import { AuditLog } from '../types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function SystemAdminAuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [migrating, setMigrating] = useState(false);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 19);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 19);
  });
  const [userEmailSearch, setUserEmailSearch] = useState<string>('');
  const [limit, setLimit] = useState('100');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', limit);
      if (actionFilter && actionFilter !== 'ALL') params.append('action', actionFilter);
      if (moduleFilter && moduleFilter !== 'ALL') params.append('entityType', moduleFilter);
      if (branchFilter && branchFilter !== 'ALL') params.append('selectedBranch', branchFilter);
      if (startDate) params.append('startDate', new Date(startDate).toISOString());
      if (endDate) params.append('endDate', new Date(endDate).toISOString());
      if (userEmailSearch) params.append('userEmail', userEmailSearch);

      const response = await api.get(`/audit-logs/system?${params.toString()}`);
      if (response.data.success) {
        setLogs(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch system admin audit logs', error);
      toast.error('Failed to load System Administration Audit Trail data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, moduleFilter, branchFilter, startDate, endDate, limit]);

  const handleKeywordSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  // Run legacy migration
  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const response = await api.post('/audit-logs/migrate');
      if (response.data.success) {
        toast.success(response.data.message || "Audit trail logs migrated successfully!");
        fetchLogs();
      } else {
        toast.error(response.data.message || "Failed migrating old logs.");
      }
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.response?.data?.message || "Internal error triggering migration.");
    } finally {
      setMigrating(false);
    }
  };

  const uniqueActions = Array.from(new Set(logs.map(l => l.action || ''))).filter(Boolean).sort();
  const uniqueModules = Array.from(new Set(logs.map(l => l.module || l.entityType || ''))).filter(Boolean).sort();
  const uniqueBranches = Array.from(new Set(logs.map(l => l.branch || l.selectedBranch || ''))).filter(Boolean).sort();

  const filteredLogs = logs.filter(log => {
    const userString = (log.userEmail || log.performedBy || '').toLowerCase();
    const actionString = (log.action || '').toLowerCase();
    const entityIdString = (log.entityId || '').toLowerCase();
    const keyword = search.toLowerCase();

    const matchesSearch = !keyword || 
      userString.includes(keyword) ||
      actionString.includes(keyword) ||
      entityIdString.includes(keyword);

    const matchesUserEmailFilter = !userEmailSearch || 
      userString.includes(userEmailSearch.toLowerCase());

    return matchesSearch && matchesUserEmailFilter;
  });

  const exportLogs = () => {
    try {
      const csvContent = "data:text/csv;charset=utf-8,"
        + "Timestamp,auditId,module/entityType,action,performedBy,role,ipAddress,userAgent,sessionId,changeReason\n"
        + filteredLogs.map(l => {
          const timestamp = l.timestamp || '';
          const auditId = l.auditId || l.id || '';
          const mod = l.module || l.entityType || '';
          const act = l.action || '';
          const perfBy = l.performedBy || l.userEmail || '';
          const role = l.role || '';
          const ip = l.ipAddress || '';
          const ua = (l.userAgent || '').replace(/"/g, '""');
          const sessId = l.sessionId || '';
          const reason = (l.changeReason || '').replace(/"/g, '""');
          return `"${timestamp}","${auditId}","${mod}","${act}","${perfBy}","${role}","${ip}","${ua}","${sessId}","${reason}"`;
        }).join("\n");
        
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `system_admin_audit_trail_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("System administration audit logs exported successfully");
    } catch (err) {
      toast.error("Failed to export administrative audit logs");
    }
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-rose-600 font-bold text-xs uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-full w-fit">
            <ShieldAlert className="w-3.5 h-3.5" />
            System Security & Access Controls
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-2">System Administration Audit Trail</h1>
          <p className="text-slate-500 mt-1">Immutable ledger tracking security policies, authentication logs, role updates, and administrative overrides.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleMigrate}
            disabled={migrating}
            variant="outline"
            className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-900 h-12 px-5 text-xs font-bold shrink-0 shadow-sm"
          >
            <Cpu className="w-4 h-4 mr-2" />
            {migrating ? "Migrating..." : "Migrate Old Audit Logs"}
          </Button>
          <Button
            onClick={fetchLogs}
            variant="outline"
            className="rounded-full border-slate-200 h-12 w-12 p-0 text-slate-500 hover:text-slate-900"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button 
            onClick={exportLogs}
            className="bg-slate-950 hover:bg-slate-900 text-white rounded-full px-6 h-12 shadow-md"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Security Data
          </Button>
        </div>
      </header>

      {/* FILTER PANEL */}
      <Card className="border border-slate-100 shadow-sm rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-6 space-y-6">
          {/* Top Row: Search & User Filter */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2 ml-1">Search Keywords, user IDs or sessions</span>
              <form onSubmit={handleKeywordSearch} className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search by keywords, user ids, sessions..." 
                  className="pl-11 h-12 w-full rounded-2xl bg-slate-50 border border-slate-100 text-slate-800 placeholder:text-slate-400 focus-visible:ring-rose-500 font-medium"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </form>
            </div>

            <div className="lg:col-span-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2 ml-1">Filter specifically by User Email</span>
              <div className="relative">
                <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Filter specifically by User Email..."
                  className="pl-11 h-12 w-full rounded-2xl bg-slate-50 border border-slate-100 text-slate-800 placeholder:text-slate-400 focus-visible:ring-rose-500 font-medium"
                  value={userEmailSearch}
                  onChange={(e) => setUserEmailSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-100" />

          {/* Bottom Row: Metadata & Operational Filters */}
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-3 ml-1">System Audit Filters</span>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
              {/* Date & Time Filters */}
              <div className="lg:col-span-4 flex flex-col gap-1.5">
                <span className="text-[9px] font-bold text-slate-400 block ml-1">Date & Time Range</span>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-3.5 h-12 rounded-2xl">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <input 
                    type="datetime-local"
                    step="1"
                    className="bg-transparent border-none text-xs text-slate-800 font-medium outline-none focus:ring-0 w-full cursor-pointer focus:outline-none"
                    style={{ colorScheme: "light" }}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <span className="text-slate-300 font-bold text-xs shrink-0 px-1">to</span>
                  <input 
                    type="datetime-local"
                    step="1"
                    className="bg-transparent border-none text-xs text-slate-800 font-medium outline-none focus:ring-0 w-full cursor-pointer focus:outline-none"
                    style={{ colorScheme: "light" }}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Action Filter */}
              <div className="lg:col-span-2 flex flex-col gap-1.5">
                <span className="text-[9px] font-bold text-slate-400 block ml-1">Action Type</span>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border border-slate-100 text-slate-800 font-medium">
                    <div className="flex items-center gap-2 text-slate-800">
                      <Activity className="w-4 h-4 text-slate-400 shrink-0" />
                      <SelectValue placeholder="Action" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-[250px]">
                    <SelectItem value="ALL">All Actions</SelectItem>
                    {uniqueActions.map(action => (
                      <SelectItem key={action} value={action}>{action.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Module Filter */}
              <div className="lg:col-span-2 flex flex-col gap-1.5">
                <span className="text-[9px] font-bold text-slate-400 block ml-1">Module / Entity</span>
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border border-slate-100 text-slate-800 font-medium">
                    <div className="flex items-center gap-2 text-slate-800">
                      <Database className="w-4 h-4 text-slate-400 shrink-0" />
                      <SelectValue placeholder="Module/Entity" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-[250px]">
                    <SelectItem value="ALL">All Modules</SelectItem>
                    {uniqueModules.map(module => (
                      <SelectItem key={module} value={module}>{module}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Branch Filter */}
              <div className="lg:col-span-2 flex flex-col gap-1.5">
                <span className="text-[9px] font-bold text-slate-400 block ml-1">Branch Site</span>
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border border-slate-100 text-slate-800 font-medium">
                    <div className="flex items-center gap-2 text-slate-800">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <SelectValue placeholder="Branch" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="ALL">All Branches</SelectItem>
                    <SelectItem value="Masulkhana">Masulkhana</SelectItem>
                    {uniqueBranches.filter(b => b !== "Masulkhana").map(branch => (
                      <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Limit selector */}
              <div className="lg:col-span-2 flex flex-col gap-1.5">
                <span className="text-[9px] font-bold text-slate-400 block ml-1">Limit Records</span>
                <Select value={limit} onValueChange={setLimit}>
                  <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border border-slate-100 text-slate-800 font-medium">
                    <div className="flex items-center gap-2 text-slate-800">
                      <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                      <SelectValue placeholder="Limit" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="50">50 items</SelectItem>
                    <SelectItem value="100">100 items</SelectItem>
                    <SelectItem value="500">500 items</SelectItem>
                    <SelectItem value="1000">1000 items</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Active states / Clear action */}
          {(search || actionFilter !== 'ALL' || moduleFilter !== 'ALL' || branchFilter !== 'ALL' || startDate || endDate || userEmailSearch) && (
            <div className="flex items-center justify-end pt-2 border-t border-slate-50">
              <Button 
                variant="ghost" 
                onClick={() => { 
                  setSearch(''); 
                  setActionFilter('ALL'); 
                  setModuleFilter('ALL'); 
                  setBranchFilter('ALL'); 
                  setStartDate(''); 
                  setEndDate(''); 
                  setUserEmailSearch('');
                  setLimit('100'); 
                }}
                className="h-9 rounded-xl px-4 text-slate-500 hover:text-rose-600 hover:bg-slate-50 text-xs font-semibold"
              >
                Clear All Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TABLE DATA */}
      <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="pl-8 w-44">Date & Time</TableHead>
                <TableHead>Administrator</TableHead>
                <TableHead>Activity/Event</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Session Context</TableHead>
                <TableHead className="w-56">Client IP / Device</TableHead>
                <TableHead className="pr-8">Audit State Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div>
                      <p className="text-slate-400 text-xs font-medium">Fetching administrative security ledger...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredLogs.map((log) => (
                <TableRow key={log.id || log.auditId} className="group hover:bg-slate-50/50 border-slate-50 transition-colors">
                  <TableCell className="pl-8">
                    <div className="flex flex-col text-slate-500 font-mono text-[11px] space-y-0.5">
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-rose-400" />
                        {new Date(log.timestamp).toLocaleDateString()}
                      </div>
                      <div className="ml-5 text-slate-400 text-[10px]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-xs font-black text-rose-700 border border-rose-100">
                        {(log.performedBy || log.userEmail || 'A')[0].toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-900 truncate max-w-[160px]">{log.performedBy || log.userEmail}</span>
                        <span className="text-[10px] text-rose-600 font-black tracking-widest uppercase">{(log as any).functionalRole || log.role || 'ADMIN'}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-white border-rose-200 text-rose-700 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-tight whitespace-nowrap">
                      {(log.action || '').replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px] bg-slate-100 px-2 py-0.5 rounded-md whitespace-nowrap animate-pulse">
                      {log.module || log.entityType || 'SYSTEM'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-[11px]">
                      <span className="text-slate-600 font-semibold truncate max-w-[150px]">Session:</span>
                      <span className="font-mono text-slate-400 shrink-0">{log.sessionId || 'UNKNOWN'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-[11px] gap-0.5 max-w-[180px]">
                      <span className="font-mono text-slate-600 font-medium bg-slate-100 px-1.5 py-0.5 rounded w-fit">IP: {log.ipAddress || '127.0.0.1'}</span>
                      <span className="text-[9px] text-slate-400 truncate mt-0.5" title={log.userAgent || ''}>{log.userAgent || 'system process'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="pr-8">
                    <div className="text-[10px] space-y-1.5 max-w-sm">
                      {log.oldValue && Object.keys(log.oldValue).length > 0 && (
                        <div className="flex gap-1.5 items-start">
                          <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded font-black text-[9px] heading-mono">BEFORE</span>
                          <span className="text-slate-500 font-mono text-[9px] break-all line-clamp-2">{JSON.stringify(log.oldValue)}</span>
                        </div>
                      )}
                      {log.newValue && Object.keys(log.newValue).length > 0 && (
                        <div className="flex gap-1.5 items-start">
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded font-black text-[9px] heading-mono">AFTER</span>
                          <span className="text-slate-800 font-mono text-[9px] break-all line-clamp-2 font-semibold">{JSON.stringify(log.newValue)}</span>
                        </div>
                      )}
                      {log.changeReason && (
                        <p className="text-slate-400 italic text-[9px]">Reason: {log.changeReason}</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-slate-400 italic text-sm">
                    No matching System Administration audit trail records found.
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
