export type TokenCategory = 'auto_generated' | 'master_lookup' | 'collection' | 'static_text';

export interface FormatToken {
  id: string; // random or sequenced id
  name: string; // e.g. "Base Batch Number", "Stage Code", "/"
  type: TokenCategory;
  source: string; // e.g. "base_batch_number", "product_code", "stage_code", "recovery_component", "generic_code", "recovery_component_collection", or the static text character
  separator?: string; // only for collection (e.g. "+", "&")
  mandatory: boolean;
}

export type FormatStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'ACTIVE';

export interface BatchNumberFormat {
  id: string;
  formatCode: string; // e.g. RM-007
  formatName: string; // e.g. Recovery Material Standard
  status: FormatStatus;
  branch: string;
  tokens: FormatToken[];
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  history?: any[];
  approvalHistory?: {
    status: FormatStatus;
    user: string;
    role: string;
    timestamp: string;
    comments?: string;
    meaning?: string;
  }[];
}

export type RecordStatus = 'DRAFT' | 'UNDER_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface TokenBreakdownItem {
  token: string;
  value: string;
  type: string;
}

export interface BatchNumberRecord {
  id: string;
  batchNumber: string; // generated read-only string e.g. 26001/LH10/RM807
  branch: string;
  product: string;
  category: string;
  scenario: string;
  formatCode: string; // reference to Format ID/Code
  status: RecordStatus;
  generatedOn: string;
  generatedBy: string;
  tokenValues: Record<string, string | string[]>; // hold input fields
  tokenBreakdown: TokenBreakdownItem[];
  timeline: {
    type: 'submitted' | 'reviewed' | 'approved' | 'rejected' | 'draft';
    user: string;
    role: string;
    timestamp: string;
    comments?: string;
  }[];
  approvedBy?: string;
  approvedDate?: string;
  remarks?: string;
}

export interface MasterItem {
  id: string;
  type: 'product' | 'stage' | 'recovery_component' | 'generic' | 'process' | 'base_batch_number';
  code: string;
  name?: string;
  productId?: string;
  status?: 'DRAFT' | 'REVIEW' | 'APPROVAL' | 'ACTIVE' | 'DEACTIVATED' | 'INACTIVE';
  approvedBy?: string;
  approvedDate?: string;
  comments?: string;
  history?: {
    action: string;
    user: string;
    timestamp: string;
    meaning?: string;
    status: string;
  }[];
}
