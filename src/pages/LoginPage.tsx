import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Mail } from 'lucide-react';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  AuthCardLayout,
  AuthErrorPill,
  AuthFloatingField,
  AuthPrimaryButton,
} from '../features/auth/AuthCardLayout';
import { useAuth } from '../features/auth/AuthContext';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * D2 Login Page:
 * - Burgundy background (--brand) with drifting radial depth shapes
 * - Centered white card (max-w 420px, radius 20px, padding 32px, shadow-auth-card)
 * - MK logo reveal + "MK Melting Solutions" in Sora + "Welcome back"
 * - 48px floating-label fields with Mail/Lock icons, focus bounce, animated password eye
 * - Full-width 48px primary button (--grad-brand, hover sheen, nudging arrow, BrandLoader xs, success check)
 * - Error shake (0.5s), red field borders + icons, error pill above button, and under-card rose glow (1.8s)
 */
export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [formError, setFormError] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState(false);
  const [errorBurstKey, setErrorBurstKey] = useState(0);
  const [succeeded, setSucceeded] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const emailValue = watch('email');
  const passwordValue = watch('password');

  const triggerErrorFeedback = (message: string, markCredentials = false) => {
    setFormError(message);
    setCredentialError(markCredentials);
    setErrorBurstKey((prev) => prev + 1);
  };

  const onValidSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    setCredentialError(false);

    try {
      const session = await login({
        email: values.email,
        password: values.password,
      });
      setSucceeded(true);
      await new Promise((resolve) => setTimeout(resolve, 340));
      if (session.needsCompanySetup) {
        navigate('/setup-company', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Email or password is incorrect';
      triggerErrorFeedback(message, true);
    }
  };

  const onInvalidSubmit = () => {
    triggerErrorFeedback('Enter a valid email address and password to continue.', false);
  };

  const emailField = register('email', {
    onChange: () => {
      if (credentialError) setCredentialError(false);
      if (formError) setFormError(null);
    },
  });

  const passwordField = register('password', {
    onChange: () => {
      if (credentialError) setCredentialError(false);
      if (formError) setFormError(null);
    },
  });

  return (
    <AuthCardLayout
      subtitle="Welcome back"
      errorBurstKey={errorBurstKey}
      footer={
        <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
          <span>New to MK Melting Solutions?</span>
          <Link to="/signup" className="auth-switch-link focus-ring rounded-[6px] px-0.5">
            Create account
          </Link>
        </div>
      }
    >
      <form
        onSubmit={handleSubmit(onValidSubmit, onInvalidSubmit)}
        noValidate
        className="space-y-4"
      >
        <AuthFloatingField
          label="Email address"
          icon={Mail}
          type="email"
          autoComplete="email"
          value={emailValue}
          error={errors.email?.message}
          hasSubmitError={credentialError}
          {...emailField}
        />

        <div className="space-y-2">
          <AuthFloatingField
            label="Password"
            icon={Lock}
            isPassword
            autoComplete="current-password"
            value={passwordValue}
            error={errors.password?.message}
            hasSubmitError={credentialError}
            {...passwordField}
          />

          <div data-auth-stagger className="flex justify-end">
            <Link
              to="/forgot-password"
              className="auth-switch-link text-xs focus-ring rounded-[6px] px-0.5"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <AuthErrorPill message={formError} />

        <AuthPrimaryButton loading={isSubmitting} succeeded={succeeded}>
          Log in
        </AuthPrimaryButton>
      </form>
    </AuthCardLayout>
  );
};
