import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { normalizeRole, type Role } from "@/lib/rbac";
import { resendFromAddress } from "@/lib/email/resend-from";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

const ASSIGNABLE: Role[] = [
  "company_owner", "finance_manager", "hr_manager", "payroll_officer", "auditor", "executive", "employee",
];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = normalizeRole(body.role);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!ASSIGNABLE.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  // Only the company owner may invite teammates.
  const { data: company, error: coErr } = await supabase
    .from("companies")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (coErr || !company) {
    return NextResponse.json({ error: "Company not found or you are not the owner." }, { status: 403 });
  }

  const blocked = await assertNotDemoCompany(supabase, company.id);
  if (blocked) return blocked;

  // Keep profile.company_id in sync so RLS helpers resolve for owners.
  await supabase.from("profiles").update({ company_id: company.id }).eq("id", user.id);

  const { error } = await supabase.from("company_members").insert({
    company_id: company.id,
    invited_email: email,
    role,
    status: "pending",
  });

  if (error) {
    const msg = error.message ?? "Could not save invite.";
    if (error.code === "23505" || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "That email has already been invited." }, { status: 409 });
    }
    if (msg.toLowerCase().includes("does not exist")) {
      return NextResponse.json({
        error: "Team management requires migration 0001_platform_expansion.sql (and 0002_my_company_id.sql) to be applied in Supabase.",
      }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://slipdesk.com";
  let emailError: string | undefined;
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const sent = await resend.emails.send({
        from: resendFromAddress(),
        to: email,
        subject: `You're invited to ${company.name} on Slipdesk`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px">
            <div style="background:#002147;padding:20px 24px;border-radius:12px;margin-bottom:24px">
              <h1 style="color:#50C878;margin:0;font-size:22px">Slipdesk</h1>
              <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">Team invitation</p>
            </div>
            <p style="color:#1e293b;font-size:15px">You've been invited to join <strong>${company.name}</strong> on Slipdesk.</p>
            <p style="color:#475569;font-size:14px;line-height:1.6">
              To get access, create your account at the link below using this email address
              (<strong>${email}</strong>) and choose your own password. We don't send passwords — you set one during signup.
            </p>
            <p style="margin:24px 0">
              <a href="${appUrl}/signup?invite=1&amp;email=${encodeURIComponent(email)}" style="background:#002147;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:bold;font-size:14px;display:inline-block">
                Create your account
              </a>
            </p>
            <p style="color:#94a3b8;font-size:12px">
              Already have an account? <a href="${appUrl}/login" style="color:#475569">Sign in</a> with the same email.
            </p>
          </div>
        `,
      });
      if (sent.error) emailError = sent.error.message;
    } catch (emailErr) {
      emailError = emailErr instanceof Error ? emailErr.message : "Email send failed";
      console.error("Invite email failed (invite still saved):", emailErr);
    }
  }

  return NextResponse.json({
    success: true,
    companyId: company.id,
    emailSent: Boolean(process.env.RESEND_API_KEY && !emailError),
    emailError: emailError ?? undefined,
  });
}
