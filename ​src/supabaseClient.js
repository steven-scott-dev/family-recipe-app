import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase Project URL and Anon Key
const supabaseUrl = 'https://mvdmoqskmmkkqszcesbp.supabase.co/rest/v1/'
const supabaseAnonKey = 'sb_publishable_t2vJebR5XLZJbGeCnFdyeg_111_sbDz'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
