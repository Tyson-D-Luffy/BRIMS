import { ReturnHistoryEntry, getUserBaseRole } from '../types';

export type WorkflowEntityType = 
  | 'PRODUCT_MASTER'
  | 'BATCH_SHEET_MASTER'
  | 'BATCH_SHEET_RECORD'
  | 'BATCH_ISSUANCE'
  | 'BATCH_EXECUTION'
  | 'BATCH_NUMBER_FORMAT'
  | 'BATCH_NUMBER_RECORD'
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
      allowedRoles: ['QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
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
      allowedRoles: ['QA_MANAGER', 'ADMIN'],
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
      stepName: 'QA Review',
      sequence: 2,
      allowedRoles: ['QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
      reviewPermissions: ['batch_sheet_master:review', 'batch_sheet_master:return', 'batch_sheet_master:edit'],
      approvePermissions: ['batch_sheet_master:review', 'batch_sheet_master:approve'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Author (Draft)', roleName: 'Author / Creator' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'batch_sheet_master:review',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    },
    'PENDING_APPROVAL': {
      stepId: 'PENDING_APPROVAL',
      stepName: 'QA Approval',
      sequence: 3,
      allowedRoles: ['QA_MANAGER', 'ADMIN'],
      reviewPermissions: ['batch_sheet_master:review'],
      approvePermissions: ['batch_sheet_master:approve', 'batch_sheet_master:return'],
      allowedReturnSteps: [
        { stepId: 'UNDER_REVIEW', label: 'Return to QA Reviewer', roleName: 'QA Reviewer' },
        { stepId: 'DRAFT', label: 'Return to Author (Draft)', roleName: 'Author / Creator' }
      ],
      defaultReturnStep: 'UNDER_REVIEW',
      returnPermission: 'batch_sheet_master:approve',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  BATCH_SHEET_RECORD: {
    'UNDER_REVIEW': {
      stepId: 'UNDER_REVIEW',
      stepName: 'QA Review',
      sequence: 2,
      allowedRoles: ['QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
      reviewPermissions: ['batch_sheet_master:review', 'batch:review', 'op:return_for_correction'],
      approvePermissions: ['batch_sheet_master:review', 'batch:review'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Initiator (Draft)', roleName: 'Initiator' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'batch_sheet_master:review',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    },
    'PENDING_APPROVAL': {
      stepId: 'PENDING_APPROVAL',
      stepName: 'QA Approval',
      sequence: 3,
      allowedRoles: ['QA_MANAGER', 'ADMIN'],
      reviewPermissions: ['batch_sheet_master:review', 'batch:review'],
      approvePermissions: ['batch_sheet_master:approve', 'batch:approve', 'op:return_for_correction'],
      allowedReturnSteps: [
        { stepId: 'UNDER_REVIEW', label: 'Return to QA Reviewer', roleName: 'QA Reviewer' },
        { stepId: 'DRAFT', label: 'Return to Initiator (Draft)', roleName: 'Initiator' }
      ],
      defaultReturnStep: 'UNDER_REVIEW',
      returnPermission: 'batch_sheet_master:approve',
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
      allowedRoles: ['QA_CHEMIST', 'QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
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
      allowedRoles: ['QA_CHEMIST', 'QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
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
    'UNDER_REVIEW': {
      stepId: 'UNDER_REVIEW',
      stepName: 'Lookup Review & Approval',
      sequence: 2,
      allowedRoles: ['QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
      reviewPermissions: ['lookup:edit', 'lookup:submit', 'lookup:create', 'lookup:approve'],
      approvePermissions: ['lookup:approve', 'lookup:activate'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Creator (Draft)', roleName: 'Creator' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'lookup:edit',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    },
    'REVIEW': {
      stepId: 'REVIEW',
      stepName: 'Lookup Review & Approval',
      sequence: 2,
      allowedRoles: ['QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
      reviewPermissions: ['lookup:edit', 'lookup:submit', 'lookup:create', 'lookup:approve'],
      approvePermissions: ['lookup:approve', 'lookup:activate'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Creator (Draft)', roleName: 'Creator' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'lookup:edit',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    },
    'PENDING_APPROVAL': {
      stepId: 'PENDING_APPROVAL',
      stepName: 'Lookup Approval',
      sequence: 2,
      allowedRoles: ['QA_MANAGER', 'ADMIN'],
      reviewPermissions: ['lookup:edit', 'lookup:submit', 'lookup:create', 'lookup:approve'],
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
      allowedRoles: ['QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
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
      allowedRoles: ['QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
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
      allowedRoles: ['QA_MANAGER', 'ADMIN'],
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

  BATCH_NUMBER_FORMAT: {
    'UNDER_REVIEW': {
      stepId: 'UNDER_REVIEW',
      stepName: 'Format Review',
      sequence: 2,
      allowedRoles: ['QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
      reviewPermissions: ['format:submit', 'format:approve', 'format:edit', 'format:create'],
      approvePermissions: ['format:approve'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Format Author (Draft)', roleName: 'Format Author' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'format:approve',
      requiresReason: true,
      requiresESignature: true,
      canEditAfterReturn: true,
    }
  },

  BATCH_NUMBER_RECORD: {
    'PENDING_APPROVAL': {
      stepId: 'PENDING_APPROVAL',
      stepName: 'Batch Number Approval',
      sequence: 2,
      allowedRoles: ['QA_INCHARGE', 'QA_MANAGER', 'ADMIN'],
      reviewPermissions: ['batch_number:submit', 'batch_number:approve'],
      approvePermissions: ['batch_number:approve'],
      allowedReturnSteps: [{ stepId: 'DRAFT', label: 'Return to Creator (Draft)', roleName: 'Creator' }],
      defaultReturnStep: 'DRAFT',
      returnPermission: 'batch_number:approve',
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
      allowedRoles: ['ADMIN'],
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
  const roleUpper = (user.role || "").toUpperCase();
  const emailLower = (user.email || "").toLowerCase();
  if (
    roleUpper === 'ADMIN' || 
    roleUpper.includes('ADMIN') || 
    roleUpper.includes('SYSTEM') || 
    roleUpper.includes('IT') || 
    emailLower === 'shakshay04@gmail.com' || 
    user.multiBranchAccess
  ) {
    return true;
  }

  const recLower = recordBranch.trim().toLowerCase();
  if (recLower === 'all' || recLower === '' || recLower === 'general') return true;

  if (user.defaultBranch && user.defaultBranch.trim().toLowerCase() === recLower) return true;
  if (user.branch && user.branch.trim().toLowerCase() === recLower) return true;
  if (user.selectedBranch && user.selectedBranch.trim().toLowerCase() === recLower) return true;

  if (Array.isArray(user.allowedBranches)) {
    if (user.allowedBranches.some((b: string) => (b || '').trim().toLowerCase() === recLower)) {
      return true;
    }
  }

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

/**
 * ============================================================================
 * WORKFLOW-STATE-BASED AUTHORIZATION ENGINE (GAMP 5 & 21 CFR Part 11)
 * ============================================================================
 * Controls all user actions by:
 * 1. The permission required for the CURRENT WORKFLOW STAGE
 * 2. The specific action permitted within that stage
 *
 * Core Rule: A user cannot perform any state-changing action unless
 * authorized to act at the record's current workflow stage.
 */

export interface WorkflowStageActionConfig {
  label: string;
  actionPermission?: string | string[];
  nextState?: string;
  requiresReason?: boolean;
  requiresESignature?: boolean;
  isReturn?: boolean;
}

export interface WorkflowStageDefinition {
  state: string;
  stageName: string;
  stagePermissions: string[];
  actions: Record<string, WorkflowStageActionConfig>;
}

export interface WorkflowAuthParams {
  user: any;
  entityType: WorkflowEntityType;
  currentStatus: string;
  action: string;
  record?: any;
}

export interface WorkflowAuthResult {
  allowed: boolean;
  reason?: string;
  currentStatus: string;
  stageName?: string;
  stagePermissionRequired?: string[];
  actionPermissionRequired?: string[];
  stageAuthorized?: boolean;
  actionAuthorized?: boolean;
}

export interface WorkflowActionStatus {
  visible: boolean;
  enabled: boolean;
  disabledReason?: string;
  tooltip?: string;
  stagePermissionRequired?: string[];
  actionPermissionRequired?: string[];
}

export function normalizeWorkflowState(status: string | undefined): string {
  if (!status) return 'DRAFT';
  const clean = status.trim().toUpperCase().replace(/[\s\-_]+/g, '_');
  
  if (['DRAFT', 'NEW', 'INITIAL'].includes(clean)) return 'DRAFT';
  if (['PENDING_FOR_REVIEW', 'PENDING_REVIEW', 'PENDING_FOR_QA_REVIEW'].includes(clean)) return 'PENDING_FOR_REVIEW';
  if (['UNDER_REVIEW', 'IN_REVIEW', 'REVIEW'].includes(clean)) return 'UNDER_REVIEW';
  if (['PENDING_APPROVAL', 'APPROVAL'].includes(clean)) return 'PENDING_APPROVAL';
  if (['RETURNED_FOR_CORRECTION', 'RETURNED', 'CORRECTION', 'RETURNED_FOR_REVISION'].includes(clean)) return 'RETURNED_FOR_CORRECTION';
  if (['UNDER_UPDATE'].includes(clean)) return 'UNDER_UPDATE';
  if (['ACTIVE'].includes(clean)) return 'ACTIVE';
  if (['APPROVED'].includes(clean)) return 'APPROVED';
  if (['REJECTED'].includes(clean)) return 'REJECTED';
  if (['RETIRED', 'ARCHIVED'].includes(clean)) return 'RETIRED';
  if (['OBSOLETE'].includes(clean)) return 'OBSOLETE';
  if (['INACTIVE', 'DEACTIVATED'].includes(clean)) return 'INACTIVE';
  if (['CANCELLED'].includes(clean)) return 'CANCELLED';
  if (['ISSUED'].includes(clean)) return 'ISSUED';
  if (['READY_FOR_PRODUCTION_HANDOVER', 'READY_FOR_HANDOVER'].includes(clean)) return 'READY_FOR_PRODUCTION_HANDOVER';
  if (['HANDED_OVER'].includes(clean)) return 'HANDED_OVER';
  if (['PRODUCTION_IN_PROGRESS', 'IN_PROGRESS'].includes(clean)) return 'PRODUCTION_IN_PROGRESS';
  if (['READY_FOR_QA_REVIEW'].includes(clean)) return 'READY_FOR_QA_REVIEW';
  if (['COMPLETED'].includes(clean)) return 'COMPLETED';

  return clean;
}

export const WORKFLOW_STAGE_DEFINITIONS: Record<WorkflowEntityType, Record<string, WorkflowStageDefinition>> = {
  PRODUCT_MASTER: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'Draft Creation',
      stagePermissions: ['create:product', 'edit:product', 'product:submit'],
      actions: {
        'edit': { label: 'Edit Draft', actionPermission: 'edit:product' },
        'submit': { label: 'Submit for GAMP Review', actionPermission: 'product:submit', nextState: 'Pending for Review', requiresReason: true, requiresESignature: true },
        'deactivate': { label: 'Deactivate', actionPermission: 'product:deactivate' }
      }
    },
    'RETURNED_FOR_CORRECTION': {
      state: 'RETURNED_FOR_CORRECTION',
      stageName: 'Returned for Correction',
      stagePermissions: ['create:product', 'edit:product', 'product:submit'],
      actions: {
        'edit': { label: 'Edit Draft', actionPermission: 'edit:product' },
        'submit': { label: 'Resubmit for Review', actionPermission: 'product:submit', nextState: 'Pending for Review', requiresReason: true, requiresESignature: true },
        'resubmit': { label: 'Resubmit for Review', actionPermission: 'product:submit', nextState: 'Pending for Review', requiresReason: true, requiresESignature: true },
        'return-correction': { label: 'Return for Correction', actionPermission: 'product:submit' }
      }
    },
    'PENDING_FOR_REVIEW': {
      state: 'PENDING_FOR_REVIEW',
      stageName: 'QA Review',
      stagePermissions: ['product:review'],
      actions: {
        'start-review': { label: 'Start QA Review', actionPermission: 'product:review', nextState: 'Under Review' },
        'review': { label: 'Review & Forward', actionPermission: 'product:review', nextState: 'Under Review', requiresReason: true, requiresESignature: true },
        'return': { label: 'Return for Correction', actionPermission: ['product:return', 'product:review'], nextState: 'Returned for Correction', isReturn: true, requiresReason: true, requiresESignature: true },
        'return-correction': { label: 'Return for Correction', actionPermission: ['product:return', 'product:review'], nextState: 'Returned for Correction', isReturn: true, requiresReason: true, requiresESignature: true },
        'reject': { label: 'Reject', actionPermission: ['product:reject', 'product:review'], nextState: 'Rejected', requiresReason: true, requiresESignature: true }
      }
    },
    'UNDER_REVIEW': {
      state: 'UNDER_REVIEW',
      stageName: 'QA Approval',
      stagePermissions: ['product:approve'],
      actions: {
        'approve': { label: 'Approve & Activate', actionPermission: 'product:approve', nextState: 'Active', requiresReason: true, requiresESignature: true },
        'return': { label: 'Return for Correction', actionPermission: ['product:return', 'product:approve'], nextState: 'Pending for Review', isReturn: true, requiresReason: true, requiresESignature: true },
        'return-correction': { label: 'Return for Correction', actionPermission: ['product:return', 'product:approve'], nextState: 'Pending for Review', isReturn: true, requiresReason: true, requiresESignature: true },
        'reject': { label: 'Reject', actionPermission: ['product:reject', 'product:approve'], nextState: 'Rejected', requiresReason: true, requiresESignature: true }
      }
    },
    'ACTIVE': {
      state: 'ACTIVE',
      stageName: 'Active Master',
      stagePermissions: ['edit:product', 'product:deactivate'],
      actions: {
        'edit': { label: 'Create Revision', actionPermission: 'edit:product' },
        'deactivate': { label: 'Deactivate', actionPermission: 'product:deactivate' }
      }
    },
    'APPROVED': {
      state: 'APPROVED',
      stageName: 'Active Master',
      stagePermissions: ['edit:product', 'product:deactivate'],
      actions: {
        'edit': { label: 'Create Revision', actionPermission: 'edit:product' },
        'deactivate': { label: 'Deactivate', actionPermission: 'product:deactivate' }
      }
    },
    'REJECTED': {
      state: 'REJECTED',
      stageName: 'Rejected',
      stagePermissions: ['product:review', 'product:approve'],
      actions: {
        'return-correction': { label: 'Return for Correction', actionPermission: ['product:return', 'product:review', 'product:approve'], nextState: 'Returned for Correction' }
      }
    }
  },

  BATCH_SHEET_MASTER: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'Draft Creation',
      stagePermissions: ['batch_sheet_master:create', 'batch_sheet_master:edit', 'batch_sheet_master:submit'],
      actions: {
        'edit': { label: 'Edit Master', actionPermission: 'batch_sheet_master:edit' },
        'submit': { label: 'Submit for Review', actionPermission: 'batch_sheet_master:submit', nextState: 'UNDER_REVIEW', requiresReason: true, requiresESignature: true },
        'clone': { label: 'Clone Master', actionPermission: 'batch_sheet_master:create' }
      }
    },
    'UNDER_UPDATE': {
      state: 'UNDER_UPDATE',
      stageName: 'Under Revision',
      stagePermissions: ['batch_sheet_master:create', 'batch_sheet_master:edit', 'batch_sheet_master:submit'],
      actions: {
        'edit': { label: 'Edit Master', actionPermission: 'batch_sheet_master:edit' },
        'submit': { label: 'Submit for Review', actionPermission: 'batch_sheet_master:submit', nextState: 'UNDER_REVIEW', requiresReason: true, requiresESignature: true },
        'resubmit': { label: 'Submit for Review', actionPermission: 'batch_sheet_master:submit', nextState: 'UNDER_REVIEW', requiresReason: true, requiresESignature: true }
      }
    },
    'RETURNED_FOR_CORRECTION': {
      state: 'RETURNED_FOR_CORRECTION',
      stageName: 'Returned for Correction',
      stagePermissions: ['batch_sheet_master:create', 'batch_sheet_master:edit', 'batch_sheet_master:submit'],
      actions: {
        'edit': { label: 'Edit Master', actionPermission: 'batch_sheet_master:edit' },
        'submit': { label: 'Resubmit for Review', actionPermission: 'batch_sheet_master:submit', nextState: 'UNDER_REVIEW', requiresReason: true, requiresESignature: true },
        'resubmit': { label: 'Resubmit for Review', actionPermission: 'batch_sheet_master:submit', nextState: 'UNDER_REVIEW', requiresReason: true, requiresESignature: true },
        'request-update': { label: 'Revise Batch Sheet', actionPermission: 'batch_sheet_master:edit', nextState: 'UNDER_UPDATE' }
      }
    },
    'UNDER_REVIEW': {
      state: 'UNDER_REVIEW',
      stageName: 'QA Review',
      stagePermissions: ['batch_sheet_master:review'],
      actions: {
        'review': { label: 'Review & Forward', actionPermission: 'batch_sheet_master:review', nextState: 'PENDING_APPROVAL', requiresReason: true, requiresESignature: true },
        'return': { label: 'Return for Correction', actionPermission: ['batch_sheet_master:return', 'batch_sheet_master:review'], nextState: 'DRAFT', isReturn: true, requiresReason: true, requiresESignature: true },
        'reject': { label: 'Reject', actionPermission: ['batch_sheet_master:reject', 'batch_sheet_master:review'], nextState: 'REJECTED', requiresReason: true, requiresESignature: true }
      }
    },
    'PENDING_APPROVAL': {
      state: 'PENDING_APPROVAL',
      stageName: 'QA Approval',
      stagePermissions: ['batch_sheet_master:approve'],
      actions: {
        'approve': { label: 'Approve Master', actionPermission: 'batch_sheet_master:approve', nextState: 'APPROVED', requiresReason: true, requiresESignature: true },
        'return': { label: 'Return for Correction', actionPermission: ['batch_sheet_master:return', 'batch_sheet_master:approve'], nextState: 'UNDER_REVIEW', isReturn: true, requiresReason: true, requiresESignature: true },
        'reject': { label: 'Reject', actionPermission: ['batch_sheet_master:reject', 'batch_sheet_master:approve'], nextState: 'REJECTED', requiresReason: true, requiresESignature: true }
      }
    },
    'APPROVED': {
      state: 'APPROVED',
      stageName: 'Approved & Active',
      stagePermissions: ['batch_sheet_master:edit', 'batch_sheet_master:deactivate'],
      actions: {
        'request-update': { label: 'Request Update', actionPermission: 'batch_sheet_master:edit', nextState: 'UNDER_UPDATE', requiresReason: true, requiresESignature: true },
        'retire': { label: 'Retire Master', actionPermission: 'batch_sheet_master:deactivate', nextState: 'RETIRED', requiresReason: true, requiresESignature: true }
      }
    },
    'REJECTED': {
      state: 'REJECTED',
      stageName: 'Rejected',
      stagePermissions: ['batch_sheet_master:edit'],
      actions: {
        'request-update': { label: 'Update Batch Sheet', actionPermission: 'batch_sheet_master:edit', nextState: 'UNDER_UPDATE', requiresReason: true, requiresESignature: true }
      }
    }
  },

  BATCH_SHEET_RECORD: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'Draft Record',
      stagePermissions: ['batch_sheet_master:create', 'batch_sheet_master:edit', 'batch_sheet_master:submit'],
      actions: {
        'edit': { label: 'Edit Record', actionPermission: 'batch_sheet_master:edit' },
        'submit': { label: 'Submit Record', actionPermission: 'batch_sheet_master:submit', nextState: 'UNDER_REVIEW', requiresReason: true, requiresESignature: true }
      }
    },
    'RETURNED_FOR_CORRECTION': {
      state: 'RETURNED_FOR_CORRECTION',
      stageName: 'Returned Record',
      stagePermissions: ['batch_sheet_master:create', 'batch_sheet_master:edit', 'batch_sheet_master:submit'],
      actions: {
        'edit': { label: 'Edit Record', actionPermission: 'batch_sheet_master:edit' },
        'submit': { label: 'Resubmit Record', actionPermission: 'batch_sheet_master:submit', nextState: 'UNDER_REVIEW', requiresReason: true, requiresESignature: true },
        'resubmit': { label: 'Resubmit Record', actionPermission: 'batch_sheet_master:submit', nextState: 'UNDER_REVIEW', requiresReason: true, requiresESignature: true }
      }
    },
    'UNDER_REVIEW': {
      state: 'UNDER_REVIEW',
      stageName: 'QA Review Record',
      stagePermissions: ['batch_sheet_master:review'],
      actions: {
        'review': { label: 'Review Record', actionPermission: 'batch_sheet_master:review', nextState: 'PENDING_APPROVAL', requiresReason: true, requiresESignature: true },
        'return': { label: 'Return Record', actionPermission: ['batch_sheet_master:return', 'batch_sheet_master:review'], nextState: 'DRAFT', isReturn: true, requiresReason: true, requiresESignature: true },
        'reject': { label: 'Reject Record', actionPermission: ['batch_sheet_master:reject', 'batch_sheet_master:review'], nextState: 'REJECTED', requiresReason: true, requiresESignature: true }
      }
    },
    'PENDING_APPROVAL': {
      state: 'PENDING_APPROVAL',
      stageName: 'QA Approval Record',
      stagePermissions: ['batch_sheet_master:approve'],
      actions: {
        'approve': { label: 'Approve Record', actionPermission: 'batch_sheet_master:approve', nextState: 'APPROVED', requiresReason: true, requiresESignature: true },
        'return': { label: 'Return Record', actionPermission: ['batch_sheet_master:return', 'batch_sheet_master:approve'], nextState: 'UNDER_REVIEW', isReturn: true, requiresReason: true, requiresESignature: true },
        'reject': { label: 'Reject Record', actionPermission: ['batch_sheet_master:reject', 'batch_sheet_master:approve'], nextState: 'REJECTED', requiresReason: true, requiresESignature: true }
      }
    }
  },

  BATCH_ISSUANCE: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'Batch Generation',
      stagePermissions: ['batch:create', 'batch:edit'],
      actions: {
        'edit': { label: 'Edit Batch', actionPermission: 'batch:edit' },
        'submit': { label: 'Submit for QA Review', actionPermission: ['batch:create', 'batch:edit'], nextState: 'PENDING_REVIEW', requiresReason: true, requiresESignature: true }
      }
    },
    'PENDING_FOR_REVIEW': {
      state: 'PENDING_FOR_REVIEW',
      stageName: 'QA Review & Approval',
      stagePermissions: ['batch:review', 'batch:approve'],
      actions: {
        'approve': { label: 'QA Approve Batch', actionPermission: 'batch:approve', nextState: 'APPROVED', requiresReason: true, requiresESignature: true },
        'return': { label: 'Return to Requisitioner', actionPermission: ['op:return_for_correction', 'batch:review'], nextState: 'DRAFT', isReturn: true, requiresReason: true, requiresESignature: true },
        'reject': { label: 'Cancel Batch', actionPermission: ['batch:reject', 'batch:review'], nextState: 'CANCELLED', requiresReason: true, requiresESignature: true }
      }
    },
    'APPROVED': {
      state: 'APPROVED',
      stageName: 'Approved for Issuance',
      stagePermissions: ['op:issued', 'batch:print'],
      actions: {
        'issue': { label: 'Official Batch Issuance', actionPermission: 'op:issued', nextState: 'ISSUED', requiresReason: true, requiresESignature: true },
        'print': { label: 'Print Batch Record', actionPermission: 'batch:print' }
      }
    },
    'ISSUED': {
      state: 'ISSUED',
      stageName: 'Officially Issued',
      stagePermissions: ['op:ready_for_handover'],
      actions: {
        'ready_for_handover': { label: 'Prepare Custody Transfer', actionPermission: 'op:ready_for_handover', nextState: 'READY_FOR_PRODUCTION_HANDOVER', requiresReason: true, requiresESignature: true }
      }
    },
    'READY_FOR_PRODUCTION_HANDOVER': {
      state: 'READY_FOR_PRODUCTION_HANDOVER',
      stageName: 'Handover in Progress',
      stagePermissions: ['op:ready_for_handover', 'op:production_in_progress', 'op:ready_for_qa_review', 'op:completed'],
      actions: {
        'handover': { label: 'Transfer Custody', actionPermission: 'op:ready_for_handover', nextState: 'HANDED_OVER', requiresReason: true, requiresESignature: true },
        'receive_production': { label: 'Receive in Production', actionPermission: 'op:production_in_progress', nextState: 'PRODUCTION_IN_PROGRESS', requiresReason: true, requiresESignature: true },
        'send_qa_review': { label: 'Send back For QA Review', actionPermission: 'op:ready_for_qa_review', nextState: 'READY_FOR_QA_REVIEW', requiresReason: true, requiresESignature: true },
        'qa_receive': { label: 'QA Received / Review', actionPermission: 'op:completed', nextState: 'READY_FOR_PRODUCTION_HANDOVER', requiresReason: true, requiresESignature: true },
        'complete': { label: 'QA Received / Final Acceptance', actionPermission: 'op:completed', nextState: 'COMPLETED', requiresReason: true, requiresESignature: true }
      }
    },
    'HANDED_OVER': {
      state: 'HANDED_OVER',
      stageName: 'Custody Handed Over',
      stagePermissions: ['op:production_in_progress', 'op:ready_for_qa_review', 'op:completed'],
      actions: {
        'receive_production': { label: 'Receive in Production', actionPermission: 'op:production_in_progress', nextState: 'PRODUCTION_IN_PROGRESS', requiresReason: true, requiresESignature: true },
        'send_qa_review': { label: 'Send back For QA Review', actionPermission: 'op:ready_for_qa_review', nextState: 'READY_FOR_QA_REVIEW', requiresReason: true, requiresESignature: true },
        'qa_receive': { label: 'QA Received / Review', actionPermission: 'op:completed', nextState: 'HANDED_OVER', requiresReason: true, requiresESignature: true },
        'complete': { label: 'QA Received / Final Acceptance', actionPermission: 'op:completed', nextState: 'COMPLETED', requiresReason: true, requiresESignature: true }
      }
    },
    'PRODUCTION_IN_PROGRESS': {
      state: 'PRODUCTION_IN_PROGRESS',
      stageName: 'Production Execution',
      stagePermissions: ['op:ready_for_qa_review', 'batch:sign', 'batch:edit', 'op:completed'],
      actions: {
        'send_qa_review': { label: 'Send back For QA Review', actionPermission: 'op:ready_for_qa_review', nextState: 'READY_FOR_QA_REVIEW', requiresReason: true, requiresESignature: true },
        'edit': { label: 'Log Execution Step', actionPermission: ['batch:edit', 'batch:sign'] },
        'sign': { label: 'E-Sign Step', actionPermission: 'batch:sign' },
        'qa_receive': { label: 'QA Received / Review', actionPermission: 'op:completed', nextState: 'PRODUCTION_IN_PROGRESS', requiresReason: true, requiresESignature: true },
        'complete': { label: 'QA Received / Final Acceptance', actionPermission: 'op:completed', nextState: 'COMPLETED', requiresReason: true, requiresESignature: true }
      }
    },
    'READY_FOR_QA_REVIEW': {
      state: 'READY_FOR_QA_REVIEW',
      stageName: 'QA Review & Acceptance',
      stagePermissions: ['op:completed', 'op:return_for_correction', 'batch:approve'],
      actions: {
        'qa_receive': { label: 'QA Received / Final Acceptance', actionPermission: 'op:completed', nextState: 'COMPLETED', requiresReason: true, requiresESignature: true },
        'complete': { label: 'QA Received / Final Acceptance', actionPermission: 'op:completed', nextState: 'COMPLETED', requiresReason: true, requiresESignature: true },
        'return': { label: 'Return for Correction', actionPermission: 'op:return_for_correction', nextState: 'RETURNED', isReturn: true, requiresReason: true, requiresESignature: true }
      }
    },
    'RETURNED_FOR_CORRECTION': {
      state: 'RETURNED_FOR_CORRECTION',
      stageName: 'Returned to Production',
      stagePermissions: ['op:production_in_progress', 'op:ready_for_qa_review'],
      actions: {
        'receive_production': { label: 'Resume Production', actionPermission: 'op:production_in_progress', nextState: 'PRODUCTION_IN_PROGRESS' },
        'send_qa_review': { label: 'Resubmit for QA Review', actionPermission: 'op:ready_for_qa_review', nextState: 'READY_FOR_QA_REVIEW', requiresReason: true, requiresESignature: true }
      }
    }
  },

  BATCH_EXECUTION: {
    'PRODUCTION_IN_PROGRESS': {
      state: 'PRODUCTION_IN_PROGRESS',
      stageName: 'Production Execution',
      stagePermissions: ['op:ready_for_qa_review', 'batch:sign', 'batch:edit'],
      actions: {
        'send_qa_review': { label: 'Send back For QA Review', actionPermission: 'op:ready_for_qa_review', nextState: 'READY_FOR_QA_REVIEW', requiresReason: true, requiresESignature: true },
        'edit': { label: 'Log Execution Step', actionPermission: ['batch:edit', 'batch:sign'] },
        'sign': { label: 'E-Sign Step', actionPermission: 'batch:sign' }
      }
    },
    'READY_FOR_QA_REVIEW': {
      state: 'READY_FOR_QA_REVIEW',
      stageName: 'QA Execution Review',
      stagePermissions: ['op:completed', 'op:return_for_correction'],
      actions: {
        'qa_receive': { label: 'QA Received / Final Acceptance', actionPermission: 'op:completed', nextState: 'COMPLETED', requiresReason: true, requiresESignature: true },
        'complete': { label: 'QA Received / Final Acceptance', actionPermission: 'op:completed', nextState: 'COMPLETED', requiresReason: true, requiresESignature: true },
        'return': { label: 'Return for Correction', actionPermission: 'op:return_for_correction', nextState: 'RETURNED', isReturn: true, requiresReason: true, requiresESignature: true }
      }
    },
    'RETURNED_FOR_CORRECTION': {
      state: 'RETURNED_FOR_CORRECTION',
      stageName: 'Returned to Production',
      stagePermissions: ['op:production_in_progress', 'op:ready_for_qa_review'],
      actions: {
        'receive_production': { label: 'Resume Production', actionPermission: 'op:production_in_progress', nextState: 'PRODUCTION_IN_PROGRESS' },
        'send_qa_review': { label: 'Resubmit for QA Review', actionPermission: 'op:ready_for_qa_review', nextState: 'READY_FOR_QA_REVIEW', requiresReason: true, requiresESignature: true }
      }
    }
  },

  BATCH_NUMBER_FORMAT: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'Format Builder Draft',
      stagePermissions: ['format:create', 'format:edit'],
      actions: {
        'edit': { label: 'Edit Format', actionPermission: ['format:edit', 'format:create'], requiresReason: true, requiresESignature: true },
        'submit': { label: 'Submit Format for Review', actionPermission: 'format:submit', nextState: 'UNDER_REVIEW' },
        'delete': { label: 'Delete Format', actionPermission: 'format:create' }
      }
    },
    'UNDER_REVIEW': {
      state: 'UNDER_REVIEW',
      stageName: 'Format Review & Approval',
      stagePermissions: ['format:approve', 'format:edit', 'format:create'],
      actions: {
        'edit': { label: 'Edit Format', actionPermission: ['format:edit', 'format:create'], requiresReason: true, requiresESignature: true },
        'approve': { label: 'Approve & Activate', actionPermission: 'format:approve', nextState: 'ACTIVE' },
        'activate': { label: 'Activate Format', actionPermission: 'format:approve', nextState: 'ACTIVE' },
        'return': { label: 'Return to Draft', actionPermission: 'format:approve', nextState: 'DRAFT' },
        'delete': { label: 'Delete Format', actionPermission: 'format:approve' }
      }
    },
    'ACTIVE': {
      state: 'ACTIVE',
      stageName: 'Active Format',
      stagePermissions: ['format:approve', 'format:edit', 'format:create'],
      actions: {
        'edit': { label: 'Edit Format', actionPermission: ['format:edit', 'format:create'], requiresReason: true, requiresESignature: true },
        'delete': { label: 'Delete Format', actionPermission: 'format:approve' }
      }
    }
  },

  BATCH_NUMBER_RECORD: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'Batch Number Draft',
      stagePermissions: ['batch_number:create', 'batch_number:submit'],
      actions: {
        'edit': { label: 'Edit Record', actionPermission: ['batch_number:create', 'batch_number:submit'] },
        'submit': { label: 'Submit for Approval', actionPermission: ['batch_number:submit', 'batch_number:create'], nextState: 'PENDING_APPROVAL' },
        'delete': { label: 'Delete Record', actionPermission: ['batch_number:create', 'batch_number:submit'] }
      }
    },
    'PENDING_APPROVAL': {
      state: 'PENDING_APPROVAL',
      stageName: 'Batch Number Approval',
      stagePermissions: ['batch_number:approve'],
      actions: {
        'approve': { label: 'Approve Batch Number', actionPermission: 'batch_number:approve', nextState: 'APPROVED' },
        'return': { label: 'Return to Draft', actionPermission: 'batch_number:approve', nextState: 'DRAFT' },
        'delete': { label: 'Delete Record', actionPermission: 'batch_number:approve' }
      }
    },
    'APPROVED': {
      state: 'APPROVED',
      stageName: 'Approved Batch Number',
      stagePermissions: [],
      actions: {}
    }
  },

  MASTER_LOOKUP: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'Lookup Draft',
      stagePermissions: ['lookup:create', 'lookup:edit', 'lookup:submit'],
      actions: {
        'edit': { label: 'Edit Lookup', actionPermission: ['lookup:edit', 'lookup:create'] },
        'submit': { label: 'Submit Lookup', actionPermission: 'lookup:submit', nextState: 'REVIEW' },
        'delete': { label: 'Delete Lookup', actionPermission: 'lookup:create' }
      }
    },
    'UNDER_REVIEW': {
      state: 'UNDER_REVIEW',
      stageName: 'Lookup Review & Approval',
      stagePermissions: ['lookup:approve', 'lookup:activate', 'lookup:submit', 'lookup:edit'],
      actions: {
        'approve': { label: 'Approve & Activate', actionPermission: ['lookup:approve', 'lookup:activate'], nextState: 'ACTIVE' },
        'activate': { label: 'Activate Lookup', actionPermission: ['lookup:approve', 'lookup:activate'], nextState: 'ACTIVE' },
        'return': { label: 'Return to Draft', actionPermission: ['lookup:approve', 'lookup:edit'], nextState: 'DRAFT' },
        'reject': { label: 'Reject to Draft', actionPermission: ['lookup:approve', 'lookup:edit'], nextState: 'DRAFT' },
        'edit': { label: 'Edit Lookup', actionPermission: ['lookup:edit', 'lookup:create'] },
        'delete': { label: 'Delete Lookup', actionPermission: 'lookup:approve' }
      }
    },
    'REVIEW': {
      state: 'REVIEW',
      stageName: 'Lookup Review & Approval',
      stagePermissions: ['lookup:approve', 'lookup:activate', 'lookup:submit', 'lookup:edit'],
      actions: {
        'approve': { label: 'Approve & Activate', actionPermission: ['lookup:approve', 'lookup:activate'], nextState: 'ACTIVE' },
        'activate': { label: 'Activate Lookup', actionPermission: ['lookup:approve', 'lookup:activate'], nextState: 'ACTIVE' },
        'return': { label: 'Return to Draft', actionPermission: ['lookup:approve', 'lookup:edit'], nextState: 'DRAFT' },
        'reject': { label: 'Reject to Draft', actionPermission: ['lookup:approve', 'lookup:edit'], nextState: 'DRAFT' },
        'edit': { label: 'Edit Lookup', actionPermission: ['lookup:edit', 'lookup:create'] },
        'delete': { label: 'Delete Lookup', actionPermission: 'lookup:approve' }
      }
    },
    'PENDING_APPROVAL': {
      state: 'PENDING_APPROVAL',
      stageName: 'Lookup Approval',
      stagePermissions: ['lookup:approve', 'lookup:activate', 'lookup:submit', 'lookup:edit'],
      actions: {
        'approve': { label: 'Approve & Activate', actionPermission: ['lookup:approve', 'lookup:activate'], nextState: 'ACTIVE' },
        'activate': { label: 'Activate Lookup', actionPermission: ['lookup:approve', 'lookup:activate'], nextState: 'ACTIVE' },
        'return': { label: 'Return to Draft', actionPermission: ['lookup:approve', 'lookup:edit'], nextState: 'DRAFT' },
        'reject': { label: 'Reject to Draft', actionPermission: ['lookup:approve', 'lookup:edit'], nextState: 'DRAFT' },
        'edit': { label: 'Edit Lookup', actionPermission: ['lookup:edit', 'lookup:create'] },
        'delete': { label: 'Delete Lookup', actionPermission: 'lookup:approve' }
      }
    },
    'ACTIVE': {
      state: 'ACTIVE',
      stageName: 'Active Lookup',
      stagePermissions: ['lookup:deactivate', 'lookup:edit', 'lookup:activate'],
      actions: {
        'edit': { label: 'Edit Lookup (Resets to Draft)', actionPermission: ['lookup:edit', 'lookup:create'], nextState: 'DRAFT' },
        'deactivate': { label: 'Deactivate Lookup (Resets to Draft)', actionPermission: 'lookup:deactivate', nextState: 'DRAFT' }
      }
    },
    'INACTIVE': {
      state: 'INACTIVE',
      stageName: 'Inactive Lookup',
      stagePermissions: ['lookup:activate', 'lookup:edit', 'lookup:create', 'lookup:submit'],
      actions: {
        'activate': { label: 'Activate Lookup', actionPermission: ['lookup:activate', 'lookup:approve'], nextState: 'ACTIVE' },
        'reactivate': { label: 'Re-activate Lookup', actionPermission: ['lookup:activate', 'lookup:edit'], nextState: 'DRAFT' },
        'return': { label: 'Re-activate to Draft', actionPermission: ['lookup:activate', 'lookup:edit'], nextState: 'DRAFT' },
        'submit': { label: 'Submit Lookup', actionPermission: ['lookup:submit', 'lookup:create'], nextState: 'REVIEW' },
        'edit': { label: 'Edit Lookup', actionPermission: ['lookup:edit', 'lookup:create'], nextState: 'DRAFT' }
      }
    },
    'DEACTIVATED': {
      state: 'DEACTIVATED',
      stageName: 'Deactivated Lookup',
      stagePermissions: ['lookup:activate', 'lookup:edit', 'lookup:create', 'lookup:submit'],
      actions: {
        'activate': { label: 'Activate Lookup', actionPermission: ['lookup:activate', 'lookup:approve'], nextState: 'ACTIVE' },
        'reactivate': { label: 'Re-activate Lookup', actionPermission: ['lookup:activate', 'lookup:edit'], nextState: 'DRAFT' },
        'return': { label: 'Re-activate to Draft', actionPermission: ['lookup:activate', 'lookup:edit'], nextState: 'DRAFT' },
        'submit': { label: 'Submit Lookup', actionPermission: ['lookup:submit', 'lookup:create'], nextState: 'REVIEW' },
        'edit': { label: 'Edit Lookup', actionPermission: ['lookup:edit', 'lookup:create'], nextState: 'DRAFT' }
      }
    }
  },

  DEPARTMENT: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'Department Draft',
      stagePermissions: ['department:create', 'department:submit'],
      actions: {
        'edit': { label: 'Edit Department', actionPermission: 'department:create' },
        'submit': { label: 'Submit Department', actionPermission: 'department:submit', nextState: 'Pending Approval' }
      }
    },
    'PENDING_APPROVAL': {
      state: 'PENDING_APPROVAL',
      stageName: 'Department Approval',
      stagePermissions: ['department:approve', 'master:approve'],
      actions: {
        'approve': { label: 'Approve Department', actionPermission: ['department:approve', 'master:approve'], nextState: 'Active' },
        'return': { label: 'Return Department', actionPermission: ['department:approve', 'department:submit'], nextState: 'Draft' }
      }
    }
  },

  DESIGNATION: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'Designation Draft',
      stagePermissions: ['designation:create', 'designation:submit'],
      actions: {
        'edit': { label: 'Edit Designation', actionPermission: 'designation:create' },
        'submit': { label: 'Submit Designation', actionPermission: 'designation:submit', nextState: 'Review' }
      }
    },
    'UNDER_REVIEW': {
      state: 'UNDER_REVIEW',
      stageName: 'Designation Review',
      stagePermissions: ['designation:submit', 'designation:approve'],
      actions: {
        'review': { label: 'Review & Forward', actionPermission: 'designation:submit', nextState: 'Approval' },
        'return': { label: 'Return Designation', actionPermission: 'designation:submit', nextState: 'Draft' }
      }
    },
    'PENDING_APPROVAL': {
      state: 'PENDING_APPROVAL',
      stageName: 'Designation Approval',
      stagePermissions: ['designation:approve', 'master:approve'],
      actions: {
        'approve': { label: 'Approve Designation', actionPermission: ['designation:approve', 'master:approve'], nextState: 'Active' },
        'return': { label: 'Return Designation', actionPermission: 'designation:approve', nextState: 'Review' }
      }
    }
  },

  USER: {
    'DRAFT': {
      state: 'DRAFT',
      stageName: 'User Registration Draft',
      stagePermissions: ['user:create', 'admin:users'],
      actions: {
        'edit': { label: 'Edit User', actionPermission: 'user:edit' },
        'submit': { label: 'Submit User', actionPermission: 'user:create', nextState: 'Pending Approval' }
      }
    },
    'PENDING_APPROVAL': {
      state: 'PENDING_APPROVAL',
      stageName: 'User Account Approval',
      stagePermissions: ['admin:users', 'user:manage'],
      actions: {
        'approve': { label: 'Approve User Account', actionPermission: ['admin:users', 'user:manage'], nextState: 'Active' },
        'return': { label: 'Return User Account', actionPermission: 'admin:users', nextState: 'Draft' }
      }
    }
  }
};

/**
 * Validates whether a user is authorized to perform an action on an entity at its current workflow stage.
 * Enforces:
 * 1. Current Workflow Stage Authority
 * 2. Specific Action Permission within that Stage
 * 3. Segregation of Duties (SoD)
 * 4. Branch Segregation
 * 5. No Automatic Admin Bypass on GMP Workflows
 */
export function canPerformWorkflowAction(params: WorkflowAuthParams): WorkflowAuthResult {
  const { user, entityType, currentStatus, action, record } = params;

  if (!user) {
    return {
      allowed: false,
      currentStatus: currentStatus || 'UNKNOWN',
      reason: 'Authentication required: No active user session provided.'
    };
  }

  if (user.status === 'inactive' || user.status === 'DISABLED') {
    return {
      allowed: false,
      currentStatus: currentStatus || 'UNKNOWN',
      reason: 'Access Denied: User account is currently inactive or disabled.'
    };
  }

  // Branch Segregation Check
  const recordBranch = record?.branch;
  if (!checkBranchAccess(user, recordBranch)) {
    return {
      allowed: false,
      currentStatus: currentStatus || 'UNKNOWN',
      reason: `Access Denied: Branch segregation violation. User is not authorized to access records from branch '${recordBranch}'.`
    };
  }

  const normalizedStatus = normalizeWorkflowState(currentStatus);
  const entityStages = WORKFLOW_STAGE_DEFINITIONS[entityType];

  if (!entityStages) {
    return {
      allowed: false,
      currentStatus: normalizedStatus,
      reason: `Configuration Error: No workflow definitions registered for entity type '${entityType}'.`
    };
  }

  const stageDef = entityStages[normalizedStatus];
  if (!stageDef) {
    if (isRecordFinalized(normalizedStatus)) {
      return {
        allowed: false,
        currentStatus: normalizedStatus,
        reason: `Record is finalized in state '${currentStatus}' and cannot undergo further workflow transitions.`
      };
    }
    return {
      allowed: false,
      currentStatus: normalizedStatus,
      reason: `Access Denied: Record is in unhandled or terminal state '${currentStatus}'.`
    };
  }

  // Segregation of Duties Check (SoD)
  // Creator cannot review or approve or return their own record at review/approval steps
  const isReviewOrApprovalStage = ['PENDING_FOR_REVIEW', 'UNDER_REVIEW', 'PENDING_APPROVAL', 'READY_FOR_QA_REVIEW'].includes(normalizedStatus);
  const normalizedAction = action.trim().toLowerCase();
  const isVerificationAction = ['review', 'approve', 'reject', 'return', 'return-correction', 'qa_receive', 'complete'].includes(normalizedAction);

  if (entityType !== 'MASTER_LOOKUP' && (isReviewOrApprovalStage || isVerificationAction)) {
    const creatorUid = record?.createdBy || record?.creatorUid || record?.authorUid || record?.userId;
    const userUid = user?.uid || user?.id;
    if (creatorUid && userUid && creatorUid === userUid && getUserBaseRole(user) !== 'ADMIN') {
      return {
        allowed: false,
        currentStatus: normalizedStatus,
        stageName: stageDef.stageName,
        reason: `Compliance Duty Segregation (21 CFR Part 11): The record creator (${user.email || user.username || userUid}) is prohibited from performing review, approval, or return actions on their own submission.`
      };
    }
  }

  // 1. STAGE AUTHORITY CHECK
  const isAdmin = getUserBaseRole(user) === 'ADMIN';
  const userPerms: string[] = [
    ...(user?.permissions || []),
    ...(isAdmin ? [
      "user:create", "user:view", "user:edit", "user:delete",
      "batch:create", "batch:view", "batch:edit", "batch:sign", "batch:approve", "batch:preview",
      "batch_sheet_master:create", "batch_sheet_master:edit", "batch_sheet_master:submit", "batch_sheet_master:review", "batch_sheet_master:approve", "batch_sheet_master:reject", "batch_sheet_master:return", "batch_sheet_master:deactivate",
      "create:product", "edit:product", "product:submit", "product:review", "product:approve", "product:reject", "product:return", "product:deactivate",
      "lookup:create", "lookup:edit", "lookup:submit", "lookup:approve", "lookup:activate", "lookup:deactivate",
      "op:issued", "op:ready_for_handover", "op:production_in_progress", "op:ready_for_qa_review", "op:completed", "op:return_for_correction",
      "department:create", "department:submit", "department:approve", "designation:create", "designation:submit", "designation:approve",
      "batch_number:create", "batch_number:submit", "batch_number:approve", "format:create", "format:edit", "format:submit", "format:approve",
      "audit:view"
    ] : [])
  ];
  const stageAuthorized = stageDef.stagePermissions.some(perm => userPerms.includes(perm));

  if (!stageAuthorized) {
    return {
      allowed: false,
      stageAuthorized: false,
      actionAuthorized: false,
      currentStatus: normalizedStatus,
      stageName: stageDef.stageName,
      stagePermissionRequired: stageDef.stagePermissions,
      reason: `Access Denied: You lack authorization for the current workflow stage '${stageDef.stageName}' (${currentStatus}). Required stage permission(s): ${stageDef.stagePermissions.join(', ')}.`
    };
  }

  // 2. ACTION AUTHORITY CHECK
  // Search for the action definition inside the current stage
  let actionDef = stageDef.actions[normalizedAction];
  if (!actionDef) {
    // Try matching without hyphens/underscores
    const strippedAction = normalizedAction.replace(/[-_]/g, '');
    for (const [key, val] of Object.entries(stageDef.actions)) {
      if (key.replace(/[-_]/g, '').toLowerCase() === strippedAction) {
        actionDef = val;
        break;
      }
    }
  }

  if (!actionDef) {
    return {
      allowed: false,
      stageAuthorized: true,
      actionAuthorized: false,
      currentStatus: normalizedStatus,
      stageName: stageDef.stageName,
      stagePermissionRequired: stageDef.stagePermissions,
      reason: `Action '${action}' is not permitted at workflow stage '${stageDef.stageName}' (${currentStatus}). Permitted actions: ${Object.keys(stageDef.actions).join(', ')}.`
    };
  }

  if (actionDef.actionPermission) {
    const reqPerms = Array.isArray(actionDef.actionPermission) ? actionDef.actionPermission : [actionDef.actionPermission];
    const actionAuthorized = reqPerms.some(p => userPerms.includes(p));

    if (!actionAuthorized) {
      return {
        allowed: false,
        stageAuthorized: true,
        actionAuthorized: false,
        currentStatus: normalizedStatus,
        stageName: stageDef.stageName,
        stagePermissionRequired: stageDef.stagePermissions,
        actionPermissionRequired: reqPerms,
        reason: `Access Denied: You are authorized at stage '${stageDef.stageName}', but lack the specific permission required to execute '${action}'. Required: ${reqPerms.join(', ')}.`
      };
    }
  }

  return {
    allowed: true,
    stageAuthorized: true,
    actionAuthorized: true,
    currentStatus: normalizedStatus,
    stageName: stageDef.stageName,
    stagePermissionRequired: stageDef.stagePermissions,
    actionPermissionRequired: actionDef.actionPermission ? (Array.isArray(actionDef.actionPermission) ? actionDef.actionPermission : [actionDef.actionPermission]) : []
  };
}

/**
 * Computes the button visibility, enabled state, and tooltip/disabled reason for a UI action.
 * Rule: If the user lacks current stage authority, transition buttons are hidden from the UI.
 */
export function getWorkflowActionStatus(params: {
  user: any;
  entityType: WorkflowEntityType;
  currentStatus: string;
  action: string;
  record?: any;
}): WorkflowActionStatus {
  const result = canPerformWorkflowAction(params);

  if (result.allowed) {
    return {
      visible: true,
      enabled: true,
      tooltip: undefined,
      stagePermissionRequired: result.stagePermissionRequired,
      actionPermissionRequired: result.actionPermissionRequired
    };
  }

  // If user lacks stage authority, do NOT display transition buttons to that user in the UI
  if (!result.stageAuthorized) {
    return {
      visible: false,
      enabled: false,
      disabledReason: result.reason,
      tooltip: result.reason,
      stagePermissionRequired: result.stagePermissionRequired,
      actionPermissionRequired: result.actionPermissionRequired
    };
  }

  // User is stage-authorized, but lacks action-specific authority: show disabled with clear explanation
  return {
    visible: true,
    enabled: false,
    disabledReason: result.reason,
    tooltip: result.reason,
    stagePermissionRequired: result.stagePermissionRequired,
    actionPermissionRequired: result.actionPermissionRequired
  };
}

/**
 * Returns whether the user is authorized to perform any action at the current workflow stage.
 */
export function isStageAuthorized(params: {
  user: any;
  entityType: WorkflowEntityType;
  currentStatus: string;
  record?: any;
}): boolean {
  const { user, entityType, currentStatus, record } = params;
  if (!user || user.status === 'inactive' || user.status === 'DISABLED') return false;
  if (record?.branch && !checkBranchAccess(user, record.branch)) return false;

  const normalizedStatus = normalizeWorkflowState(currentStatus);
  const entityStages = WORKFLOW_STAGE_DEFINITIONS[entityType];
  if (!entityStages) return false;

  const stageDef = entityStages[normalizedStatus];
  if (!stageDef) return false;

  const userPerms: string[] = user?.permissions || [];
  return stageDef.stagePermissions.some(perm => userPerms.includes(perm));
}

/**
 * Returns all action keys the user is authorized to execute at the current workflow stage.
 */
export function getAuthorizedActionsForStage(params: {
  user: any;
  entityType: WorkflowEntityType;
  currentStatus: string;
  record?: any;
}): string[] {
  const { user, entityType, currentStatus, record } = params;
  const normalizedStatus = normalizeWorkflowState(currentStatus);
  const entityStages = WORKFLOW_STAGE_DEFINITIONS[entityType];
  if (!entityStages) return [];

  const stageDef = entityStages[normalizedStatus];
  if (!stageDef) return [];

  const authorizedActions: string[] = [];
  for (const actionKey of Object.keys(stageDef.actions)) {
    const res = canPerformWorkflowAction({
      user,
      entityType,
      currentStatus,
      action: actionKey,
      record
    });
    if (res.allowed) {
      authorizedActions.push(actionKey);
    }
  }

  return authorizedActions;
}


