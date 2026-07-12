import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sendPayslipEmails, type PayslipAttachment } from "@/lib/email/send-payslips";
import { resolveCompanyIdForUser } from "@/lib/payments/server";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

/**
 * POST /api/payroll/email-payslips
 * Body: {
 *   periodLabel?: string,
 *   companyName?: string,
 *   emailFooter?: string,
 *   attachments: { to, employeeName, filename, contentBase64 }[]
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = await resolveCompanyIdForUser(supabase, user.id);
  if (!companyId) {
    return NextResponse.json({ error: "No company found" }, { status: 403 });
  }

  const blocked = await assertNotDemoCompany(supabase, companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body.attachments) ? body.attachments : [];
  if (!raw.length) {
    return NextResponse.json({ error: "No payslip attachments provided" }, { status: 400 });
  }
  if (raw.length > 80) {
    return NextResponse.json({ error: "Max 80 payslips per request" }, { status: 400 });
  }

  const attachments: PayslipAttachment[] = raw.map((a: Record<string, string>) => ({
    to: String(a.to ?? ""),
    employeeName: String(a.employeeName ?? "Employee"),
    filename: String(a.filename ?? "payslip.pdf"),
    contentBase64: String(a.contentBase64 ?? "").replace(/^data:application\/pdf;base64,/, ""),
  }));

  const result = await sendPayslipEmails(attachments, {
    companyName: body.companyName,
    periodLabel: body.periodLabel,
    emailFooter: body.emailFooter,
  });

  const status = result.sent > 0 || result.failed === 0 ? 200 : 502;
  return NextResponse.json(result, { status });
}
