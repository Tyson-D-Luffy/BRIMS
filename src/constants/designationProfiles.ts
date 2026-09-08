export interface PermissionDefinition {
  id: string;
  name: string;
  category: string;
  description?: string;
  derivedReturnInfo?: string;
}

export const PERMISSION_CATEGORIES = [
  'Product Master',
  'Batch Sheet Master',
  'Batch Issuance & Execution',
  'Master Lookups',
  'Batch Number Engine',
  'Department & Designation',
  'Compliance & System'
] as const;

export const ALL_SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  // Product Master
  { id: 'create:product', name: 'Create Product Master (Draft)', category: 'Product Master', description: 'Create and submit initial draft specifications for Product Masters.' },
  { id: 'edit:product', name: 'Edit Product Master', category: 'Product Master', description: 'Modify draft or returned Product Master records.' },
  { id: 'product:submit', name: 'Submit Product Master (GAMP Review)', category: 'Product Master', description: 'Submit drafted or returned Product Master specifications for technical QA / GAMP review.' },
  { id: 'product:review', name: 'Review Product Master', category: 'Product Master', description: 'Perform technical review on submitted Product Masters.' },
  { id: 'product:approve', name: 'Approve Product Master', category: 'Product Master', description: 'Certify and authorize Product Masters for production issuance.' },
  { id: 'product:reject', name: 'Reject Product Master', category: 'Product Master', description: 'Reject Product Master draft or review submissions.' },
  { id: 'product:return', name: 'Return Product Master for Correction', category: 'Product Master', description: 'Return Product Master to author for corrections.' },
  { id: 'product:deactivate', name: 'Deactivate Product Master', category: 'Product Master', description: 'Obsolete or deactivate active Product Masters.' },

  // Batch Sheet Master
  { id: 'batch_sheet_master:create', name: 'Create Batch Sheet Master (Draft)', category: 'Batch Sheet Master', description: 'Author new master manufacturing or packaging records.' },
  { id: 'batch_sheet_master:edit', name: 'Edit Batch Sheet Master', category: 'Batch Sheet Master', description: 'Modify existing master template instructions.' },
  { id: 'batch_sheet_master:submit', name: 'Submit Batch Sheet Master', category: 'Batch Sheet Master', description: 'Submit drafted templates for QA review pipeline.' },
  { id: 'batch_sheet_master:review', name: 'Review Batch Sheet Master', category: 'Batch Sheet Master', description: 'Perform QA Review and verification on master templates.' },
  { id: 'batch_sheet_master:approve', name: 'Approve Batch Sheet Master', category: 'Batch Sheet Master', description: 'QA Manager sign-off and approval of master templates.' },
  { id: 'batch_sheet_master:reject', name: 'Reject Batch Sheet Master', category: 'Batch Sheet Master', description: 'Reject submitted master template workflows.' },
  { id: 'batch_sheet_master:return', name: 'Return Batch Sheet Master for Correction', category: 'Batch Sheet Master', description: 'Return template for author revisions.' },
  { id: 'batch_sheet_master:deactivate', name: 'Deactivate Batch Sheet Master', category: 'Batch Sheet Master', description: 'Retire or obsolete active batch sheet masters.' },

  // Batch Issuance & Execution
  { id: 'batch:create', name: 'Create Batch Request', category: 'Batch Issuance & Execution', description: 'Initiate a new batch issuance request for production.' },
  { id: 'batch:view', name: 'View Batch Record', category: 'Batch Issuance & Execution', description: 'View issued batches and workflow timelines.' },
  { id: 'batch:review', name: 'Review Batch Issuance', category: 'Batch Issuance & Execution', description: 'Review batch records and issuance parameters.' },
  { id: 'batch:approve', name: 'Approve Batch Issuance', category: 'Batch Issuance & Execution', description: 'Approve issuance requests for physical printing and release.' },
  { id: 'batch:issue', name: 'Issue Batch Sheet', category: 'Batch Issuance & Execution', description: 'Authorize official batch release and material custody.' },
  { id: 'batch:print', name: 'Print Batch Sheets', category: 'Batch Issuance & Execution', description: 'Execute official batch record print and re-print runs.' },
  { id: 'batch:preview', name: 'Preview Batch Sheets', category: 'Batch Issuance & Execution', description: 'Preview batch records and PDF layouts.' },
  { id: 'op:issued', name: 'Issued (Status Transition)', category: 'Batch Issuance & Execution', description: 'Move batch record to officially ISSUED status.' },
  { id: 'op:ready_for_handover', name: 'Ready for Handover', category: 'Batch Issuance & Execution', description: 'Mark batch custody prepared for production handover.' },
  { id: 'op:production_in_progress', name: 'Received by Production', category: 'Batch Issuance & Execution', description: 'Accept custody and initiate shopfloor execution.' },
  { id: 'op:ready_for_qa_review', name: 'Send for QA Review', category: 'Batch Issuance & Execution', description: 'Submit filled batch back to QA for review and release.' },
  { id: 'op:completed', name: 'QA Received / Final Acceptance', category: 'Batch Issuance & Execution', description: 'Perform final QA verification and complete batch.' },
  { id: 'op:return_for_correction', name: 'Return Batch Sheet for Correction', category: 'Batch Issuance & Execution', description: 'Return execution batch to production for corrections.' },

  // Master Lookups
  { id: 'lookup:create', name: 'Create Master Lookups', category: 'Master Lookups', description: 'Draft stage, recovery, generic, or process lookups.' },
  { id: 'lookup:edit', name: 'Edit Master Lookups', category: 'Master Lookups', description: 'Modify master lookup definitions and codes.' },
  { id: 'lookup:submit', name: 'Submit Master Lookups', category: 'Master Lookups', description: 'Submit drafted lookups for authorization.' },
  { id: 'lookup:approve', name: 'Approve Master Lookups', category: 'Master Lookups', description: 'Authorize and lock master lookup values.' },
  { id: 'lookup:activate', name: 'Activate Master Lookups', category: 'Master Lookups', description: 'Activate lookups for dropdown selections across BRIMS.' },
  { id: 'lookup:deactivate', name: 'Deactivate Master Lookups', category: 'Master Lookups', description: 'Deactivate lookups from active dropdowns.' },

  // Batch Number Engine & Format Builder
  { id: 'batch_number:create', name: 'Create Batch Number Record', category: 'Batch Number Engine', description: 'Generate/draft new batch number series.' },
  { id: 'batch_number:submit', name: 'Submit Batch Number Record', category: 'Batch Number Engine', description: 'Submit generated batch numbers for QA review.' },
  { id: 'batch_number:approve', name: 'Approve Batch Number Record', category: 'Batch Number Engine', description: 'Authorize batch number allocation.' },
  { id: 'format:create', name: 'Create Format Template', category: 'Batch Number Engine', description: 'Build configurable batch number format algorithms.' },
  { id: 'format:submit', name: 'Submit Format Template', category: 'Batch Number Engine', description: 'Submit format templates for QA certification.' },
  { id: 'format:approve', name: 'Approve Format Template', category: 'Batch Number Engine', description: 'Certify and lock batch number formats.' },

  // Department & Designation
  { id: 'department:create', name: 'Create Department Master', category: 'Department & Designation', description: 'Create and draft organizational department masters.' },
  { id: 'department:submit', name: 'Submit Department Master', category: 'Department & Designation', description: 'Submit department masters for approval.' },
  { id: 'department:approve', name: 'Approve Department Master', category: 'Department & Designation', description: 'Approve and activate department masters.' },
  { id: 'designation:create', name: 'Create Designation Master', category: 'Department & Designation', description: 'Create and draft organizational designation masters.' },
  { id: 'designation:submit', name: 'Submit Designation Master', category: 'Department & Designation', description: 'Submit designation masters for approval.' },
  { id: 'designation:approve', name: 'Approve Designation Master', category: 'Department & Designation', description: 'Approve and activate designation masters.' },

  // Compliance & System
  { id: 'user:manage', name: 'User Management (Admin Panel)', category: 'Compliance & System', description: 'Create, edit, reset passwords, and manage system users.' },
  { id: 'audit:view', name: 'View Audit Trail', category: 'Compliance & System', description: 'View tamper-evident 21 CFR Part 11 system audit trails.' }
];

export interface DefaultDesignationProfile {
  profileId: string;
  designationName: string;
  normalizedAliases: string[];
  departmentName: string;
  permissions: string[];
  version: string;
  status: 'Active';
  effectiveDate: string;
  approvedBy: string;
  description: string;
}

export const DEFAULT_DESIGNATION_PROFILES: DefaultDesignationProfile[] = [
  {
    profileId: 'profile-qa-chemist',
    designationName: 'QA Chemist',
    normalizedAliases: ['QA CHEMIST', 'QUALITY ASSURANCE CHEMIST', 'CHEMIST', 'QA ANALYST'],
    departmentName: 'Quality Assurance',
    version: '1.0',
    status: 'Active',
    effectiveDate: '2025-01-01',
    approvedBy: 'Quality Assurance Head',
    description: 'Entry & drafting authority across Product Masters, Batch Sheet Masters, Batch Numbering, Lookups, and Batch Issuance review.',
    permissions: [
      // Product Master
      'create:product',
      'edit:product',
      'product:submit',
      // Batch Sheet Master
      'batch_sheet_master:create',
      'batch_sheet_master:edit',
      'batch_sheet_master:submit',
      // Batch Issuance & Execution
      'batch:view',
      'batch:review',
      'batch:approve',
      'batch:issue',
      'batch:print',
      'batch:preview',
      'op:issued',
      'op:ready_for_handover',
      'op:completed',
      'op:return_for_correction',
      // Master Lookups
      'lookup:create',
      'lookup:submit',
      // Batch Number Engine
      'batch_number:create',
      'batch_number:submit',
      'format:create',
      'format:submit',
      // Department & Designation
      'department:create',
      'department:submit',
      'designation:create',
      'designation:submit',
      // Compliance
      'audit:view'
    ]
  },
  {
    profileId: 'profile-qa-incharge',
    designationName: 'QA Incharge',
    normalizedAliases: ['QA INCHARGE', 'QA IN-CHARGE', 'QUALITY ASSURANCE INCHARGE', 'QA SUPERVISOR', 'QA LEAD'],
    departmentName: 'Quality Assurance',
    version: '1.0',
    status: 'Active',
    effectiveDate: '2025-01-01',
    approvedBy: 'Quality Assurance Head',
    description: 'Review and return authority across Product Masters, Batch Sheet Masters, Lookup maintenance, and full QA Batch Issuance.',
    permissions: [
      // Product Master
      'create:product',
      'edit:product',
      'product:review',
      'product:return',
      // Batch Sheet Master
      'batch_sheet_master:create',
      'batch_sheet_master:edit',
      'batch_sheet_master:review',
      'batch_sheet_master:return',
      // Batch Issuance & Execution
      'batch:view',
      'batch:review',
      'batch:approve',
      'batch:issue',
      'batch:print',
      'batch:preview',
      'op:issued',
      'op:ready_for_handover',
      'op:completed',
      'op:return_for_correction',
      // Master Lookups
      'lookup:edit',
      'lookup:submit',
      // Batch Number Engine
      'batch_number:create',
      'batch_number:submit',
      'format:create',
      'format:submit',
      // Department & Designation
      'department:create',
      'department:submit',
      'designation:create',
      'designation:submit',
      // Compliance
      'audit:view'
    ]
  },
  {
    profileId: 'profile-qa-manager',
    designationName: 'QA Manager',
    normalizedAliases: ['QA MANAGER', 'QUALITY ASSURANCE MANAGER', 'HEAD QA', 'QA HEAD', 'VP QA'],
    departmentName: 'Quality Assurance',
    version: '1.0',
    status: 'Active',
    effectiveDate: '2025-01-01',
    approvedBy: 'Head of Operations & Quality',
    description: 'Highest approval, rejection, deactivation, and certification authority across Product Masters, Batch Sheet Masters, Lookups, and Organization Masters.',
    permissions: [
      // Product Master
      'product:approve',
      'product:reject',
      'product:return',
      'product:deactivate',
      // Batch Sheet Master
      'batch_sheet_master:approve',
      'batch_sheet_master:reject',
      'batch_sheet_master:return',
      'batch_sheet_master:deactivate',
      // Batch Issuance & Execution
      'batch:view',
      'batch:review',
      'batch:approve',
      'batch:issue',
      'batch:print',
      'batch:preview',
      'op:issued',
      'op:ready_for_handover',
      'op:completed',
      'op:return_for_correction',
      // Master Lookups
      'lookup:approve',
      'lookup:activate',
      'lookup:deactivate',
      // Batch Number Engine
      'batch_number:approve',
      'format:approve',
      // Department & Designation
      'department:approve',
      'designation:approve',
      // Compliance
      'audit:view'
    ]
  },
  {
    profileId: 'profile-production-incharge',
    designationName: 'Production Incharge',
    normalizedAliases: ['PRODUCTION INCHARGE', 'PRODUCTION IN-CHARGE', 'PRODUCTION MANAGER', 'PRODUCTION SUPERVISOR', 'PRODUCTION LEAD', 'MANUFACTURING HEAD'],
    departmentName: 'Production',
    version: '1.0',
    status: 'Active',
    effectiveDate: '2025-01-01',
    approvedBy: 'Head of Operations',
    description: 'Operational line execution authority: Batch creation, shopfloor custody receipt, and submission back for QA review.',
    permissions: [
      // Batch Issuance & Execution only
      'batch:create',
      'batch:view',
      'batch:preview',
      'op:production_in_progress',
      'op:ready_for_qa_review',
      // Compliance
      'audit:view'
    ]
  },
  {
    profileId: 'profile-it-admin',
    designationName: 'IT ADMIN',
    normalizedAliases: ['IT ADMIN', 'ITADMIN', 'SYSTEM ADMINISTRATOR', 'SYSADMIN', 'IT LEAD', 'ADMIN'],
    departmentName: 'Information Technology',
    version: '1.0',
    status: 'Active',
    effectiveDate: '2025-01-01',
    approvedBy: 'Chief Information Officer',
    description: 'System and User Administration, role matrices, security settings, and audit logs. Zero GMP business or batch operational authority.',
    permissions: [
      'user:manage',
      'audit:view'
    ]
  }
];

export function getDefaultPermissionsForDesignation(designationName: string): { permissions: string[]; profile: DefaultDesignationProfile | null } {
  if (!designationName) {
    return { permissions: ['batch:view', 'audit:view'], profile: null };
  }
  
  const normalized = designationName.toUpperCase().trim();
  
  // Exact or alias match
  for (const p of DEFAULT_DESIGNATION_PROFILES) {
    if (p.designationName.toUpperCase() === normalized || p.normalizedAliases.some(alias => normalized === alias || normalized.includes(alias))) {
      return { permissions: [...p.permissions], profile: p };
    }
  }

  // Fallback pattern matching
  if (normalized.includes('ADMIN') || normalized.includes('SYSTEM') || normalized.includes('SYSADMIN') || normalized.includes('IT')) {
    const p = DEFAULT_DESIGNATION_PROFILES.find(x => x.profileId === 'profile-it-admin')!;
    return { permissions: [...p.permissions], profile: p };
  }

  if (normalized.includes('CHEMIST') || normalized.includes('ANALYST')) {
    const p = DEFAULT_DESIGNATION_PROFILES.find(x => x.profileId === 'profile-qa-chemist')!;
    return { permissions: [...p.permissions], profile: p };
  }

  if (normalized.includes('INCHARGE') || normalized.includes('IN-CHARGE') || normalized.includes('SUPERVISOR') || normalized.includes('LEAD')) {
    if (normalized.includes('PROD') || normalized.includes('MANUFACTURING') || normalized.includes('PLANT')) {
      const p = DEFAULT_DESIGNATION_PROFILES.find(x => x.profileId === 'profile-production-incharge')!;
      return { permissions: [...p.permissions], profile: p };
    }
    const p = DEFAULT_DESIGNATION_PROFILES.find(x => x.profileId === 'profile-qa-incharge')!;
    return { permissions: [...p.permissions], profile: p };
  }

  if (normalized.includes('MANAGER') || normalized.includes('HEAD') || normalized.includes('DIRECTOR') || normalized.includes('VP')) {
    if (normalized.includes('PROD') || normalized.includes('MANUFACTURING')) {
      const p = DEFAULT_DESIGNATION_PROFILES.find(x => x.profileId === 'profile-production-incharge')!;
      return { permissions: [...p.permissions], profile: p };
    }
    const p = DEFAULT_DESIGNATION_PROFILES.find(x => x.profileId === 'profile-qa-manager')!;
    return { permissions: [...p.permissions], profile: p };
  }

  if (normalized.includes('QA') || normalized.includes('QC') || normalized.includes('QUALITY')) {
    const p = DEFAULT_DESIGNATION_PROFILES.find(x => x.profileId === 'profile-qa-chemist')!;
    return { permissions: [...p.permissions], profile: p };
  }

  if (normalized.includes('PROD') || normalized.includes('OPERATOR')) {
    const p = DEFAULT_DESIGNATION_PROFILES.find(x => x.profileId === 'profile-production-incharge')!;
    return { permissions: [...p.permissions], profile: p };
  }

  return { permissions: ['batch:view', 'audit:view'], profile: null };
}
