/**
 * Exact email lookup for Supabase Auth admin — avoids paginated listUsers scans.
 */

export type AuthUserLite = { id: string; email?: string | null };

/**
 * Resolve an auth user by exact email using the Admin REST filter.
 * Falls back to getUserByEmail when the JS client exposes it.
 */
export async function findAuthUserByEmail(email: string): Promise<AuthUserLite | null> {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    // GoTrue admin: filter by email (exact). Prefer this over listUsers pagination.
    const endpoint = `${url.replace(/\/$/, "")}/auth/v1/admin/users?email=${encodeURIComponent(normalized)}`;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      console.warn("[findAuthUserByEmail] HTTP", res.status);
      return null;
    }
    const body = (await res.json()) as {
      users?: Array<{ id: string; email?: string | null }>;
      user?: { id: string; email?: string | null };
    };

    if (body.user?.id) return { id: body.user.id, email: body.user.email };
    const match = (body.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === normalized,
    );
    return match ? { id: match.id, email: match.email } : null;
  } catch (err) {
    console.warn("[findAuthUserByEmail] failed:", err);
    return null;
  }
}
