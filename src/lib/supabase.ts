import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type RequiredSupabaseEnvVar = 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY';

export const OFFLINE_SAVE_MESSAGE = 'You are offline. Reconnect to save';

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const rawSupabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/**
 * Blocks any save/mutation immediately when the browser is offline so writes are never silently dropped.
 */
export function assertOnlineForSave(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(OFFLINE_SAVE_MESSAGE);
  }
}

/**
 * Returns the list of required Supabase environment variables that are missing or empty.
 */
export function getMissingSupabaseEnvVars(): RequiredSupabaseEnvVar[] {
  const missing: RequiredSupabaseEnvVar[] = [];
  if (!rawSupabaseUrl) {
    missing.push('VITE_SUPABASE_URL');
  }
  if (!rawSupabaseAnonKey) {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }
  return missing;
}

/**
 * True only when both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured.
 */
export const isSupabaseConfigured: boolean =
  Boolean(rawSupabaseUrl) && Boolean(rawSupabaseAnonKey);

const offlineAwareFetch: typeof fetch = async (input, init) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const method = (init?.method || 'GET').toUpperCase();
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const isMutationOrWriteRpc =
      method === 'POST' ||
      method === 'PUT' ||
      method === 'PATCH' ||
      method === 'DELETE';

    const isReadOnlySignedUrlRequest = url.includes('/storage/v1/object/sign/');
    const isAuthSessionRefresh = url.includes('/auth/v1/token');

    if (
      isMutationOrWriteRpc &&
      !isReadOnlySignedUrlRequest &&
      !isAuthSessionRefresh
    ) {
      throw new Error(OFFLINE_SAVE_MESSAGE);
    }
  }

  return fetch(input, init);
};

/**
 * Singleton Supabase client (null when environment variables are missing so the app
 * can render the "Connect your database" screen without throwing).
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawSupabaseUrl, rawSupabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: offlineAwareFetch,
      },
    })
  : null;

/**
 * Returns the configured Supabase client or throws a clear configuration error.
 */
export function requireSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const missing = getMissingSupabaseEnvVars();
    throw new Error(
      `Database connection is not configured. Missing environment variable${
        missing.length > 1 ? 's' : ''
      }: ${missing.join(', ')}.`
    );
  }
  return supabase;
}
