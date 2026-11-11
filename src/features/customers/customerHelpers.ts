import Decimal from 'decimal.js';
import type { PrintableDocumentMeta } from '../../components/print/PrintLayout';
import {
  roundMoney,
  type CustomerLedgerEntry,
  type CustomerLedgerResult,
} from '../../domain/engine';
import type {
  Bill,
  CompanySettings,
  Customer,
  CustomerPayment,
} from '../../domain/types';
import {
  amountInWords,
  formatDate,
  formatMoney,
  getTodayKarachiIsoDate,
} from '../../lib/format';

export function formatPaymentMethod(method?: string): string {
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'bank':
      return 'Bank';
    case 'cheque':
      return 'Cheque';
    case 'online':
      return 'Online';
    default:
      return method ? method.charAt(0).toUpperCase() + method.slice(1) : 'Cash';
  }
}

export function formatRunningBalanceLabel(balance: Decimal): string {
  if (balance.lt(0)) {
    return `${formatMoney(balance.abs())} (Advance)`;
  }
  return formatMoney(balance);
}

/**
 * Computes a Map<paymentId, string> describing which bills (or opening balance / advance)
 * each customer payment was applied to under FIFO allocation.
 */
export function computePaymentAppliedToBillsMap(input: {
  openingBalance: Decimal.Value;
  bills: Bill[];
  payments: CustomerPayment[];
}): Map<string, string> {
  const result = new Map<string, string>();
  const opening = roundMoney(input.openingBalance || 0);

  const activeBills = input.bills
    .filter((b) => b.status === 'active')
    .sort(
      (a, b) =>
        a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) ||
        (a.createdAt || a.date).localeCompare(b.createdAt || b.date) ||
        a.docNumber.localeCompare(b.docNumber)
    );

  const activePayments = input.payments
    .filter((p) => p.status === 'active')
    .sort(
      (a, b) =>
        a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) ||
        (a.createdAt || a.date).localeCompare(b.createdAt || b.date) ||
        a.docNumber.localeCompare(b.docNumber)
    );

  const targets: Array<{ label: string; remaining: Decimal }> = [];
  if (opening.gt(0)) {
    targets.push({ label: 'Opening balance', remaining: opening });
  }
  for (const b of activeBills) {
    const amt = roundMoney(b.totalAmount);
    if (amt.gt(0)) {
      targets.push({ label: b.docNumber, remaining: amt });
    }
  }

  // If opening balance was negative (customer advance), apply it to oldest bills first
  if (opening.lt(0)) {
    let creditPool = opening.abs();
    for (const t of targets) {
      if (creditPool.lte(0)) break;
      if (t.remaining.lte(0)) continue;
      const used = Decimal.min(t.remaining, creditPool);
      t.remaining = roundMoney(t.remaining.minus(used));
      creditPool = roundMoney(creditPool.minus(used));
    }
  }

  for (const p of activePayments) {
    let rem = roundMoney(p.amount);
    const parts: string[] = [];
    for (const t of targets) {
      if (rem.lte(0)) break;
      if (t.remaining.lte(0)) continue;
      const used = Decimal.min(t.remaining, rem);
      t.remaining = roundMoney(t.remaining.minus(used));
      rem = roundMoney(rem.minus(used));
      parts.push(`${t.label} (${formatMoney(used)})`);
    }
    if (rem.gt(0)) {
      parts.push(`Advance (${formatMoney(rem)})`);
    }
    result.set(p.id, parts.length > 0 ? parts.join(', ') : 'Account allocation');
  }

  return result;
}

/**
 * Builds PrintableDocumentMeta for Customer Ledger Statement (Print statement & Download PDF).
 */
export function buildCustomerStatementPrintMeta(
  customer: Customer,
  ledger: CustomerLedgerResult,
  entries: CustomerLedgerEntry[],
  settings?: CompanySettings | null,
  dateFilter?: { fromDate?: string; toDate?: string }
): PrintableDocumentMeta {
  const companyAddress = [settings?.address, settings?.city]
    .filter(Boolean)
    .join(', ');

  const customerAddress = [
    customer.contactPerson ? `Attn: ${customer.contactPerson}` : null,
    customer.address,
    customer.city,
    customer.phone,
    customer.alternatePhone ? `Alt: ${customer.alternatePhone}` : null,
    customer.email,
    customer.unloadingAddress ? `Unloading: ${customer.unloadingAddress}` : null,
    customer.ntn ? `NTN: ${customer.ntn}` : null,
    customer.paymentTermsDays ? `Terms: ${customer.paymentTermsDays} days` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const metaRows: Array<{ label: string; value: string }> = [];
  if (customer.phone) {
    metaRows.push({ label: 'Customer phone', value: customer.phone });
  }
  if (customer.ntn) {
    metaRows.push({ label: 'NTN', value: customer.ntn });
  }
  if (customer.paymentTermsDays) {
    metaRows.push({ label: 'Payment terms', value: `${customer.paymentTermsDays} days` });
  }
  if (dateFilter?.fromDate || dateFilter?.toDate) {
    metaRows.push({
      label: 'Statement period',
      value: `${dateFilter.fromDate ? formatDate(dateFilter.fromDate) : 'Start'} to ${
        dateFilter.toDate ? formatDate(dateFilter.toDate) : 'Today'
      }`,
    });
  }

  const closingLabel = ledger.balance.lt(0)
    ? 'Closing advance'
    : 'Closing balance receivable';
  const closingValue = ledger.balance.lt(0)
    ? `${formatMoney(ledger.balance.abs())} (Advance)`
    : formatMoney(ledger.balance);

  return {
    title: 'Customer Statement of Account',
    docNumber: `STMT-${customer.name.replace(/\s+/g, '-').toUpperCase().slice(0, 12)}`,
    date: formatDate(getTodayKarachiIsoDate()),
    companyName: settings?.companyName || 'MK Melting Solutions',
    companyPhone: settings?.phone,
    companyEmail: settings?.email,
    companyAddress: companyAddress || undefined,
    partyLabel: 'Customer',
    partyName: customer.name,
    partyAddress: customerAddress || undefined,
    metaRows,
    columns: [
      { key: 'date', header: 'Date', align: 'left' },
      { key: 'detail', header: 'Detail', align: 'left' },
      { key: 'debit', header: 'Debit', align: 'right' },
      { key: 'credit', header: 'Credit', align: 'right' },
      { key: 'balance', header: 'Balance', align: 'right' },
    ],
    rows: entries.map((e) => ({
      date: e.date ? formatDate(e.date) : 'Opening',
      detail: e.detail,
      debit: e.debit.gt(0) ? formatMoney(e.debit) : '—',
      credit: e.credit.gt(0) ? formatMoney(e.credit) : '—',
      balance: formatRunningBalanceLabel(e.balance),
    })),
    totals: [
      {
        label: 'Opening balance',
        value: formatRunningBalanceLabel(ledger.openingBalance),
      },
      {
        label: 'Total sold',
        value: formatMoney(ledger.totalSold),
      },
      {
        label: 'Total received',
        value: formatMoney(ledger.totalPaid),
      },
      {
        label: closingLabel,
        value: closingValue,
        highlight: true,
      },
    ],
  };
}

/**
 * Builds PrintableDocumentMeta for a Customer Payment Receipt (RCV-YYYY-NNNN).
 */
export function buildPaymentReceiptPrintMeta(
  payment: CustomerPayment,
  customer?: Customer | null,
  settings?: CompanySettings | null,
  balanceContext?: { balanceBefore?: Decimal; balanceAfter?: Decimal }
): PrintableDocumentMeta {
  const companyAddress = [settings?.address, settings?.city]
    .filter(Boolean)
    .join(', ');

  const customerAddress = [
    customer?.contactPerson ? `Attn: ${customer.contactPerson}` : null,
    customer?.address,
    customer?.city,
    customer?.phone,
    customer?.unloadingAddress ? `Unloading: ${customer.unloadingAddress}` : null,
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
      value: formatRunningBalanceLabel(balanceContext.balanceBefore),
    });
  }

  totals.push({
    label: 'Amount received',
    value: formatMoney(payment.amount, { alwaysShowDecimals: true }),
    highlight: true,
  });

  if (balanceContext?.balanceAfter !== undefined) {
    totals.push({
      label: balanceContext.balanceAfter.lt(0)
        ? 'Advance after payment'
        : 'Balance after payment',
      value: formatRunningBalanceLabel(balanceContext.balanceAfter),
    });
  }

  return {
    title: 'Payment Receipt',
    docNumber: payment.docNumber,
    date: formatDate(payment.date),
    companyName: settings?.companyName || 'MK Melting Solutions',
    companyPhone: settings?.phone,
    companyEmail: settings?.email,
    companyAddress: companyAddress || undefined,
    partyLabel: 'Received from',
    partyName: payment.customerName,
    partyAddress: customerAddress || undefined,
    metaRows,
    columns: [
      { key: 'receipt', header: 'Receipt #', align: 'left' },
      { key: 'date', header: 'Date', align: 'left' },
      { key: 'method', header: 'Method', align: 'left' },
      { key: 'note', header: 'Note', align: 'left' },
      { key: 'amount', header: 'Amount', align: 'right' },
    ],
    rows: [
      {
        receipt: payment.docNumber,
        date: formatDate(payment.date),
        method: formatPaymentMethod(payment.method),
        note: payment.notes || 'Payment received against account',
        amount: formatMoney(payment.amount, { alwaysShowDecimals: true }),
      },
    ],
    totals,
    amountInWordsText: amountInWords(payment.amount),
  };
}
