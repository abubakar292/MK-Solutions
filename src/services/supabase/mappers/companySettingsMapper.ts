import type { CompanySettings, DocumentPrefixes } from '../../../domain/types';

export const FIXED_BILL_PREFIX = 'INV' as const;

export const DEFAULT_PREFIXES: DocumentPrefixes = {
  purchase: 'PUR',
  batch: 'BATCH',
  dispatch: 'DSP',
  receipt: 'RCV',
  expense: 'EXP',
  advance: 'ADV',
  salary: 'SAL',
};

export interface CompanyRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  logo_url: string | null;
  final_product_name: string | null;
  prefixes: Partial<DocumentPrefixes> | null;
  details: Record<string, unknown> | null;
  updated_at: string;
}

export function sanitizeDocumentPrefixes(
  raw?: (Partial<DocumentPrefixes> & { bill?: string }) | null
): DocumentPrefixes {
  return {
    purchase: raw?.purchase || DEFAULT_PREFIXES.purchase,
    batch: raw?.batch || DEFAULT_PREFIXES.batch,
    dispatch: raw?.dispatch || DEFAULT_PREFIXES.dispatch,
    receipt: raw?.receipt || DEFAULT_PREFIXES.receipt,
    expense: raw?.expense || DEFAULT_PREFIXES.expense,
    advance: raw?.advance || DEFAULT_PREFIXES.advance,
    salary: raw?.salary || DEFAULT_PREFIXES.salary,
  };
}

export function mapCompanyRowToSettings(
  row: CompanyRow,
  resolvedLogoUrl?: string
): CompanySettings {
  return {
    id: `settings_${row.id}`,
    companyId: row.id,
    companyName: row.name || 'MK Melting Solutions',
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    city: row.city || 'Lahore',
    logoDataUrl: resolvedLogoUrl,
    prefixes: sanitizeDocumentPrefixes(row.prefixes),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}
