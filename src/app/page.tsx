/**
 * Slipdesk — Root Page
 * Place at: src/app/page.tsx
 *
 * The landing page uses client-side animations (framer-motion),
 * so we import the client component here from a Server Component shell.
 */

import LandingPageClient from "./(marketing)/page-client";

export const metadata = {
  title: "Slipdesk — LRA & NASSCORP Compliant Payroll for Liberian Businesses",
  description:
    "Automate USD ↔ LRD payroll, calculate NASSCORP contributions and LRA income tax to the last decimal. Built for Liberian SMEs.",
};

export default function RootPage() {
  return <LandingPageClient />;
}