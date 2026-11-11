import type { RecordStatus, Supplier } from '../../../domain/types';
import { toDecimalString } from '../queryClient';

export interface DbSupplierRow {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  opening_balance: string | number | null;
  notes: string | null;
  details: Record<string, unknown> | null;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapDbSupplierToDomain(row: DbSupplierRow): Supplier {
  const details =
    row.details && typeof row.details === 'object' ? row.details : {};

  const rawPaymentTerms = details.paymentTermsDays;
  const paymentTermsDays =
    typeof rawPaymentTerms === 'string' && rawPaymentTerms.trim()
      ? rawPaymentTerms.trim()
      : typeof rawPaymentTerms === 'number' && Number.isFinite(rawPaymentTerms)
      ? String(rawPaymentTerms)
      : undefined;

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    phone: row.phone ?? undefined,
    city: row.city ?? undefined,
    address: row.address ?? undefined,
    openingBalance: toDecimalString(row.opening_balance, '0'),
    notes: row.notes ?? undefined,
    contactPerson:
      typeof details.contactPerson === 'string' && details.contactPerson.trim()
        ? details.contactPerson.trim()
        : undefined,
    alternatePhone:
      typeof details.alternatePhone === 'string' && details.alternatePhone.trim()
        ? details.alternatePhone.trim()
        : undefined,
    email:
      typeof details.email === 'string' && details.email.trim()
        ? details.email.trim()
        : undefined,
    ntnOrCnic:
      typeof details.ntnOrCnic === 'string' && details.ntnOrCnic.trim()
        ? details.ntnOrCnic.trim()
        : undefined,
    paymentTermsDays,
    status: row.status,
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildSupplierDetailsJson(input: Partial<Supplier>): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  if (input.contactPerson !== undefined) {
    details.contactPerson = input.contactPerson?.trim() || null;
  }
  if (input.alternatePhone !== undefined) {
    details.alternatePhone = input.alternatePhone?.trim() || null;
  }
  if (input.email !== undefined) {
    details.email = input.email?.trim() || null;
  }
  if (input.ntnOrCnic !== undefined) {
    details.ntnOrCnic = input.ntnOrCnic?.trim() || null;
  }
  if (input.paymentTermsDays !== undefined) {
    details.paymentTermsDays = input.paymentTermsDays?.trim() || null;
  }
  return details;
}

export function mapDomainSupplierToDbInsert(
  companyId: string,
  input: Omit<Supplier, 'id' | 'companyId' | 'status' | 'createdAt' | 'updatedAt'> & {
    id?: string;
  }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    company_id: companyId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    city: input.city?.trim() || null,
    address: input.address?.trim() || null,
    opening_balance: toDecimalString(input.openingBalance, '0'),
    notes: input.notes?.trim() || null,
    details: buildSupplierDetailsJson(input),
    status: 'active',
  };

  if (input.id) {
    payload.id = input.id;
  }

  return payload;
}

export function mapDomainSupplierPatchToRpcPayload(
  patch: Partial<Supplier>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.phone !== undefined) payload.phone = patch.phone?.trim() || '';
  if (patch.city !== undefined) payload.city = patch.city?.trim() || '';
  if (patch.address !== undefined) payload.address = patch.address?.trim() || '';
  if (patch.openingBalance !== undefined) {
    payload.openingBalance = toDecimalString(patch.openingBalance, '0');
  }
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || '';

  const details = buildSupplierDetailsJson(patch);
  if (Object.keys(details).length > 0) {
    payload.details = details;
  }

  return payload;
}
