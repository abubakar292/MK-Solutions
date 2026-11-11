import { zodResolver } from '@hookform/resolvers/zod';
import React, { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { TextInput } from '../components/shared/Inputs';
import { Button } from '../components/ui/Button';
import { useAuth } from '../features/auth/AuthContext';
import { BrandLogo } from '../lib/brand';
import { shake, usePageEnter } from '../lib/motion';

const companySchema = z.object({
  companyName: z.string().trim().min(2, 'Enter your company name'),
});

type CompanyFormValues = z.infer<typeof companySchema>;

/**
 * CompanySetupPage per A2 & D1:
 * Auth card uses 20px radius, shadow-soft, BrandLogo, and Button loading (BrandLoader xs).
 */
export const CompanySetupPage: React.FC = () => {
  const { completeCompanySetup } = useAuth();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [formError, setFormError] = useState<string | null>(null);

  usePageEnter(pageRef, 'setup-company');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      companyName: 'MK Melting Solutions',
    },
  });

  const onSubmit = async (values: CompanyFormValues) => {
    setFormError(null);
    try {
      await completeCompanySetup(values.companyName);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not save company name. Try again.'
      );
      shake(cardRef.current);
    }
  };

  return (
    <div
      ref={pageRef}
      className="min-h-[100dvh] bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-8"
    >
      <div
        ref={cardRef}
        className="w-full max-w-sm rounded-[20px] border border-[var(--border)] bg-[var(--bg)] p-6 sm:p-7 space-y-6 shadow-soft"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo size="lg" />
          <h1 className="font-heading text-xl font-semibold text-[var(--text)]">Company name</h1>
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--danger)]"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <TextInput
            label="Company name"
            type="text"
            placeholder="MK Melting Solutions"
            autoFocus
            error={errors.companyName?.message}
            {...register('companyName')}
          />

          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            className="w-full"
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
};
