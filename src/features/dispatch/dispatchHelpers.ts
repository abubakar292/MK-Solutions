import type { PrintableDocumentMeta } from '../../components/print/PrintLayout';
import type {
  Bill,
  BillPaymentStatus,
  CompanySettings,
  Dispatch,
} from '../../domain/types';
import {
  amountInWords,
  formatBags,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTon,
} from '../../lib/format';

export type DispatchDisplayStatus = 'sent' | 'sold' | 'cancelled';

/**
 * Determines the display status of a dispatch:
 * - 'cancelled' if dispatch.status === 'cancelled'
 * - 'sold' if dispatch.billId points to an active bill
 * - 'sent' otherwise (waiting for weight & rate)
 */
export function getDispatchDisplayStatus(
  dispatch: Dispatch,
  billsMap: Map<string, Bill>
): DispatchDisplayStatus {
  if (dispatch.status === 'cancelled') {
    return 'cancelled';
  }
  if (dispatch.billId) {
    const bill = billsMap.get(dispatch.billId);
    if (bill && bill.status === 'active') {
      return 'sold';
    }
  }
  return 'sent';
}

/**
 * Builds PrintableDocumentMeta for a Dispatch Gate Pass (Print & PDF).
 * Shows customer, vehicle, driver, bags, notes, and Sold weight if recorded.
 */
export function buildDispatchPrintMeta(
  dispatch: Dispatch,
  settings?: CompanySettings | null,
  statusLabel = 'Sent'
): PrintableDocumentMeta {
  const companyAddress = [settings?.address, settings?.city]
    .filter(Boolean)
    .join(', ');

  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Vehicle number', value: dispatch.vehicleNumber },
    { label: 'Dispatch status', value: statusLabel },
  ];

  if (dispatch.driverName) {
    metaRows.push({ label: 'Driver name', value: dispatch.driverName });
  }
  if (dispatch.bagsCount && dispatch.bagsCount > 0) {
    metaRows.push({ label: 'Bags count', value: formatBags(dispatch.bagsCount) });
  }
  if (dispatch.receivedWeightTons) {
    metaRows.push({ label: 'Sold weight', value: formatTon(dispatch.receivedWeightTons) });
  }
  if (dispatch.notes) {
    metaRows.push({ label: 'Notes', value: dispatch.notes });
  }

  return {
    title: 'Dispatch Gate Pass',
    docNumber: dispatch.docNumber,
    date: formatDateTime(dispatch.dateTime),
    companyName: settings?.companyName || 'MK Melting Solutions',
    companyPhone: settings?.phone,
    companyEmail: settings?.email,
    companyAddress: companyAddress || undefined,
    partyLabel: 'Customer',
    partyName: dispatch.customerName,
    metaRows,
    columns: [
      { key: 'item', header: 'Item', align: 'left' },
      { key: 'vehicle', header: 'Vehicle #', align: 'left' },
      { key: 'bags', header: 'Bags', align: 'right' },
      { key: 'status', header: 'Status', align: 'right' },
    ],
    rows: [
      {
        item: 'Final Powder',
        vehicle: dispatch.vehicleNumber,
        bags:
          dispatch.bagsCount && dispatch.bagsCount > 0
            ? formatBags(dispatch.bagsCount)
            : '—',
        status: statusLabel,
      },
    ],
    totals: dispatch.receivedWeightTons
      ? [
          {
            label: 'Sold weight',
            value: formatTon(dispatch.receivedWeightTons),
            highlight: true,
          },
        ]
      : undefined,
  };
}

/**
 * Builds PrintableDocumentMeta for a Customer Bill / Tax Invoice per Phase 2.5:
 * Logo, company details, bill number, date, customer, vehicle number, dispatch number,
 * dispatch date and time, driver, table with product, bags (if entered), received weight (tons),
 * rate per ton, amount, discount, total in numbers and in words, paid and balance, signature area.
 */
export function buildBillPrintMeta(
  bill: Bill,
  settings?: CompanySettings | null,
  allocation?: {
    paidAmount: string;
    remainingAmount: string;
    paymentStatus: BillPaymentStatus;
  }
): PrintableDocumentMeta {
  const companyAddress = [settings?.address, settings?.city]
    .filter(Boolean)
    .join(', ');

  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Dispatch number', value: bill.dispatchDocNumber },
    { label: 'Dispatch date & time', value: formatDateTime(bill.dispatchDateTime) },
    { label: 'Vehicle number', value: bill.vehicleNumber },
  ];

  if (bill.driverName) {
    metaRows.push({ label: 'Driver name', value: bill.driverName });
  }
  if (bill.bagsCount && bill.bagsCount > 0) {
    metaRows.push({ label: 'Bags loaded', value: formatBags(bill.bagsCount) });
  }

  if (bill.notes) {
    metaRows.push({ label: 'Notes', value: bill.notes });
  }

  const totals: Array<{ label: string; value: string; highlight?: boolean }> = [];

  if (bill.discount && Number(bill.discount) > 0) {
    totals.push({
      label: 'Subtotal',
      value: formatMoney(bill.subtotal, { alwaysShowDecimals: true }),
    });
    totals.push({
      label: 'Discount',
      value: `- ${formatMoney(bill.discount, { alwaysShowDecimals: true })}`,
    });
  }

  totals.push({
    label: 'Total bill amount',
    value: formatMoney(bill.totalAmount, { alwaysShowDecimals: true }),
    highlight: true,
  });

  if (allocation) {
    totals.push({
      label: 'Paid amount',
      value: formatMoney(allocation.paidAmount, { alwaysShowDecimals: true }),
    });
    totals.push({
      label: 'Balance due',
      value: formatMoney(allocation.remainingAmount, { alwaysShowDecimals: true }),
    });
  }

  return {
    title: 'Customer Bill',
    docNumber: bill.docNumber,
    date: formatDate(bill.date),
    companyName: settings?.companyName || 'MK Melting Solutions',
    companyPhone: settings?.phone,
    companyEmail: settings?.email,
    companyAddress: companyAddress || undefined,
    partyLabel: 'Bill to',
    partyName: bill.customerName,
    partyAddress: bill.customerAddress || undefined,
    metaRows,
    columns: [
      { key: 'description', header: 'Description', align: 'left' },
      { key: 'bags', header: 'Bags', align: 'right' },
      { key: 'receivedWeight', header: 'Received weight', align: 'right' },
      { key: 'rate', header: 'Rate per ton', align: 'right' },
      { key: 'amount', header: 'Amount', align: 'right' },
    ],
    rows: [
      {
        description: `Final Powder (${bill.vehicleNumber})`,
        bags: bill.bagsCount && bill.bagsCount > 0 ? formatBags(bill.bagsCount) : '—',
        receivedWeight: formatTon(bill.receivedWeightTons),
        rate: `${formatMoney(bill.ratePerTon)} / ton`,
        amount: formatMoney(bill.totalAmount, { alwaysShowDecimals: true }),
      },
    ],
    totals,
    amountInWordsText: amountInWords(bill.totalAmount),
  };
}
