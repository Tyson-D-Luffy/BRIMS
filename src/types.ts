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

export type RecordStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED' | 'RETURNED';

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
  approvedBy?: string;
  approvedAt?: string;
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
  completedBy?: string;
  completedByName?: string;
  completedByRole?: string;
  completedByEmployeeId?: string;
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

export type MasterStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'RETIRED' | 'UNDER_UPDATE' | 'RETURNED';

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
