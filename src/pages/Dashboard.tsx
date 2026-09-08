import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Activity, 
  CheckCircle2, 
  Package, 
  TrendingUp, 
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Plus,
  ArrowRight,
  RotateCcw,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '../components/ui/dialog';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  Cell
} from "recharts";
import { motion } from "motion/react";
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { LoadingPage } from '../components/LoadingSpinner';
import { getUserBaseRole } from '../types';
import { DashboardMetricsSummary } from '../components/DashboardMetricsSummary';
import CurrentMonthBatchRequestsChart from '../components/CurrentMonthBatchRequestsChart';

export default function Dashboard() {
  const { user } = useAuth();
  const { selectedBranch, setSelectedBranch, allowedBranches, canSwitchBranch } = useBranch();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [productUsage, setProductUsage] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [productMasters, setProductMasters] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllProductsModal, setShowAllProductsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [velocityMode, setVelocityMode] = useState<'30days' | 'month' | 'year'>('30days');
  const [selectedVelocityMonth, setSelectedVelocityMonth] = useState<number>(new Date().getMonth());
  const [selectedVelocityYear, setSelectedVelocityYear] = useState<number>(new Date().getFullYear());
  const [loadingTrends, setLoadingTrends] = useState(false);

  // ResizeObserver state to guarantee container width is > 0 before rendering charts
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    const el = containerRef.current;
    if (!el) return;

    let timeoutId: any = null;
    const observer = new ResizeObserver((entries) => {
      if (!entries || !entries[0]) return;
      const { width } = entries[0].contentRect;
      if (width > 0) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setContainerWidth(width);
        }, 150);
      }
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loading]);

  const fetchDashboardData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, usageRes, recentRes, pendingRes, productsRes] = await Promise.all([
        api.get("/dashboard/summary"),
        api.get("/dashboard/product-usage"),
        api.get("/dashboard/recent-activities"),
        api.get("/batches?status=PENDING_REVIEW"),
        api.get("/product-masters")
      ]);

      if (summaryRes.data.success) setSummary(summaryRes.data.data);
      if (usageRes.data.success) setProductUsage(usageRes.data.data);
      if (recentRes.data.success) setRecentActivities(recentRes.data.data);
      if (pendingRes.data.success) setPendingRequests(pendingRes.data.data);
      if (productsRes.data.success) setProductMasters(productsRes.data.data);
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const fetchTrends = async () => {
      setLoadingTrends(true);
      try {
        let url = "/dashboard/batch-trends?range=30days";
        if (velocityMode === 'month') {
          const startDate = new Date(Date.UTC(selectedVelocityYear, selectedVelocityMonth, 1, 0, 0, 0)).toISOString();
          const endDate = new Date(Date.UTC(selectedVelocityYear, selectedVelocityMonth + 1, 0, 23, 59, 59, 999)).toISOString();
          url = `/dashboard/batch-trends?range=custom&startDate=${startDate}&endDate=${endDate}`;
        } else if (velocityMode === 'year') {
          const startDate = new Date(Date.UTC(selectedVelocityYear, 0, 1, 0, 0, 0)).toISOString();
          const endDate = new Date(Date.UTC(selectedVelocityYear, 11, 31, 23, 59, 59, 999)).toISOString();
          url = `/dashboard/batch-trends?range=custom&startDate=${startDate}&endDate=${endDate}`;
        }

        const res = await api.get(url);
        if (res.data.success) {
          setTrends(res.data.data);
        }
      } catch (err) {
        console.error("Failed to fetch trends", err);
      } finally {
        setLoadingTrends(false);
      }
    };

    fetchTrends();
  }, [velocityMode, selectedVelocityMonth, selectedVelocityYear, selectedBranch]);

  const processedTrends = React.useMemo(() => {
    if (velocityMode === 'year') {
      const monthlyCounts: Record<string, number> = {};
      const monthsList = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      monthsList.forEach(m => {
        monthlyCounts[m] = 0;
      });

      trends.forEach((t: any) => {
        const d = new Date(t.date);
        if (!isNaN(d.getTime())) {
          const mLabel = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
          if (monthlyCounts[mLabel] !== undefined) {
            monthlyCounts[mLabel] += t.count;
          }
        }
      });

      return monthsList.map(m => ({
        displayDate: m,
        count: monthlyCounts[m],
        rawDate: m
      }));
    } else {
      if (velocityMode === 'month') {
        const daysInMonth = new Date(selectedVelocityYear, selectedVelocityMonth + 1, 0).getDate();
        const dailyCounts: Record<string, number> = {};
        
        for (let i = 1; i <= daysInMonth; i++) {
          const dayStr = `${selectedVelocityYear}-${String(selectedVelocityMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
          dailyCounts[dayStr] = 0;
        }

        trends.forEach((t: any) => {
          if (dailyCounts[t.date] !== undefined) {
            dailyCounts[t.date] = t.count;
          }
        });

        return Object.entries(dailyCounts).map(([date, count]) => ({
          displayDate: date,
          count,
          rawDate: date
        }));
      }

      return trends.map((t: any) => ({
        displayDate: t.date,
        count: t.count,
        rawDate: t.date
      }));
    }
  }, [trends, velocityMode, selectedVelocityMonth, selectedVelocityYear]);

  if (loading) {
    return <LoadingPage label="Initializing command center..." />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm tracking-wider uppercase">
            <Activity className="w-4 h-4" />
            Live Operations
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            Command Center
          </h1>
          <p className="text-slate-500 text-lg max-w-2xl">
            Real-time oversight of batch manufacturing cycles and compliance metrics.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {canSwitchBranch ? (
            <div className="bg-slate-100 p-1 rounded-full flex items-center gap-1 border border-slate-200" id="branch-selection-picker">
              {["Masulkhana", "Baddi"].map((br) => {
                const isActive = selectedBranch === br;
                return (
                  <button
                    key={br}
                    onClick={() => setSelectedBranch(br)}
                    disabled={!allowedBranches.includes(br)}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all duration-300 ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-md scale-102 font-bold'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                    } ${!allowedBranches.includes(br) ? 'opacity-30 cursor-not-allowed' : ''}`}
                    id={`branch-btn-${br}`}
                  >
                    {br}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-150 rounded-full px-4 py-1.5 text-xs font-semibold text-slate-500" id="branch-badge-display">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Branch</span>
              <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                {selectedBranch || 'None'}
              </span>
            </div>
          )}

          {(user?.permissions?.includes('batch:create') || getUserBaseRole(user) === 'ADMIN') && (
            <Button 
              onClick={() => navigate('/batches')} 
              className="bg-slate-900 hover:bg-slate-800 text-white px-6 h-12 rounded-full transition-all hover:scale-105 active:scale-95 shadow-xl shadow-slate-200"
              id="new-batch-sheet-req-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Batch Sheet Request
            </Button>
          )}
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium border border-emerald-100" id="system-active-indicator">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            System Active
          </div>
        </div>
      </header>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          label="Total Batch Records" 
          value={summary?.batch_summary.TOTAL || 0} 
          trend="+12%"
          trendUp={true}
          icon={<ClipboardList className="w-5 h-5" />}
          description="Cumulative issuance"
          color="indigo"
          onClick={() => navigate('/batch-sheet-records/status?status=ALL')}
        />
        <MetricCard 
          label="Pending Review" 
          value={summary?.batch_summary.PENDING_REVIEW !== undefined ? summary.batch_summary.PENDING_REVIEW : pendingRequests.length} 
          trend="QA Review"
          trendUp={true}
          icon={<Clock className="w-5 h-5" />}
          description="Awaiting approval"
          color="rose"
          onClick={() => navigate('/batch-sheet-records/status?status=PENDING_REVIEW')}
        />
        <MetricCard 
          label="In Progress" 
          value={summary?.batch_summary.IN_PROGRESS || 0} 
          trend="Active"
          trendUp={true}
          icon={<Activity className="w-5 h-5" />}
          description="Currently on floor"
          color="amber"
          onClick={() => navigate('/batch-sheet-records/status?status=IN_PROGRESS')}
        />
        <MetricCard 
          label="Completed Batch Sheets" 
          value={summary?.batch_summary.COMPLETED || 0} 
          trend="+5.2%"
          trendUp={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          description="Finalized records"
          color="emerald"
          onClick={() => navigate('/batch-sheet-records/completed')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Trend Visualization */}
        <Card className="lg:col-span-2 border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl overflow-hidden">
          <CardHeader className="px-8 pt-8 pb-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold text-slate-900">Production Velocity</CardTitle>
                <CardDescription className="text-slate-500">
                  {velocityMode === '30days' && "Daily batch issuance volume over last 30 days"}
                  {velocityMode === 'month' && `Daily batch issuance volume for ${new Date(selectedVelocityYear, selectedVelocityMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}`}
                  {velocityMode === 'year' && `Monthly batch issuance volume for the year ${selectedVelocityYear}`}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Mode Selector */}
                <select
                  value={velocityMode}
                  onChange={(e: any) => setVelocityMode(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="30days">Last 30 Days</option>
                  <option value="month">Selected Month</option>
                  <option value="year">Selected Year</option>
                </select>

                {/* Month Dropdown (only visible when month is selected) */}
                {velocityMode === 'month' && (
                  <select
                    value={selectedVelocityMonth}
                    onChange={(e: any) => setSelectedVelocityMonth(Number(e.target.value))}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {[
                      "January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"
                    ].map((mName, idx) => (
                      <option key={idx} value={idx}>{mName}</option>
                    ))}
                  </select>
                )}

                {/* Year Dropdown (visible when month or year is selected) */}
                {velocityMode !== '30days' && (
                  <select
                    value={selectedVelocityYear}
                    onChange={(e: any) => setSelectedVelocityYear(Number(e.target.value))}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {[2024, 2025, 2026, 2027].map((yr) => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                )}
                
                {loadingTrends && (
                  <span className="text-[10px] text-slate-400 font-bold uppercase animate-pulse">Loading...</span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div ref={containerRef} className="w-full h-[300px] mt-6 flex items-center justify-center min-w-0 min-h-[300px] relative">
              {containerWidth && containerWidth > 0 ? (
                <ResponsiveContainer width={containerWidth} height={300} minWidth={0} minHeight={300} debounce={50}>
                  <AreaChart data={processedTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="displayDate" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                      dy={10}
                      tickFormatter={(val) => {
                        if (velocityMode === 'year') {
                          return val;
                        }
                        try {
                          return new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        } catch (e) {
                          return val;
                        }
                      }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                    />
                    <Tooltip 
                      content={<CustomTooltip velocityMode={velocityMode} selectedVelocityYear={selectedVelocityYear} />}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#6366f1" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#velocityGradient)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-slate-400 font-medium text-xs">Awaiting space calibration...</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Secondary Metric: Product Distribution */}
        <Card 
          className="border-none bg-slate-900 text-white shadow-2xl rounded-3xl overflow-hidden flex flex-col justify-between"
        >
          <div>
            <CardHeader className="px-8 pt-8 flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-xl font-bold">Product Utilization</CardTitle>
                <CardDescription className="text-slate-400">Top 5 products by manufacturing frequency</CardDescription>
              </div>
              <button 
                onClick={() => navigate('/product-masters')}
                className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer group"
                title="View Product Masters"
              >
                <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </CardHeader>
            <CardContent className="px-8 pb-6">
              <div className="space-y-6 mt-4">
                {productUsage.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-200 truncate pr-4">{item.name}</span>
                      <span className="font-bold text-indigo-400">{item.count}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.count / (productUsage[0]?.count || 1)) * 100}%` }}
                        transition={{ duration: 1, delay: idx * 0.1 }}
                        className="h-full bg-indigo-500 rounded-full"
                      />
                    </div>
                  </div>
                ))}
                {productUsage.length === 0 && (
                  <div className="py-12 text-center text-slate-500 italic">No usage data available.</div>
                )}
              </div>
            </CardContent>
          </div>

          {productUsage.length > 0 && (
            <div className="px-8 pb-8 pt-2 flex justify-center">
              <Button 
                onClick={() => {
                  setSearchQuery("");
                  setShowAllProductsModal(true);
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.02] text-white font-bold text-xs tracking-wider uppercase py-2.5 rounded-2xl transition-all duration-300"
              >
                Show All Products
              </Button>
            </div>
          )}
        </Card>

        {/* Show All Products Dialog */}
        <Dialog open={showAllProductsModal} onOpenChange={setShowAllProductsModal}>
          <DialogContent className="sm:max-w-2xl w-full max-h-[85vh] flex flex-col rounded-3xl p-6 bg-white border border-slate-100 text-slate-900 shadow-2xl overflow-hidden">
            <DialogHeader className="border-b border-slate-100 pb-4 mb-3 bg-white shrink-0">
              <DialogTitle className="text-2xl font-bold text-slate-900 tracking-tight">
                Active Products Manufacturing Frequency
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-sm mt-1">
                Complete inventory of active products and their cumulative batch manufacturing frequency
              </DialogDescription>
            </DialogHeader>

            {/* Search bar */}
            <div className="mb-3 shrink-0">
              <input
                type="text"
                placeholder="Search active products by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 placeholder-slate-400 text-sm"
              />
            </div>

            <ScrollArea className="flex-1 min-h-[200px] max-h-[50vh] pr-2 overflow-y-auto">
              <div className="space-y-3 pr-2">
                {productUsage
                  .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((item, idx) => {
                    const maxCount = productUsage[0]?.count || 1;
                    const percent = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                    return (
                      <div key={idx} className="space-y-2 p-4 bg-slate-50/60 rounded-2xl border border-slate-100 hover:bg-slate-50/100 transition-all">
                        <div className="flex justify-between text-sm items-center">
                          <span className="font-bold text-slate-800 truncate pr-4">{item.name}</span>
                          <span className="font-extrabold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full text-xs shrink-0">
                            {item.count} batches
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            style={{ width: `${percent}%` }}
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                {productUsage.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <div className="py-12 text-center text-slate-400 italic">No matching products found.</div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="mt-4 pt-3 border-t border-slate-100 flex justify-end shrink-0">
              <Button 
                onClick={() => {
                  setShowAllProductsModal(false);
                  setSearchQuery("");
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs tracking-wider uppercase py-2.5 px-6 rounded-full cursor-pointer"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current Month Batch Requests Visualization Section (Recharts) */}
      <CurrentMonthBatchRequestsChart 
        selectedBranch={selectedBranch} 
        onRefreshParent={fetchDashboardData} 
      />

      {/* Key Metrics Summary Component & 7-Day Operational Dynamics Visualizer */}
      <DashboardMetricsSummary 
        selectedBranch={selectedBranch} 
        summaryData={summary} 
        pendingRequests={pendingRequests} 
      />

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Recent Activity</h3>
            <Button variant="link" onClick={() => navigate('/audit')} className="text-indigo-600 font-semibold">
              View Audit Trail
            </Button>
          </div>
          <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-100 overflow-hidden">
            <div className="divide-y divide-slate-50">
              {recentActivities.map((log) => (
                <div key={log.id} className="p-6 hover:bg-slate-50/50 transition-colors group">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-2xl ${getActionColor(log.action)} shadow-sm group-hover:scale-110 transition-transform`}>
                        {getActionIcon(log.action)}
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-900 leading-tight">
                          {log.action.replace(/_/g, ' ')}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-medium text-slate-500">{log.userEmail}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-xs text-slate-400">{log.entityType}: {log.entityId}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-tighter">
                        {new Date(log.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {recentActivities.length === 0 && (
                <div className="p-12 text-center text-slate-400 italic">No recent activity found.</div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions / Status Summary */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-slate-900 tracking-tight mb-6">Quick Insights</h3>
          <Card className="border-none bg-indigo-600 text-white rounded-3xl p-8 shadow-xl shadow-indigo-200">
            <div className="space-y-6">
              <div className="p-3 bg-white/20 rounded-2xl w-fit">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-3xl font-bold">98.4%</h4>
                <p className="text-indigo-100 text-sm mt-1">Compliance Rate this month</p>
              </div>
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-indigo-100">Target Goal</span>
                  <span className="font-bold">95.0%</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-white rounded-full w-[98.4%]" />
                </div>
              </div>
            </div>
          </Card>
          
          <Card className="border-none bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h4 className="font-bold text-slate-900 mb-4">Pending Approvals</h4>
            <div className="space-y-4">
              {pendingRequests.length === 0 ? (
                <div className="text-sm text-slate-400 italic py-4 text-center">No pending Requests at the moment.</div>
              ) : (
                pendingRequests.map(batch => {
                  const product = productMasters.find(p => p.id === batch.productId);
                  const productName = product?.title || 'Unknown Product';
                  return (
                    <div key={batch.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{batch.batchNumber}</p>
                        <p className="text-xs text-slate-500 truncate">{productName}</p>
                      </div>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="rounded-full hover:bg-white"
                        onClick={() => navigate(`/batches/${batch.id}`)}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const MetricCard = ({ label, value, trend, trendUp, icon, description, color, onClick }: any) => {
  const colors: any = {
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 300 }}
      onClick={onClick}
      className={onClick ? "cursor-pointer" : ""}
    >
      <Card className="border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.03)] rounded-3xl p-8 group transition-all hover:shadow-xl hover:bg-slate-50/50">
        <div className="flex justify-between items-start mb-6">
          <div className={`p-4 rounded-2xl ${colors[color]} border transition-transform group-hover:scale-110`}>
            {icon}
          </div>
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend}
          </div>
        </div>
        <div>
          <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-1">
            {value.toLocaleString()}
          </h3>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{label}</p>
          <p className="text-xs text-slate-400 mt-2 font-medium">{description}</p>
        </div>
      </Card>
    </motion.div>
  );
};

const CustomTooltip = ({ active, payload, label, velocityMode, selectedVelocityYear }: any) => {
  if (active && payload && payload.length) {
    let formattedLabel = label;
    if (velocityMode === 'year') {
      formattedLabel = `${label} ${selectedVelocityYear}`;
    } else {
      try {
        formattedLabel = new Date(label).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
      } catch (e) {
        formattedLabel = label;
      }
    }

    return (
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-white/10 backdrop-blur-md">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">
          {formattedLabel}
        </p>
        <p className="text-xl font-black text-white">
          {payload[0].value} <span className="text-xs font-normal text-slate-400 ml-1">Records</span>
        </p>
      </div>
    );
  }
  return null;
};

const getActionIcon = (action: string) => {
  if (action.includes("ISSUE")) return <ClipboardList className="w-5 h-5" />;
  if (action.includes("START")) return <Activity className="w-5 h-5" />;
  if (action.includes("COMPLETE")) return <CheckCircle2 className="w-5 h-5" />;
  if (action.includes("CANCEL")) return <XCircle className="w-5 h-5" />;
  if (action.includes("RETURN")) return <RotateCcw className="w-5 h-5" />;
  return <AlertCircle className="w-5 h-5" />;
};

const getActionColor = (action: string) => {
  if (action.includes("ISSUE")) return "bg-indigo-50 text-indigo-600";
  if (action.includes("START")) return "bg-amber-50 text-amber-600";
  if (action.includes("COMPLETE")) return "bg-emerald-50 text-emerald-600";
  if (action.includes("CANCEL")) return "bg-rose-50 text-rose-600";
  if (action.includes("RETURN")) return "bg-slate-50 text-slate-600";
  return "bg-slate-50 text-slate-600";
};
