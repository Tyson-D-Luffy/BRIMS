export type UserRole = 
  | 'ADMIN' 
  | 'QA_CHEMIST' 
  | 'QA_INCHARGE' 
  | 'QA_MANAGER' 
  | 'PRODUCTION_INCHARGE'
  | string;

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  createdAt: string;
}

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}
