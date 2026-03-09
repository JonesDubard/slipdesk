"use client";

import dynamic from "next/dynamic";
import type { Variants } from "framer-motion";

const LandingPageClient = dynamic(() => import("../components/LandingPageClient"), {
  ssr: false,
});

export default function Page() {
  return <LandingPageClient />;
}

