export type ComplianceDomain = 
  | 'ESIGN'
  | 'AUDIT_TRAIL'
  | 'ALCOA_PLUS'
  | 'BATCH_NUMBER'
  | 'WORKFLOW'
  | 'MASTER_DATA'
  | 'USER_BEHAVIOR';

export type ComplianceStandard = 
  | 'GAMP5'
  | 'CFR21_PART11'
  | 'ALCOA_PLUS'
  | 'EU_ANNEX_11'
  | 'WHO_GMP'
  | 'PICS_GMP'
  | 'INTERNAL_SOP';

export type ComplianceSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type FindingStatus = 'OPEN' | 'INVESTIGATING' | 'CAPA_ASSIGNED' | 'RESOLVED' | 'FALSE_POSITIVE';

export interface ExplainableAIOutput {
  whatHappened: string;
  whyIsItAProblem: string;
  applicableRegulation: string;
  applicableSOP: string;
  howConclusionReached: string;
  supportingEvidence: Record<string, any>;
  confidencePercent: number;
}

export interface RecommendationDetail {
  issue: string;
  severity: ComplianceSeverity;
  applicableRegulation: string;
  businessImpact: string;
  possibleRootCause: string;
  recommendedAction: string;
  responsibleDepartment: string;
  priority: 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW';
  targetCompletionHours: number;
}

export interface HumanFeedback {
  status: 'APPROVED' | 'REJECTED' | 'MODIFIED';
  reviewedBy: string;
  reviewedByEmail?: string;
  reviewedAt: string;
  actualRootCause?: string;
  capaId?: string;
  capaActionPlan?: string;
  accuracyRating?: number; // 1-5 stars
  notes?: string;
}

export interface ComplianceFinding {
  id: string;
  title: string;
  domain: ComplianceDomain;
  standard: ComplianceStandard;
  severity: ComplianceSeverity;
  status: FindingStatus;
  timestamp: string;
  branch: string;
  entityType: string;
  entityId: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  explanation: ExplainableAIOutput;
  recommendation: RecommendationDetail;
  humanFeedback?: HumanFeedback;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceScoreCard {
  overallScore: number; // 0 - 100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  categoryScores: {
    documentation: number;
    workflow: number;
    security: number;
    masterData: number;
    electronicRecords: number;
  };
  todayViolationsCount: number;
  criticalCount: number;
  openRisksCount: number;
  pendingReviewsCount: number;
  inspectionReadinessScore: number;
  branchComparison: Array<{
    branchName: string;
    score: number;
    openIssues: number;
    criticalIssues: number;
  }>;
}

export interface InspectionReadinessMetrics {
  usfdaScore: number;
  euReadinessScore: number;
  whoReadinessScore: number;
  overallReadiness: number;
  inspectionRiskLevel: 'INSPECTION_READY' | 'MINOR_GAPS' | 'HIGH_RISK_DEVIATION';
  missingDocumentsCount: number;
  pendingApprovalsCount: number;
  incompleteAuditTrailsCount: number;
  pendingCapasCount: number;
  expiredTrainingCount: number;
  outstandingDeviationsCount: number;
  checklists: Array<{
    id: string;
    category: string;
    passed: boolean;
    title: string;
    findingText?: string;
    standardRef: string;
  }>;
}

export interface UserBehaviorAnomaly {
  userId: string;
  userName: string;
  userEmail: string;
  department: string;
  designation: string;
  anomalyScore: number; // 0 - 100
  riskStatus: 'NORMAL' | 'ELEVATED' | 'SUSPICIOUS' | 'CRITICAL_RISK';
  flags: string[];
  lastEventTime: string;
  eventCount24h: number;
  offHoursEventsCount: number;
  rapidSignaturesCount: number;
  failedLoginsCount: number;
}

export interface ComplianceAuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  inputSnapshot: any;
  aiRecommendation: any;
  confidenceScore: number;
  promptVersion: string;
  knowledgeBaseVersion: string;
  userDecision?: string;
  finalAction?: string;
}

export interface LearningEngineEntry {
  id: string;
  findingId: string;
  findingTitle?: string;
  domain?: ComplianceDomain;
  userDecision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
  actualRootCause: string;
  capaId: string;
  capaPlan?: string;
  accuracyRating: number;
  reviewedBy: string;
  reviewedByEmail?: string;
  reviewedAt: string;
  notes?: string;
  retrainedStatus: 'PENDING' | 'INCORPORATED';
}

export interface InterceptorLogEntry {
  id: string;
  time: string;
  timestamp: string;
  event: string;
  user: string;
  userEmail?: string;
  branch: string;
  module: string;
  latency: string;
  eval: 'PASS' | 'FLAGGED_OFF_HOURS' | 'FLAGGED_ANOMALY' | 'FLAGGED_FORMAT_WARN' | 'FLAGGED_PARAM_DEVIATION';
  details?: string;
}

export interface InterceptorStreamData {
  logs: InterceptorLogEntry[];
  summary: {
    totalIntercepted: number;
    passCount: number;
    flaggedCount: number;
    passRate: number;
    avgLatency: string;
    activeChannels: string[];
    lastPolledAt: string;
  };
}

export interface LearningBaseMetrics {
  totalReviews: number;
  accuracyRate: number;
  approvedCapaCount: number;
  falsePositiveCount: number;
  falsePositiveRate: number;
  averageRating: number;
  knowledgeBaseVersion: string;
  promptVersion: string;
}

export interface LearningBaseData {
  entries: LearningEngineEntry[];
  metrics: LearningBaseMetrics;
}
