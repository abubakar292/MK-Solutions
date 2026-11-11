import type {
  Purchase,
  PurchaseChemicalLine,
  PurchaseItemLine,
  PurchaseRockLine,
  RecordStatus,
} from '../../../domain/types';
import { toDecimalString } from '../queryClient';

export interface DbPurchaseRow {
  id: string;
  company_id: string;
  doc_no: string;
  date: string;
  supplier_id: string;
  supplier_name: string;
  lines: unknown;
  rock_line: unknown;
  chemical_lines: unknown;
  subtotal: string | number;
  other_charges: string | number;
  total_amount: string | number;
  paid_now: string | number;
  payment_method: string | null;
  notes: string | null;
  details: Record<string, unknown> | null;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

function normalizePurchaseItemLine(raw: unknown): PurchaseItemLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind === 'rock' ? 'rock' : 'chemical';
  return {
    id: String(obj.id ?? ''),
    itemId: String(obj.itemId ?? ''),
    itemName: String(obj.itemName ?? ''),
    kind,
    quantity: toDecimalString(obj.quantity as string | number, '0'),
    rate: toDecimalString(obj.rate as string | number, '0'),
    amount: toDecimalString((obj.amount ?? obj.lineTotal) as string | number, '0'),
  };
}

function normalizeRockLine(raw: unknown): PurchaseRockLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.itemId && !obj.tons && !obj.quantityTons) return null;
  return {
    itemId: String(obj.itemId ?? ''),
    itemName: String(obj.itemName ?? 'Rock'),
    tons: toDecimalString((obj.tons ?? obj.quantityTons) as string | number, '0'),
    ratePerTon: toDecimalString(
      (obj.ratePerTon ?? obj.pricePerTon) as string | number,
      '0'
    ),
    amount: toDecimalString((obj.amount ?? obj.total) as string | number, '0'),
  };
}

function normalizeChemicalLine(raw: unknown): PurchaseChemicalLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  return {
    id: String(obj.id ?? ''),
    itemId: String(obj.itemId ?? ''),
    itemName: String(obj.itemName ?? ''),
    bags: toDecimalString((obj.bags ?? obj.bagsCount) as string | number, '0'),
    ratePerBag: toDecimalString(obj.ratePerBag as string | number, '0'),
    amount: toDecimalString((obj.amount ?? obj.total) as string | number, '0'),
  };
}

export function mapDbPurchaseToDomain(row: DbPurchaseRow): Purchase {
  const details =
    row.details && typeof row.details === 'object' ? row.details : {};

  const rawLines = Array.isArray(row.lines) ? row.lines : [];
  const lines = rawLines
    .map(normalizePurchaseItemLine)
    .filter((l): l is PurchaseItemLine => l !== null);

  const rockLine = normalizeRockLine(row.rock_line);

  const rawChemLines = Array.isArray(row.chemical_lines) ? row.chemical_lines : [];
  const chemicalLines = rawChemLines
    .map(normalizeChemicalLine)
    .filter((c): c is PurchaseChemicalLine => c !== null);

  const paymentMethod: 'cash' | 'bank' | 'cheque' | undefined =
    row.payment_method === 'cash' ||
    row.payment_method === 'bank' ||
    row.payment_method === 'cheque'
      ? row.payment_method
      : undefined;

  return {
    id: row.id,
    companyId: row.company_id,
    docNumber: row.doc_no,
    date: row.date,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    lines: lines.length > 0 ? lines : undefined,
    rockLine,
    chemicalLines,
    subtotal: toDecimalString(row.subtotal, '0'),
    otherCharges: toDecimalString(row.other_charges, '0'),
    totalAmount: toDecimalString(row.total_amount, '0'),
    paidNow: toDecimalString(row.paid_now, '0'),
    paymentMethod,
    vehicleNumber:
      typeof details.vehicleNumber === 'string' && details.vehicleNumber.trim()
        ? details.vehicleNumber.trim()
        : undefined,
    supplierBillNumber:
      typeof details.supplierBillNumber === 'string' && details.supplierBillNumber.trim()
        ? details.supplierBillNumber.trim()
        : undefined,
    driverName:
      typeof details.driverName === 'string' && details.driverName.trim()
        ? details.driverName.trim()
        : undefined,
    reference:
      typeof details.reference === 'string' && details.reference.trim()
        ? details.reference.trim()
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

export function mapDomainPurchaseToRpcPayload(purchase: Purchase): Record<string, unknown> {
  return {
    id: purchase.id,
    docNumber: purchase.docNumber || '',
    date: purchase.date,
    supplierId: purchase.supplierId,
    supplierName: purchase.supplierName,
    lines: purchase.lines ?? [],
    rockLine: purchase.rockLine ?? null,
    chemicalLines: purchase.chemicalLines ?? [],
    subtotal: toDecimalString(purchase.subtotal, '0'),
    otherCharges: toDecimalString(purchase.otherCharges, '0'),
    totalAmount: toDecimalString(purchase.totalAmount, '0'),
    paidNow: toDecimalString(purchase.paidNow, '0'),
    paymentMethod: purchase.paymentMethod ?? '',
    notes: purchase.notes ?? '',
    details: {
      vehicleNumber: purchase.vehicleNumber ?? null,
      supplierBillNumber: purchase.supplierBillNumber ?? null,
      driverName: purchase.driverName ?? null,
      reference: purchase.reference ?? null,
    },
  };
}
