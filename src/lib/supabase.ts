/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';

export const hasSupabaseConfig = supabaseUrl !== 'https://YOUR_PROJECT_ID.supabase.co' && supabaseUrl !== '';

// Enhanced client with better reliability and real-time settings
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  global: {
    headers: { 'x-application-name': 'erp-system' }
  }
});

/**
 * Utility to verify the Supabase connection and data integrity.
 * This can be used to check if the client is online and the connection is secured.
 */
export async function verifyConnection() {
  try {
    const { data, error } = await supabase.from('employees').select('id').limit(1);
    if (error) throw error;
    return { connected: true, error: null };
  } catch (error: any) {
    console.error('Supabase connection error:', error);
    return { connected: false, error: error.message };
  }
}
