import { redirect } from "next/navigation";
import { isDemoModeEnabled } from "@/lib/demo/constants";

/**
 * Legacy toy calculator retired — send visitors into the real app demo.
 */
export default function DemoPage() {
  if (!isDemoModeEnabled()) {
    redirect("/?demo=off");
  }
  redirect("/demo/enter");
}
