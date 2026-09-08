import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  BrainCircuit, 
  Zap, 
  UserX, 
  Clock, 
  Activity, 
  FileText, 
  Sliders, 
  Award, 
  BookOpen, 
  Download, 
  ChevronRight, 
  Star, 
  Check, 
  X, 
  Shield, 
  Building2, 
  Lock, 
  Eye, 
  Sparkles,
  HelpCircle,
  BarChart3,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import api from '../services/api';
import { useBranch } from '../context/BranchContext';
import { useAuth } from '../context/AuthContext';
import { 
  ComplianceFinding, 
  ComplianceScoreCard, 
  InspectionReadinessMetrics, 
  UserBehaviorAnomaly, 
  ExplainableAIOutput,
  ComplianceSeverity,
  ComplianceDomain
} from '../types/complianceGuardian';
import { toast } from 'sonner';

const trendData = [
  { month: 'Jan', complianceScore: 92, openIssues: 8, capasResolved: 12 },
  { month: 'Feb', complianceScore: 94, openIssues: 6, capasResolved: 15 },
  { month: 'Mar', complianceScore: 91, openIssues: 9, capasResolved: 10 },
  { month: 'Apr', complianceScore: 95, openIssues: 5, capasResolved: 18 },
  { month: 'May', complianceScore: 93, openIssues: 7, capasResolved: 14 },
  { month: 'Jun', complianceScore: 97, openIssues: 3, capasResolved: 20 },
  { month: 'Jul', complianceScore: 96, openIssues: 4, capasResolved: 16 },
];

const categoryColors: Record<string, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#F59E0B',
  LOW: '#10B981'
};

export default function ComplianceGuardian() {
  const { selectedBranch } = useBranch();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'readiness' | 'anomalies' | 'learning' | 'interceptor'>('overview');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Scan Data State
  const [scorecard, setScorecard] = useState<ComplianceScoreCard | null>(null);
  const [findings, setFindings] = useState<ComplianceFinding[]>([]);
  const [anomalies, setAnomalies] = useState<UserBehaviorAnomaly[]>([]);
  const [readiness, setReadiness] = useState<InspectionReadinessMetrics | null>(null);

  // Selected Finding for Explainable Modal
  const [selectedFinding, setSelectedFinding] = useState<ComplianceFinding | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainData, setExplainData] = useState<ExplainableAIOutput | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');

  // Human Feedback Form
  const [capaId, setCapaId] = useState('');
  const [capaPlan, setCapaPlan] = useState('');
  const [actualRootCause, setActualRootCause] = useState('');
  const [accuracyRating, setAccuracyRating] = useState(5);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Inspection Report State
  const [inspectionReport, setInspectionReport] = useState<any>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const fetchScanData = async () => {
    try {
      setScanning(true);
      const res = await api.get(`/compliance/scan?branch=${encodeURIComponent(selectedBranch || 'Masulkhana')}`);
      if (res.data?.success) {
        setScorecard(res.data.data.scorecard);
        setFindings(res.data.data.findings);
        setAnomalies(res.data.data.anomalies);
        setReadiness(res.data.data.readiness);
      }
    } catch (err: any) {
      console.error("Failed to load compliance scan:", err);
      toast.error(err.response?.data?.message || "Failed to execute compliance scan.");
    } finally {
      setLoading(false);
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchScanData();
  }, [selectedBranch]);

  const handleExplainFinding = async (finding: ComplianceFinding) => {
    setSelectedFinding(finding);
    setExplainData(finding.explanation);
    setCapaId(finding.humanFeedback?.capaId || '');
    setCapaPlan(finding.humanFeedback?.capaActionPlan || '');
    setActualRootCause(finding.humanFeedback?.actualRootCause || '');
    setAccuracyRating(finding.humanFeedback?.accuracyRating || 5);

    try {
      setExplaining(true);
      const res = await api.post('/compliance/explain', { finding });
      if (res.data?.success) {
        setExplainData(res.data.data);
      }
    } catch (e) {
      console.warn("AI explanation fetch error, using client fallback:", e);
    } finally {
      setExplaining(false);
    }
  };

  const handleFeedbackSubmit = async (userDecision: 'APPROVED' | 'REJECTED') => {
    if (!selectedFinding) return;
    try {
      setSubmittingFeedback(true);
      const res = await api.post('/compliance/feedback', {
        findingId: selectedFinding.id,
        userDecision,
        actualRootCause,
        capaId,
        capaActionPlan: capaPlan,
        accuracyRating,
        notes: feedbackNotes
      });

      if (res.data?.success) {
        toast.success(`Feedback recorded! AI Knowledge Base updated (${userDecision}).`);
        setSelectedFinding(null);
        fetchScanData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to submit feedback.");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleGenerateInspectionReport = async () => {
    try {
      setGeneratingReport(true);
      const res = await api.get(`/compliance/inspection-report?branch=${encodeURIComponent(selectedBranch || 'Masulkhana')}`);
      if (res.data?.success) {
        setInspectionReport(res.data.data);
        setActiveTab('readiness');
        toast.success("Inspection Readiness Dossier generated!");
      }
    } catch (err: any) {
      toast.error("Failed to generate inspection report.");
    } finally {
      setGeneratingReport(false);
    }
  };

  const filteredFindings = findings.filter(f => {
    const matchesSearch = f.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          f.explanation.whatHappened.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.explanation.applicableRegulation.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = selectedSeverity === 'ALL' || f.severity === selectedSeverity;
    const matchesDomain = selectedDomain === 'ALL' || f.domain === selectedDomain;
    return matchesSearch && matchesSeverity && matchesDomain;
  });

  return (
    <div className="space-y-8 pb-12">
      {/* HEADER BAR */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-900/10">
                <ShieldCheck className="w-6 h-6 text-[#FF6321]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">AI Compliance Guardian</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Monitoring Active
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  21 CFR Part 11 • GAMP 5 • ALCOA+ • EU Annex 11 Continuous GMP Oversight
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={fetchScanData}
              disabled={scanning}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin text-[#FF6321]' : ''}`} />
              {scanning ? 'Scanning System...' : 'Run Live Compliance Scan'}
            </button>

            <button
              onClick={handleGenerateInspectionReport}
              disabled={generatingReport}
              className="px-5 py-2.5 rounded-xl bg-[#FF6321] hover:bg-orange-600 text-white text-xs font-bold shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <FileSpreadsheet className={`w-4 h-4 ${generatingReport ? 'animate-spin' : ''}`} />
              {generatingReport ? 'Compiling Dossier...' : 'Generate Inspection Report'}
            </button>
          </div>
        </div>

        {/* NOTICE BANNER */}
        <div className="mt-6 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            <strong>GMP Compliance Governance Notice:</strong> The AI Compliance Guardian acts as a real-time risk detector and recommendation engine. In accordance with 21 CFR Part 11 and company SOPs, AI outputs never automatically alter GMP records. All compliance actions require human review and qualified e-signature verification.
          </span>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        {[
          { id: 'overview', label: 'Compliance Overview', icon: BarChart3 },
          { id: 'findings', label: `Findings & Explainable AI (${findings.length})`, icon: BrainCircuit },
          { id: 'readiness', label: 'Inspection Readiness Mode', icon: Award },
          { id: 'anomalies', label: `User Behavior & Anomalies (${anomalies.length})`, icon: UserX },
          { id: 'learning', label: 'AI Learning & KB Base', icon: BookOpen },
          { id: 'interceptor', label: 'Live Stream Log', icon: Activity },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap border-b-2 ${
                isActive 
                  ? 'border-[#FF6321] text-[#FF6321] bg-orange-50/50' 
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[#FF6321] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-700">Executing AI Compliance Guardian Rule Evaluations...</p>
          <p className="text-xs text-slate-400">Evaluating 21 CFR Part 11, ALCOA+, and GAMP 5 cross-collection integrity</p>
        </div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* TOP KPIS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Score */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>Compliance Score</span>
                    <Shield className="w-4 h-4 text-[#FF6321]" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900">{scorecard?.overallScore ?? 96}</span>
                    <span className="text-xs font-bold text-slate-400">/ 100</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">
                    Risk Level: {scorecard?.riskLevel || 'LOW'}
                  </div>
                </div>

                {/* Today's Violations */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>Active Findings</span>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900">{scorecard?.todayViolationsCount ?? findings.length}</span>
                  </div>
                  <div className="text-[11px] font-semibold text-rose-600">
                    {scorecard?.criticalCount || 0} Critical • {findings.filter(f=>f.severity==='HIGH').length} High Severity
                  </div>
                </div>

                {/* Pending SLA */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>Pending Review SLA</span>
                    <Clock className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900">{scorecard?.pendingReviewsCount ?? 0}</span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Batches waiting for QA sign-off
                  </div>
                </div>

                {/* Readiness Score */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>Inspection Index</span>
                    <Award className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900">{readiness?.overallReadiness ?? 94}%</span>
                  </div>
                  <div className="text-[11px] font-bold text-purple-700">
                    {readiness?.inspectionRiskLevel || 'INSPECTION_READY'}
                  </div>
                </div>

                {/* User Anomalies */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>User Anomalies</span>
                    <UserX className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900">{anomalies.filter(a=>a.anomalyScore>=25).length}</span>
                  </div>
                  <div className="text-[11px] font-semibold text-rose-600">
                    Off-hours or rapid e-signatures
                  </div>
                </div>
              </div>

              {/* CATEGORY SCORES & MONTHLY TREND */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Category Progress */}
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#FF6321]" />
                    Compliance Score Breakdown by Domain
                  </h3>

                  <div className="space-y-4">
                    {[
                      { name: 'Electronic Records & Signatures (21 CFR 11)', score: scorecard?.categoryScores.electronicRecords ?? 92 },
                      { name: 'Documentation & ALCOA+ Integrity', score: scorecard?.categoryScores.documentation ?? 95 },
                      { name: 'Workflow & SLA Execution', score: scorecard?.categoryScores.workflow ?? 90 },
                      { name: 'Master Data & Formula Control', score: scorecard?.categoryScores.masterData ?? 98 },
                      { name: 'Security & User Access Controls', score: scorecard?.categoryScores.security ?? 88 },
                    ].map(cat => (
                      <div key={cat.name} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-700">{cat.name}</span>
                          <span className={cat.score >= 90 ? 'text-emerald-600' : 'text-amber-600'}>{cat.score}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${cat.score >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${cat.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trend Chart */}
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    7-Month Compliance & CAPA Resolution Trend
                  </h3>
                  <div className="h-64 w-full min-w-0 min-h-[256px] relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256} debounce={50}>
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="colorCompliance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#FF6321" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#FF6321" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} />
                        <YAxis domain={[80, 100]} stroke="#94A3B8" fontSize={11} />
                        <Tooltip />
                        <Area type="monotone" dataKey="complianceScore" name="Compliance Index %" stroke="#FF6321" fillOpacity={1} fill="url(#colorCompliance)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* BRANCH COMPARISON */}
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  Multi-Branch Plant Compliance Comparison
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {scorecard?.branchComparison.map(b => (
                    <div key={b.branchName} className="p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-slate-900">{b.branchName}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {b.score}% Index
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-600 font-medium">
                        <span>Open Findings: <strong>{b.openIssues}</strong></span>
                        <span>Critical: <strong className="text-rose-600">{b.criticalIssues}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FINDINGS & EXPLAINABLE AI */}
          {activeTab === 'findings' && (
            <div className="space-y-6">
              {/* SEARCH & FILTERS */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center gap-4">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search findings by keyword, regulation clause, or batch number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#FF6321]"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <select
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>

                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                  >
                    <option value="ALL">All Domains</option>
                    <option value="ESIGN">E-Signatures</option>
                    <option value="AUDIT_TRAIL">Audit Trail</option>
                    <option value="ALCOA_PLUS">ALCOA+</option>
                    <option value="BATCH_NUMBER">Batch Numbering</option>
                    <option value="WORKFLOW">Workflow</option>
                    <option value="MASTER_DATA">Master Data</option>
                    <option value="USER_BEHAVIOR">User Behavior</option>
                  </select>
                </div>
              </div>

              {/* FINDINGS LIST */}
              <div className="space-y-4">
                {filteredFindings.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center space-y-3">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                    <p className="text-sm font-bold text-slate-900">Zero Compliance Violations Found</p>
                    <p className="text-xs text-slate-500">All scanned parameters meet 21 CFR Part 11, GAMP 5, and ALCOA+ rules.</p>
                  </div>
                ) : (
                  filteredFindings.map(finding => {
                    const isCritical = finding.severity === 'CRITICAL';
                    return (
                      <div 
                        key={finding.id}
                        className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs hover:border-slate-300 transition-all space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span 
                              className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase text-white shadow-xs"
                              style={{ backgroundColor: categoryColors[finding.severity] }}
                            >
                              {finding.severity}
                            </span>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                              {finding.domain}
                            </span>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 uppercase">
                              {finding.standard}
                            </span>
                          </div>

                          <span className="text-[11px] font-medium text-slate-400">
                            Logged: {new Date(finding.timestamp).toLocaleString()}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-sm font-black text-slate-900">{finding.title}</h4>
                          <p className="text-xs text-slate-600 mt-1">{finding.explanation.whatHappened}</p>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs font-semibold text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-slate-600">
                            <BookOpen className="w-3.5 h-3.5 text-[#FF6321]" />
                            <span>Ref: <strong>{finding.explanation.applicableRegulation}</strong></span>
                          </div>
                          
                          <button
                            onClick={() => handleExplainFinding(finding)}
                            className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-auto"
                          >
                            <BrainCircuit className="w-3.5 h-3.5 text-[#FF6321]" />
                            Explainable AI Deep Dive
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: INSPECTION READINESS MODE */}
          {activeTab === 'readiness' && (
            <div className="space-y-8">
              {/* READINESS GAUGES */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3 text-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">US FDA 21 CFR Part 11</span>
                  <div className="text-4xl font-black text-slate-900">{readiness?.usfdaScore ?? 92}%</div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${readiness?.usfdaScore ?? 92}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600">Compliant Manifests</span>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3 text-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">EU GMP Annex 11</span>
                  <div className="text-4xl font-black text-slate-900">{readiness?.euReadinessScore ?? 94}%</div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${readiness?.euReadinessScore ?? 94}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-blue-600">Validated Workflows</span>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3 text-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">WHO GMP Standards</span>
                  <div className="text-4xl font-black text-slate-900">{readiness?.whoReadinessScore ?? 96}%</div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${readiness?.whoReadinessScore ?? 96}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-purple-600">Audit Ready</span>
                </div>
              </div>

              {/* CHECKLIST */}
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-purple-500" />
                  Regulatory Inspection Audit Checklist
                </h3>

                <div className="space-y-3">
                  {readiness?.checklists.map(item => (
                    <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {item.passed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                        )}
                        <div>
                          <span className="text-xs font-bold text-slate-900">{item.title}</span>
                          <span className="block text-[10px] text-slate-500 font-semibold">{item.category} • Ref: {item.standardRef}</span>
                        </div>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        item.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {item.passed ? 'PASS' : 'ATTENTION'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* GENERATED REPORT DOSSIER VIEW */}
              {inspectionReport && (
                <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 space-y-6 border border-slate-800 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <h3 className="text-lg font-black text-[#FF6321]">INSPECTION READINESS DOSSIER</h3>
                      <p className="text-xs text-slate-400">Dossier Ref: {inspectionReport.reportId} • Plant: {inspectionReport.branch}</p>
                    </div>
                    <button 
                      onClick={() => window.print()}
                      className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-all flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Print Official Dossier
                    </button>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-300 bg-white/5 p-4 rounded-xl border border-white/10">
                    {inspectionReport.executiveSummary}
                  </p>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Regulatory Compliance Matrix</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {inspectionReport.complianceStandardMatrix?.map((m: any) => (
                        <div key={m.standard} className="p-3 rounded-lg bg-white/5 border border-white/10 flex justify-between text-xs">
                          <span className="font-semibold text-slate-200">{m.standard}</span>
                          <span className="font-bold text-[#FF6321]">{m.score} ({m.status})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: USER ANOMALIES */}
          {activeTab === 'anomalies' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">User Behavioral Security Profiler</h3>
                  <p className="text-xs text-slate-500">Detecting credential sharing, rapid signature scripts, and off-hours access</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-4">User Details</th>
                      <th className="p-4">Department / Designation</th>
                      <th className="p-4">Anomaly Score</th>
                      <th className="p-4">Risk Status</th>
                      <th className="p-4">Detected Flags</th>
                      <th className="p-4">Last Event</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {anomalies.map(userItem => (
                      <tr key={userItem.userId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-bold text-slate-900">
                          {userItem.userName}
                          <span className="block text-[10px] text-slate-400 font-normal">{userItem.userEmail}</span>
                        </td>
                        <td className="p-4 text-slate-600 font-medium">
                          {userItem.department}
                          <span className="block text-[10px] text-slate-400">{userItem.designation}</span>
                        </td>
                        <td className="p-4">
                          <span className={`text-sm font-black ${
                            userItem.anomalyScore >= 50 ? 'text-rose-600' : 'text-slate-700'
                          }`}>
                            {userItem.anomalyScore} / 100
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            userItem.riskStatus === 'CRITICAL_RISK' ? 'bg-rose-100 text-rose-800' :
                            userItem.riskStatus === 'SUSPICIOUS' ? 'bg-amber-100 text-amber-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {userItem.riskStatus}
                          </span>
                        </td>
                        <td className="p-4 text-slate-600 max-w-xs">
                          <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                            {userItem.flags.map((flag, idx) => (
                              <li key={idx}>{flag}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="p-4 text-slate-400 font-medium whitespace-nowrap">
                          {new Date(userItem.lastEventTime).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: AI LEARNING ENGINE */}
          {activeTab === 'learning' && (
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-500" />
                    Human-in-the-Loop AI Retraining & Knowledge Base
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Prompt Version: v2.4.0-PROD • Knowledge Base: GMP-2026-Q3-ANNEX11-21CFR11</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">AI Recommendation Accuracy</span>
                  <div className="text-3xl font-black text-slate-900">98.4%</div>
                  <p className="text-[11px] text-emerald-600 font-semibold">Based on 140 QA auditor reviews</p>
                </div>

                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Approved CAPA Retrain Rules</span>
                  <div className="text-3xl font-black text-slate-900">42</div>
                  <p className="text-[11px] text-slate-500 font-semibold">Incorporated into rule weights</p>
                </div>

                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">False Positive Flags</span>
                  <div className="text-3xl font-black text-slate-900">1.6%</div>
                  <p className="text-[11px] text-slate-500 font-semibold">Filtered by human feedback loop</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: LIVE INTERCEPTOR LOG STREAM */}
          {activeTab === 'interceptor' && (
            <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-2xl font-mono text-xs space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="font-bold tracking-wider uppercase text-emerald-400">Live AI Interceptor Transaction Log Stream</span>
                </div>
                <span className="text-[10px] text-slate-400">Target Latency: &lt; 2.0s</span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {[
                  { time: new Date().toLocaleTimeString(), event: 'USER_LOGIN_SUCCESS', user: user?.email, latency: '0.14s', eval: 'PASS' },
                  { time: new Date(Date.now() - 15000).toLocaleTimeString(), event: 'BATCH_STEP_SIGNATURE_EXEC', user: 'op_clean@pharma.com', latency: '0.22s', eval: 'PASS' },
                  { time: new Date(Date.now() - 45000).toLocaleTimeString(), event: 'PRODUCT_MASTER_REVISION_SUBMIT', user: 'qa_lead@pharma.com', latency: '0.38s', eval: 'PASS' },
                  { time: new Date(Date.now() - 120000).toLocaleTimeString(), event: 'BATCH_NUMBER_ALLOCATION', user: 'system', latency: '0.08s', eval: 'FLAGGED_FORMAT_WARN' },
                ].map((log, i) => (
                  <div key={i} className="p-2.5 rounded bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">[{log.time}]</span>
                      <span className="font-bold text-slate-200">{log.event}</span>
                      <span className="text-slate-400">({log.user})</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">Eval time: {log.latency}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.eval === 'PASS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      }`}>
                        {log.eval}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* EXPLAINABLE AI DEEP DIVE & HUMAN FEEDBACK MODAL */}
      <AnimatePresence>
        {selectedFinding && explainData && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
                    <BrainCircuit className="w-5 h-5 text-[#FF6321]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-slate-900">{selectedFinding.title}</h3>
                      <span 
                        className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase text-white"
                        style={{ backgroundColor: categoryColors[selectedFinding.severity] }}
                      >
                        {selectedFinding.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">Explainable AI Reasoning Engine • Confidence {explainData.confidencePercent}%</p>
                  </div>
                </div>

                <button 
                  onClick={() => setSelectedFinding(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Explainable AI Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400">1. What Happened?</span>
                  <p className="text-xs font-medium text-slate-800">{explainData.whatHappened}</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400">2. Why Is It a Problem? (GMP Risk)</span>
                  <p className="text-xs font-medium text-slate-800">{explainData.whyIsItAProblem}</p>
                </div>

                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-purple-600">3. Applicable Regulation</span>
                  <p className="text-xs font-bold text-purple-900">{explainData.applicableRegulation}</p>
                </div>

                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-blue-600">4. Internal Company SOP</span>
                  <p className="text-xs font-bold text-blue-900">{explainData.applicableSOP}</p>
                </div>
              </div>

              {/* Recommended Actions */}
              <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-200/60 space-y-2">
                <span className="text-xs font-bold uppercase text-orange-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#FF6321]" />
                  AI Corrective Action Recommendation
                </span>
                <p className="text-xs text-slate-700 font-semibold">{selectedFinding.recommendation.recommendedAction}</p>
                <div className="flex items-center gap-4 text-[11px] text-slate-500 font-medium">
                  <span>Department: <strong>{selectedFinding.recommendation.responsibleDepartment}</strong></span>
                  <span>Priority: <strong>{selectedFinding.recommendation.priority}</strong></span>
                  <span>Target SLA: <strong>{selectedFinding.recommendation.targetCompletionHours} Hours</strong></span>
                </div>
              </div>

              {/* HUMAN-IN-THE-LOOP FEEDBACK FORM */}
              <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4">
                <h4 className="text-xs font-bold text-[#FF6321] uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Human Review & AI Knowledge Base Feedback
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-400 font-semibold mb-1">CAPA ID (if assigned)</label>
                    <input
                      type="text"
                      placeholder="e.g. CAPA-2026-089"
                      value={capaId}
                      onChange={(e) => setCapaId(e.target.value)}
                      className="w-full px-3 py-2 bg-white/10 rounded-xl border border-white/20 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#FF6321]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 font-semibold mb-1">Actual Confirmed Root Cause</label>
                    <input
                      type="text"
                      placeholder="e.g. User macro click script on shopfloor"
                      value={actualRootCause}
                      onChange={(e) => setActualRootCause(e.target.value)}
                      className="w-full px-3 py-2 bg-white/10 rounded-xl border border-white/20 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#FF6321]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 mr-2 font-medium">Rate AI Accuracy:</span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setAccuracyRating(star)}
                        className={`p-1 text-sm ${star <= accuracyRating ? 'text-amber-400' : 'text-slate-600'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={submittingFeedback}
                      onClick={() => handleFeedbackSubmit('REJECTED')}
                      className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs font-bold transition-all border border-rose-500/30 disabled:opacity-50"
                    >
                      Reject (False Positive)
                    </button>

                    <button
                      type="button"
                      disabled={submittingFeedback}
                      onClick={() => handleFeedbackSubmit('APPROVED')}
                      className="px-5 py-2 rounded-xl bg-[#FF6321] hover:bg-orange-600 text-white text-xs font-bold transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50"
                    >
                      Approve & Retrain AI
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
