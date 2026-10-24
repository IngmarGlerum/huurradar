import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY ontbreken (zie apps/web/.env.example)');
}

export const supabase = createClient(url, key);
