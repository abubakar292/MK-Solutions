import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Mail, User } from 'lucide-react';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  AuthCardLayout,
  AuthErrorPill,
  AuthFloatingField,
  AuthPrimaryButton,
  PasswordStrengthMeter,
} from '../features/auth/AuthCardLayout';
import { useAuth } from '../features/auth/AuthContext';

const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name'),
    email: z
      .string()
      .trim()
      .min(1, 'Enter your email address')
      .email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type SignUpFormValues = z.infer<typeof signUpSchema>;

/**
 * D2 Sign-Up Page:
 * - Burgundy background (--brand) with drifting radial depth shapes
 * - Centered white card (max-w 420px, radius 20px, padding 32px, shadow-auth-card)
 * - MK logo reveal + "MK Melting Solutions" in Sora + "Create your account"
 * - 48px floating-label fields: Full name, Email, Password (with 4-segment strength meter),
 *   and Confirm password (with animated match check mark)
 * - Inline field errors while typing/blurring without card shake; failed submit triggers
 *   card shake (0.5s), error pill above button, and under-card rose glow (1.8s)
 */
export const SignUpPage: React.FC = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [formError, setFormError] = useState<string | null>(null);
  const [errorBurstKey, setErrorBurstKey] = useState(0);
  const [succeeded, setSucceeded] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    mode: 'onChange',
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const fullNameValue = watch('fullName');
  const emailValue = watch('email');
  const passwordValue = watch('password');
  const confirmPasswordValue = watch('confirmPassword');

  const passwordsMatch =
    confirmPasswordValue.length > 0 &&
    passwordValue.length >= 8 &&
    confirmPasswordValue === passwordValue;

  const triggerSubmitError = (message: string) => {
    setFormError(message);
    setErrorBurstKey((prev) => prev + 1);
  };

  const onValidSubmit = async (values: SignUpFormValues) => {
    setFormError(null);
    try {
      await signUp({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
      });
      setSucceeded(true);
      await new Promise((resolve) => setTimeout(resolve, 340));
      navigate('/setup-company', { replace: true });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not create account. Try another email.';
      if (message.toLowerCase().includes('email')) {
        setError('email', { type: 'server', message });
      }
      triggerSubmitError(message);
    }
  };

  const onInvalidSubmit = () => {
    triggerSubmitError('Check the highlighted fields above to create your account.');
  };

  const fullNameField = register('fullName', {
    onChange: () => {
      if (formError) setFormError(null);
    },
  });

  const emailField = register('email', {
    onChange: () => {
      if (formError) setFormError(null);
    },
  });

  const passwordField = register('password', {
    onChange: () => {
      if (formError) setFormError(null);
    },
  });

  const confirmPasswordField = register('confirmPassword', {
    onChange: () => {
      if (formError) setFormError(null);
    },
  });

  return (
    <AuthCardLayout
      subtitle="Create your account"
      errorBurstKey={errorBurstKey}
      footer={
        <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
          <span>Already have an account?</span>
          <Link to="/login" className="auth-switch-link focus-ring rounded-[6px] px-0.5">
            Log in
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
          label="Full name"
          icon={User}
          type="text"
          autoComplete="name"
          value={fullNameValue}
          error={errors.fullName?.message}
          {...fullNameField}
        />

        <AuthFloatingField
          label="Email address"
          icon={Mail}
          type="email"
          autoComplete="email"
          value={emailValue}
          error={errors.email?.message}
          {...emailField}
        />

        <div className="space-y-2">
          <AuthFloatingField
            label="Password"
            icon={Lock}
            isPassword
            passwordVisible={passwordVisible}
            onTogglePasswordVisible={() => setPasswordVisible((prev) => !prev)}
            autoComplete="new-password"
            value={passwordValue}
            error={errors.password?.message}
            {...passwordField}
          />
          <PasswordStrengthMeter password={passwordValue} />
        </div>

        <AuthFloatingField
          label="Confirm password"
          icon={Lock}
          isPassword
          passwordVisible={passwordVisible}
          onTogglePasswordVisible={() => setPasswordVisible((prev) => !prev)}
          autoComplete="new-password"
          value={confirmPasswordValue}
          error={errors.confirmPassword?.message}
          showMatchCheck={passwordsMatch}
          {...confirmPasswordField}
        />

        <AuthErrorPill message={formError} />

        <AuthPrimaryButton loading={isSubmitting} succeeded={succeeded}>
          Create account
        </AuthPrimaryButton>
      </form>
    </AuthCardLayout>
  );
};
