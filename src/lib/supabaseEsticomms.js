import { createClient } from '@supabase/supabase-js'

export const supabaseEsticomms = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { db: { schema: 'esticomms' } }
)
