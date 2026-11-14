import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const isMock = import.meta.env.VITE_MOCK_AUTH === 'true';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// Instead of throwing (which crashes the entire app), log a clear warning.
// AuthContext guards all supabase usages with a null check.
if (!isMock && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    '[Supabase] Environment variables missing!\n' +
    'Make sure your .env file contains:\n' +
    '  VITE_SUPABASE_URL=https://<your-project>.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=<your-anon-key>\n' +
    'Then restart the dev server (npm run dev).'
  );
}

// Typed as always present: it is null only in mock mode or when the env
// vars are missing, both of which are already reported above and guarded
// by `if (!supabase)` checks in AuthContext.
export const supabase = (
  isMock || !supabaseUrl || !supabaseAnonKey
    ? null
    : createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
) as SupabaseClient;
