// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

type CookieToSet = {
  name: string;
  value: string;
  // Supabase CookieOptions and NextResponse cookie options overlap; keep this loose.
  options?: Record<string, unknown>;
};

export function applyAuthCookies(res: NextResponse, cookiesToSet: CookieToSet[]): NextResponse {
  for (const cookie of cookiesToSet) {
    if (cookie.options) res.cookies.set(cookie.name, cookie.value, cookie.options as never);
    else res.cookies.set(cookie.name, cookie.value);
  }
  return res;
}

/**
 * Route Handler client bound to the incoming request cookie jar.
 *
 * Do not use `cookies()` from `next/headers` on /api/org/* after the proxy has
 * called getUser(): that snapshot can still hold the pre-refresh JWT while the
 * proxy has already rotated the refresh token → getUser() 401s.
 */
export function createRouteHandlerClient(request: NextRequest) {
  const pending: CookieToSet[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            pending.push({ name, value, options });
          });
        },
      },
    },
  );
  return { supabase, pending };
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Handle errors silently
          }
        },
      },
    }
  );
}

/**
 * Server-side identity for authorization. Always uses getUser() (JWT
 * revalidated with Auth). Never treat getSession().user as authenticated.
 *
 * Pass the Route Handler `request` for cookie APIs so we read the same jar the
 * browser sent (and write rotated tokens onto the JSON response).
 */
export async function getAuthenticatedUser(request?: NextRequest): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User | null;
  authCookies: CookieToSet[];
}> {
  if (request) {
    const { supabase, pending } = createRouteHandlerClient(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { supabase, user, authCookies: pending };
    const { data: refreshed } = await supabase.auth.refreshSession();
    return { supabase, user: refreshed.user ?? null, authCookies: pending };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { supabase, user, authCookies: [] };

  const { data: refreshed } = await supabase.auth.refreshSession();
  return { supabase, user: refreshed.user ?? null, authCookies: [] };
}
