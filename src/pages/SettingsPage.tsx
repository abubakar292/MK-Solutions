import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Building2, Image as ImageIcon, RotateCcw, Upload } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { SectionLoader } from '../components/loader/SectionLoader';
import { TextInput } from '../components/shared/Inputs';
import { PageHeader } from '../components/shared/PageHeader';
import { Button } from '../components/ui/Button';
import { useAuth } from '../features/auth/AuthContext';
import { BrandLogo, getCustomLogoDataUrl, isDefaultLogoMissing } from '../lib/brand';
import { useStaggerIn } from '../lib/motion';
import { notify } from '../lib/notify';
import { cn } from '../lib/utils';
import { SettingsService } from '../services';

const settingsSchema = z.object({
  companyName: z.string().trim().min(2, 'Enter company name'),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      'Enter a valid email address'
    ),
  city: z.string().trim().optional(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

type SectionId = 'company-profile' | 'company-logo';

const SECTIONS: {
  id: SectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'company-profile',
    label: 'Company profile',
    description: 'Name, contact and address',
    icon: Building2,
  },
  {
    id: 'company-logo',
    label: 'Logo',
    description: 'Brand mark for app and PDFs',
    icon: ImageIcon,
  },
];

const INITIAL_DEFAULTS: SettingsFormValues = {
  companyName: 'MK Melting Solutions',
  address: '',
  phone: '',
  email: '',
  city: 'Lahore',
};

export const SettingsPage: React.FC = () => {
  const { session, refreshSession } = useAuth();
  const companyId = session?.companyId ?? '';
  const queryClient = useQueryClient();

  const pageRef = useRef<HTMLDivElement>(null);
  const profileSectionRef = useRef<HTMLElement>(null);
  const logoSectionRef = useRef<HTMLElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('company-profile');

  // Persisted vs draft state for clean Discard & dirty detection
  const [savedValues, setSavedValues] = useState<SettingsFormValues>(INITIAL_DEFAULTS);
  const [savedLogo, setSavedLogo] = useState<string | null>(() =>
    getCustomLogoDataUrl(companyId)
  );
  const [draftLogo, setDraftLogo] = useState<string | null>(() =>
    getCustomLogoDataUrl(companyId)
  );
  const [logoMissing, setLogoMissing] = useState<boolean>(() => isDefaultLogoMissing());

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty: isFormDirty },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: INITIAL_DEFAULTS,
  });

  const watchedCompanyName = watch('companyName');

  useStaggerIn(pageRef, '[data-stagger-item]', !loading);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const s = await SettingsService.getSettings(companyId);
        if (!active) return;
        const loadedValues: SettingsFormValues = {
          companyName: s.companyName || 'MK Melting Solutions',
          address: s.address ?? '',
          phone: s.phone ?? '',
          email: s.email ?? '',
          city: s.city ?? 'Lahore',
        };
        setSavedValues(loadedValues);
        reset(loadedValues);

        const initialLogo = s.logoDataUrl || getCustomLogoDataUrl(companyId) || null;
        setSavedLogo(initialLogo);
        setDraftLogo(initialLogo);
        setLogoMissing(isDefaultLogoMissing());
      } catch (err) {
        notify.error(err instanceof Error ? err.message : 'Could not load settings.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [companyId, reset]);

  useEffect(() => {
    const syncLogoState = () => {
      const currentStored = getCustomLogoDataUrl(companyId);
      setSavedLogo(currentStored);
      setDraftLogo(currentStored);
      setLogoMissing(isDefaultLogoMissing());
    };
    window.addEventListener('mk-logo-updated', syncLogoState);
    return () => window.removeEventListener('mk-logo-updated', syncLogoState);
  }, [companyId]);

  // Scroll spy to highlight active section in left navigation as user scrolls
  useEffect(() => {
    if (loading) return;
    const profileEl = profileSectionRef.current;
    const logoEl = logoSectionRef.current;
    if (!profileEl || !logoEl) return;

    const handleScroll = () => {
      const logoRect = logoEl.getBoundingClientRect();
      const viewportTrigger = Math.min(260, window.innerHeight * 0.38);
      const nearBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 48;

      if (nearBottom || logoRect.top <= viewportTrigger) {
        setActiveSection('company-logo');
      } else {
        setActiveSection('company-profile');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loading]);

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    const target =
      id === 'company-profile' ? profileSectionRef.current : logoSectionRef.current;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const isLogoDirty = (draftLogo ?? '') !== (savedLogo ?? '');
  const hasUnsavedChanges = isFormDirty || isLogoDirty;
  const showStickyBar = hasUnsavedChanges || saving || savedSuccess;

  const onSave = async (values: SettingsFormValues) => {
    if (!companyId) return;
    setSaving(true);
    setSavedSuccess(false);
    try {
      const updated = await SettingsService.updateSettings(companyId, {
        companyName: values.companyName,
        address: values.address || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        city: values.city || undefined,
        logoDataUrl: draftLogo ?? '',
      });

      const normalizedSaved: SettingsFormValues = {
        companyName: updated.companyName || values.companyName,
        address: updated.address ?? '',
        phone: updated.phone ?? '',
        email: updated.email ?? '',
        city: updated.city ?? '',
      };
      setSavedValues(normalizedSaved);
      reset(normalizedSaved);

      const persistedLogo = updated.logoDataUrl || null;
      setSavedLogo(persistedLogo);
      setDraftLogo(persistedLogo);

      await refreshSession();
      await queryClient.invalidateQueries({ queryKey: ['settings', companyId] });

      setSavedSuccess(true);
      notify.success('Company settings saved.');
      window.setTimeout(() => {
        setSavedSuccess(false);
      }, 1400);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    reset(savedValues);
    setDraftLogo(savedLogo);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
    notify.info('Discarded unsaved changes.');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify.error('Select a PNG, JPG, or WebP image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify.error('Logo image must be smaller than 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      setDraftLogo(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    setDraftLogo(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <SectionLoader label="Loading settings..." />
      </div>
    );
  }

  return (
    <div ref={pageRef} className="space-y-6 pb-28">
      <div data-stagger-item>
        <PageHeader title="Settings" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
        {/* Left column on desktop: compact section navigation that highlights on scroll */}
        <aside
          data-stagger-item
          aria-label="Settings sections"
          className="md:sticky md:top-20 bg-[var(--bg)] border border-[var(--border)] rounded-[14px] p-2 shadow-card"
        >
          <div className="px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)]">
            Sections
          </div>
          <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto">
            {SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => scrollToSection(sec.id)}
                  className={cn(
                    'group relative flex items-center gap-2.5 w-full min-h-[44px] px-3 py-2 rounded-[10px] text-left transition-colors duration-150 cursor-pointer shrink-0 md:shrink',
                    isActive
                      ? 'bg-[var(--brand-soft)] text-[var(--text)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] font-medium'
                  )}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="hidden md:block absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-[var(--brand)]"
                    />
                  )}
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-[8px] shrink-0 transition-colors',
                      isActive
                        ? 'bg-[var(--bg)] text-[var(--brand-deep)] shadow-soft'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] group-hover:text-[var(--text)]'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{sec.label}</div>
                    <div className="hidden md:block text-[11px] text-[var(--text-muted)] truncate font-normal">
                      {sec.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right column: Settings sections */}
        <form
          onSubmit={handleSubmit(onSave)}
          noValidate
          className="space-y-6 min-w-0"
        >
          {/* Section 1: Company profile */}
          <section
            id="company-profile"
            ref={profileSectionRef}
            data-stagger-item
            className="scroll-mt-24 bg-[var(--bg)] border border-[var(--border)] rounded-[14px] shadow-card overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--brand-soft)] text-[var(--brand-deep)] shrink-0">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-[var(--text)] truncate">
                  Company profile
                </h2>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  Shown in the app header and on every printed invoice, receipt, and statement.
                </p>
              </div>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <TextInput
                  label="Company name"
                  required
                  placeholder="Enter company name"
                  error={errors.companyName?.message}
                  {...register('companyName')}
                />
              </div>

              <TextInput
                label="Phone"
                placeholder="e.g. 0300-1234567"
                error={errors.phone?.message}
                {...register('phone')}
              />

              <TextInput
                label="Email"
                type="email"
                placeholder="e.g. info@mksolutions.pk"
                error={errors.email?.message}
                {...register('email')}
              />

              <TextInput
                label="City"
                placeholder="e.g. Lahore"
                error={errors.city?.message}
                {...register('city')}
              />

              <TextInput
                label="Address"
                placeholder="Plot, street, or industrial area"
                error={errors.address?.message}
                {...register('address')}
              />
            </div>
          </section>

          {/* Section 2: Logo */}
          <section
            id="company-logo"
            ref={logoSectionRef}
            data-stagger-item
            className="scroll-mt-24 bg-[var(--bg)] border border-[var(--border)] rounded-[14px] shadow-card overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--brand-soft)] text-[var(--brand-deep)] shrink-0">
                <ImageIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-[var(--text)] truncate">
                  Logo
                </h2>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  Used in the sidebar, top bar, and at the top of printed PDF documents.
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {!draftLogo && logoMissing && (
                <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-[var(--brand-soft)] border border-[var(--border)] text-xs text-[var(--text)]">
                  <AlertCircle className="h-4 w-4 text-[var(--brand-deep)] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Default logo file not found.</span> Upload
                    your company logo below so it appears in the app and on printed PDFs.
                  </div>
                </div>
              )}

              {/* Preview card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[12px] bg-[var(--surface-subtle)] border border-[var(--border)]">
                <div className="flex items-center gap-3.5 min-w-0">
                  <BrandLogo
                    size="xl"
                    showText={false}
                    companyName={watchedCompanyName || savedValues.companyName || 'MK Solutions'}
                    companyId={companyId}
                    overrideLogoSrc={draftLogo}
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text)] truncate">
                        {watchedCompanyName || savedValues.companyName || 'MK Melting Solutions'}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-medium border',
                          draftLogo
                            ? 'bg-[var(--brand-soft)] text-[var(--brand-deep)] border-[var(--brand)]/25'
                            : 'bg-[var(--bg)] text-[var(--text-secondary)] border-[var(--border)]'
                        )}
                      >
                        {draftLogo ? 'Custom logo' : 'Default MK logo'}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {draftLogo
                        ? 'Your custom logo is active. Removing it restores the default MK logo.'
                        : 'Showing the default MK Solutions logo. Upload a square PNG or JPG (up to 2 MB) to replace it.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload logo
                  </Button>
                  {draftLogo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveLogo}
                      className="text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </form>
      </div>

      {/* Sticky Save Bar that slides up when something changed */}
      <div
        aria-live="polite"
        className={cn(
          'fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:w-[460px] z-40 transition-all duration-300 ease-out',
          showStickyBar
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-8 opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-[14px] bg-[var(--bg)] border border-[var(--border-strong)] shadow-pop">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={cn(
                'h-2 w-2 rounded-full shrink-0 transition-colors',
                savedSuccess && !hasUnsavedChanges
                  ? 'bg-[var(--success)]'
                  : 'bg-[var(--brand)] glow-focus'
              )}
            />
            <span className="text-sm font-medium text-[var(--text)] truncate">
              {savedSuccess && !hasUnsavedChanges ? 'Changes saved' : 'Unsaved changes'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving || !hasUnsavedChanges}
              onClick={handleDiscard}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={saving}
              saved={savedSuccess}
              disabled={!hasUnsavedChanges && !savedSuccess}
              onClick={handleSubmit(onSave)}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
