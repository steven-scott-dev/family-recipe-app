import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
alert("URL: " + JSON.stringify(import.meta.env.VITE_SUPABASE_URL) + "\nKEY PREFIX: " + String(import.meta.env.VITE_SUPABASE_ANON_KEY).substring(0, 10));

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
