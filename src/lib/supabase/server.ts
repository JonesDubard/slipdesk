import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

// These should be in your .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Returns a Supabase client with service role (server-side)
 */
export function createClient(): SupabaseClient {
  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}