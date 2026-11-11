import { getLogoBase64DataUrl, setCustomLogoDataUrl } from '../../lib/brand';
import {
  assertOnlineForSave,
  requireSupabaseClient,
  supabase,
} from '../../lib/supabase';
import { formatSupabaseServiceError } from './queryClient';

export const COMPANY_ASSETS_BUCKET = 'company-assets';

// Signed URL valid for 1 hour (3600s); refreshed 10 minutes before expiry (after 50m)
const SIGNED_URL_TTL_SECONDS = 3600;
const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000;

interface SignedLogoCacheEntry {
  companyId: string;
  storagePath: string;
  signedUrl: string;
  expiresAt: number;
  refreshTimerId?: ReturnType<typeof setTimeout>;
}

const signedLogoCache = new Map<string, SignedLogoCacheEntry>();

function clearRefreshTimer(companyId: string): void {
  const existing = signedLogoCache.get(companyId);
  if (existing?.refreshTimerId) {
    clearTimeout(existing.refreshTimerId);
  }
  signedLogoCache.delete(companyId);
}

function scheduleSignedUrlRefresh(companyId: string, storagePath: string, expiresAt: number): void {
  if (typeof window === 'undefined') return;
  const existing = signedLogoCache.get(companyId);
  if (existing?.refreshTimerId) {
    clearTimeout(existing.refreshTimerId);
  }

  const delayMs = Math.max(
    30_000,
    expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS
  );

  const timerId = setTimeout(() => {
    void refreshCompanyLogoSignedUrl(companyId, storagePath);
  }, delayMs);

  const current = signedLogoCache.get(companyId);
  if (current) {
    current.refreshTimerId = timerId;
  }
}

function parseDataUrlToBlobAndExt(dataUrl: string): {
  blob: Blob;
  ext: string;
  contentType: string;
} {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Select a valid PNG, JPG, WebP, or SVG image file.');
  }

  const contentType = match[1].toLowerCase();
  const base64Data = match[2];

  let ext = 'png';
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    ext = 'jpg';
  } else if (contentType === 'image/webp') {
    ext = 'webp';
  } else if (contentType === 'image/svg+xml') {
    ext = 'svg';
  } else if (contentType === 'image/png') {
    ext = 'png';
  }

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return {
    blob: new Blob([bytes], { type: contentType }),
    ext,
    contentType,
  };
}

function fileOrBlobToExtAndType(file: File | Blob): {
  ext: string;
  contentType: string;
} {
  const contentType = (file.type || 'image/png').toLowerCase();
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (contentType === 'image/webp') {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  if (contentType === 'image/svg+xml') {
    return { ext: 'svg', contentType: 'image/svg+xml' };
  }
  return { ext: 'png', contentType: 'image/png' };
}

function isStorageObjectPath(value: string): boolean {
  return (
    Boolean(value) &&
    !value.startsWith('data:') &&
    !value.startsWith('http://') &&
    !value.startsWith('https://') &&
    !value.startsWith('blob:') &&
    !value.startsWith('/')
  );
}

/**
 * Extracts a storage object path `{company_id}/logo.<ext>` from a stored path or signed URL.
 */
export function extractLogoStoragePath(
  companyId: string,
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (isStorageObjectPath(trimmed)) {
    return trimmed;
  }

  const marker = `/company-assets/${companyId}/`;
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) {
    const afterBucket = trimmed.slice(idx + '/company-assets/'.length);
    const cleanPath = afterBucket.split('?')[0];
    if (cleanPath) return cleanPath;
  }

  return null;
}

/**
 * Refreshes the signed URL for `{company_id}/logo.<ext>` before it expires and updates BrandLogo.
 */
export async function refreshCompanyLogoSignedUrl(
  companyId: string,
  storagePath: string
): Promise<string | undefined> {
  if (!supabase || !companyId || !storagePath) return undefined;

  const { data, error } = await supabase.storage
    .from(COMPANY_ASSETS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return undefined;
  }

  const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
  signedLogoCache.set(companyId, {
    companyId,
    storagePath,
    signedUrl: data.signedUrl,
    expiresAt,
  });

  setCustomLogoDataUrl(data.signedUrl, companyId);
  scheduleSignedUrlRefresh(companyId, storagePath, expiresAt);
  // Pre-convert once to base64 and cache for PDFs & prints
  void getLogoBase64DataUrl(companyId);

  return data.signedUrl;
}

/**
 * Resolves `companies.logo_url` (which stores `{company_id}/logo.<ext>`) into a signed URL,
 * schedules automatic refresh before expiry, and caches the base64 representation once for PDFs.
 */
export async function resolveCompanyLogoSignedUrl(
  companyId: string,
  storedLogoUrl: string | null | undefined
): Promise<string | undefined> {
  if (!companyId || !storedLogoUrl || !storedLogoUrl.trim()) {
    clearRefreshTimer(companyId);
    setCustomLogoDataUrl(null, companyId);
    return undefined;
  }

  const trimmed = storedLogoUrl.trim();

  // Legacy data URL or direct URL fallback
  if (trimmed.startsWith('data:image/')) {
    setCustomLogoDataUrl(trimmed, companyId, trimmed);
    return trimmed;
  }

  const storagePath = extractLogoStoragePath(companyId, trimmed);
  if (!storagePath) {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      setCustomLogoDataUrl(trimmed, companyId);
      void getLogoBase64DataUrl(companyId);
      return trimmed;
    }
    clearRefreshTimer(companyId);
    setCustomLogoDataUrl(null, companyId);
    return undefined;
  }

  const cached = signedLogoCache.get(companyId);
  if (
    cached &&
    cached.storagePath === storagePath &&
    Date.now() < cached.expiresAt - REFRESH_BEFORE_EXPIRY_MS
  ) {
    setCustomLogoDataUrl(cached.signedUrl, companyId);
    return cached.signedUrl;
  }

  return refreshCompanyLogoSignedUrl(companyId, storagePath);
}

/**
 * Uploads a company logo (File, Blob, or data URL) to the private bucket `company-assets`
 * at `{company_id}/logo.<ext>`, generates a signed URL with auto-refresh, and caches the base64 data URL.
 */
export async function uploadCompanyLogo(
  companyId: string,
  source: File | Blob | string
): Promise<{
  storagePath: string;
  signedUrl: string;
}> {
  assertOnlineForSave();
  const client = requireSupabaseClient();

  let blob: Blob;
  let ext: string;
  let contentType: string;
  let base64DataUrl: string | undefined;

  if (typeof source === 'string') {
    const parsed = parseDataUrlToBlobAndExt(source);
    blob = parsed.blob;
    ext = parsed.ext;
    contentType = parsed.contentType;
    base64DataUrl = source;
  } else {
    const meta = fileOrBlobToExtAndType(source);
    blob = source;
    ext = meta.ext;
    contentType = meta.contentType;
  }

  const storagePath = `${companyId}/logo.${ext}`;

  // Clean up any previous logo files with different extensions under {company_id}/
  const otherPaths = ['png', 'jpg', 'jpeg', 'webp', 'svg']
    .map((candidateExt) => `${companyId}/logo.${candidateExt}`)
    .filter((p) => p !== storagePath);

  await client.storage.from(COMPANY_ASSETS_BUCKET).remove(otherPaths);

  const { error: uploadError } = await client.storage
    .from(COMPANY_ASSETS_BUCKET)
    .upload(storagePath, blob, {
      upsert: true,
      contentType,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw formatSupabaseServiceError(uploadError, 'upload company logo');
  }

  const { data: signedData, error: signedError } = await client.storage
    .from(COMPANY_ASSETS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signedData?.signedUrl) {
    throw formatSupabaseServiceError(
      signedError ?? new Error('Could not generate a signed URL for the uploaded logo.'),
      'load uploaded company logo'
    );
  }

  const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
  signedLogoCache.set(companyId, {
    companyId,
    storagePath,
    signedUrl: signedData.signedUrl,
    expiresAt,
  });

  setCustomLogoDataUrl(signedData.signedUrl, companyId, base64DataUrl ?? null);
  scheduleSignedUrlRefresh(companyId, storagePath, expiresAt);
  void getLogoBase64DataUrl(companyId);

  return {
    storagePath,
    signedUrl: signedData.signedUrl,
  };
}

/**
 * Removes the company's custom logo from `company-assets` storage and resets the app to the default MK logo.
 */
export async function removeCompanyLogo(
  companyId: string,
  currentStoredPath?: string | null
): Promise<void> {
  assertOnlineForSave();
  clearRefreshTimer(companyId);
  setCustomLogoDataUrl(null, companyId);

  if (!supabase || !companyId) return;

  const pathsToRemove = new Set<string>([
    `${companyId}/logo.png`,
    `${companyId}/logo.jpg`,
    `${companyId}/logo.jpeg`,
    `${companyId}/logo.webp`,
    `${companyId}/logo.svg`,
  ]);

  const extracted = extractLogoStoragePath(companyId, currentStoredPath);
  if (extracted) {
    pathsToRemove.add(extracted);
  }

  await supabase.storage
    .from(COMPANY_ASSETS_BUCKET)
    .remove(Array.from(pathsToRemove));
}
