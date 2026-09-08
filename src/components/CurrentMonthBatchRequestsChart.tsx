import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  BarChart3, 
  PieChart as PieChartIcon, 
  TrendingUp, 
  ArrowUpRight, 
  RefreshCw, 
  FileText, 
  ExternalLink, 
  Layers, 
  ChevronRight,
  Filter,
  CheckCircle,
  AlertTriangle,
  FileCheck2,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import api from '../services/api';

interface MonthlyBatchData {
  month: number;
  year: number;
  monthName: string;
  monthYearLabel: string;
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    pendingPercentage: number;
    approvedPercentage: number;
    rejectedPercentage: number;
    approvalRate: number;
  };
  distribution: Array<{
    name: string;
    value: number;
    percentage: number;
    color: string;
  }>;
  dailyBreakdown: Array<{
    day: number;
    date: string;
    label: string;
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  }>;
  categoryStatusDetails: {
    pending: Record<string, number>;
    approved: Record<string, number>;
    rejected: Record<string, number>;
  };
  batches: Array<{
    id: string;
    batchNumber: string;
    productId: string;
    productName: string;
    stage: string;
    status: string;
    category: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    manufacturingDate: string;
    branch: string;
    reason: string | null;
  }>;
}

interface Props {
  selectedBranch?: string;
  onRefreshParent?: () => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Color palette specifically designed for clean visual contrast
const STATUS_COLORS = {
  pending: "#f59e0b",   // Warm Amber / Gold
  approved: "#10b981",  // Emerald Green
  rejected: "#f43f5e",  // Rose Red
};

export default function CurrentMonthBatchRequestsChart({ selectedBranch, onRefreshParent }: Props) {
  const navigate = useNavigate();
  const currentDate = useMemo(() => new Date(), []);
  
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [activeTab, setActiveTab] = useState<'distribution' | 'timeline' | 'cumulative' | 'records'>('distribution');
  const [recordFilter, setRecordFilter] = useState<'ALL' | 'pending' | 'approved' | 'rejected'>('ALL');
  
  const [monthlyData, setMonthlyData] = useState<MonthlyBatchData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isHoveredPieIndex, setIsHoveredPieIndex] = useState<number | null>(null);

  // ResizeObserver reference to ensure Recharts always has non-zero bounding dimensions
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    if (!chartWrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 50) {
          setChartReady(true);
        }
      }
    });
    observer.observe(chartWrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const isCurrentMonth = useMemo(() => {
    return selectedMonth === currentDate.getMonth() && selectedYear === currentDate.getFullYear();
  }, [selectedMonth, selectedYear, currentDate]);

  const fetchMonthlyData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/dashboard/monthly-batch-requests', {
        params: {
          month: selectedMonth,
          year: selectedYear
        }
      });
      if (response.data.success) {
        setMonthlyData(response.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch monthly batch requests data', err);
      // Fallback: build minimal structure to avoid crashing
      const fallbackMonthName = MONTH_NAMES[selectedMonth] || "Current Month";
      setMonthlyData({
        month: selectedMonth,
        year: selectedYear,
        monthName: fallbackMonthName,
        monthYearLabel: `${fallbackMonthName} ${selectedYear}`,
        summary: { total: 0, pending: 0, approved: 0, rejected: 0, pendingPercentage: 0, approvedPercentage: 0, rejectedPercentage: 0, approvalRate: 0 },
        distribution: [
          { name: "Pending", value: 0, percentage: 0, color: STATUS_COLORS.pending },
          { name: "Approved", value: 0, percentage: 0, color: STATUS_COLORS.approved },
          { name: "Rejected", value: 0, percentage: 0, color: STATUS_COLORS.rejected }
        ],
        dailyBreakdown: [],
        categoryStatusDetails: { pending: {}, approved: {}, rejected: {} },
        batches: []
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyData();
  }, [selectedMonth, selectedYear, selectedBranch]);

  // Filter batches for the table/cards view
  const filteredBatches = useMemo(() => {
    if (!monthlyData?.batches) return [];
    if (recordFilter === 'ALL') return monthlyData.batches;
    return monthlyData.batches.filter(b => b.category === recordFilter);
  }, [monthlyData, recordFilter]);

  // Compute cumulative daily data for the cumulative chart view
  const cumulativeData = useMemo(() => {
    if (!monthlyData?.dailyBreakdown) return [];
    let runPending = 0;
    let runApproved = 0;
    let runRejected = 0;

    return monthlyData.dailyBreakdown.map(item => {
      runPending += item.pending;
      runApproved += item.approved;
      runRejected += item.rejected;
      return {
        label: item.label,
        day: item.day,
        date: item.date,
        pending: runPending,
        approved: runApproved,
        rejected: runRejected,
        total: runPending + runApproved + runRejected
      };
    });
  }, [monthlyData]);

  // Only days that have activity or every 3-5 days for cleaner axis rendering on mobile
  const formattedTimelineData = useMemo(() => {
    if (!monthlyData?.dailyBreakdown) return [];
    // Show all days in month
    return monthlyData.dailyBreakdown;
  }, [monthlyData]);

  const summary = monthlyData?.summary || {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    pendingPercentage: 0,
    approvedPercentage: 0,
    rejectedPercentage: 0,
    approvalRate: 0
  };

  // Custom Tooltip for Recharts Pie Chart
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const category = data.name.toLowerCase() as 'pending' | 'approved' | 'rejected';
      const subDetails = monthlyData?.categoryStatusDetails?.[category] || {};
      const subEntries = Object.entries(subDetails);

      return (
        <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-800 text-xs space-y-2 min-w-[200px] z-50">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: data.payload.color || '#6366f1' }}
              />
              <span className="font-bold text-sm tracking-wide">{data.name} Requests</span>
            </div>
            <span className="font-extrabold text-sm px-2 py-0.5 rounded-md bg-white/10">
              {data.value}
            </span>
          </div>

          <div className="flex justify-between text-slate-300 text-[11px] pt-1">
            <span>Share of monthly requests:</span>
            <span className="font-bold text-white">{data.payload.percentage}%</span>
          </div>

          {subEntries.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 space-y-1">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Status Sub-Breakdown:</div>
              {subEntries.map(([statusName, count]) => (
                <div key={statusName} className="flex justify-between items-center text-[11px] text-slate-300">
                  <span className="font-mono text-slate-400">{statusName}</span>
                  <span className="font-semibold text-white">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Recharts Bar Chart
  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pendingVal = payload.find((p: any) => p.dataKey === 'pending')?.value || 0;
      const approvedVal = payload.find((p: any) => p.dataKey === 'approved')?.value || 0;
      const rejectedVal = payload.find((p: any) => p.dataKey === 'rejected')?.value || 0;
      const dayTotal = pendingVal + approvedVal + rejectedVal;

      return (
        <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl border border-slate-800 text-xs space-y-2 min-w-[190px] z-50">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-bold text-sm">
            <span>{label}</span>
            <span className="text-slate-400 font-normal text-[11px]">{dayTotal} total</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Pending:
              </span>
              <span className="font-bold font-mono">{pendingVal}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Approved:
              </span>
              <span className="font-bold font-mono">{approvedVal}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-rose-300">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                Rejected:
              </span>
              <span className="font-bold font-mono">{rejectedVal}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <section className="space-y-6" id="current-month-batch-visualization-section">
      {/* Container Card */}
      <Card className="border border-slate-200/80 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.03)] rounded-3xl overflow-hidden">
        {/* Header Bar */}
        <CardHeader className="p-6 md:p-8 border-b border-slate-100 bg-gradient-to-r from-white via-slate-50/40 to-indigo-50/20">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  {isCurrentMonth ? "Current Month Focus" : "Historical Monthly Record"}
                </span>
                {selectedBranch && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    Branch: {selectedBranch}
                  </span>
                )}
              </div>
              <CardTitle className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                <span>Batch Requests Status Analytics</span>
                <span className="text-base font-normal text-slate-500">
                  ({monthlyData?.monthYearLabel || "Current Month"})
                </span>
              </CardTitle>
              <CardDescription className="text-slate-500 text-sm max-w-2xl">
                Breakdown of Pending, Approved, and Rejected batch manufacturing & packaging records issued during this operational cycle.
              </CardDescription>
            </div>

            {/* Month / Year Selectors & Refresh Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Reset to Current Month Shortcut */}
              {!isCurrentMonth && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedMonth(currentDate.getMonth());
                    setSelectedYear(currentDate.getFullYear());
                  }}
                  className="rounded-full text-xs font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                >
                  Jump to Current Month
                </Button>
              )}

              {/* Month Dropdown */}
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="h-9 px-3.5 pr-8 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none"
                  id="month-selector-dropdown"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={idx} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
              </div>

              {/* Year Dropdown */}
              <div className="relative">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="h-9 px-3 pr-7 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none"
                  id="year-selector-dropdown"
                >
                  {[2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
              </div>

              {/* Refresh Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  fetchMonthlyData();
                  if (onRefreshParent) onRefreshParent();
                }}
                disabled={loading}
                className="h-9 w-9 rounded-xl hover:bg-slate-100 text-slate-600"
                title="Refresh Monthly Statistics"
                id="refresh-monthly-chart-btn"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 md:p-8 space-y-8">
          {/* Top KPI Cards for the Month */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Requests Card */}
            <div 
              onClick={() => setActiveTab('records')}
              className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-all cursor-pointer group"
              id="kpi-total-monthly-requests"
            >
              <div className="flex items-center justify-between text-slate-500 mb-3">
                <span className="text-xs font-bold tracking-wider uppercase">Total Requests</span>
                <span className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 group-hover:scale-105 transition-transform">
                  <FileText className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {summary.total}
                </span>
                <span className="text-xs font-semibold text-slate-500">records</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                All batch sheets initiated in {monthlyData?.monthName || "this month"}
              </p>
            </div>

            {/* Pending Requests Card */}
            <div 
              onClick={() => {
                setActiveTab('records');
                setRecordFilter('pending');
              }}
              className="p-5 rounded-2xl bg-amber-50/50 border border-amber-200/70 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer group relative overflow-hidden"
              id="kpi-pending-monthly-requests"
            >
              <div className="flex items-center justify-between text-amber-700 mb-3">
                <span className="text-xs font-bold tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Pending Review
                </span>
                <span className="p-2 rounded-xl bg-amber-100/70 text-amber-800 group-hover:scale-105 transition-transform">
                  <Clock className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-amber-900 tracking-tight">
                    {summary.pending}
                  </span>
                  <span className="text-xs font-bold text-amber-700">
                    ({summary.pendingPercentage}%)
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/batch-sheet-records/status?status=PENDING_REVIEW');
                  }}
                  className="h-7 px-2 text-[11px] font-bold text-amber-800 hover:bg-amber-100 rounded-lg"
                >
                  Review <ArrowUpRight className="w-3 h-3 ml-0.5" />
                </Button>
              </div>
              <p className="text-xs text-amber-700/80 mt-2">
                Awaiting QA review, authorization, or production handover
              </p>
            </div>

            {/* Approved Requests Card */}
            <div 
              onClick={() => {
                setActiveTab('records');
                setRecordFilter('approved');
              }}
              className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/70 hover:border-emerald-300 hover:shadow-sm transition-all cursor-pointer group relative overflow-hidden"
              id="kpi-approved-monthly-requests"
            >
              <div className="flex items-center justify-between text-emerald-700 mb-3">
                <span className="text-xs font-bold tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Approved / Active
                </span>
                <span className="p-2 rounded-xl bg-emerald-100/70 text-emerald-800 group-hover:scale-105 transition-transform">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-emerald-900 tracking-tight">
                    {summary.approved}
                  </span>
                  <span className="text-xs font-bold text-emerald-700">
                    ({summary.approvedPercentage}%)
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/batch-sheet-records/completed');
                  }}
                  className="h-7 px-2 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 rounded-lg"
                >
                  Completed <ArrowUpRight className="w-3 h-3 ml-0.5" />
                </Button>
              </div>
              <div className="flex items-center justify-between text-xs text-emerald-700/80 mt-2">
                <span>Approval Rate:</span>
                <span className="font-bold text-emerald-800 font-mono">{summary.approvalRate}%</span>
              </div>
            </div>

            {/* Rejected Requests Card */}
            <div 
              onClick={() => {
                setActiveTab('records');
                setRecordFilter('rejected');
              }}
              className="p-5 rounded-2xl bg-rose-50/50 border border-rose-200/70 hover:border-rose-300 hover:shadow-sm transition-all cursor-pointer group relative overflow-hidden"
              id="kpi-rejected-monthly-requests"
            >
              <div className="flex items-center justify-between text-rose-700 mb-3">
                <span className="text-xs font-bold tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Rejected / Returned
                </span>
                <span className="p-2 rounded-xl bg-rose-100/70 text-rose-800 group-hover:scale-105 transition-transform">
                  <XCircle className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-rose-900 tracking-tight">
                    {summary.rejected}
                  </span>
                  <span className="text-xs font-bold text-rose-700">
                    ({summary.rejectedPercentage}%)
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/batch-sheet-records/rejected');
                  }}
                  className="h-7 px-2 text-[11px] font-bold text-rose-800 hover:bg-rose-100 rounded-lg"
                >
                  Rejected <ArrowUpRight className="w-3 h-3 ml-0.5" />
                </Button>
              </div>
              <p className="text-xs text-rose-700/80 mt-2">
                Returned for correction or QA rejected
              </p>
            </div>
          </div>

          {/* Visualization Controls & View Switcher */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700">
              <button
                onClick={() => setActiveTab('distribution')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'distribution'
                    ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                id="btn-tab-status-distribution"
              >
                <PieChartIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>Status Distribution</span>
              </button>

              <button
                onClick={() => setActiveTab('timeline')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'timeline'
                    ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                id="btn-tab-daily-timeline"
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Daily Trajectory</span>
              </button>

              <button
                onClick={() => setActiveTab('cumulative')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'cumulative'
                    ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                id="btn-tab-cumulative-trend"
              >
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                <span>Cumulative Trend</span>
              </button>

              <button
                onClick={() => setActiveTab('records')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'records'
                    ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                id="btn-tab-monthly-records"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>Batch Records ({monthlyData?.batches.length || 0})</span>
              </button>
            </div>

            {/* Quick Status Legend indicator */}
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Pending ({summary.pending})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Approved ({summary.approved})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                Rejected ({summary.rejected})
              </span>
            </div>
          </div>

          {/* Chart Display Area with ResizeObserver Wrapper */}
          <div ref={chartWrapperRef} className="w-full min-h-[340px]">
            {chartReady && (
              <>
                {/* 1. Status Distribution Donut Chart View */}
                {activeTab === 'distribution' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                    <div className="lg:col-span-7 h-[320px] w-full flex items-center justify-center relative">
                      {summary.total === 0 ? (
                        <div className="text-center space-y-2 text-slate-400">
                          <FileText className="w-10 h-10 mx-auto stroke-1 text-slate-300" />
                          <p className="text-sm font-medium">No batch requests recorded in {monthlyData?.monthYearLabel}.</p>
                          <p className="text-xs">Issue a new batch sheet request to begin tracking.</p>
                        </div>
                      ) : (
                        <>
                          <ResponsiveContainer width="100%" height={320}>
                            <PieChart>
                              <Tooltip content={<CustomPieTooltip />} />
                              <Pie
                                data={monthlyData?.distribution || []}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={125}
                                paddingAngle={4}
                                dataKey="value"
                                strokeWidth={2}
                                stroke="#ffffff"
                              >
                                {monthlyData?.distribution.map((entry, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={entry.color} 
                                    className="transition-all duration-300 cursor-pointer hover:opacity-90"
                                  />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>

                          {/* Center Stats Overlay inside Donut */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-mono">
                              {summary.total}
                            </span>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              Batch Requests
                            </span>
                            <span className="text-[10px] text-slate-500 mt-0.5">
                              {monthlyData?.monthName}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Right side: Detailed Sub-Breakdown & Proportions */}
                    <div className="lg:col-span-5 space-y-4">
                      <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-900 text-sm">Monthly Category Breakdown</h4>
                          <span className="text-xs text-slate-400 font-mono">
                            {summary.total} Total
                          </span>
                        </div>

                        {/* Category Progress Bars */}
                        <div className="space-y-3.5">
                          {/* Pending Bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-amber-800 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                Pending Batch Requests
                              </span>
                              <span className="font-mono text-slate-700">
                                {summary.pending} ({summary.pendingPercentage}%)
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-amber-500 rounded-full transition-all duration-700" 
                                style={{ width: `${summary.pendingPercentage}%` }}
                              />
                            </div>
                          </div>

                          {/* Approved Bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-emerald-800 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                Approved / Active Requests
                              </span>
                              <span className="font-mono text-slate-700">
                                {summary.approved} ({summary.approvedPercentage}%)
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-500 rounded-full transition-all duration-700" 
                                style={{ width: `${summary.approvedPercentage}%` }}
                              />
                            </div>
                          </div>

                          {/* Rejected Bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-rose-800 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-rose-500" />
                                Rejected / Returned Requests
                              </span>
                              <span className="font-mono text-slate-700">
                                {summary.rejected} ({summary.rejectedPercentage}%)
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-rose-500 rounded-full transition-all duration-700" 
                                style={{ width: `${summary.rejectedPercentage}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Detailed Sub-Statuses Table */}
                        <div className="pt-3 border-t border-slate-200/80 text-xs">
                          <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500 block mb-2">
                            Active Operational States in {monthlyData?.monthName}:
                          </span>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            {monthlyData?.categoryStatusDetails && Object.entries({
                              ...monthlyData.categoryStatusDetails.pending,
                              ...monthlyData.categoryStatusDetails.approved,
                              ...monthlyData.categoryStatusDetails.rejected
                            }).map(([statusName, cnt]) => (
                              <div key={statusName} className="flex justify-between items-center p-2 rounded-lg bg-white border border-slate-100">
                                <span className="text-slate-600 truncate font-mono text-[10px]">{statusName}</span>
                                <span className="font-extrabold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                  {cnt}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Daily Timeline Bar Chart View */}
                {activeTab === 'timeline' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 px-2">
                      <span>Daily batch request issuances throughout {monthlyData?.monthYearLabel}</span>
                      <span className="font-medium">Grouped by status: Pending, Approved, and Rejected</span>
                    </div>

                    <div className="h-[340px] w-full">
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={formattedTimelineData} margin={{ top: 10, right: 20, left: -20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="day" 
                            stroke="#94a3b8" 
                            fontSize={11} 
                            tickLine={false}
                            axisLine={{ stroke: '#e2e8f0' }}
                            tickFormatter={(day) => `${day}`}
                          />
                          <YAxis 
                            stroke="#94a3b8" 
                            fontSize={11} 
                            tickLine={false} 
                            axisLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip content={<CustomBarTooltip />} />
                          <Legend 
                            verticalAlign="top" 
                            align="right"
                            iconType="circle"
                            wrapperStyle={{ paddingBottom: '16px', fontSize: '12px' }}
                          />
                          <Bar 
                            name="Pending" 
                            dataKey="pending" 
                            fill={STATUS_COLORS.pending} 
                            radius={[4, 4, 0, 0]} 
                            maxBarSize={16}
                          />
                          <Bar 
                            name="Approved" 
                            dataKey="approved" 
                            fill={STATUS_COLORS.approved} 
                            radius={[4, 4, 0, 0]} 
                            maxBarSize={16}
                          />
                          <Bar 
                            name="Rejected" 
                            dataKey="rejected" 
                            fill={STATUS_COLORS.rejected} 
                            radius={[4, 4, 0, 0]} 
                            maxBarSize={16}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 3. Cumulative Area Chart View */}
                {activeTab === 'cumulative' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 px-2">
                      <span>Cumulative progression of batch requests across {monthlyData?.monthYearLabel}</span>
                      <span className="font-medium">Running total over time</span>
                    </div>

                    <div className="h-[340px] w-full">
                      <ResponsiveContainer width="100%" height={340}>
                        <AreaChart data={cumulativeData} margin={{ top: 10, right: 20, left: -20, bottom: 20 }}>
                          <defs>
                            <linearGradient id="approvedGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={STATUS_COLORS.approved} stopOpacity={0.4}/>
                              <stop offset="95%" stopColor={STATUS_COLORS.approved} stopOpacity={0.0}/>
                            </linearGradient>
                            <linearGradient id="pendingGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={STATUS_COLORS.pending} stopOpacity={0.4}/>
                              <stop offset="95%" stopColor={STATUS_COLORS.pending} stopOpacity={0.0}/>
                            </linearGradient>
                            <linearGradient id="rejectedGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={STATUS_COLORS.rejected} stopOpacity={0.4}/>
                              <stop offset="95%" stopColor={STATUS_COLORS.rejected} stopOpacity={0.0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="day" 
                            stroke="#94a3b8" 
                            fontSize={11} 
                            tickLine={false}
                            axisLine={{ stroke: '#e2e8f0' }}
                          />
                          <YAxis 
                            stroke="#94a3b8" 
                            fontSize={11} 
                            tickLine={false} 
                            axisLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip content={<CustomBarTooltip />} />
                          <Legend 
                            verticalAlign="top" 
                            align="right"
                            iconType="circle"
                            wrapperStyle={{ paddingBottom: '16px', fontSize: '12px' }}
                          />
                          <Area 
                            type="monotone" 
                            name="Approved" 
                            dataKey="approved" 
                            stroke={STATUS_COLORS.approved} 
                            fillOpacity={1} 
                            fill="url(#approvedGrad)" 
                            strokeWidth={2.5}
                          />
                          <Area 
                            type="monotone" 
                            name="Pending" 
                            dataKey="pending" 
                            stroke={STATUS_COLORS.pending} 
                            fillOpacity={1} 
                            fill="url(#pendingGrad)" 
                            strokeWidth={2}
                          />
                          <Area 
                            type="monotone" 
                            name="Rejected" 
                            dataKey="rejected" 
                            stroke={STATUS_COLORS.rejected} 
                            fillOpacity={1} 
                            fill="url(#rejectedGrad)" 
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 4. Batch Records List View */}
                {activeTab === 'records' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mr-2">Filter by Status:</span>
                        <button
                          onClick={() => setRecordFilter('ALL')}
                          className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                            recordFilter === 'ALL'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          All ({monthlyData?.batches.length || 0})
                        </button>
                        <button
                          onClick={() => setRecordFilter('pending')}
                          className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                            recordFilter === 'pending'
                              ? 'bg-amber-600 text-white'
                              : 'text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          Pending ({summary.pending})
                        </button>
                        <button
                          onClick={() => setRecordFilter('approved')}
                          className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                            recordFilter === 'approved'
                              ? 'bg-emerald-600 text-white'
                              : 'text-emerald-800 hover:bg-emerald-100'
                          }`}
                        >
                          Approved ({summary.approved})
                        </button>
                        <button
                          onClick={() => setRecordFilter('rejected')}
                          className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                            recordFilter === 'rejected'
                              ? 'bg-rose-600 text-white'
                              : 'text-rose-800 hover:bg-rose-100'
                          }`}
                        >
                          Rejected ({summary.rejected})
                        </button>
                      </div>

                      <span className="text-xs text-slate-400 font-mono">
                        Showing {filteredBatches.length} batch records
                      </span>
                    </div>

                    {filteredBatches.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 space-y-1 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                        <FileText className="w-8 h-8 mx-auto text-slate-300" />
                        <p className="text-sm font-medium">No batch records match the selected category in this month.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                        {filteredBatches.map((batch) => {
                          const isPending = batch.category === 'pending';
                          const isApproved = batch.category === 'approved';
                          const isRejected = batch.category === 'rejected';

                          return (
                            <div 
                              key={batch.id}
                              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                                isPending
                                  ? 'bg-amber-50/30 border-amber-200/60 hover:border-amber-300'
                                  : isApproved
                                  ? 'bg-emerald-50/30 border-emerald-200/60 hover:border-emerald-300'
                                  : 'bg-rose-50/30 border-rose-200/60 hover:border-rose-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-sm text-slate-900 font-mono tracking-tight">
                                      {batch.batchNumber}
                                    </span>
                                    <Badge 
                                      className={`text-[10px] uppercase font-bold py-0.5 px-2 rounded-full border ${
                                        isPending
                                          ? 'bg-amber-100/80 text-amber-800 border-amber-300'
                                          : isApproved
                                          ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300'
                                          : 'bg-rose-100/80 text-rose-800 border-rose-300'
                                      }`}
                                    >
                                      {batch.status.replace(/_/g, ' ')}
                                    </Badge>
                                  </div>
                                  <p className="text-xs font-semibold text-slate-700 mt-1 truncate max-w-[260px]">
                                    {batch.productName}
                                  </p>
                                </div>

                                <span className="text-[11px] font-mono text-slate-400 shrink-0">
                                  {new Date(batch.createdAt).toLocaleDateString()}
                                </span>
                              </div>

                              {batch.reason && (
                                <p className="text-[11px] text-rose-700 italic bg-rose-50 p-2 rounded-lg border border-rose-100">
                                  Reason: {batch.reason}
                                </p>
                              )}

                              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                  Stage: {batch.stage} • {batch.branch}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (isApproved) {
                                      navigate(`/batch-sheet-records/completed`);
                                    } else if (isRejected) {
                                      navigate(`/batch-sheet-records/rejected`);
                                    } else {
                                      navigate(`/batch-sheet-records/status?status=${batch.status}`);
                                    }
                                  }}
                                  className="h-6 px-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg gap-1"
                                >
                                  View Flow <ChevronRight className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
