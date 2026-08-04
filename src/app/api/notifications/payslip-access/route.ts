import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAndConsumeToken } from "@/lib/notifications/service";
import { employeePortalEmail } from "@/lib/employee-portal/phone";
import { findAuthUserByEmail } from "@/lib/employee-portal/find-auth-user";

/**
 * Validates a single-use 24h payslip access token, establishes a portal session,
 * and redirects to the payslip view. Expired/invalid → /portal/login.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const loginUrl = new URL("/portal/login", req.url);

  if (!token) {
    return NextResponse.redirect(loginUrl);
  }

  const validated = await validateAndConsumeToken(token, "payslip_access");
  if (!validated.ok) {
    loginUrl.searchParams.set("error", validated.reason);
    return NextResponse.redirect(loginUrl);
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const email = employeePortalEmail(validated.record.employeeId);
  let userId: string | null = null;

  const { data: emp } = await db
    .from("employees")
    .select("user_id, portal_enabled")
    .eq("id", validated.record.employeeId)
    .maybeSingle();

  if (!emp?.portal_enabled) {
    loginUrl.searchParams.set("error", "disabled");
    return NextResponse.redirect(loginUrl);
  }

  userId = emp.user_id ?? null;
  if (!userId) {
    const existing = await findAuthUserByEmail(email);
    userId = existing?.id ?? null;
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    loginUrl.searchParams.set("error", "session");
    return NextResponse.redirect(loginUrl);
  }

  const payslipId = validated.record.payslipId;
  const dest = new URL(
    payslipId ? `/portal/payslips?open=${encodeURIComponent(payslipId)}` : "/portal/payslips",
    req.url,
  );
  const response = NextResponse.redirect(dest);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });

  if (error) {
    loginUrl.searchParams.set("error", "session");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
