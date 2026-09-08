import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Download, 
  Filter, 
  User, 
  Tag, 
  Clock, 
  Activity, 
  Database, 
  Calendar,
  Building2,
  RefreshCw
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
import { HighlightText } from '../components/HighlightText';

export default function BatchAuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Compliance-ready filters
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
      // Build query string dynamically
      const params = new URLSearchParams();
      params.append('limit', limit);
      if (actionFilter && actionFilter !== 'ALL') params.append('action', actionFilter);
      if (moduleFilter && moduleFilter !== 'ALL') params.append('entityType', moduleFilter);
      if (branchFilter && branchFilter !== 'ALL') params.append('selectedBranch', branchFilter);
      if (startDate) params.append('startDate', new Date(startDate).toISOString());
      if (endDate) params.append('endDate', new Date(endDate).toISOString());
      if (userEmailSearch) params.append('userEmail', userEmailSearch);

      const response = await api.get(`/audit-logs/batch?${params.toString()}`);
      if (response.data.success) {
        setLogs(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch batch audit logs', error);
      toast.error('Failed to load Batch Process Audit Trail data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, moduleFilter, branchFilter, startDate, endDate, limit]);

  // Handle immediate search triggers
  const handleKeywordSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  // Extract unique actions & modules for dynamic filters
  const uniqueActions = Array.from(new Set(logs.map(l => l.action || ''))).filter(Boolean).sort();
  const uniqueModules = Array.from(new Set(logs.map(l => l.module || l.entityType || ''))).filter(Boolean).sort();
  const uniqueBranches = Array.from(new Set(logs.map(l => l.branch || l.selectedBranch || ''))).filter(Boolean).sort();

  // client-side secondary refinement for typing search fields
  const filteredLogs = logs.filter(log => {
    const userString = (log.userEmail || log.performedBy || '').toLowerCase();
    const actionString = (log.action || '').toLowerCase();
    const entityIdString = (log.entityId || '').toLowerCase();
    const batchNumberString = ((log as any).batchNumber || '').toLowerCase();
    const requestIdString = ((log as any).requestId || (log as any).batchSheetRequestId || '').toLowerCase();
    const sheetIdString = ((log as any).sheetId || '').toLowerCase();
    const printJobIdString = ((log as any).printJobId || '').toLowerCase();
    const meaningString = (log.signatureMeaning || '').toLowerCase();
    const reasonString = (log.changeReason || '').toLowerCase();
    const keyword = search.toLowerCase();

    const matchesSearch = !keyword || 
      userString.includes(keyword) ||
      actionString.includes(keyword) ||
      entityIdString.includes(keyword) ||
      batchNumberString.includes(keyword) ||
      requestIdString.includes(keyword) ||
      sheetIdString.includes(keyword) ||
      printJobIdString.includes(keyword) ||
      reasonString.includes(keyword) ||
      meaningString.includes(keyword);

    const matchesUserEmailFilter = !userEmailSearch || 
      userString.includes(userEmailSearch.toLowerCase());

    return matchesSearch && matchesUserEmailFilter;
  });

  const exportLogs = () => {
    try {
      const csvContent = "data:text/csv;charset=utf-8,"
        + "Timestamp,auditId,module/entityType,action,performedBy,role,branch,IpAddress,sessionId,changeReason,SignatureMeaning\n"
        + filteredLogs.map(l => {
          // Flatten data strings safely for CSV format
          const timestamp = l.timestamp || '';
          const auditId = l.auditId || l.id || '';
          const mod = l.module || l.entityType || '';
          const act = l.action || '';
          const perfBy = l.performedBy || l.userEmail || '';
          const role = l.role || '';
          const branch = l.branch || l.selectedBranch || '';
          const ip = l.ipAddress || '';
          const sessId = l.sessionId || '';
          const reason = (l.changeReason || '').replace(/"/g, '""');
          const signature = (l.signatureMeaning || '').replace(/"/g, '""');
          return `"${timestamp}","${auditId}","${mod}","${act}","${perfBy}","${role}","${branch}","${ip}","${sessId}","${reason}","${signature}"`;
        }).join("\n");
        
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `batch_process_audit_trail_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Batch process audit logs exported successfully to CSV");
    } catch (err) {
      toast.error("Failed to export audit logs");
    }
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full w-fit">
            <Activity className="w-3 h-3" />
            GMP / GDP Operational Logs
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-2">Batch Process Audit Trail</h1>
          <p className="text-slate-500 mt-1">Immutable product lifecycle, recipe approvals, printing controls, and manufacturing workflow signatures.</p>
        </div>
        
        <div className="flex items-center gap-3">
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 h-12 shadow-lg shadow-indigo-100"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Audit Data
          </Button>
        </div>
      </header>

      {/* FILTER PANEL */}
      <Card className="border border-slate-100 shadow-sm rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-6 space-y-6">
          {/* Top Row: Search & User Filter */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2 ml-1">Search Keywords, signatures or IDs</span>
              <form onSubmit={handleKeywordSearch} className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search by keywords, signature, or record IDs..." 
                  className="pl-11 h-12 w-full rounded-2xl bg-slate-50 border border-slate-100 text-slate-800 placeholder:text-slate-400 focus-visible:ring-indigo-500 font-medium"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </form>
            </div>

            <div className="lg:col-span-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2 ml-1">Filter specifically by User Email</span>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Filter specifically by User Email..."
                  className="pl-11 h-12 w-full rounded-2xl bg-slate-50 border border-slate-100 text-slate-800 placeholder:text-slate-400 focus-visible:ring-indigo-500 font-medium"
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
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-3 ml-1">Operational Audit Filters</span>
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

          {/* Active states / Refresh & Clear action */}
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
                className="h-9 rounded-xl px-4 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 text-xs font-semibold"
              >
                Clear All Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TABLE PANEL */}
      <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="pl-8 w-44">Timestamp</TableHead>
                <TableHead>User & Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead className="w-56">Branch & ID</TableHead>
                <TableHead className="w-64">21 CFR Electronic Signature</TableHead>
                <TableHead className="pr-8">Audit State Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      <p className="text-slate-400 text-xs font-medium">Fetching batch process database logs...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredLogs.map((log) => (
                <TableRow key={log.id || log.auditId} className="group hover:bg-slate-50/50 border-slate-50 transition-colors">
                  <TableCell className="pl-8">
                    <div className="flex flex-col text-slate-500 font-mono text-[11px] space-y-0.5">
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                        <Calendar className="w-3. h-3 text-indigo-400" />
                        {new Date(log.timestamp).toLocaleDateString()}
                      </div>
                      <div className="ml-4 text-slate-400 text-[10px]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600 border border-slate-200">
                        {(log.performedBy || log.userEmail || 'S')[0].toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-900 truncate max-w-[160px]">
                          <HighlightText text={log.performedBy || log.userEmail || ''} search={search || userEmailSearch} />
                        </span>
                        <span className="text-[10px] text-indigo-600 font-bold tracking-wider uppercase">{(log as any).functionalRole || log.role || 'USER'}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-tight whitespace-nowrap">
                      <HighlightText text={(log.action || '').replace(/_/g, ' ')} search={search} />
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                      <HighlightText text={log.module || log.entityType || 'N/A'} search={search} />
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-[11px]">
                      <span className="text-slate-600 font-semibold">
                        <HighlightText text={log.branch || log.selectedBranch || 'N/A'} search={search} />
                      </span>
                      <span className="font-mono text-slate-400 mt-0.5 truncate max-w-[155px]">
                        ID: <HighlightText text={log.entityId || 'N/A'} search={search} />
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.signatureId ? (
                      <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-3 space-y-1.5 max-w-[240px]">
                        <div className="flex items-center gap-1.5 text-amber-700 font-black text-[9px] uppercase tracking-wider">
                          <History className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                          Certified ESig applied
                        </div>
                        <p className="text-[10px] text-slate-600 leading-relaxed italic line-clamp-2">
                          "<HighlightText text={log.signatureMeaning || ''} search={search} />"
                        </p>
                        <div className="flex items-center gap-2 pt-1 border-t border-amber-100/50 mt-1 justify-between">
                          <span className="text-[8px] text-slate-400 font-mono">IP: {log.ipAddress || 'Client'}</span>
                          <span className="text-[8px] text-amber-600 font-bold">SHA-256 Validated</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-300 italic">No signature applied</span>
                    )}
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
                          <span className="text-slate-800 font-mono text-[9px] break-all line-clamp-2 font-medium">{JSON.stringify(log.newValue)}</span>
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
                    No matching GAMP batch process audit trail records found.
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
