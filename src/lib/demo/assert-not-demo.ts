import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCompanyIdForUser } from "@/lib/payments/server";
import { DEMO_READONLY_CODE, DEMO_READONLY_MESSAGE } from "@/lib/demo/constants";

export function demoReadonlyResponse(message = DEMO_READONLY_MESSAGE) {
  return NextResponse.json(
    { error: message, code: DEMO_READONLY_CODE },
    { status: 403 },
  );
}

/** Returns a 403 response if the given company is the shared demo tenant. */
export async function assertNotDemoCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  companyId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!companyId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("companies")
    .select("is_demo")
    .eq("id", companyId)
    .maybeSingle();

  if (data?.is_demo) return demoReadonlyResponse();
  return null;
}

/** Resolve the user's company and block if it is the demo tenant. */
export async function assertNotDemoForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  userId: string,
): Promise<{ companyId: string | null; blocked: NextResponse | null }> {
  const companyId = await resolveCompanyIdForUser(supabase, userId);
  const blocked = await assertNotDemoCompany(supabase, companyId);
  return { companyId, blocked };
}

export async function isDemoCompanyId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  companyId: string | null | undefined,
): Promise<boolean> {
  if (!companyId) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("companies")
    .select("is_demo")
    .eq("id", companyId)
    .maybeSingle();
  return Boolean(data?.is_demo);
}
