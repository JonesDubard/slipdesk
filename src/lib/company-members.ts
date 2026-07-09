/**
 * Slipdesk — Company Members (User Roles / RBAC roster)
 *
 * Uses server API routes so invites/member lists work reliably with RLS and
 * return clear errors instead of hanging the UI.
 */

import type { Role } from "@/lib/rbac";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface CompanyMember {
  id: string;
  userId: string | null;
  role: Role;
  invitedEmail: string | null;
  status: "pending" | "active";
  createdAt: string;
}

export interface MemberResult {
  ok: boolean;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMembers(_companyId: string): Promise<CompanyMember[]> {
  try {
    const res = await fetchWithTimeout("/api/team/members");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn("[team] fetchMembers:", body.error ?? res.statusText);
      return [];
    }
    const body = await res.json();
    return body.members ?? [];
  } catch (err) {
    console.warn("[team] fetchMembers:", err);
    return [];
  }
}

export async function inviteMember(_companyId: string, email: string, role: Role): Promise<MemberResult> {
  try {
    const res = await fetchWithTimeout("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body.error ?? "Could not send invite." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateMemberRole(id: string, role: Role): Promise<MemberResult> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient() as AnySupabase;
    const { error } = await supabase.from("company_members").update({ role }).eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function removeMember(id: string): Promise<MemberResult> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient() as AnySupabase;
    const { error } = await supabase.from("company_members").delete().eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
