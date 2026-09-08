export type UserRole = string;

export function getUserBaseRole(user: any): string {
  if (!user) return 'OPERATOR';
  // Check system admin email bypass
  if (user.email && user.email.toLowerCase() === 'shakshay04@gmail.com') {
    return 'ADMIN';
  }
  const role = user.role || user.designation || '';
  const normalized = role.toUpperCase().trim();
  
  if (normalized.includes("ADMIN") || normalized.includes("SYSTEM") || normalized.includes("IT")) {
    return "ADMIN";
  }
  if (normalized.includes("QA") || normalized.includes("QC") || normalized.includes("QUALITY") || normalized.includes("CONTROL") || normalized.includes("AUDIT")) {
    return "QA";
  }
  if (normalized.includes("PRODUCTION") || normalized.includes("MANAGER") || normalized.includes("HEAD") || normalized.includes("SUPERVISOR") || normalized.includes("INCHARGE") || normalized.includes("LEAD")) {
    return "PRODUCTION_MANAGER";
  }
  return "OPERATOR";
}

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  designation?: string;
  designationId?: string;
  designationName?: string;
  designationPermissionProfileId?: string;
  designationPermissionProfileVersion?: string;
  permissionSource?: 'DESIGNATION_DEFAULT' | 'USER_OVERRIDE' | 'CUSTOM';
  permissionOverrides?: { [permissionId: string]: boolean };
  permissionOverrideReason?: string;
  status?: 'active' | 'inactive' | 'locked';
  createdAt: string;
  employeeId?: string;
  username?: string;
  mobileNumber?: string;
  passwordExpiry?: string;
  passwordSetAt?: string;
  forcePasswordReset?: boolean;
  mfaEnabled?: boolean;
  department?: string;
  permissions?: string[];
  defaultBranch?: string;
  allowedBranches?: string[];
  multiBranchAccess?: boolean;
  esignatureRequiredApprovals?: boolean;
  esignatureRequiredStatusChanges?: boolean;
  sessionTimeout?: number;
  maxLoginAttempts?: number;
  accountLockAfterFailedAttempts?: boolean;
  remarks?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  updatedAt?: string;
}

export type RecordStatus = 'DRAFT' | 'UNDER_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ARCHIVED' | 'RETURNED';

export interface ReturnHistoryEntry {
  returnNo: number;
  returnedAt: string;
  returnedBy: string;
  returnedByEmail?: string;
  returnedByName?: string;
  returnedByRole?: string;
  fromStep: string;
  toStep: string;
  reason: string;
  comments?: string;
  resubmittedAt?: string;
  resubmittedBy?: string;
  resubmittedByEmail?: string;
  resubmittedByName?: string;
}

export interface BatchSheetRecord {
  id: string;
  masterId: string;
  masterSnapshot: {
    masterName: string;
    productId: string;
    steps_json: ManufacturingStep[];
    stage?: string;
    type?: string;
    version: string;
    batchNumberSeries?: string;
    documentNumber?: string;
    files?: { name: string; url: string }[];
  };
  changeReason: string;
  status: RecordStatus;
  createdBy: string;
  reviewedBy?: string;
  reviewedByEmail?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewComments?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedByName?: string;
  approvedAt?: string;
  approvalComments?: string;
  isLocked?: boolean;
  createdAt: string;
  updatedAt: string;
  branch?: string;
  returnedBy?: string;
  returnedByEmail?: string;
  returnedAt?: string;
  returnedFrom?: string;
  returnedTo?: string;
  returnReason?: string;
  returnComments?: string;
  returnCount?: number;
  returnHistory?: ReturnHistoryEntry[];
}

export interface Approval {
  id: string;
  recordId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  comments?: string;
  actionBy: string;
  actionAt: string;
  signatureRequired: boolean;
  createdAt: string;
}

export interface ElectronicSignature {
  id: string;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  meaning: string;
  signedAt: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export type BatchIssuanceStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ISSUED' | 'IN_PROGRESS' | 'COMPLETED' | 'RETURNED' | 'CANCELLED' | 'READY_FOR_PRODUCTION_HANDOVER' | 'PRODUCTION_IN_PROGRESS' | 'READY_FOR_QA_REVIEW' | 'HANDED_OVER';

export type PrintJobStatus = 
  | 'PENDING_SEQUENCE'
  | 'PENDING'
  | 'READY_TO_PRINT'
  | 'PRINT_INITIATED'
  | 'AWAITING_USER_CONFIRMATION'
  | 'PRINTING'
  | 'PRINTING_ISSUE'
  | 'INTERRUPTED'
  | 'REPRINT_REQUIRED'
  | 'REPRINT_INITIATED'
  | 'REPRINTING'
  | 'PRINT_COMPLETED'
  | 'PRINTED'
  | 'REPRINTED'
  | 'PRINT_FAILED';

export type PrintDeliveryMethod = 'PRINTER' | 'PDF_DOWNLOAD';

export type PrintJobType = 'FULL_PRINT' | 'PAGE_REPRINT';

export interface PrintJob {
  printJobId: string;
  parentPrintJobId?: string | null;
  requestId: string;
  batchSheetId: string;
  batchNumber: string;
  sequenceNumber: number;
  attemptNumber: number;
  printType: PrintJobType;
  requestedPages?: string;
  normalizedPages?: number[];
  totalPages: number;
  deliveryMethod: PrintDeliveryMethod;
  status: 'INITIATED' | 'AWAITING_USER_CONFIRMATION' | 'PRINTING_ISSUE' | 'COMPLETED' | 'CANCELLED';
  startedAt: string;
  completedAt?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  employeeId?: string;
  branch?: string;
  issueReason?: string;
  comments?: string;
  documentVersion?: string;
  signatureId?: string;
}

export interface BatchSheetPrintHistoryEntry {
  id: string;
  printJobId?: string;
  parentPrintJobId?: string | null;
  action: 
    | 'PRINT_INITIATED'
    | 'PRINT_STARTED' 
    | 'PDF_DOWNLOADED' 
    | 'PRINTING_ISSUE_REPORTED' 
    | 'PRINT_INTERRUPTED' 
    | 'PRINT_FAILED' 
    | 'REPRINT_INITIATED' 
    | 'REPRINT_STARTED' 
    | 'PRINT_COMPLETED' 
    | 'REPRINT_COMPLETED' 
    | 'LOCK_RELEASED' 
    | 'PRINT_SEQUENCE_ADVANCED' 
    | 'PRINT_SEQUENCE_COMPLETED';
  status: PrintJobStatus;
  timestamp: string;
  performedBy: string;
  userId: string;
  userEmail: string;
  userRole?: string;
  employeeId?: string;
  branch?: string;
  attemptNumber?: number;
  printType?: PrintJobType;
  requestedPages?: string;
  originalPagesReprinted?: string;
  totalPages?: number;
  deliveryMethod?: PrintDeliveryMethod;
  reason?: string;
  issueReason?: string;
  comments?: string;
  documentVersion?: string;
  signatureId?: string;
  signatureMeaning?: string;
  copyNumber?: number;
  ipAddress?: string;
  userAgent?: string;
}

export type SheetHandoverStatus = 'PENDING_HANDOVER' | 'HANDOVER_INITIATED' | 'HANDED_OVER_TO_PRODUCTION';
export type SheetProductionReceiptStatus = 'NOT_AVAILABLE' | 'AWAITING_PRODUCTION_RECEIPT' | 'RECEIVED_BY_PRODUCTION';
export type SheetProductionStatus = 'PENDING' | 'IN_PROGRESS' | 'READY_FOR_QA_REVIEW' | 'COMPLETED';
export type SheetQaReturnStatus = 'NOT_SENT' | 'READY_FOR_QA_REVIEW' | 'SENT_FOR_QA_REVIEW';
export type SheetQaReceiptStatus = 'NOT_AVAILABLE' | 'AWAITING_QA_RECEIPT' | 'RECEIVED_BY_QA';
export type SheetQaReviewStatus = 'PENDING_RECEIPT' | 'RECEIVED' | 'UNDER_QA_REVIEW' | 'QA_REVIEW_COMPLETED';

export interface BatchSheetItem {
  id: string;
  batchNumber: string;
  sequenceIndex: number;
  status: PrintJobStatus;
  printCount: number;
  attemptCount?: number;
  currentPrintJobId?: string | null;
  lastDeliveryMethod?: PrintDeliveryMethod;
  activeLock?: {
    lockedBy: string;
    lockedByName: string;
    lockedAt: string;
    lockExpiresAt?: string;
  } | null;
  printedAt?: string;
  printedBy?: string;
  printedByName?: string;
  printedByEmployeeId?: string;
  completedAt?: string;
  completedBy?: string;
  completedByName?: string;
  completedByEmployeeId?: string;
  interruptedAt?: string;
  interruptedBy?: string;
  interruptedReason?: string;
  issueReason?: string;
  reprintReason?: string;
  reprintPages?: string;
  totalPages?: number;
  history: BatchSheetPrintHistoryEntry[];
  printJobs?: PrintJob[];

  // Individual Handover to Production fields
  handoverStatus?: SheetHandoverStatus;
  handedOverBy?: string | null;
  handedOverByName?: string | null;
  handedOverByRole?: string | null;
  handedOverByEmployeeId?: string | null;
  handedOverAt?: string | null;
  handoverSignatureId?: string | null;

  // Individual Production Receipt fields
  productionReceiptStatus?: SheetProductionReceiptStatus;
  receivedByProduction?: string | null;
  productionReceivedByName?: string | null;
  productionReceivedByRole?: string | null;
  productionReceivedByEmployeeId?: string | null;
  productionReceivedAt?: string | null;
  productionReceiptSignatureId?: string | null;
  productionStatus?: SheetProductionStatus;

  // Individual QA Return / Send for QA Review fields
  qaReturnStatus?: SheetQaReturnStatus;
  sentForQaReviewBy?: string | null;
  sentForQaReviewByName?: string | null;
  sentForQaReviewByRole?: string | null;
  sentForQaReviewByEmployeeId?: string | null;
  sentForQaReviewAt?: string | null;
  sentForQaReviewSignatureId?: string | null;

  // Individual QA Receipt fields
  qaReceiptStatus?: SheetQaReceiptStatus;
  receivedByQa?: string | null;
  qaReceivedByName?: string | null;
  qaReceivedByRole?: string | null;
  qaReceivedByEmployeeId?: string | null;
  qaReceivedAt?: string | null;
  qaReceiptSignatureId?: string | null;

  // Individual QA Review Completion fields
  qaReviewStatus?: SheetQaReviewStatus;
  qaReviewedBy?: string | null;
  qaReviewedByName?: string | null;
  qaReviewedByRole?: string | null;
  qaReviewedByEmployeeId?: string | null;
  qaReviewedAt?: string | null;
  qaReviewSignatureId?: string | null;

  // Custody tracking
  currentCustody?: string;
  currentOperationalState?: string;
}

export interface BatchIssuance {
  id: string;
  batchNumber: string;
  recordId: string;
  productId: string;
  version: string;
  issuedBy: string;
  manufacturingDate: string;
  expiryDate: string;
  status: BatchIssuanceStatus;
  startedAt?: string;
  completedAt?: string;
  returnedAt?: string;
  returnedReason?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  batchNumberSeries?: string;
  dropdownBatchSeries?: string;
  singlePagesBatchNumber?: string;
  startDate?: string;
  endDate?: string;
  recordInfo?: any;
  productInfo?: any;
  issuedByName?: string;
  issuedByRole?: string;
  requestType?: 'NEW' | 'REPRINT';
  reprintReason?: string;
  comments?: string;
  rejectionReason?: string;
  printCounts?: { [item: string]: number };
  batchSheets?: BatchSheetItem[];
  printSequenceStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  currentPrintableSequence?: number;
  activePrintJobId?: string | null;
  totalPrintAttempts?: number;
  totalReprintAttempts?: number;
  activePrintLock?: {
    lockedSheetId: string;
    lockedBy: string;
    lockedByName: string;
    lockedAt: string;
  } | null;
  completedBy?: string;
  completedByName?: string;
  completedByRole?: string;
  completedByEmployeeId?: string;

  // Individual Handover & Review parent state tracking
  handoverSubStatus?: 'NOT_STARTED' | 'HANDOVER_IN_PROGRESS' | 'HANDOVER_COMPLETED';
  qaReviewSubStatus?: 'NOT_STARTED' | 'QA_REVIEW_IN_PROGRESS' | 'QA_REVIEW_COMPLETED';
  handoverProgress?: {
    total: number;
    handedOverCount: number;
    productionReceivedCount: number;
    pendingHandoverCount: number;
    awaitingProductionReceiptCount: number;
    percent: number;
  };
  qaReviewProgress?: {
    total: number;
    sentForReviewCount: number;
    qaReceivedCount: number;
    reviewedCount: number;
    stillInProductionCount: number;
    percent: number;
  };
}

export interface AuditLog {
  id: string;
  auditId?: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: string;
  entityId: string;
  entityType: string;
  oldValue?: any;
  newValue?: any;
  changeReason?: string;
  signatureId?: string;
  signatureMeaning?: string;
  ipAddress?: string;
  userAgent?: string;
  performedBy?: string;
  role?: string;
  branch?: string;
  selectedBranch?: string;
  module?: string;
  sessionId?: string;
}

export interface ProductMaster {
  id: string;
  title: string;
  type: string;
  stage: string;
  batchNumberSeries: string;
  description?: string;
  documentUrl?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  activeSince?: string;
  deactivatedSince?: string;
  
  workflowStatus?: string;
  version?: number;
  revisionNo?: number;
  parentProductId?: string;
  createdBy?: string;
  createdByEmail?: string;
  createdByUserName?: string;
  reviewedBy?: string;
  reviewedByEmail?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedDate?: string;
  effectiveDate?: string;
  reviewComments?: string;
  approvalComments?: string;
  rejectedComments?: string;
  history?: any[];
  branch?: string;
  returnedBy?: string;
  returnedByEmail?: string;
  returnedAt?: string;
  returnedFrom?: string;
  returnedTo?: string;
  returnReason?: string;
  returnComments?: string;
  returnCount?: number;
  returnHistory?: ReturnHistoryEntry[];
}

export type MasterStatus = 'DRAFT' | 'UNDER_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RETIRED' | 'UNDER_UPDATE' | 'RETURNED';

export interface BatchSheetMaster {
  id: string;
  productId: string;
  product?: ProductMaster | null;
  masterName: string;
  version: string;
  status: MasterStatus;
  steps_json: ManufacturingStep[];
  stage?: string;
  type?: string;
  batchNumberSeries?: string;
  documentNumber?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewedByEmail?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewComments?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedByName?: string;
  approvedAt?: string;
  approvalComments?: string;
  changeReason?: string;
  isLocked?: boolean;
  isDeleted?: boolean;
  recordCount?: number;
  files?: { name: string; url: string }[];
  branch?: string;
  returnedBy?: string;
  returnedByEmail?: string;
  returnedAt?: string;
  returnedFrom?: string;
  returnedTo?: string;
  returnReason?: string;
  returnComments?: string;
  returnCount?: number;
  returnHistory?: ReturnHistoryEntry[];
}

export interface ManufacturingStep {
  step_number: number;
  description: string;
  equipment: string;
  expected_time: string;
}

export interface Signature {
  userId: string;
  userName: string;
  role: UserRole;
  timestamp: string;
  meaning: string; // e.g., "I am the author", "I have reviewed this", "I approve this"
  ipAddress?: string;
  userAgent?: string;
  hash: string; // SHA-256 hash of the document state + signature metadata
}

export interface Designation {
  designationId: string;
  designationCode?: string;
  designationName: string;
  departmentId: string;
  departmentName: string;
  description?: string;
  remarks?: string;
  status: 'Draft' | 'Review' | 'Approval' | 'Active' | 'Obsolete';
  version: number;
  createdBy: string;
  createdOn: string;
  reviewedBy?: string;
  reviewedOn?: string;
  approvedBy?: string;
  approvedOn?: string;
  activatedBy?: string;
  activatedOn?: string;
}

export interface DesignationAuditLog {
  logId: string;
  designationId: string;
  action: string;
  designationCode?: string;
  designationName: string;
  oldValue: any;
  newValue: any;
  user: string;
  timestamp: string;
  department: string;
  reason: string;
  signatureId?: string;
}

export interface DesignationApprovalTimeline {
  timelineId: string;
  designationId: string;
  action: string;
  userId: string;
  userName: string;
  department: string;
  timestamp: string;
  comments: string;
  reason: string;
}

export interface DesignationPermissionProfile {
  id: string;
  profileId: string;
  designationName: string;
  designationId?: string;
  departmentName?: string;
  permissions: string[];
  version: string;
  status: 'Active' | 'Draft' | 'Obsolete';
  effectiveDate: string;
  approvedBy: string;
  approvedAt?: string;
  updatedAt?: string;
  description?: string;
  history?: {
    version: string;
    permissions: string[];
    changedBy: string;
    changedAt: string;
    reason: string;
  }[];
}

