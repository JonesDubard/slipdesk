"use client";

import { useEffect } from "react";
import { Loader } from "lucide-react";

/** Old /demo/enter links — same hard handoff. */
export default function DemoEnterPage() {
  useEffect(() => {
    window.location.replace("/api/demo/enter");
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 px-6">
      <Loader className="w-8 h-8 text-[#50C878] animate-spin" />
      <p className="text-sm text-slate-500 font-medium">Starting interactive demo…</p>
    </div>
  );
}
