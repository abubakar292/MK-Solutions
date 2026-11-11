import type {
  BatchChemicalUsage,
  ProductionBatch,
  RecordStatus,
} from '../../../domain/types';
import { toDecimalString, toOptionalDecimalString } from '../queryClient';

export interface DbBatchRow {
  id: string;
  company_id: string;
  doc_no: string;
  date: string;
  rock_item_id: string;
  rock_item_name: string;
  rock_tons: string | number;
  rock_avg_cost_snapshot: string | number;
  rock_cost_snapshot: string | number;
  chemical_usages: unknown;
  chemicals_cost_snapshot: string | number;
  final_product_tons: string | number;
  total_cost_snapshot: string | number;
  cost_per_ton_snapshot: string | number;
  raw_cost_per_ton_snapshot: string | number | null;
  notes: string | null;
  details: Record<string, unknown> | null;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

type BatchChemicalLineItem = NonNullable<ProductionBatch['chemicalLines']>[number];

function normalizeChemicalUsage(raw: unknown): BatchChemicalUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  return {
    itemId: String(obj.itemId ?? ''),
    itemName: String(obj.itemName ?? ''),
    bags: toDecimalString((obj.bags ?? obj.bagsUsed) as string | number, '0'),
    avgCostPerBagSnapshot: toDecimalString(
      (obj.avgCostPerBagSnapshot ?? obj.avgCostSnapshot) as string | number,
      '0'
    ),
    lineCostSnapshot: toDecimalString(
      (obj.lineCostSnapshot ?? obj.lineCost) as string | number,
      '0'
    ),
  };
}

function normalizeChemicalLine(raw: unknown): BatchChemicalLineItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  return {
    itemId: String(obj.itemId ?? ''),
    itemName: String(obj.itemName ?? ''),
    bagsUsed: toDecimalString(
      (obj.bagsUsed ?? obj.bags ?? obj.quantityBags) as string | number,
      '0'
    ),
    avgCostSnapshot: toDecimalString(
      (obj.avgCostSnapshot ?? obj.avgCostPerBagSnapshot) as string | number,
      '0'
    ),
    lineCost: toDecimalString(
      (obj.lineCost ?? obj.lineCostSnapshot ?? obj.costSnapshot) as string | number,
      '0'
    ),
  };
}

export function mapDbBatchToDomain(row: DbBatchRow): ProductionBatch {
  const details =
    row.details && typeof row.details === 'object' ? row.details : {};

  const rawUsages = Array.isArray(row.chemical_usages) ? row.chemical_usages : [];
  const chemicalUsages = rawUsages
    .map(normalizeChemicalUsage)
    .filter((u): u is BatchChemicalUsage => u !== null);

  const rawChemLines = Array.isArray(details.chemicalLines)
    ? details.chemicalLines
    : [];
  const parsedChemLines = rawChemLines
    .map(normalizeChemicalLine)
    .filter((l): l is BatchChemicalLineItem => l !== null);

  const chemicalLines: BatchChemicalLineItem[] | undefined =
    parsedChemLines.length > 0
      ? parsedChemLines
      : chemicalUsages.length > 0
      ? chemicalUsages.map((u) => ({
          itemId: u.itemId,
          itemName: u.itemName,
          bagsUsed: u.bags,
          avgCostSnapshot: u.avgCostPerBagSnapshot,
          lineCost: u.lineCostSnapshot,
        }))
      : undefined;

  const totalCostSnapshot = toDecimalString(row.total_cost_snapshot, '0');
  const totalBatchCostSnapshot =
    typeof details.totalBatchCostSnapshot === 'string' ||
    typeof details.totalBatchCostSnapshot === 'number'
      ? toDecimalString(details.totalBatchCostSnapshot, totalCostSnapshot)
      : totalCostSnapshot;

  return {
    id: row.id,
    companyId: row.company_id,
    docNumber: row.doc_no,
    date: row.date,
    rockItemId: row.rock_item_id,
    rockItemName: row.rock_item_name,
    rockTons: toDecimalString(row.rock_tons, '0'),
    rockAvgCostSnapshot: toDecimalString(row.rock_avg_cost_snapshot, '0'),
    rockCostSnapshot: toDecimalString(row.rock_cost_snapshot, '0'),
    chemicalUsages,
    chemicalLines,
    chemicalsCostSnapshot: toDecimalString(row.chemicals_cost_snapshot, '0'),
    finalProductTons: toDecimalString(row.final_product_tons, '0'),
    totalCostSnapshot,
    totalBatchCostSnapshot,
    costPerTonSnapshot: toDecimalString(row.cost_per_ton_snapshot, '0'),
    rawCostPerTonSnapshot:
      toOptionalDecimalString(row.raw_cost_per_ton_snapshot) ??
      toDecimalString(row.cost_per_ton_snapshot, '0'),
    shift:
      typeof details.shift === 'string' && details.shift.trim()
        ? details.shift.trim()
        : undefined,
    machine:
      typeof details.machine === 'string' && details.machine.trim()
        ? details.machine.trim()
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

export function mapDomainBatchToRpcPayload(batch: ProductionBatch): Record<string, unknown> {
  return {
    id: batch.id,
    docNumber: batch.docNumber || '',
    date: batch.date,
    rockItemId: batch.rockItemId,
    rockItemName: batch.rockItemName,
    rockTons: toDecimalString(batch.rockTons, '0'),
    rockAvgCostSnapshot: toDecimalString(batch.rockAvgCostSnapshot, '0'),
    rockCostSnapshot: toDecimalString(batch.rockCostSnapshot, '0'),
    chemicalUsages: batch.chemicalUsages,
    chemicalsCostSnapshot: toDecimalString(batch.chemicalsCostSnapshot, '0'),
    finalProductTons: toDecimalString(batch.finalProductTons, '0'),
    totalCostSnapshot: toDecimalString(batch.totalCostSnapshot, '0'),
    costPerTonSnapshot: toDecimalString(batch.costPerTonSnapshot, '0'),
    rawCostPerTonSnapshot: toDecimalString(
      batch.rawCostPerTonSnapshot ?? batch.costPerTonSnapshot,
      '0'
    ),
    notes: batch.notes ?? '',
    details: {
      shift: batch.shift ?? null,
      machine: batch.machine ?? null,
      chemicalLines: batch.chemicalLines ?? [],
      totalBatchCostSnapshot: toDecimalString(
        batch.totalBatchCostSnapshot ?? batch.totalCostSnapshot,
        '0'
      ),
    },
  };
}

export function mapDomainBatchSnapshotPayload(batch: ProductionBatch): Record<string, unknown> {
  return {
    id: batch.id,
    rockAvgCostSnapshot: toDecimalString(batch.rockAvgCostSnapshot, '0'),
    rockCostSnapshot: toDecimalString(batch.rockCostSnapshot, '0'),
    chemicalUsages: batch.chemicalUsages,
    chemicalsCostSnapshot: toDecimalString(batch.chemicalsCostSnapshot, '0'),
    totalCostSnapshot: toDecimalString(batch.totalCostSnapshot, '0'),
    costPerTonSnapshot: toDecimalString(batch.costPerTonSnapshot, '0'),
    rawCostPerTonSnapshot: toDecimalString(
      batch.rawCostPerTonSnapshot ?? batch.costPerTonSnapshot,
      '0'
    ),
    details: {
      chemicalLines: batch.chemicalLines ?? [],
      totalBatchCostSnapshot: toDecimalString(
        batch.totalBatchCostSnapshot ?? batch.totalCostSnapshot,
        '0'
      ),
    },
  };
}
