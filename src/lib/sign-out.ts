/**
 * Sign out with a timeout so the UI never hangs if Supabase auth is slow.
 * Always redirects to /login afterward.
 */
export async function performSignOut(signOut: () => Promise<void>): Promise<void> {
  try {
    await Promise.race([
      signOut(),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // Proceed to login even if sign-out fails
  }
  try {
    document.cookie = "slipdesk_demo=; Path=/; Max-Age=0; SameSite=Lax";
  } catch {
    // ignore
  }
  window.location.assign("/login");
}
