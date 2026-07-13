import { redirect } from "next/navigation";
import { isDemoModeEnabled } from "@/lib/demo/constants";

/** Legacy path — same handoff as /demo. */
export default function DemoEnterPage() {
  if (!isDemoModeEnabled()) {
    redirect("/?demo=off");
  }
  redirect("/api/demo/enter");
}
