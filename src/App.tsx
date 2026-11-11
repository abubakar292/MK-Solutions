import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppSplash } from './components/loader/AppSplash';
import { DocumentPrepOverlay } from './components/print/PrintLayout';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { AppShell } from './layouts/AppShell';
import { BrandLogo } from './lib/brand';
import {
  getMissingSupabaseEnvVars,
  isSupabaseConfigured,
  type RequiredSupabaseEnvVar,
} from './lib/supabase';
import { BillsPage } from './pages/BillsPage';
import { CompanySetupPage } from './pages/CompanySetupPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { DispatchPage } from './pages/DispatchPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { ProductionPage } from './pages/ProductionPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SignUpPage } from './pages/SignUpPage';
import { StockPage } from './pages/StockPage';
import { queryClient } from './services/supabase/queryClient';

const ALL_SUPABASE_ENV_VARS: RequiredSupabaseEnvVar[] = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

/**
 * Clean setup screen shown when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.
 */
const ConnectDatabaseScreen: React.FC = () => {
  const missingVars = getMissingSupabaseEnvVars();

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-[20px] border border-[var(--border)] bg-[var(--bg)] p-6 sm:p-8 space-y-6 shadow-soft">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo size="lg" />
          <div className="space-y-1">
            <h1 className="font-heading text-xl font-semibold text-[var(--text)]">
              Connect your database
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-muted)]">
              Set the missing Supabase environment variables below and restart the app.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {ALL_SUPABASE_ENV_VARS.map((envName) => {
            const isMissing = missingVars.includes(envName);
            return (
              <div
                key={envName}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 py-2.5"
              >
                <code className="font-mono text-xs font-medium text-[var(--text)]">
                  {envName}
                </code>
                <span
                  className={
                    isMissing
                      ? 'rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--danger)]'
                      : 'rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--success)]'
                  }
                >
                  {isMissing ? 'Missing' : 'Configured'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (session.needsCompanySetup && location.pathname !== '/setup-company') {
    return <Navigate to="/setup-company" replace />;
  }

  return <>{children}</>;
};

const RequireCompanySetup: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!session.needsCompanySetup) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const RequireGuest: React.FC<{
  children: React.ReactNode;
  allowRecovery?: boolean;
}> = ({ children, allowRecovery = false }) => {
  const { session, loading, isPasswordRecovery } = useAuth();

  if (loading) {
    return null;
  }

  if (allowRecovery && isPasswordRecovery) {
    return <>{children}</>;
  }

  if (session) {
    if (session.needsCompanySetup) {
      return <Navigate to="/setup-company" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { loading } = useAuth();

  return (
    <>
      <AppSplash ready={!loading} />
      <DocumentPrepOverlay />
      <Routes>
        <Route
          path="/login"
          element={
            <RequireGuest>
              <LoginPage />
            </RequireGuest>
          }
        />
        <Route
          path="/signup"
          element={
            <RequireGuest>
              <SignUpPage />
            </RequireGuest>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <RequireGuest allowRecovery>
              <ForgotPasswordPage />
            </RequireGuest>
          }
        />
        <Route
          path="/setup-company"
          element={
            <RequireCompanySetup>
              <CompanySetupPage />
            </RequireCompanySetup>
          }
        />

        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="purchases" element={<PurchasesPage />} />
          <Route path="suppliers" element={<Navigate to="/purchases?tab=suppliers" replace />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="production" element={<ProductionPage />} />
          <Route path="dispatch" element={<DispatchPage />} />
          <Route path="bills" element={<BillsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
};

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <ErrorBoundary>
        <ConnectDatabaseScreen />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: 'var(--shadow-pop)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                },
              }}
            />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
