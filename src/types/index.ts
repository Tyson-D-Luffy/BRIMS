export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'QA';

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
