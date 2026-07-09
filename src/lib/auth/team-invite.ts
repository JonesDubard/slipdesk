/** Whether bootstrap should create a brand-new owned company for this user. */
export function shouldCreateOwnedCompany(opts: {
  isPlatformAdmin: boolean;
  hasOwnedCompany: boolean;
  hasActiveMembership: boolean;
  hasPendingInvite: boolean;
}): boolean {
  if (opts.isPlatformAdmin) return false;
  if (opts.hasOwnedCompany) return false;
  if (opts.hasActiveMembership) return false;
  if (opts.hasPendingInvite) return false;
  return true;
}
