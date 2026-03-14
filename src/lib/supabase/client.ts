/**
 * Slipdesk — Supabase Browser Client
 * Place at: src/lib/supabase/client.ts
 *
 * Uses the ANON key — safe to expose in the browser.
 * RLS policies on every table ensure users only see their own data.
 *
 * NOTE: We export a typed `SupabaseClient` alias so callers can type
 * `.from()` calls without hitting the `never` inference bug that occurs
 * when the generic isn't threaded through correctly.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type TypedSupabaseClient = SupabaseClient<Database>;

export function createClient(): TypedSupabaseClient {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}