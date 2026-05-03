import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bpjbffbqzbexgtdxenwz.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamJmZmJxemJleGd0ZHhlbnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MjgxMDgsImV4cCI6MjA3MzIwNDEwOH0.BZyUzR4-dnKWMIRYHLVvlnyY1dkRp8A0gGzggi8OgyY';

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export default customSupabaseClient;

export { 
    customSupabaseClient,
    customSupabaseClient as supabase,
};
