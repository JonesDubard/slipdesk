"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PayRunLine } from "@/lib/mock-data";

export type AutosaveState = "idle" | "saving" | "saved" | "error";

export type RunStatus = "draft" | "review" | "approved" | "paid";
export type RunType = "monthly" | "weekly" | "bi_weekly" | "bonus" | "off_cycle";

export interface DraftSnapshot {
  payRunId: string | null;
  periodLabel: string;
  payDate: string;
  runType: RunType;
  exchangeRate: number;
  status: RunStatus;
  runStarted: boolean;
  lines: PayRunLine[];
}

const AUTOSAVE_MS = 1500;

export function usePayrollDraftAutosave(snapshot: DraftSnapshot, enabled: boolean) {
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const saveNow = useCallback(async () => {
    const s = snapshotRef.current;
    if (!enabled || !s.payRunId || s.status === "paid") return false;

    const fingerprint = JSON.stringify({
      id: s.payRunId,
      periodLabel: s.periodLabel,
      payDate: s.payDate,
      runType: s.runType,
      exchangeRate: s.exchangeRate,
      status: s.status,
      runStarted: s.runStarted,
      lines: s.lines,
    });
    if (fingerprint === lastSavedRef.current) return true;

    setAutosaveState("saving");
    try {
      const res = await fetch(`/api/payroll/runs/${s.payRunId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel: s.periodLabel,
          payDate: s.payDate,
          runType: s.runType,
          exchangeRate: s.exchangeRate,
          status: s.status,
          runStarted: s.runStarted,
          lines: s.lines,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "FINALIZED") return false;
        setAutosaveState("error");
        return false;
      }
      lastSavedRef.current = fingerprint;
      setAutosaveState("saved");
      return true;
    } catch {
      setAutosaveState("error");
      return false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !snapshot.payRunId || snapshot.status === "paid") return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveNow();
    }, AUTOSAVE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    enabled,
    snapshot.payRunId,
    snapshot.periodLabel,
    snapshot.payDate,
    snapshot.runType,
    snapshot.exchangeRate,
    snapshot.status,
    snapshot.runStarted,
    snapshot.lines,
    saveNow,
  ]);

  return { autosaveState, saveNow };
}

export async function createPayrollDraft(body: {
  periodLabel: string;
  payDate: string;
  runType: RunType;
  exchangeRate: number;
  runStarted: boolean;
  lines: PayRunLine[];
  branchId?: string | null;
}): Promise<{ id: string } | null> {
  const res = await fetch("/api/payroll/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.run?.id ? { id: data.run.id as string } : null;
}

export async function loadActivePayrollDraft(branchId: string | null = null): Promise<{
  payRunId: string;
  periodLabel: string;
  payDate: string;
  runType: RunType;
  exchangeRate: number;
  status: RunStatus;
  runStarted: boolean;
  lines: PayRunLine[];
  branchId: string | null;
  branchName: string | null;
} | null> {
  const scopeParam = branchId ? branchId : "all";
  const listRes = await fetch(`/api/payroll/runs?active=true&branchId=${encodeURIComponent(scopeParam)}`);
  if (!listRes.ok) return null;
  const list = await listRes.json();
  const first = list.runs?.[0];
  if (!first?.id) return null;

  const detailRes = await fetch(`/api/payroll/runs/${first.id}`);
  if (!detailRes.ok) return null;
  const detail = await detailRes.json();
  const run = detail.run;
  if (!run?.draft) return null;

  return {
    payRunId: run.id,
    periodLabel: run.periodLabel,
    payDate: run.payDate,
    runType: run.runType ?? "monthly",
    exchangeRate: run.exchangeRate ?? 185.44,
    status: run.status ?? "draft",
    runStarted: run.draft.runStarted ?? false,
    lines: run.draft.lines ?? [],
    branchId: run.branchId ?? null,
    branchName: run.branchName ?? null,
  };
}

export async function finalizePayrollRun(
  payRunId: string,
  lines: PayRunLine[],
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/payroll/runs/${payRunId}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Finalize failed" };
  return { ok: true };
}

export async function patchPayrollRunStatus(
  payRunId: string,
  status: RunStatus,
  snapshot: Omit<DraftSnapshot, "payRunId" | "status">,
): Promise<boolean> {
  const res = await fetch(`/api/payroll/runs/${payRunId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...snapshot, status }),
  });
  return res.ok;
}

export async function abandonPayrollDraft(payRunId: string): Promise<boolean> {
  const res = await fetch(`/api/payroll/runs/${payRunId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abandon: true }),
  });
  return res.ok;
}
