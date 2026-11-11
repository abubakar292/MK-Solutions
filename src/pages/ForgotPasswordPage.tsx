import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Lock, Mail } from 'lucide-react';
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

const requestResetEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .email('Enter a valid email address'),
});

type RequestResetEmailValues = z.infer<typeof requestResetEmailSchema>;

const updatePasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>;

/**
 * D2 Forgot Password Page:
 * Uses the exact same burgundy background, drifting radial shapes, white card,
 * MK logo reveal, floating-label fields, error shake + pill + under-card glow,
 * and animated switch link back to Log in.
 * - Step 1 (default): sends a Supabase password reset email via requestPasswordReset.
 * - Step 2 (recovery link session): updates the user's password via updatePassword.
 */
export const ForgotPasswordPage: React.FC = () => {
  const { requestPasswordReset, updatePassword, isPasswordRecovery, logout } = useAuth();
  const navigate = useNavigate();

  const [formError, setFormError] = useState<string | null>(null);
  const [emailSubmitError, setEmailSubmitError] = useState(false);
  const [errorBurstKey, setErrorBurstKey] = useState(0);
  const [succeeded, setSucceeded] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const emailForm = useForm<RequestResetEmailValues>({
    resolver: zodResolver(requestResetEmailSchema),
    mode: 'onTouched',
    defaultValues: {
      email: '',
    },
  });

  const passwordForm = useForm<UpdatePasswordValues>({
    resolver: zodResolver(updatePasswordSchema),
    mode: 'onTouched',
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const emailValue = emailForm.watch('email');
  const newPasswordValue = passwordForm.watch('newPassword');
  const confirmPasswordValue = passwordForm.watch('confirmPassword');

  const passwordsMatch =
    confirmPasswordValue.length > 0 &&
    newPasswordValue.length >= 8 &&
    confirmPasswordValue === newPasswordValue;

  const triggerErrorFeedback = (message: string, markEmail = false) => {
    setFormError(message);
    setEmailSubmitError(markEmail);
    setErrorBurstKey((prev) => prev + 1);
  };

  const onSendResetEmail = async (values: RequestResetEmailValues) => {
    setFormError(null);
    setEmailSubmitError(false);

    try {
      await requestPasswordReset({ email: values.email });
      setSucceeded(true);
      await new Promise((resolve) => setTimeout(resolve, 360));
      setEmailSentTo(values.email.trim());
      setSucceeded(false);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not send the password reset email. Try again.';
      triggerErrorFeedback(message, true);
    }
  };

  const onUpdatePassword = async (values: UpdatePasswordValues) => {
    setFormError(null);

    try {
      await updatePassword(values.newPassword);
      setSucceeded(true);
      await new Promise((resolve) => setTimeout(resolve, 360));
      await logout();
      setPasswordUpdated(true);
      setSucceeded(false);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not update your password. Try again.';
      triggerErrorFeedback(message, false);
    }
  };

  const emailField = emailForm.register('email', {
    onChange: () => {
      if (emailSubmitError) setEmailSubmitError(false);
      if (formError) setFormError(null);
    },
  });

  const newPasswordField = passwordForm.register('newPassword', {
    onChange: () => {
      if (formError) setFormError(null);
    },
  });

  const confirmPasswordField = passwordForm.register('confirmPassword', {
    onChange: () => {
      if (formError) setFormError(null);
    },
  });

  return (
    <AuthCardLayout
      subtitle={isPasswordRecovery ? 'Set your new password' : 'Reset your password'}
      errorBurstKey={errorBurstKey}
      footer={
        <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
          <span>Remember your password?</span>
          <Link to="/login" className="auth-switch-link focus-ring rounded-[6px] px-0.5">
            Log in
          </Link>
        </div>
      }
    >
      {passwordUpdated ? (
        <div className="space-y-5 text-center py-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-bg)] border border-[var(--success-border)] text-[var(--success)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-heading text-base font-semibold text-[var(--text)]">
              Password updated
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Your password has been reset. You can now log in with your new password.
            </p>
          </div>
          <AuthPrimaryButton
            type="button"
            onClick={() => navigate('/login', { replace: true })}
          >
            Continue to log in
          </AuthPrimaryButton>
        </div>
      ) : emailSentTo ? (
        <div className="space-y-5 text-center py-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-bg)] border border-[var(--success-border)] text-[var(--success)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-heading text-base font-semibold text-[var(--text)]">
              Check your email
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              We sent a password reset link to <span className="font-medium text-[var(--text)]">{emailSentTo}</span>. Open the link to choose a new password.
            </p>
          </div>
          <AuthPrimaryButton
            type="button"
            onClick={() => navigate('/login', { replace: true })}
          >
            Back to log in
          </AuthPrimaryButton>
        </div>
      ) : isPasswordRecovery ? (
        <form
          onSubmit={passwordForm.handleSubmit(onUpdatePassword, () =>
            triggerErrorFeedback('Check the highlighted fields above to update your password.')
          )}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-2">
            <AuthFloatingField
              label="New password"
              icon={Lock}
              isPassword
              passwordVisible={passwordVisible}
              onTogglePasswordVisible={() => setPasswordVisible((prev) => !prev)}
              autoComplete="new-password"
              value={newPasswordValue}
              error={passwordForm.formState.errors.newPassword?.message}
              {...newPasswordField}
            />
            <PasswordStrengthMeter password={newPasswordValue} />
          </div>

          <AuthFloatingField
            label="Confirm new password"
            icon={Lock}
            isPassword
            passwordVisible={passwordVisible}
            onTogglePasswordVisible={() => setPasswordVisible((prev) => !prev)}
            autoComplete="new-password"
            value={confirmPasswordValue}
            error={passwordForm.formState.errors.confirmPassword?.message}
            showMatchCheck={passwordsMatch}
            {...confirmPasswordField}
          />

          <AuthErrorPill message={formError} />

          <AuthPrimaryButton
            loading={passwordForm.formState.isSubmitting}
            succeeded={succeeded}
          >
            Update password
          </AuthPrimaryButton>
        </form>
      ) : (
        <form
          onSubmit={emailForm.handleSubmit(onSendResetEmail, () =>
            triggerErrorFeedback('Enter a valid email address to reset your password.', true)
          )}
          noValidate
          className="space-y-4"
        >
          <AuthFloatingField
            label="Account email address"
            icon={Mail}
            type="email"
            autoComplete="email"
            value={emailValue}
            error={emailForm.formState.errors.email?.message}
            hasSubmitError={emailSubmitError}
            {...emailField}
          />

          <AuthErrorPill message={formError} />

          <AuthPrimaryButton
            loading={emailForm.formState.isSubmitting}
            succeeded={succeeded}
          >
            Send reset link
          </AuthPrimaryButton>
        </form>
      )}
    </AuthCardLayout>
  );
};
