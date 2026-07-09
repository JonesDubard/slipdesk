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
  window.location.assign("/login");
}
