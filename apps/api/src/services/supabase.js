import { createClient } from '@supabase/supabase-js';
import env from '../config/env.js';

// Cliente publico (respeta RLS) - usar con JWT del usuario
export const supabasePublic = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Cliente admin (service role) - SOLO backend, bypasea RLS
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
