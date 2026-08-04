import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { loginWithPassword } from "@/lib/employee-portal/auth";
import { logAuditServer } from "@/lib/audit-server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const identifier = String(body.phone ?? body.identifier ?? "");
  const password = String(body.password ?? body.pin ?? "");

  const result = await loginWithPassword(identifier, password);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.retryAfterMs != null ? { retryAfterMs: result.retryAfterMs } : {}),
        ...(result.code ? { code: result.code } : {}),
      },
      { status: result.status },
    );
  }

  const response = NextResponse.json({
    ok: true,
    employeeId: result.employeeId,
    companyId: result.companyId,
    mustChangePassword: result.mustChangePassword,
  });

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

  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: result.tokenHash,
  });

  if (otpErr) {
    console.warn("[employee-auth] session exchange failed:", otpErr.message);
    return NextResponse.json({ error: "Could not establish portal session." }, { status: 500 });
  }

  try {
    const admin = createAdminClient();
    await logAuditServer(admin, {
      companyId: result.companyId,
      action: "user.login",
      entityType: "employee",
      entityId: result.employeeId,
      actorId: result.userId,
      actorEmail: result.email,
      newValue: { channel: "employee_portal_password" },
    });
  } catch {
    // non-fatal
  }

  return response;
}
