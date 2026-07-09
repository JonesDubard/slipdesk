/** Platform-level Slipdesk admin (payment review, account lock, etc.). */
export function isPlatformAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

/** Email that should always receive platform admin (from env). */
export function isDesignatedPlatformAdmin(email: string | null | undefined): boolean {
  const designated = process.env.SLIPDESK_ADMIN_EMAIL?.trim().toLowerCase();
  if (!designated || !email) return false;
  return email.trim().toLowerCase() === designated;
}
