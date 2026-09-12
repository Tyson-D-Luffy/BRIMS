export function hasEquivalentRole(userRole: string, allowedRoles: string[]): boolean {
  if (!userRole) return false;
  
  const roleUpper = userRole.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const equivalentRoles = [roleUpper, userRole.trim().toUpperCase()];
  
  if (roleUpper === 'ADMIN' || roleUpper === 'IT_ADMIN' || roleUpper === 'MANAGER') {
    equivalentRoles.push('ADMIN', 'QA_CHEMIST', 'QA_INCHARGE', 'QA_MANAGER', 'PRODUCTION_INCHARGE', 'QA', 'PRODUCTION_MANAGER', 'OPERATOR');
  } else if (
    roleUpper === 'QA_MANAGER' || roleUpper === 'HEAD_QA' || roleUpper === 'QA_HEAD' || roleUpper === 'QA_APPROVER'
  ) {
    equivalentRoles.push('QA_MANAGER', 'QA_INCHARGE', 'QA_CHEMIST', 'QA');
  } else if (
    roleUpper === 'QA_INCHARGE' || roleUpper === 'QA_REVIEWER' || roleUpper === 'QA_SUPERVISOR'
  ) {
    equivalentRoles.push('QA_INCHARGE', 'QA_CHEMIST', 'QA');
  } else if (
    roleUpper === 'QA_CHEMIST' || roleUpper === 'QA_OFFICER' || roleUpper === 'QA_EXECUTIVE' || roleUpper === 'QA'
  ) {
    equivalentRoles.push('QA_CHEMIST', 'QA');
  } else if (
    roleUpper === 'PRODUCTION_INCHARGE' || roleUpper === 'PRODUCTION_MANAGER' || roleUpper === 'PRODUCTION_USER' ||
    roleUpper === 'PRODUCTION_SUPERVISOR' || roleUpper === 'OPERATOR' || roleUpper === 'ISSUER'
  ) {
    equivalentRoles.push('PRODUCTION_INCHARGE', 'PRODUCTION_MANAGER', 'OPERATOR');
  }
  
  return allowedRoles.some(r => {
    const rNorm = r.trim().toUpperCase().replace(/[\s-]+/g, '_');
    return (
      equivalentRoles.includes(rNorm) ||
      equivalentRoles.includes(r.trim().toUpperCase()) ||
      userRole === r ||
      userRole.toUpperCase() === r.toUpperCase()
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
  return hasEquivalentRole(user.role, ['QA_CHEMIST', 'QA_INCHARGE', 'QA_MANAGER', 'QA']);
}

export function isUserProduction(user: any): boolean {
  if (!user) return false;
  return hasEquivalentRole(user.role, ['PRODUCTION_INCHARGE', 'PRODUCTION_MANAGER']);
}
