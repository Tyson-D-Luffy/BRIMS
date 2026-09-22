export type BrimsRole =
  | 'admin'
  | 'creator'
  | 'reviewer'
  | 'approver'
  | 'qaIssuance'
  | 'production'
  | 'audit'
  | 'unauthorized';

export interface RoleCredentials {
  employeeId: string;
  password: string;
}

const ENV_KEYS: Record<BrimsRole, [string, string]> = {
  admin: ['BRIMS_ADMIN_EMPLOYEE_ID', 'BRIMS_ADMIN_PASSWORD'],
  creator: ['BRIMS_CREATOR_EMPLOYEE_ID', 'BRIMS_CREATOR_PASSWORD'],
  reviewer: ['BRIMS_REVIEWER_EMPLOYEE_ID', 'BRIMS_REVIEWER_PASSWORD'],
  approver: ['BRIMS_APPROVER_EMPLOYEE_ID', 'BRIMS_APPROVER_PASSWORD'],
  qaIssuance: ['BRIMS_QA_ISSUANCE_EMPLOYEE_ID', 'BRIMS_QA_ISSUANCE_PASSWORD'],
  production: ['BRIMS_PRODUCTION_EMPLOYEE_ID', 'BRIMS_PRODUCTION_PASSWORD'],
  audit: ['BRIMS_AUDIT_EMPLOYEE_ID', 'BRIMS_AUDIT_PASSWORD'],
  unauthorized: ['BRIMS_UNAUTHORIZED_EMPLOYEE_ID', 'BRIMS_UNAUTHORIZED_PASSWORD']
};

export function credentialsFor(role: BrimsRole): RoleCredentials {
  const [employeeKey, passwordKey] = ENV_KEYS[role];
  const employeeId = process.env[employeeKey];
  const password = process.env[passwordKey];

  if (!employeeId || !password) {
    throw new Error(`Missing test credentials for ${role}: set ${employeeKey} and ${passwordKey}.`);
  }

  return { employeeId, password };
}

export function hasCredentials(role: BrimsRole): boolean {
  const [employeeKey, passwordKey] = ENV_KEYS[role];
  return Boolean(process.env[employeeKey] && process.env[passwordKey]);
}
