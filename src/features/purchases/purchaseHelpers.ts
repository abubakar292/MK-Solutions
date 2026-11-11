import Decimal from 'decimal.js';
import type { PrintableDocumentMeta } from '../../components/print/PrintLayout';
import {
  calculateSupplierLedger,
  roundMoney,
  roundWeight,
  toDecimal,
  type AllocatedPurchaseSummary,
  type SupplierLedgerDetailResult,
} from '../../domain/engine';
import type {
  CompanySettings,
  Purchase,
  PurchaseItemLine,
  Supplier,
  SupplierPayment,
} from '../../domain/types';
import {
  amountInWords,
  formatBags,
  formatDate,
  formatMoney,
  formatTon,
  getTodayKarachiIsoDate,
} from '../../lib/format';
import { formatPaymentMethod } from '../customers/customerHelpers';

/**
 * Normalize lines from a Purchase (handles both unified `lines` and `rockLine` + `chemicalLines`).
 */
export function getPurchaseLines(purchase: Purchase): PurchaseItemLine[] {
  if (purchase.lines && purchase.lines.length > 0) {
    return purchase.lines;
  }

  const result: PurchaseItemLine[] = [];
  if (purchase.rockLine && toDecimal(purchase.rockLine.tons).gt(0)) {
    result.push({
      id: `${purchase.id}_rock`,
      itemId: purchase.rockLine.itemId,
      itemName: purchase.rockLine.itemName,
      kind: 'rock',
      quantity: purchase.rockLine.tons,
      rate: purchase.rockLine.ratePerTon,
      amount: purchase.rockLine.amount,
    });
  }

  for (const chem of purchase.chemicalLines || []) {
    if (toDecimal(chem.bags).gt(0)) {
      result.push({
        id: chem.id || `${purchase.id}_${chem.itemId}`,
        itemId: chem.itemId,
        itemName: chem.itemName,
        kind: 'chemical',
        quantity: chem.bags,
        rate: chem.ratePerBag,
        amount: chem.amount,
      });
    }
  }

  return result;
}

/**
 * Summarize items for the Purchases table row (never showing kg).
 */
export function formatPurchaseItemsSummary(purchase: Purchase): string {
  const lines = getPurchaseLines(purchase);
  if (lines.length === 0) return '—';

  return lines
    .map((line) => {
      const qtyStr =
        line.kind === 'rock'
          ? formatTon(line.quantity)
          : formatBags(line.quantity);
      return `${line.itemName} (${qtyStr})`;
    })
    .join(', ');
}

export function getPurchaseBalance(purchase: Purchase): Decimal {
  const total = roundMoney(purchase.totalAmount);
  const paid = roundMoney(purchase.paidNow ?? 0);
  return roundMoney(total.minus(paid));
}

export function buildPurchaseVoucherPrintMeta(
  purchase: Purchase,
  settings?: CompanySettings | null
): PrintableDocumentMeta {
  const lines = getPurchaseLines(purchase);
  const balance = getPurchaseBalance(purchase);

  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Voucher no.', value: purchase.docNumber },
    { label: 'Date', value: formatDate(purchase.date) },
    { label: 'Status', value: purchase.status === 'cancelled' ? 'Cancelled' : 'Active' },
  ];

  if (purchase.vehicleNumber) {
    metaRows.push({ label: 'Vehicle no.', value: purchase.vehicleNumber });
  }
  if (purchase.supplierBillNumber) {
    metaRows.push({ label: "Supplier's bill no.", value: purchase.supplierBillNumber });
  }
  if (purchase.driverName) {
    metaRows.push({ label: 'Driver', value: purchase.driverName });
  }
  if (purchase.notes) {
    metaRows.push({ label: 'Notes', value: purchase.notes });
  }

  const companyAddress = [settings?.address, settings?.city].filter(Boolean).join(', ');

  return {
    title: 'Purchase voucher',
    docNumber: purchase.docNumber,
    date: formatDate(purchase.date),
    companyName: settings?.companyName || 'MK Melting Solutions',
    companyAddress: companyAddress || undefined,
    companyPhone: settings?.phone,
    companyEmail: settings?.email,
    partyLabel: 'Supplier',
    partyName: purchase.supplierName,
    metaRows,
    columns: [
      { key: 'item', header: 'Item', align: 'left' },
      { key: 'quantity', header: 'Quantity', align: 'right' },
      { key: 'rate', header: 'Rate', align: 'right' },
      { key: 'amount', header: 'Amount', align: 'right' },
    ],
    rows: lines.map((l) => ({
      item: l.itemName,
      quantity: l.kind === 'rock' ? formatTon(l.quantity) : formatBags(l.quantity),
      rate:
        l.kind === 'rock'
          ? `${formatMoney(l.rate)} / ton`
          : `${formatMoney(l.rate)} / bag`,
      amount: formatMoney(l.amount),
    })),
    totals: [
      { label: 'Total amount', value: formatMoney(purchase.totalAmount), highlight: true },
      { label: 'Paid now', value: formatMoney(purchase.paidNow ?? 0) },
      { label: 'Balance', value: formatMoney(balance) },
    ],
    amountInWordsText: amountInWords(purchase.totalAmount),
  };
}

export function buildSupplierLedgerPrintMeta(
  supplier: Supplier,
  ledger: SupplierLedgerDetailResult,
  settings?: CompanySettings | null
): PrintableDocumentMeta {
  const companyAddress = [settings?.address, settings?.city].filter(Boolean).join(', ');

  const partyAddressParts = [
    supplier.contactPerson ? `Attn: ${supplier.contactPerson}` : null,
    supplier.address,
    supplier.city,
    supplier.phone,
    supplier.alternatePhone ? `Alt: ${supplier.alternatePhone}` : null,
    supplier.email,
    supplier.ntnOrCnic ? `NTN/CNIC: ${supplier.ntnOrCnic}` : null,
    supplier.paymentTermsDays ? `Terms: ${supplier.paymentTermsDays} days` : null,
  ].filter(Boolean);

  const supplierMetaRows: Array<{ label: string; value: string }> = [
    { label: 'Total purchased', value: formatMoney(ledger.totalPurchased) },
    { label: 'Total paid', value: formatMoney(ledger.totalPaid) },
    { label: 'Closing balance', value: formatMoney(ledger.balance) },
  ];
  if (supplier.ntnOrCnic) {
    supplierMetaRows.push({ label: 'NTN / CNIC', value: supplier.ntnOrCnic });
  }
  if (supplier.paymentTermsDays) {
    supplierMetaRows.push({ label: 'Payment terms', value: `${supplier.paymentTermsDays} days` });
  }

  return {
    title: 'Supplier statement',
    docNumber: supplier.name,
    date: formatDate(new Date().toISOString().slice(0, 10)),
    companyName: settings?.companyName || 'MK Melting Solutions',
    companyAddress: companyAddress || undefined,
    companyPhone: settings?.phone,
    companyEmail: settings?.email,
    partyLabel: 'Supplier',
    partyName: supplier.name,
    partyAddress: partyAddressParts.join(' · ') || undefined,
    metaRows: supplierMetaRows,
    columns: [
      { key: 'date', header: 'Date', align: 'left' },
      { key: 'detail', header: 'Detail', align: 'left' },
      { key: 'debit', header: 'Debit', align: 'right' },
      { key: 'credit', header: 'Credit', align: 'right' },
      { key: 'balance', header: 'Balance', align: 'right' },
    ],
    rows: ledger.entries.map((e) => ({
      date: e.date === '—' ? '—' : formatDate(e.date),
      detail: e.detail,
      debit: e.debit.gt(0) ? formatMoney(e.debit) : '—',
      credit: e.credit.gt(0) ? formatMoney(e.credit) : '—',
      balance: formatMoney(e.balance),
    })),
    totals: [
      { label: 'Total purchased', value: formatMoney(ledger.totalPurchased) },
      { label: 'Total paid', value: formatMoney(ledger.totalPaid) },
      { label: 'Balance we owe', value: formatMoney(ledger.balance), highlight: true },
    ],
  };
}

/**
 * Convert unified form lines into both `lines` and legacy `rockLine` + `chemicalLines`
 * so all existing reports and services work seamlessly.
 */
export function buildPurchaseStorageLines(
  formLines: Array<{
    id: string;
    itemId: string;
    itemName: string;
    kind: 'rock' | 'chemical';
    quantity: string;
    rate: string;
  }>
) {
  const normalizedLines: PurchaseItemLine[] = formLines.map((l) => {
    const qty = roundWeight(l.quantity);
    const rate = toDecimal(l.rate);
    const amount = roundMoney(qty.times(rate));
    return {
      id: l.id,
      itemId: l.itemId,
      itemName: l.itemName,
      kind: l.kind,
      quantity: qty.toString(),
      rate: roundMoney(rate).toString(),
      amount: amount.toString(),
    };
  });

  const subtotal = normalizedLines.reduce(
    (acc, l) => acc.plus(roundMoney(l.amount)),
    new Decimal(0)
  );

  // Sync rockLine (if one or more rock lines exist, combine for legacy field while keeping exact `lines`)
  const rockLines = normalizedLines.filter((l) => l.kind === 'rock');
  let rockLine: Purchase['rockLine'] = null;
  if (rockLines.length > 0) {
    const totalRockTons = rockLines.reduce(
      (acc, l) => acc.plus(roundWeight(l.quantity)),
      new Decimal(0)
    );
    const totalRockAmt = rockLines.reduce(
      (acc, l) => acc.plus(roundMoney(l.amount)),
      new Decimal(0)
    );
    const effectiveRate = totalRockTons.gt(0)
      ? roundMoney(totalRockAmt.dividedBy(totalRockTons))
      : new Decimal(0);
    rockLine = {
      itemId: rockLines[0].itemId,
      itemName: rockLines[0].itemName,
      tons: totalRockTons.toString(),
      ratePerTon: effectiveRate.toString(),
      amount: totalRockAmt.toString(),
    };
  }

  const chemicalLines: Purchase['chemicalLines'] = normalizedLines
    .filter((l) => l.kind === 'chemical')
    .map((l) => ({
      id: l.id,
      itemId: l.itemId,
      itemName: l.itemName,
      bags: l.quantity,
      ratePerBag: l.rate,
      amount: l.amount,
    }));

  return {
    lines: normalizedLines,
    rockLine,
    chemicalLines,
    subtotal: roundMoney(subtotal),
  };
}

export function formatSupplierRunningBalanceLabel(balance: Decimal): string {
  if (balance.lt(0)) {
    return `${formatMoney(balance.abs())} (Advance)`;
  }
  return formatMoney(balance);
}

/**
 * Computes a Map<purchaseId, AllocatedPurchaseSummary> for all active purchases across
 * all suppliers using the oldest-first FIFO allocation rule from `calculateSupplierLedger`.
 */
export function computePurchaseAllocationsMap(input: {
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
}): Map<string, AllocatedPurchaseSummary> {
  const map = new Map<string, AllocatedPurchaseSummary>();
  const supplierById = new Map<string, Supplier>(
    input.suppliers.map((s) => [s.id, s])
  );

  // Group purchases and payments by supplierId
  const supplierIds = new Set<string>();
  for (const s of input.suppliers) supplierIds.add(s.id);
  for (const p of input.purchases) supplierIds.add(p.supplierId);
  for (const sp of input.supplierPayments) supplierIds.add(sp.supplierId);

  for (const supId of supplierIds) {
    const sup = supplierById.get(supId);
    const supPurchases = input.purchases.filter((p) => p.supplierId === supId);
    const supPayments = input.supplierPayments.filter(
      (sp) => sp.supplierId === supId
    );
    const ledger = calculateSupplierLedger({
      openingBalance: sup?.openingBalance ?? 0,
      purchases: supPurchases,
      payments: supPayments,
    });
    for (const alloc of ledger.purchaseAllocations) {
      map.set(alloc.purchaseId, alloc);
    }
  }

  return map;
}

/**
 * Builds PrintableDocumentMeta for a Supplier Payment Receipt (PAY-YYYY-NNNN).
 */
export function buildSupplierPaymentReceiptPrintMeta(
  payment: SupplierPayment,
  supplier?: Supplier | null,
  settings?: CompanySettings | null,
  balanceContext?: { balanceBefore?: Decimal; balanceAfter?: Decimal }
): PrintableDocumentMeta {
  const companyAddress = [settings?.address, settings?.city]
    .filter(Boolean)
    .join(', ');

  const supplierAddress = [
    supplier?.contactPerson ? `Attn: ${supplier.contactPerson}` : null,
    supplier?.address,
    supplier?.city,
    supplier?.phone,
    supplier?.ntnOrCnic ? `NTN/CNIC: ${supplier.ntnOrCnic}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Payment method', value: formatPaymentMethod(payment.method) },
    {
      label: 'Status',
      value: payment.status === 'cancelled' ? 'Cancelled' : 'Active',
    },
  ];

  if (payment.reference) {
    metaRows.push({ label: 'Reference / cheque no.', value: payment.reference });
  }
  if (payment.bankName) {
    metaRows.push({ label: 'Bank name', value: payment.bankName });
  }
  if (payment.notes) {
    metaRows.push({ label: 'Note', value: payment.notes });
  }

  const totals: Array<{ label: string; value: string; highlight?: boolean }> = [];

  if (balanceContext?.balanceBefore !== undefined) {
    totals.push({
      label: 'Balance before payment',
      value: formatSupplierRunningBalanceLabel(balanceContext.balanceBefore),
    });
  }

  totals.push({
    label: 'Amount paid',
    value: formatMoney(payment.amount, { alwaysShowDecimals: true }),
    highlight: true,
  });

  if (balanceContext?.balanceAfter !== undefined) {
    totals.push({
      label: balanceContext.balanceAfter.lt(0)
        ? 'Advance after payment'
        : 'Balance after payment',
      value: formatSupplierRunningBalanceLabel(balanceContext.balanceAfter),
    });
  }

  return {
    title: 'Supplier Payment Voucher',
    docNumber: payment.docNumber,
    date: formatDate(payment.date || getTodayKarachiIsoDate()),
    companyName: settings?.companyName || 'MK Melting Solutions',
    companyPhone: settings?.phone,
    companyEmail: settings?.email,
    companyAddress: companyAddress || undefined,
    partyLabel: 'Paid to supplier',
    partyName: payment.supplierName,
    partyAddress: supplierAddress || undefined,
    metaRows,
    columns: [
      { key: 'voucher', header: 'Voucher #', align: 'left' },
      { key: 'date', header: 'Date', align: 'left' },
      { key: 'method', header: 'Method', align: 'left' },
      { key: 'note', header: 'Reference / note', align: 'left' },
      { key: 'amount', header: 'Amount', align: 'right' },
    ],
    rows: [
      {
        voucher: payment.docNumber,
        date: formatDate(payment.date),
        method: formatPaymentMethod(payment.method),
        note:
          [
            payment.reference ? `Ref: ${payment.reference}` : null,
            payment.notes,
          ]
            .filter(Boolean)
            .join(' · ') || 'Payment against supplier account',
        amount: formatMoney(payment.amount, { alwaysShowDecimals: true }),
      },
    ],
    totals,
    amountInWordsText: amountInWords(payment.amount),
  };
}

