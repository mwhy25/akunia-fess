import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Service role: HANYA dipakai di server (route handler / server component).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
