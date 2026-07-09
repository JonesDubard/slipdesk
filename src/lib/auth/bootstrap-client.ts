/** Call after sign-in or sign-up so profile + company rows exist. */
export async function bootstrapAccount(opts?: {
  companyName?: string;
  lraTin?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: opts?.companyName ?? "",
        lraTin: opts?.lraTin ?? "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Account setup failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the server" };
  }
}
