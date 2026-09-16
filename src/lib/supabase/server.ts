// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';

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
 * revalidated with Auth). The SSR client has autoRefreshToken: false, so an
 * expired access token can 401 even when the refresh token is valid — retry
 * once with refreshSession(). Never treat getSession().user as authenticated.
 */
export async function getAuthenticatedUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { supabase, user };

  const { data: refreshed } = await supabase.auth.refreshSession();
  return { supabase, user: refreshed.user ?? null };
}
