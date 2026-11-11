import type { User } from '@supabase/supabase-js';
import type { DocumentPrefixes } from '../../domain/types';
import {
  OFFLINE_SAVE_MESSAGE,
  assertOnlineForSave,
  requireSupabaseClient,
  supabase,
} from '../../lib/supabase';
import type { AuthSession, IAuthService } from '../interfaces';
import { resolveCompanyLogoSignedUrl } from './logoStorage';

/**
 * Maps Supabase Auth / PostgREST / network errors into clear, friendly messages
 * for the existing error pill and shake states on the auth pages.
 */
export function mapSupabaseAuthError(
  err: unknown,
  context: 'login' | 'signup' | 'reset' | 'update_password' | 'company_setup' = 'login'
): string {
  if (err instanceof Error && err.message === OFFLINE_SAVE_MESSAGE) {
    return OFFLINE_SAVE_MESSAGE;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (context === 'company_setup' || context === 'update_password') {
      return OFFLINE_SAVE_MESSAGE;
    }
    return 'Network problem. Check your internet connection and try again.';
  }

  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err ?? '');

  const rawCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code).toLowerCase()
      : '';

  const rawStatus =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status: unknown }).status)
      : 0;

  const lower = rawMessage.toLowerCase();

  // 1. Network / fetch failure
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('fetch error')
  ) {
    return 'Network problem. Check your internet connection and try again.';
  }

  // 2. Too many attempts / rate limiting
  if (
    rawStatus === 429 ||
    rawCode.includes('rate_limit') ||
    rawCode === 'over_email_send_rate_limit' ||
    rawCode === 'over_request_rate_limit' ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('too many attempts') ||
    lower.includes('for security purposes, you can only request this')
  ) {
    return 'Too many attempts. Please wait a minute before trying again.';
  }

  // 3. Email not confirmed
  if (
    rawCode === 'email_not_confirmed' ||
    lower.includes('email not confirmed') ||
    lower.includes('confirm your email')
  ) {
    return 'Your email address is not confirmed yet. Check your inbox for the confirmation link.';
  }

  // 4. Duplicate email / already registered
  if (
    rawCode === 'user_already_exists' ||
    rawCode === 'email_exists' ||
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('user already exists') ||
    (context === 'signup' && lower.includes('duplicate'))
  ) {
    return 'An account with this email already exists. Log in instead or use another email.';
  }

  // 5. Weak password / same password
  if (
    rawCode === 'weak_password' ||
    lower.includes('weak password') ||
    lower.includes('password should be at least') ||
    lower.includes('password is too weak') ||
    lower.includes('at least 6 characters') ||
    lower.includes('at least 8 characters')
  ) {
    return 'Password is too weak. Use at least 8 characters with letters and numbers.';
  }

  if (
    rawCode === 'same_password' ||
    lower.includes('new password should be different')
  ) {
    return 'Choose a new password that is different from your current password.';
  }

  // 6. Wrong credentials
  if (
    rawCode === 'invalid_credentials' ||
    rawCode === 'invalid_grant' ||
    lower.includes('invalid login credentials') ||
    lower.includes('invalid email or password') ||
    lower.includes('email or password is incorrect')
  ) {
    return 'Email or password is incorrect';
  }

  // 7. Context-specific fallback
  if (rawMessage.trim()) {
    return rawMessage.trim();
  }

  switch (context) {
    case 'signup':
      return 'Could not create your account. Check your details and try again.';
    case 'reset':
      return 'Could not send the password reset email. Try again in a moment.';
    case 'update_password':
      return 'Could not update your password. Try again.';
    case 'company_setup':
      return 'Could not save your company name. Try again.';
    default:
      return 'Email or password is incorrect';
  }
}

function getUserFullName(user: User): string {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.fullName === 'string' && meta.fullName.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim());
  if (fromMeta) return fromMeta;
  if (user.email) {
    return user.email.split('@')[0] || 'User';
  }
  return 'User';
}

interface SupabaseCompanyRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  logo_url: string | null;
  final_product_name: string | null;
  prefixes: Partial<DocumentPrefixes> | null;
  updated_at: string;
}

/**
 * Resolves the company logo signed URL (or clears it to fallback MK logo) when a company session is loaded.
 */
async function syncCompanyCacheFromSupabase(company: SupabaseCompanyRow): Promise<void> {
  try {
    await resolveCompanyLogoSignedUrl(company.id, company.logo_url);
  } catch {
    // ignore cache sync errors
  }
}

/**
 * Resolves the full AuthSession for an authenticated Supabase user by checking
 * their active membership in `company_members` and loading `companies`.
 */
async function buildAuthSessionForUser(user: User): Promise<AuthSession> {
  const client = requireSupabaseClient();
  const fullName = getUserFullName(user);
  const email = user.email ?? '';

  const { data: memberRow, error: memberError } = await client
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw new Error(mapSupabaseAuthError(memberError, 'login'));
  }

  if (!memberRow?.company_id) {
    return {
      userId: user.id,
      companyId: '',
      fullName,
      email,
      companyName: '',
      needsCompanySetup: true,
    };
  }

  const { data: companyRow, error: companyError } = await client
    .from('companies')
    .select('id, name, phone, email, address, city, logo_url, final_product_name, prefixes, updated_at')
    .eq('id', memberRow.company_id)
    .maybeSingle();

  if (companyError) {
    throw new Error(mapSupabaseAuthError(companyError, 'login'));
  }

  if (!companyRow) {
    return {
      userId: user.id,
      companyId: '',
      fullName,
      email,
      companyName: '',
      needsCompanySetup: true,
    };
  }

  const typedCompany = companyRow as SupabaseCompanyRow;
  await syncCompanyCacheFromSupabase(typedCompany);

  const trimmedName = (typedCompany.name ?? '').trim();

  return {
    userId: user.id,
    companyId: typedCompany.id,
    fullName,
    email,
    companyName: trimmedName,
    needsCompanySetup: trimmedName.length === 0,
  };
}

export const SupabaseAuthService: IAuthService = {
  async getCurrentSession(): Promise<AuthSession | null> {
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) {
      return null;
    }

    try {
      return await buildAuthSessionForUser(data.session.user);
    } catch {
      return null;
    }
  },

  onAuthStateChange(
    listener: (session: AuthSession | null, event?: string) => void
  ): () => void {
    if (!supabase) {
      return () => {};
    }

    const { data } = supabase.auth.onAuthStateChange((event, supaSession) => {
      if (!supaSession?.user) {
        listener(null, event);
        return;
      }

      // Defer async Supabase table queries outside the synchronous auth callback lock
      setTimeout(() => {
        void (async () => {
          try {
            const resolved = await buildAuthSessionForUser(supaSession.user);
            listener(resolved, event);
          } catch {
            listener(
              {
                userId: supaSession.user.id,
                companyId: '',
                fullName: getUserFullName(supaSession.user),
                email: supaSession.user.email ?? '',
                companyName: '',
                needsCompanySetup: true,
              },
              event
            );
          }
        })();
      }, 0);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  },

  async signUp(input: {
    fullName: string;
    email: string;
    password: string;
  }): Promise<AuthSession> {
    const client = requireSupabaseClient();
    const normalizedEmail = input.email.trim().toLowerCase();
    const trimmedName = input.fullName.trim();

    try {
      const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password: input.password,
        options: {
          data: {
            full_name: trimmedName,
            fullName: trimmedName,
          },
        },
      });

      if (error) {
        throw new Error(mapSupabaseAuthError(error, 'signup'));
      }

      // When email confirmation is enabled, Supabase returns a user with empty identities for duplicate emails
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error(
          'An account with this email already exists. Log in instead or use another email.'
        );
      }

      if (!data.user) {
        throw new Error('Could not create your account. Try again.');
      }

      if (!data.session) {
        throw new Error(
          'Your email address is not confirmed yet. Check your inbox for the confirmation link, then log in.'
        );
      }

      return await buildAuthSessionForUser(data.user);
    } catch (err) {
      throw new Error(mapSupabaseAuthError(err, 'signup'));
    }
  },

  async completeCompanySetup(companyName: string): Promise<AuthSession> {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    const trimmed = companyName.trim();
    if (!trimmed) {
      throw new Error('Enter your company name to continue.');
    }

    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();

    if (userError || !user) {
      throw new Error('Your session expired. Sign in again to set your company name.');
    }

    try {
      const { data: createdCompanyId, error: rpcError } = await client.rpc('create_company', {
        p_name: trimmed,
      });

      if (rpcError) {
        throw new Error(mapSupabaseAuthError(rpcError, 'company_setup'));
      }

      const resolvedSession = await buildAuthSessionForUser(user);
      if (resolvedSession.companyId) {
        return resolvedSession;
      }

      const fallbackCompanyId = String(createdCompanyId ?? '');
      return {
        userId: user.id,
        companyId: fallbackCompanyId,
        fullName: getUserFullName(user),
        email: user.email ?? '',
        companyName: trimmed,
        needsCompanySetup: false,
      };
    } catch (err) {
      throw new Error(mapSupabaseAuthError(err, 'company_setup'));
    }
  },

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const client = requireSupabaseClient();
    const normalizedEmail = input.email.trim().toLowerCase();

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password: input.password,
      });

      if (error || !data.user) {
        throw new Error(mapSupabaseAuthError(error ?? new Error('Invalid login credentials'), 'login'));
      }

      return await buildAuthSessionForUser(data.user);
    } catch (err) {
      throw new Error(mapSupabaseAuthError(err, 'login'));
    }
  },

  async requestPasswordReset(input: { email: string; newPassword?: string }): Promise<void> {
    const client = requireSupabaseClient();
    const normalizedEmail = input.email.trim().toLowerCase();

    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/forgot-password`
          : undefined;

      const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) {
        throw new Error(mapSupabaseAuthError(error, 'reset'));
      }
    } catch (err) {
      throw new Error(mapSupabaseAuthError(err, 'reset'));
    }
  },

  async updatePassword(newPassword: string): Promise<void> {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password is too weak. Use at least 8 characters with letters and numbers.');
    }

    try {
      const { error } = await client.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw new Error(mapSupabaseAuthError(error, 'update_password'));
      }
    } catch (err) {
      throw new Error(mapSupabaseAuthError(err, 'update_password'));
    }
  },

  async logout(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
  },
};

export const AuthService: IAuthService = SupabaseAuthService;
