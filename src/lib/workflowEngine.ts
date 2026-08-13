import { ReturnHistoryEntry, getUserBaseRole } from '../types';

export type WorkflowEntityType = 
  | 'PRODUCT_MASTER'
  | 'BATCH_SHEET_MASTER'
  | 'BATCH_SHEET_RECORD'
  | 'BATCH_ISSUANCE'
  | 'BATCH_EXECUTION'
  | 'MASTER_LOOKUP'
  | 'DEPARTMENT'
  | 'DESIGNATION'
  | 'USER';

export interface WorkflowStepConfig {
  stepId: string;
  stepName: string;
  sequence: number;
  allowedRoles: string[];
  reviewPermissions: string[];
  approvePermissions: string[];
  allowedReturnSteps: { stepId: string; label: string; roleName: string }[];
  defaultReturnStep: string;
  returnPermission: string;
  requiresReason: boolean;
  requiresESignature: boolean;
  canEditAfterReturn: boolean;
}

export interface WorkflowActionConfig {
  action: 'FORWARD' | 'REVIEW' | 'APPROVE' | 'AUTHORIZE' | 'RETURN' | 'REJECT';
  label: string;
  destinationStep?: string;
  destinationLabel?: string;
  requiredPermission: string;
  requiresReason: boolean;
  requiresESignature: boolean;
}

export const WORKFLOW_DEFINITIONS: Record<WorkflowEntityType, Record<string, WorkflowStepConfig>> = {
  PRODUCT_MASTER: {
    'Pending for Review': {
      stepId: 'Pending for Review',
      stepName: 'QA Review',
      sequence: 2,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['product:review', 'product:return', 'edit:product'],
      approvePermissions: ['product:approve'],
      allowedReturnSteps: [{ stepId: 'Draft', label: 'Return to Creator (Draft)', roleName: 'Creator' }],
      defaultReturnStep: 'Draft',
      returnPermission: 'product:review',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    },
    'Under Review': {
      stepId: 'Under Review',
      stepName: 'QA Approval',
      sequence: 3,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['product:review'],
      approvePermissions: ['product:approve', 'product:return'],
      allowedReturnSteps: [
        { stepId: 'Pending for Review', label: 'Return to QA Reviewer', roleName: 'QA Reviewer' },
        { stepId: 'Draft', label: 'Return to Creator (Draft)', roleName: 'Creator' }
      ],
      defaultReturnStep: 'Pending for Review',
      returnPermission: 'product:approve',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  BATCH_SHEET_MASTER: {
    'UNDER_REVIEW': {
      stepId: 'UNDER_REVIEW',
      stepName: 'Review & Approval',
      sequence: 2,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['batch_sheet_master:review', 'batch_sheet_master:return', 'batch_sheet_master:edit'],
      approvePermissions: ['batch_sheet_master:approve', 'batch_sheet_master:return'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Author (Draft)', roleName: 'Author / Creator' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'batch_sheet_master:review',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  BATCH_SHEET_RECORD: {
    'UNDER_REVIEW': {
      stepId: 'UNDER_REVIEW',
      stepName: 'QA Approval',
      sequence: 2,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['batch:review', 'op:return_for_correction'],
      approvePermissions: ['batch:approve', 'op:completed', 'op:return_for_correction'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Initiator (Draft)', roleName: 'Initiator' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'batch:review',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  BATCH_ISSUANCE: {
    'PENDING_REVIEW': {
      stepId: 'PENDING_REVIEW',
      stepName: 'QA Issuance Review',
      sequence: 2,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['batch:review', 'op:return_for_correction', 'op:ready_for_qa_review'],
      approvePermissions: ['batch:approve', 'op:issued', 'op:return_for_correction'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Requisitioner (Draft)', roleName: 'Requisitioner' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'batch:review',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  BATCH_EXECUTION: {
    'READY_FOR_QA_REVIEW': {
      stepId: 'READY_FOR_QA_REVIEW',
      stepName: 'QA Execution Review',
      sequence: 6,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['op:ready_for_qa_review', 'op:return_for_correction', 'batch:review'],
      approvePermissions: ['op:completed', 'batch:approve', 'op:return_for_correction'],
      allowedReturnSteps: [{ stepId: 'PRODUCTION_IN_PROGRESS', label: 'Return to Production for Correction', roleName: 'Production Supervisor' }],
      defaultReturnStep: 'PRODUCTION_IN_PROGRESS',
      returnPermission: 'op:return_for_correction',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  MASTER_LOOKUP: {
    'PENDING_APPROVAL': {
      stepId: 'PENDING_APPROVAL',
      stepName: 'Lookup Approval',
      sequence: 2,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['lookup:edit', 'lookup:submit', 'lookup:create'],
      approvePermissions: ['lookup:approve', 'lookup:activate'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Creator (Draft)', roleName: 'Creator' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'lookup:edit',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  DEPARTMENT: {
    'Pending Approval': {
      stepId: 'Pending Approval',
      stepName: 'Department Approval',
      sequence: 2,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['department:submit', 'department:edit', 'master:edit'],
      approvePermissions: ['department:approve', 'master:approve'],
      allowedReturnSteps: [{ stepId: 'Draft', label: 'Return to Creator (Draft)', roleName: 'Creator' }],
      defaultReturnStep: 'Draft',
      returnPermission: 'department:submit',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  DESIGNATION: {
    'Review': {
      stepId: 'Review',
      stepName: 'Designation Review',
      sequence: 2,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['designation:submit', 'designation:edit', 'master:edit'],
      approvePermissions: ['designation:approve'],
      allowedReturnSteps: [{ stepId: 'Draft', label: 'Return to Creator (Draft)', roleName: 'Creator' }],
      defaultReturnStep: 'Draft',
      returnPermission: 'designation:submit',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    },
    'Approval': {
      stepId: 'Approval',
      stepName: 'Designation Approval',
      sequence: 3,
      allowedRoles: ['QA', 'ADMIN'],
      reviewPermissions: ['designation:submit'],
      approvePermissions: ['designation:approve', 'master:approve'],
      allowedReturnSteps: [
        { stepId: 'Review', label: 'Return to Reviewer', roleName: 'Reviewer' },
        { stepId: 'Draft', label: 'Return to Creator (Draft)', roleName: 'Creator' }
      ],
      defaultReturnStep: 'Review',
      returnPermission: 'designation:approve',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  USER: {
    'Pending Approval': {
      stepId: 'Pending Approval',
      stepName: 'User Account Approval',
      sequence: 2,
      allowedRoles: ['ADMIN', 'QA'],
      reviewPermissions: ['admin:users', 'user:manage'],
      approvePermissions: ['admin:users', 'user:manage'],
      allowedReturnSteps: [{ stepId: 'Draft', label: 'Return to Administrator / Initiator', roleName: 'Initiator' }],
      defaultReturnStep: 'Draft',
      returnPermission: 'admin:users',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  }
};

/**
 * Checks if a record status is finalized. Finalized records cannot be returned.
 */
export function isRecordFinalized(status: string | undefined): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  return ['APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED', 'OBSOLETE', 'REJECTED', 'CANCELLED', 'INACTIVE'].includes(upper);
}

/**
 * Validates branch access for a user against a record.
 */
export function checkBranchAccess(user: any, recordBranch?: string): boolean {
  if (!user || !recordBranch) return true;
  if (user.role === 'ADMIN' || user.multiBranchAccess) return true;
  if (user.defaultBranch && user.defaultBranch === recordBranch) return true;
  if (user.branch && user.branch === recordBranch) return true;
  if (user.selectedBranch && user.selectedBranch === recordBranch) return true;
  return false;
}

/**
 * Validates Segregation of Duties (SoD):
 * Creator cannot review or approve or return their own record at review/approval steps (unless system ADMIN).
 */
export function checkSegregationOfDuties(user: any, record?: any, currentStep?: string): boolean {
  if (!user || !record) return true;
  if (getUserBaseRole(user) === 'ADMIN') return true;
  
  const creatorUid = record.createdBy || record.creatorUid || record.authorUid;
  const userUid = user.uid || user.id;
  
  if (creatorUid && userUid && creatorUid === userUid) {
    const isDraft = !currentStep || ['Draft', 'DRAFT', 'Returned for Correction', 'RETURNED'].includes(currentStep);
    if (!isDraft) {
      return false; // Creator cannot perform review/approval or return at non-draft steps
    }
  }
  return true;
}

/**
 * Checks if user has a specific permission in their permissions list or is ADMIN.
 */
export function userHasPermission(user: any, requiredPermissions: string[] | string): boolean {
  if (!user) return false;
  if (getUserBaseRole(user) === 'ADMIN') return true;
  
  const permissions = user.permissions || [];
  const reqList = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  
  return reqList.some(reqPerm => permissions.includes(reqPerm));
}

/**
 * Retrieves the workflow return configuration for a given entity type and step.
 */
export function getReturnConfig(entityType: WorkflowEntityType, currentStep: string): WorkflowStepConfig | null {
  const entityWorkflows = WORKFLOW_DEFINITIONS[entityType];
  if (!entityWorkflows) return null;
  return entityWorkflows[currentStep] || null;
}

/**
 * Evaluates available workflow actions (Forward, Review, Approve, Return) derived from user permissions.
 */
export function getAvailableWorkflowActions(
  user: any,
  entityType: WorkflowEntityType,
  currentStep: string,
  record?: any
): WorkflowActionConfig[] {
  if (!user) return [];
  if (user.status === 'inactive' || user.status === 'DISABLED') return [];

  const recordStatus = record?.status || record?.workflowStatus || currentStep;
  if (isRecordFinalized(recordStatus)) return [];

  const recordBranch = record?.branch;
  if (!checkBranchAccess(user, recordBranch)) return [];

  if (!checkSegregationOfDuties(user, record, currentStep)) return [];

  const config = getReturnConfig(entityType, currentStep);
  if (!config) return [];

  const actions: WorkflowActionConfig[] = [];
  const userPerms = user.permissions || [];
  const userRole = getUserBaseRole(user);

  // Check if user has review authority at current step
  const hasReviewAuth = userRole === 'ADMIN' || 
    config.reviewPermissions.some(p => userPerms.includes(p)) ||
    userPerms.includes('op:return_for_correction');

  // Check if user has approve authority at current step
  const hasApproveAuth = userRole === 'ADMIN' || 
    config.approvePermissions.some(p => userPerms.includes(p));

  // If user has Review or Approve or Authorize authority at current step, they get Derived Return Rights
  if (hasReviewAuth || hasApproveAuth) {
    for (const returnDest of config.allowedReturnSteps) {
      actions.push({
        action: 'RETURN',
        label: `RETURN TO ${returnDest.roleName.toUpperCase()}`,
        destinationStep: returnDest.stepId,
        destinationLabel: returnDest.label,
        requiredPermission: config.returnPermission,
        requiresReason: config.requiresReason,
        requiresESignature: config.requiresESignature
      });
    }
  }

  return actions;
}

/**
 * Returns a list of available return destinations for a given user, record, and current workflow step.
 */
export function getAvailableReturnDestinations(
  user: any,
  entityType: WorkflowEntityType,
  currentStep: string,
  record?: any
): { stepId: string; label: string; roleName: string }[] {
  const actions = getAvailableWorkflowActions(user, entityType, currentStep, record);
  const returnActions = actions.filter(a => a.action === 'RETURN');
  
  if (returnActions.length === 0) return [];

  const config = getReturnConfig(entityType, currentStep);
  return config ? config.allowedReturnSteps : [];
}

/**
 * Checks if a user has derived permission to perform a Return action on a record at the current step.
 */
export function canUserReturnRecord(
  user: any,
  entityType: WorkflowEntityType,
  currentStep: string,
  record?: any
): boolean {
  if (!user) return false;
  if (user.status === 'inactive' || user.status === 'DISABLED') return false;

  const recordStatus = typeof record === 'string' ? record : (record?.status || record?.workflowStatus || currentStep);
  if (isRecordFinalized(recordStatus)) return false;

  const recordBranch = typeof record === 'object' ? record?.branch : undefined;
  if (!checkBranchAccess(user, recordBranch)) return false;

  if (typeof record === 'object' && !checkSegregationOfDuties(user, record, currentStep)) return false;

  const actions = getAvailableWorkflowActions(user, entityType, currentStep, typeof record === 'object' ? record : undefined);
  return actions.some(a => a.action === 'RETURN');
}

/**
 * Validates a return reason according to 21 CFR Part 11 / GMP ALCOA+ rules.
 */
export function validateReturnReason(reason: string): { valid: boolean; message?: string } {
  if (!reason) {
    return { valid: false, message: 'Return reason is required.' };
  }
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { valid: false, message: 'Return reason must be at least 5 characters long and contain meaningful explanation.' };
  }
  if (trimmed.length > 1000) {
    return { valid: false, message: 'Return reason cannot exceed 1000 characters.' };
  }
  return { valid: true };
}

/**
 * Builds a standardized ReturnHistoryEntry object.
 */
export function buildReturnHistoryEntry(params: {
  returnNo: number;
  returnedBy: string;
  returnedByEmail?: string;
  returnedByName?: string;
  returnedByRole?: string;
  fromStep: string;
  toStep: string;
  reason: string;
  comments?: string;
}): ReturnHistoryEntry {
  return {
    returnNo: params.returnNo,
    returnedAt: new Date().toISOString(),
    returnedBy: params.returnedBy,
    returnedByEmail: params.returnedByEmail || '',
    returnedByName: params.returnedByName || params.returnedByEmail || 'QA Personnel',
    returnedByRole: params.returnedByRole || 'QA',
    fromStep: params.fromStep,
    toStep: params.toStep,
    reason: params.reason,
    comments: params.comments || '',
  };
}

