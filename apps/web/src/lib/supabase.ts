import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

/** Lazily initialised Supabase client — avoids crashing at build time when env vars are absent. */
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required'
      );
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/** Proxy that lazily initialises the Supabase client on first property access. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const BUCKET_PRIVATE = 'uploads';
export const BUCKET_PUBLIC = 'public-uploads';
