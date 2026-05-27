// ============================================================
// BESO PLATFORM: SUPABASE CLIENT CONFIGURATION
// Server-side Supabase client for backend services
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

// Service role client for admin operations (bypasses RLS)
let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }
  
  if (!serviceClient) {
    serviceClient = createClient(supabaseUrl!, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  
  return serviceClient;
}

// Anon client for user-scoped operations (respects RLS)
let anonClient: SupabaseClient | null = null;

export function getAnonClient(): SupabaseClient {
  if (!supabaseAnonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY environment variable');
  }
  
  if (!anonClient) {
    anonClient = createClient(supabaseUrl!, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  
  return anonClient;
}

// Create a client with a specific user's JWT for RLS
export function createUserClient(accessToken: string): SupabaseClient {
  if (!supabaseAnonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY environment variable');
  }
  
  return createClient(supabaseUrl!, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Export the default service client for most operations
export const supabase = {
  get admin() {
    return getServiceClient();
  },
  get anon() {
    return getAnonClient();
  },
  forUser: createUserClient,
};

// Direct export for admin client (used by services)
export const supabaseAdmin = getServiceClient();

export default supabase;
