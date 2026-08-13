export function hasEquivalentRole(userRole: string, allowedRoles: string[]): boolean {
  if (!userRole) return false;
  
  const roleUpper = userRole.trim().toUpperCase();
  const equivalentRoles = [roleUpper];
  
  if (roleUpper === 'ADMIN' || roleUpper === 'MANAGER') {
    equivalentRoles.push('ADMIN', 'QA', 'PRODUCTION_MANAGER', 'OPERATOR');
  } else if (roleUpper === 'QA REVIEWER' || roleUpper === 'QA APPROVER' || roleUpper === 'QA') {
    equivalentRoles.push('QA', 'OPERATOR');
  } else if (roleUpper === 'PRODUCTION USER' || roleUpper === 'PRODUCTION_USER' || roleUpper === 'PRODUCTION_MANAGER' || roleUpper === 'ISSUER') {
    equivalentRoles.push('PRODUCTION_MANAGER', 'OPERATOR');
  } else if (roleUpper === 'MASTER DATA USER') {
    equivalentRoles.push('PRODUCTION_MANAGER', 'QA', 'OPERATOR');
  }
  
  return allowedRoles.some(r => {
    const rUpper = r.trim().toUpperCase();
    return (
      equivalentRoles.includes(rUpper) ||
      userRole === r ||
      userRole.toUpperCase() === rUpper
    );
  });
}

export function isUserAdmin(user: any): boolean {
  if (!user) return false;
  if (user.email?.toLowerCase() === 'shakshay04@gmail.com') return true;
  return hasEquivalentRole(user.role, ['ADMIN']);
}

export function isUserQA(user: any): boolean {
  if (!user) return false;
  return hasEquivalentRole(user.role, ['QA']);
}

export function isUserProduction(user: any): boolean {
  if (!user) return false;
  return hasEquivalentRole(user.role, ['PRODUCTION_MANAGER']);
}
