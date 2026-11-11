import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { AuthService, type AuthSession } from '../../services';

function detectInitialRecoveryFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  return hash.includes('type=recovery') || search.includes('type=recovery');
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  refreshSession: () => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<AuthSession>;
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<AuthSession>;
  requestPasswordReset: (input: { email: string; newPassword?: string }) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  completeCompanySetup: (companyName: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState<boolean>(() => isSupabaseConfigured);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() =>
    detectInitialRecoveryFromUrl()
  );

  const refreshSession = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSession(null);
      setLoading(false);
      return;
    }
    try {
      const current = await AuthService.getCurrentSession();
      setSession(current);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void refreshSession();

    const unsubscribe = AuthService.onAuthStateChange((nextSession, event) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshSession]);

  const login = async (input: { email: string; password: string }) => {
    const next = await AuthService.login(input);
    setIsPasswordRecovery(false);
    setSession(next);
    return next;
  };

  const signUp = async (input: { fullName: string; email: string; password: string }) => {
    const next = await AuthService.signUp(input);
    setIsPasswordRecovery(false);
    setSession(next);
    return next;
  };

  const requestPasswordReset = async (input: { email: string; newPassword?: string }) => {
    await AuthService.requestPasswordReset(input);
  };

  const updatePassword = async (newPassword: string) => {
    await AuthService.updatePassword(newPassword);
    setIsPasswordRecovery(false);
  };

  const completeCompanySetup = async (companyName: string) => {
    const next = await AuthService.completeCompanySetup(companyName);
    setSession(next);
    return next;
  };

  const logout = async () => {
    await AuthService.logout();
    setIsPasswordRecovery(false);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isPasswordRecovery,
        refreshSession,
        login,
        signUp,
        requestPasswordReset,
        updatePassword,
        completeCompanySetup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export interface UseCompanyValue {
  companyId: string;
  companyName: string;
  needsCompanySetup: boolean;
  loading: boolean;
  session: AuthSession | null;
  completeCompanySetup: (companyName: string) => Promise<AuthSession>;
  refreshCompany: () => Promise<void>;
}

/**
 * Convenience hook returning the current user's active company context.
 */
export function useCompany(): UseCompanyValue {
  const { session, loading, completeCompanySetup, refreshSession } = useAuth();
  return {
    companyId: session?.companyId ?? '',
    companyName: session?.companyName ?? '',
    needsCompanySetup: session?.needsCompanySetup ?? true,
    loading,
    session,
    completeCompanySetup,
    refreshCompany: refreshSession,
  };
}
