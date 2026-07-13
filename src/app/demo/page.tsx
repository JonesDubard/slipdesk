import { redirect } from "next/navigation";
import { isDemoModeEnabled } from "@/lib/demo/constants";

/**
 * Server redirect into the cookie handoff.
 * Browser does a full GET to /api/demo/enter (Set-Cookie preserved), then dashboard.
 */
export default function DemoPage() {
  if (!isDemoModeEnabled()) {
    redirect("/?demo=off");
  }
  redirect("/api/demo/enter");
}
