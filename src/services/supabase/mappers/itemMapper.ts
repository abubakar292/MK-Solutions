import type { InventoryItem, ItemKind, RecordStatus } from '../../../domain/types';
import { toOptionalDecimalString } from '../queryClient';

export interface DbItemRow {
  id: string;
  company_id: string;
  name: string;
  kind: ItemKind;
  low_stock_alert: string | number | null;
  notes: string | null;
  details: Record<string, unknown> | null;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapDbItemToDomain(row: DbItemRow): InventoryItem {
  const details =
    row.details && typeof row.details === 'object' ? row.details : {};
  const detailAlert =
    details.lowStockAlert !== undefined && details.lowStockAlert !== null
      ? toOptionalDecimalString(String(details.lowStockAlert))
      : undefined;

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    kind: row.kind,
    lowStockAlert: toOptionalDecimalString(row.low_stock_alert) ?? detailAlert,
    notes: row.notes ?? undefined,
    status: row.status,
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDomainItemToDbInsert(item: {
  id?: string;
  companyId: string;
  name: string;
  kind: ItemKind;
  lowStockAlert?: string;
  notes?: string;
  status?: RecordStatus;
}): Record<string, unknown> {
  const cleanAlert = toOptionalDecimalString(item.lowStockAlert);
  const payload: Record<string, unknown> = {
    company_id: item.companyId,
    name: item.name.trim(),
    kind: item.kind,
    low_stock_alert: cleanAlert ?? null,
    notes: item.notes?.trim() || null,
    details: cleanAlert ? { lowStockAlert: cleanAlert } : {},
    status: item.status ?? 'active',
  };

  if (item.id) {
    payload.id = item.id;
  }

  return payload;
}
