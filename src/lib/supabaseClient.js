import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
} else {
  console.warn("Supabase URL or Anon Key is missing from .env. This client is deprecated and will be removed.");
  supabase = {
    from: (table) => ({
      select: async (columns = '*') => { console.log(`Mock Supabase: SELECT on ${table}`); return ({ data: [], error: null }); },
      insert: async (data) => { console.log(`Mock Supabase: INSERT on ${table}`, data); return ({ data: [data], error: null }); },
      update: async (data) => { console.log(`Mock Supabase: UPDATE on ${table}`, data); return ({ data: [data], error: null }); },
      delete: async () => { console.log(`Mock Supabase: DELETE on ${table}`); return ({ data: [], error: null }); },
      upsert: async (data) => { console.log(`Mock Supabase: UPSERT on ${table}`, data); return ({ data: [data], error: null }); },
    }),
    auth: {
      getSession: async () => ({ data: { session: null }, error: { message: "Supabase not configured" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
      signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: null }, error: { message: 'Supabase not configured' } }),
    },
    channel: (name) => ({
      on: (event, config, callback) => {
        console.log(`Mock Supabase: Channel ${name} subscription to ${config.table}`);
        return { subscribe: (statusCallback) => {
          if (statusCallback) statusCallback('SUBSCRIBED');
        }};
      },
      subscribe: () => {},
    }),
    realtime: null,
  };
}

export { supabase };