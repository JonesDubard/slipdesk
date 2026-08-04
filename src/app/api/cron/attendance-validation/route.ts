import { NextRequest, NextResponse } from "next/server";
import { runAttendanceValidationJob } from "@/lib/attendance/scheduler";

/**
 * Scheduled attendance validation.
 * Invoke hourly via cron with ?secret=CRON_SECRET.
 * Business logic lives in scheduler.ts — this route only gates + invokes.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runAttendanceValidationJob(new Date());
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      companies: results.length,
      results,
    });
  } catch (err) {
    console.error("Attendance validation cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
}
