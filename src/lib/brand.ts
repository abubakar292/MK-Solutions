import React, { useEffect, useState } from 'react';

export const MK_LOGO_URL = '/brand/mk-logo.jpg';
export const DEFAULT_LOGO_PATH = MK_LOGO_URL;

let cachedDefaultLogoBase64: string | null = null;
let defaultLogoMissingFlag: boolean | null = null;

const customLogoUrlByCompany = new Map<string, string>();
const cachedCustomBase64ByCompany = new Map<
  string,
  { source: string; base64: string }
>();

function getCompanyKey(companyId?: string): string {
  return companyId || '__default__';
}

/**
 * Resolves a CSS custom property from :root at runtime (useful for Canvas / @react-pdf).
 */
export function resolveCssToken(tokenName: string, fallbackValue: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallbackValue;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(tokenName)
    .trim();
  return value || fallbackValue;
}

export function getCustomLogoDataUrl(companyId?: string): string | null {
  const key = getCompanyKey(companyId);
  const val =
    customLogoUrlByCompany.get(key) ||
    (!companyId ? customLogoUrlByCompany.get('__default__') ?? null : null);
  if (!val) return null;
  if (
    !val.startsWith('data:') &&
    !val.startsWith('http://') &&
    !val.startsWith('https://') &&
    !val.startsWith('blob:') &&
    !val.startsWith('/')
  ) {
    return null;
  }
  return val;
}

export function getActiveLogoUrl(companyId?: string): string {
  return getCustomLogoDataUrl(companyId) || MK_LOGO_URL;
}

export function setCustomLogoDataUrl(
  dataUrl: string | null,
  companyId?: string,
  precomputedBase64?: string | null
): void {
  const mapKey = getCompanyKey(companyId);

  if (dataUrl) {
    customLogoUrlByCompany.set(mapKey, dataUrl);
    customLogoUrlByCompany.set('__default__', dataUrl);

    const base64Candidate =
      precomputedBase64 ||
      (dataUrl.startsWith('data:image/') ? dataUrl : null);

    if (base64Candidate) {
      cachedCustomBase64ByCompany.set(mapKey, {
        source: dataUrl,
        base64: base64Candidate,
      });
      cachedCustomBase64ByCompany.set('__default__', {
        source: dataUrl,
        base64: base64Candidate,
      });
    }
  } else {
    customLogoUrlByCompany.delete(mapKey);
    customLogoUrlByCompany.delete('__default__');
    cachedCustomBase64ByCompany.delete(mapKey);
    cachedCustomBase64ByCompany.delete('__default__');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mk-logo-updated'));
  }
}

/**
 * Generates a crisp square fallback PNG data URL for PDFs when /brand/mk-logo.jpg is unavailable.
 */
function createFallbackBrandPngDataUrl(): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const bg = resolveCssToken('--bg', 'rgb(255, 255, 255)');
  const brand = resolveCssToken('--brand', 'rgb(124, 14, 68)');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = brand;
  ctx.beginPath();
  ctx.roundRect(8, 8, 112, 112, 22);
  ctx.fill();

  ctx.fillStyle = bg;
  ctx.font = 'bold 52px Sora, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MK', 64, 66);

  return canvas.toDataURL('image/png');
}

/**
 * Rasterizes any image data URL (e.g. SVG or WebP) into a PNG data URL so @react-pdf/renderer
 * can always embed it reliably.
 */
async function ensurePngOrJpegDataUrl(dataUrl: string): Promise<string> {
  if (
    dataUrl.startsWith('data:image/png') ||
    dataUrl.startsWith('data:image/jpeg') ||
    dataUrl.startsWith('data:image/jpg')
  ) {
    return dataUrl;
  }
  if (typeof document === 'undefined') return dataUrl;

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 128;
        canvas.height = img.naturalHeight || 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(createFallbackBrandPngDataUrl());
          return;
        }
        const bg = resolveCssToken('--bg', 'rgb(255, 255, 255)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(createFallbackBrandPngDataUrl());
      }
    };
    img.onerror = () => resolve(createFallbackBrandPngDataUrl());
    img.src = dataUrl;
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert the active logo once to a base64 data URL and reuse it for @react-pdf/renderer
 * and printed documents.
 */
export async function getLogoBase64DataUrl(companyId?: string): Promise<string> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font readiness error
    }
  }

  const mapKey = getCompanyKey(companyId);
  const custom = getCustomLogoDataUrl(companyId);

  if (custom) {
    const memCached =
      cachedCustomBase64ByCompany.get(mapKey) ||
      (!companyId ? cachedCustomBase64ByCompany.get('__default__') : undefined);
    if (memCached && memCached.source === custom && memCached.base64) {
      return ensurePngOrJpegDataUrl(memCached.base64);
    }

    if (custom.startsWith('data:image/')) {
      const normalized = await ensurePngOrJpegDataUrl(custom);
      cachedCustomBase64ByCompany.set(mapKey, {
        source: custom,
        base64: normalized,
      });
      return normalized;
    }

    // Custom logo is a signed URL: fetch once, convert to base64 data URL, and cache in memory for reuse
    try {
      const res = await fetch(custom, { method: 'GET' });
      if (res.ok) {
        const blob = await res.blob();
        const rawDataUrl = await blobToDataUrl(blob);
        const normalized = await ensurePngOrJpegDataUrl(rawDataUrl);
        cachedCustomBase64ByCompany.set(mapKey, {
          source: custom,
          base64: normalized,
        });
        cachedCustomBase64ByCompany.set('__default__', {
          source: custom,
          base64: normalized,
        });
        return normalized;
      }
    } catch {
      // Fallback to default logo below if signed URL fetch fails
    }
  }

  if (cachedDefaultLogoBase64) {
    return cachedDefaultLogoBase64;
  }

  try {
    const res = await fetch(DEFAULT_LOGO_PATH, { method: 'GET', cache: 'force-cache' });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.startsWith('image/')) {
      const blob = await res.blob();
      const rawDataUrl = await blobToDataUrl(blob);
      const base64 = await ensurePngOrJpegDataUrl(rawDataUrl);
      cachedDefaultLogoBase64 = base64;
      defaultLogoMissingFlag = false;
      return base64;
    }
  } catch {
    // Fallback below
  }

  defaultLogoMissingFlag = true;
  cachedDefaultLogoBase64 = createFallbackBrandPngDataUrl();
  return cachedDefaultLogoBase64;
}

export function isDefaultLogoMissing(): boolean {
  return defaultLogoMissingFlag === true;
}

export interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  collapsed?: boolean;
  companyName?: string;
  companyId?: string;
  badge?: boolean;
  overrideLogoSrc?: string | null;
  className?: string;
}

const SIZE_CLASSES: Record<
  NonNullable<BrandLogoProps['size']>,
  { badge: string; img: string; title: string }
> = {
  xs: { badge: 'h-7 w-7 p-0.5 rounded-[8px]', img: 'h-full w-full', title: 'text-sm' },
  sm: { badge: 'h-8 w-8 p-0.5 rounded-[8px]', img: 'h-full w-full', title: 'text-sm' },
  md: { badge: 'h-10 w-10 p-1 rounded-[10px]', img: 'h-full w-full', title: 'text-base' },
  lg: { badge: 'h-12 w-12 p-1 rounded-[12px]', img: 'h-full w-full', title: 'text-lg' },
  xl: { badge: 'h-16 w-16 p-1.5 rounded-[14px]', img: 'h-full w-full', title: 'text-xl' },
};

/**
 * Centralized BrandLogo component per A5:
 * Always places the white-background MK logo inside a clean white rounded badge so it looks sharp on any surface.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = true,
  collapsed = false,
  companyName = 'MK Solutions',
  companyId,
  badge = true,
  overrideLogoSrc,
  className = '',
}) => {
  const [customLogo, setCustomLogo] = useState<string | null>(() =>
    getCustomLogoDataUrl(companyId)
  );
  const [imgFailed, setImgFailed] = useState<boolean>(false);

  useEffect(() => {
    setCustomLogo(getCustomLogoDataUrl(companyId));
    setImgFailed(false);

    const syncLogo = () => {
      setCustomLogo(getCustomLogoDataUrl(companyId));
      setImgFailed(false);
    };
    window.addEventListener('mk-logo-updated', syncLogo);
    return () => window.removeEventListener('mk-logo-updated', syncLogo);
  }, [companyId]);

  const effectiveCustomLogo = overrideLogoSrc !== undefined ? overrideLogoSrc : customLogo;
  const activeSrc = effectiveCustomLogo || (!imgFailed ? DEFAULT_LOGO_PATH : null);
  const sz = SIZE_CLASSES[size];

  return React.createElement(
    'div',
    {
      className: `inline-flex items-center gap-2.5 min-w-0 shrink-0 select-none ${className}`,
    },
    activeSrc
      ? React.createElement(
          'div',
          {
            className: `${sz.badge} bg-[var(--bg)] ${
              badge ? 'border border-[var(--border)] shadow-soft' : ''
            } flex items-center justify-center overflow-hidden shrink-0`,
          },
          React.createElement('img', {
            src: activeSrc,
            alt: companyName,
            referrerPolicy: 'no-referrer',
            onError: () => {
              if (!customLogo) {
                defaultLogoMissingFlag = true;
                setImgFailed(true);
              }
            },
            className: `${sz.img} object-contain select-none pointer-events-none`,
          })
        )
      : React.createElement(
          'div',
          {
            className: `${sz.badge} bg-brand-gradient text-[var(--bg)] font-heading font-semibold flex items-center justify-center tracking-tight shrink-0 shadow-soft`,
            'aria-label': companyName,
          },
          'MK'
        ),
    showText && !collapsed
      ? React.createElement(
          'span',
          {
            className: `font-heading font-semibold text-[var(--text)] tracking-tight truncate ${sz.title}`,
          },
          companyName
        )
      : null
  );
};
