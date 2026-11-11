import type { Dispatch, RecordStatus } from '../../../domain/types';
import { toOptionalDecimalString } from '../queryClient';

export type DbDispatchState = 'sent' | 'sold' | 'cancelled';

export interface DbDispatchRow {
  id: string;
  company_id: string;
  doc_no: string;
  date_time: string;
  customer_id: string;
  customer_name: string;
  vehicle_number: string;
  bags_count: number;
  dispatch_state: DbDispatchState;
  received_weight_tons: string | number | null;
  rate_per_ton: string | number | null;
  sale_date: string | null;
  avg_cost_per_ton_snapshot: string | number | null;
  raw_avg_cost_per_ton_snapshot: string | number | null;
  cogs_snapshot: string | number | null;
  cost_of_powder_sold_snapshot: string | number | null;
  bill_id: string | null;
  bill_doc_no: string | null;
  notes: string | null;
  details: Record<string, unknown> | null;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeDateTime(value: string): string {
  if (!value) return value;
  try {
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString();
    }
  } catch {
    // ignore
  }
  return value;
}

export function mapDbDispatchToDomain(row: DbDispatchRow): Dispatch {
  const details =
    row.details && typeof row.details === 'object' ? row.details : {};

  return {
    id: row.id,
    companyId: row.company_id,
    docNumber: row.doc_no,
    dateTime: normalizeDateTime(row.date_time),
    customerId: row.customer_id,
    customerName: row.customer_name,
    vehicleNumber: row.vehicle_number,
    bagsCount: Number(row.bags_count) || 0,
    receivedWeightTons: toOptionalDecimalString(row.received_weight_tons),
    ratePerTon: toOptionalDecimalString(row.rate_per_ton),
    saleDate: row.sale_date ?? undefined,
    avgCostPerTonSnapshot: toOptionalDecimalString(row.avg_cost_per_ton_snapshot),
    rawAvgCostPerTonSnapshot: toOptionalDecimalString(
      row.raw_avg_cost_per_ton_snapshot
    ),
    cogsSnapshot: toOptionalDecimalString(row.cogs_snapshot),
    costOfPowderSoldSnapshot: toOptionalDecimalString(
      row.cost_of_powder_sold_snapshot
    ),
    billId: row.bill_id ?? undefined,
    billDocNumber: row.bill_doc_no ?? undefined,
    driverName:
      typeof details.driverName === 'string' && details.driverName.trim()
        ? details.driverName.trim()
        : undefined,
    driverPhone:
      typeof details.driverPhone === 'string' && details.driverPhone.trim()
        ? details.driverPhone.trim()
        : undefined,
    destinationCity:
      typeof details.destinationCity === 'string' && details.destinationCity.trim()
        ? details.destinationCity.trim()
        : undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDomainDispatchToDbInsert(params: {
  id?: string;
  companyId: string;
  dateTime: string;
  customerId: string;
  customerName: string;
  vehicleNumber: string;
  bagsCount: number;
  driverName?: string;
  driverPhone?: string;
  destinationCity?: string;
  notes?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    company_id: params.companyId,
    doc_no: null,
    date_time: params.dateTime,
    customer_id: params.customerId,
    customer_name: params.customerName.trim(),
    vehicle_number: params.vehicleNumber.trim().toUpperCase(),
    bags_count: Math.round(Number(params.bagsCount) || 0),
    dispatch_state: 'sent',
    notes: params.notes?.trim() || null,
    details: {
      driverName: params.driverName?.trim() || null,
      driverPhone: params.driverPhone?.trim() || null,
      destinationCity: params.destinationCity?.trim() || null,
    },
    status: 'active',
  };

  if (params.id) {
    payload.id = params.id;
  }

  return payload;
}

export function mapDomainDispatchSnapshotPayload(
  dispatch: Dispatch
): Record<string, unknown> {
  return {
    id: dispatch.id,
    avgCostPerTonSnapshot:
      toOptionalDecimalString(dispatch.avgCostPerTonSnapshot) ?? null,
    rawAvgCostPerTonSnapshot:
      toOptionalDecimalString(dispatch.rawAvgCostPerTonSnapshot) ?? null,
    cogsSnapshot: toOptionalDecimalString(dispatch.cogsSnapshot) ?? null,
    costOfPowderSoldSnapshot:
      toOptionalDecimalString(dispatch.costOfPowderSoldSnapshot) ?? null,
  };
}
