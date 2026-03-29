"use client";

/**
 * Slipdesk — PageSkeleton
 * Place at: src/components/PageSkeleton.tsx
 *
 * Shown on any page while AppContext is still booting (first load / reload).
 * Prevents the white-screen flash that occurred when pages rendered before
 * Supabase had returned employee/company data.
 *
 * Usage:
 *   const { loading } = useApp();
 *   if (loading) return <PageSkeleton />;
 */

export default function PageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
      {/* Page title */}
      <div className="space-y-2">
        <div className="h-7 w-40 bg-slate-200 rounded-xl" />
        <div className="h-4 w-64 bg-slate-100 rounded-xl" />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-100 bg-white p-5 space-y-3">
            <div className="h-3 w-24 bg-slate-100 rounded" />
            <div className="h-7 w-32 bg-slate-200 rounded" />
            <div className="h-3 w-20 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      {/* Main content card */}
      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="h-4 w-36 bg-slate-200 rounded" />
          <div className="h-8 w-24 bg-slate-100 rounded-xl" />
        </div>
        {/* Table rows */}
        <div className="divide-y divide-slate-50">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
              {/* Name + sub */}
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-36 bg-slate-200 rounded" />
                <div className="h-3 w-24 bg-slate-100 rounded" />
              </div>
              {/* Col 1 */}
              <div className="hidden sm:block h-3.5 w-20 bg-slate-100 rounded" />
              {/* Col 2 */}
              <div className="hidden sm:block h-3.5 w-16 bg-slate-100 rounded" />
              {/* Col 3 */}
              <div className="hidden sm:block h-3.5 w-16 bg-slate-100 rounded" />
              {/* Action */}
              <div className="h-7 w-16 bg-slate-100 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Second card (e.g. quick actions / history) */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-100 bg-white p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-28 bg-slate-200 rounded" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}