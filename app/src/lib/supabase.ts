/**
 * Supabase client for the Veducore mobile app (Expo / React Native).
 * Connected to production Supabase project (same as web portal).
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = 'https://earrifjgtsympejzfrtx.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhcnJpZmpndHN5bXBlanpmcnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzYxMzIsImV4cCI6MjEwODI1MjEzMn0._QVvyZynViDfFDr8TrIe_rkVj4cwsPFHW0z6vpYLPAg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
