/**
 * src/app/(auth)/layout.tsx
 */
"use client";

import { AppProvider } from "@/context/AppContext";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}