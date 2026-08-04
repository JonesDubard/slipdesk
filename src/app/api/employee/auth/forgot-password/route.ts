import { NextRequest, NextResponse } from "next/server";
import { requestPasswordResetByEmail } from "@/lib/notifications/service";

/**
 * Always returns a generic success message to avoid email enumeration.
 * Employees without email should use HR PIN reset (v0.1.0).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "");

  await requestPasswordResetByEmail(email);

  return NextResponse.json({
    ok: true,
    message:
      "If an employee portal account exists for that email, a reset link has been sent. " +
      "If you do not use email on your employee record, ask HR to reset your PIN.",
  });
}
