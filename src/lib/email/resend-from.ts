/**
 * Resend requires a verified domain in production.
 * For local dev, use onboarding@resend.dev (only delivers to your Resend account email).
 */
export function resendFromAddress(): string {
  const configured = process.env.RESEND_FROM_EMAIL?.trim();
  if (configured) return configured;
  return "Slipdesk <onboarding@resend.dev>";
}
