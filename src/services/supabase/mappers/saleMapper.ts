import type { Bill, RecordStatus } from '../../../domain/types';
import { toDecimalString } from '../queryClient';

export interface DbSaleRow {
  id: string;
  company_id: string;
  doc_no: string;
  date: string;
  customer_id: string;
  customer_name: string;
  dispatch_id: string;
  dispatch_doc_no: string;
  dispatch_date_time: string;
  vehicle_number: string;
  bags_count: number;
  received_weight_tons: string | number;
  rate_per_ton: string | number;
  subtotal: string | number;
  discount: string | number;
  total_amount: string | number;
  cost_of_powder_sold_snapshot: string | number;
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

export function mapDbSaleToDomain(row: DbSaleRow): Bill {
  const details =
    row.details && typeof row.details === 'object' ? row.details : {};

  return {
    id: row.id,
    companyId: row.company_id,
    docNumber: row.doc_no,
    date: row.date,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerAddress:
      typeof details.customerAddress === 'string' && details.customerAddress.trim()
        ? details.customerAddress.trim()
        : undefined,
    unloadingAddress:
      typeof details.unloadingAddress === 'string' && details.unloadingAddress.trim()
        ? details.unloadingAddress.trim()
        : undefined,
    dispatchId: row.dispatch_id,
    dispatchDocNumber: row.dispatch_doc_no,
    dispatchDateTime: normalizeDateTime(row.dispatch_date_time),
    vehicleNumber: row.vehicle_number,
    driverName:
      typeof details.driverName === 'string' && details.driverName.trim()
        ? details.driverName.trim()
        : undefined,
    driverPhone:
      typeof details.driverPhone === 'string' && details.driverPhone.trim()
        ? details.driverPhone.trim()
        : undefined,
    bagsCount: Number(row.bags_count) || 0,
    receivedWeightTons: toDecimalString(row.received_weight_tons, '0'),
    ratePerTon: toDecimalString(row.rate_per_ton, '0'),
    subtotal: toDecimalString(row.subtotal, '0'),
    discount: toDecimalString(row.discount, '0'),
    totalAmount: toDecimalString(row.total_amount, '0'),
    costOfPowderSoldSnapshot: toDecimalString(
      row.cost_of_powder_sold_snapshot,
      '0'
    ),
    weightSlipNumber:
      typeof details.weightSlipNumber === 'string' && details.weightSlipNumber.trim()
        ? details.weightSlipNumber.trim()
        : undefined,
    remarks:
      typeof details.remarks === 'string' && details.remarks.trim()
        ? details.remarks.trim()
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

export function mapDomainSaleToRpcPayload(bill: Bill): Record<string, unknown> {
  return {
    id: bill.id,
    docNumber: bill.docNumber || '',
    date: bill.date,
    customerId: bill.customerId,
    customerName: bill.customerName,
    dispatchId: bill.dispatchId,
    dispatchDocNumber: bill.dispatchDocNumber,
    dispatchDateTime: bill.dispatchDateTime,
    vehicleNumber: bill.vehicleNumber,
    bagsCount: Number(bill.bagsCount) || 0,
    receivedWeightTons: toDecimalString(bill.receivedWeightTons, '0'),
    ratePerTon: toDecimalString(bill.ratePerTon, '0'),
    subtotal: toDecimalString(bill.subtotal, '0'),
    discount: toDecimalString(bill.discount, '0'),
    totalAmount: toDecimalString(bill.totalAmount, '0'),
    costOfPowderSoldSnapshot: toDecimalString(
      bill.costOfPowderSoldSnapshot,
      '0'
    ),
    notes: bill.notes ?? '',
    details: {
      customerAddress: bill.customerAddress ?? null,
      unloadingAddress: bill.unloadingAddress ?? null,
      driverName: bill.driverName ?? null,
      driverPhone: bill.driverPhone ?? null,
      weightSlipNumber: bill.weightSlipNumber ?? null,
      remarks: bill.remarks ?? null,
    },
  };
}

export function mapDomainSaleSnapshotPayload(bill: Bill): Record<string, unknown> {
  return {
    id: bill.id,
    costOfPowderSoldSnapshot: toDecimalString(
      bill.costOfPowderSoldSnapshot,
      '0'
    ),
  };
}
