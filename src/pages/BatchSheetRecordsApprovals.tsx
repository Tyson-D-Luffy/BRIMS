import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { LoadingPage } from '../components/LoadingSpinner';
import { cn } from '../lib/utils';
import { HighlightText } from '../components/HighlightText';

export default function BatchSheetRecordsApprovals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPending = async () => {
    setLoading(true);
    try {
      const response = await api.get('/approvals/pending');
      if (response.data.success) {
        setPendingApprovals(response.data.data);
      }
      try {
        const usersResponse = await api.get('/users');
        if (usersResponse.data.success) {
          setUsers(usersResponse.data.data);
        }
      } catch (err) {
        console.warn('Failed to load users for approvals component', err);
      }
    } catch (error: any) {
      console.error('Failed to fetch pending approvals', error);
      toast.error('Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const getUserDisplay = (uidOrStr: string) => {
    if (!uidOrStr) return 'System';
    const found = users.find(u => u.uid === uidOrStr || u.id === uidOrStr || u.email === uidOrStr || u.username === uidOrStr);
    if (found) {
      if (found.employeeId && found.username) {
        return `${found.employeeId} - ${found.username}`;
      }
      if (found.employeeId) {
        return `${found.employeeId} - ${found.username || found.displayName || found.email?.split('@')[0]}`;
      }
      return found.username || found.displayName || found.email?.split('@')[0] || uidOrStr;
    }
    if (uidOrStr.includes('@')) {
      return uidOrStr.split('@')[0];
    }
    return uidOrStr;
  };

  const filteredApprovals = pendingApprovals.filter(approval => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (approval.masterSnapshot?.masterName || '').toLowerCase().includes(q) ||
      (approval.masterSnapshot?.documentNumber || '').toLowerCase().includes(q) ||
      (approval.masterSnapshot?.product?.title || '').toLowerCase().includes(q) ||
      getUserDisplay(approval.createdBy).toLowerCase().includes(q) ||
      (approval.status || '').toLowerCase().replace(/_/g, ' ').includes(q)
    );
  });

  if (loading) return <LoadingPage label="Scanning for pending approvals..." />;

  const isProduction = user?.role === 'PRODUCTION_MANAGER';
  const isQA = user?.role === 'QA';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <button 
            onClick={() => navigate('/batch-sheet-masters')}
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors mb-4 font-bold text-sm bg-slate-50 border border-slate-100 px-4 py-2 rounded-full cursor-pointer hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Batch Sheet Masters
          </button>
          <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm tracking-wider uppercase mb-1">
            <Clock className="w-4 h-4" />
            Compliance Queue
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Record Approvals</h1>
          <p className="text-slate-500 text-lg max-w-2xl mt-1">
            Review and finalize Batch Sheet Records awaiting authorization.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white p-1 rounded-full shadow-sm border border-slate-100">
            <div className="px-4 py-2 text-sm font-bold text-slate-400">Total Pending:</div>
            <div className="px-4 py-2 bg-amber-500 text-white rounded-full text-sm font-black shadow-lg shadow-amber-200">
                {pendingApprovals.length}
            </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search by protocol or document number..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 rounded-2xl bg-slate-50 border-none focus-visible:ring-indigo-500 h-12"
          />
        </div>
        <div className="flex items-center gap-2">
            <Button variant="ghost" className="rounded-full text-slate-400 font-bold px-6 h-12">
                <Filter className="w-4 h-4 mr-2" />
                Refine List
            </Button>
            <Button onClick={fetchPending} variant="ghost" className="rounded-full text-indigo-600 font-bold px-6 h-12 bg-indigo-50 hover:bg-indigo-100">
                Refresh Queue
            </Button>
        </div>
      </div>

      <Card className="border-none shadow-xl rounded-[40px] overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-slate-100/50">
                <TableHead className="pl-10 py-6 text-xs font-black uppercase tracking-widest text-slate-400">Protocol Details</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Version</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Product</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Submission</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-slate-400">Status</TableHead>
                <TableHead className="pr-10 text-right text-xs font-black uppercase tracking-widest text-slate-400">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApprovals.map((approval) => (
                <TableRow key={approval.id} className="group hover:bg-slate-50/50 transition-all border-slate-50">
                  <TableCell className="pl-10 py-8">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-xl shadow-slate-200 group-hover:scale-110 transition-transform">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-black text-slate-900 text-lg leading-tight uppercase tracking-tight">
                          <HighlightText text={approval.masterSnapshot?.masterName} search={searchQuery} />
                        </p>
                        <p className="text-xs font-mono text-slate-400 mt-1">
                          <HighlightText text={approval.masterSnapshot?.documentNumber} search={searchQuery} />
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="px-3 py-1 bg-indigo-50 rounded-lg text-indigo-600 font-black text-[10px] inline-block text-center uppercase">
                          Ver {approval.masterSnapshot?.version}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span className="font-bold text-slate-700">
                          <HighlightText text={approval.masterSnapshot?.product?.title || 'Unknown Product'} search={searchQuery} />
                        </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-900">
                          <HighlightText text={getUserDisplay(approval.createdBy)} search={searchQuery} />
                        </p>
                        <p className="text-xs text-slate-400">{new Date(approval.createdAt).toLocaleDateString()}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {approval.status === 'PENDING_APPROVAL' ? (
                      <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Pending Approval
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-600 border-amber-200 rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
                        <Clock className="w-3 h-3 mr-1" />
                        Under Review
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-10 text-right">
                    <Button 
                      onClick={() => navigate(`/batch-sheet-masters/${approval.masterId}`)}
                      className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-6 h-10 font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-slate-200"
                    >
                      Audit Record
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredApprovals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-96 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-slate-300">
                        <ShieldCheck className="w-20 h-20 opacity-20" />
                        <div>
                            <p className="text-xl font-bold text-slate-400">Queue Cleared</p>
                            <p className="text-sm text-slate-400 mt-1 font-medium">All batch sheet records have been processed.</p>
                        </div>
                    </div>
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
