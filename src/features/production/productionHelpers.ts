import type { PrintableDocumentMeta } from '../../components/print/PrintLayout';
import type { CompanySettings, ProductionBatch } from '../../domain/types';
import {
  amountInWords,
  formatBags,
  formatDate,
  formatMoney,
  formatTon,
} from '../../lib/format';

/**
 * Formats a concise summary of chemicals used in a batch for list views.
 */
export function formatBatchChemicalsSummary(batch: ProductionBatch): string {
  if (!batch.chemicalUsages || batch.chemicalUsages.length === 0) {
    return 'No chemicals';
  }
  return batch.chemicalUsages
    .map((c) => `${c.itemName} (${formatBags(c.bags)})`)
    .join(', ');
}

/**
 * Builds the PrintableDocumentMeta for Print and Download PDF of a Production Batch.
 */
export function buildBatchPrintMeta(
  batch: ProductionBatch,
  settings?: CompanySettings | null
): PrintableDocumentMeta {
  const companyAddress = [settings?.address, settings?.city]
    .filter(Boolean)
    .join(', ');

  const rows: Array<Record<string, string | number>> = [
    {
      item: batch.rockItemName || 'White Rock',
      type: 'Rock',
      quantity: formatTon(batch.rockTons),
      avgCost: `${formatMoney(batch.rockAvgCostSnapshot)} / ton`,
      lineCost: formatMoney(batch.rockCostSnapshot),
    },
    ...(batch.chemicalUsages || []).map((chem) => ({
      item: chem.itemName,
      type: 'Chemical',
      quantity: formatBags(chem.bags),
      avgCost: `${formatMoney(chem.avgCostPerBagSnapshot)} / bag`,
      lineCost: formatMoney(chem.lineCostSnapshot),
    })),
  ];

  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Final product made', value: formatTon(batch.finalProductTons) },
    { label: 'Cost per ton', value: formatMoney(batch.costPerTonSnapshot) },
    { label: 'Status', value: batch.status === 'cancelled' ? 'Cancelled' : 'Active' },
  ];

  if (batch.notes) {
    metaRows.push({ label: 'Notes', value: batch.notes });
  }

  return {
    title: 'Production Batch Sheet',
    docNumber: batch.docNumber,
    date: formatDate(batch.date),
    companyName: settings?.companyName || 'MK Melting Solutions',
    companyPhone: settings?.phone,
    companyAddress: companyAddress || undefined,
    partyLabel: 'Production output',
    partyName: `Final Product: ${formatTon(batch.finalProductTons)}`,
    partyAddress: `Cost per ton: ${formatMoney(batch.costPerTonSnapshot)}`,
    metaRows,
    columns: [
      { key: 'item', header: 'Input item', align: 'left' },
      { key: 'type', header: 'Type', align: 'left' },
      { key: 'quantity', header: 'Quantity used', align: 'right' },
      { key: 'avgCost', header: 'Avg cost', align: 'right' },
      { key: 'lineCost', header: 'Cost', align: 'right' },
    ],
    rows,
    totals: [
      {
        label: 'Total batch input cost',
        value: formatMoney(batch.totalCostSnapshot),
      },
      {
        label: 'Final product made',
        value: formatTon(batch.finalProductTons),
      },
      {
        label: 'Cost per ton',
        value: formatMoney(batch.costPerTonSnapshot),
        highlight: true,
      },
    ],
    amountInWordsText: amountInWords(batch.totalCostSnapshot),
  };
}
