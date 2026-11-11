import Decimal from 'decimal.js';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  RefreshCw,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { BrandLoader } from '../../components/loader/BrandLoader';
import {
  downloadDocumentPdf,
  PrintLayout,
  usePrintDocument,
  type PrintableDocumentMeta,
} from '../../components/print/PrintLayout';
import { Dialog } from '../../components/shared/Dialog';
import { DatePicker } from '../../components/shared/Inputs';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import {
  calculateCustomerLedgerAndAllocations,
  calculateEmployeeLedger,
  calculateSupplierLedger,
  getPreviousYearMonth,
  isSalaryRecordPaid,
  roundMoney,
  roundWeight,
} from '../../domain/engine';
import {
  diffDaysBetweenIsoDates,
  extractNormalizedPurchaseLines,
  getMonthDateBounds,
} from '../../domain/reports';
import type {
  Bill,
  CompanySettings,
  Customer,
  CustomerPayment,
  Dispatch,
  Employee,
  EmployeeAdvance,
  Purchase,
  SalaryRecord,
  Supplier,
  SupplierPayment,
} from '../../domain/types';
import {
  formatBags,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTon,
  getTodayKarachiIsoDate,
} from '../../lib/format';
import { notify } from '../../lib/notify';
import { cn } from '../../lib/utils';
import {
  computePaymentAppliedToBillsMap,
  formatPaymentMethod,
  formatRunningBalanceLabel,
} from '../customers/customerHelpers';
import { formatMonthYearLabel } from '../employees/employeeHelpers';

export type PartyReportPreset = 'this_month' | 'last_month' | 'this_year' | 'custom';

export interface PartyReportsDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  settings?: CompanySettings | null;
  partyType: 'customer' | 'supplier' | 'employee';
  customer?: Customer | null;
  supplier?: Supplier | null;
  employee?: Employee | null;
  // Records for customer
  bills?: Bill[];
  dispatches?: Dispatch[];
  customerPayments?: CustomerPayment[];
  // Records for supplier
  purchases?: Purchase[];
  supplierPayments?: SupplierPayment[];
  // Records for employee
  advances?: EmployeeAdvance[];
  salaries?: SalaryRecord[];
}

function getPresetBounds(preset: PartyReportPreset): { fromDate: string; toDate: string } {
  const today = getTodayKarachiIsoDate();
  const currentMonth = today.slice(0, 7);

  if (preset === 'this_month') {
    const bounds = getMonthDateBounds(currentMonth);
    return { fromDate: bounds.fromDate, toDate: bounds.toDate };
  }
  if (preset === 'last_month') {
    const prevMonth = getPreviousYearMonth(currentMonth);
    return getMonthDateBounds(prevMonth);
  }
  if (preset === 'this_year') {
    const year = currentMonth.slice(0, 4);
    return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` };
  }
  return { fromDate: `${currentMonth.slice(0, 4)}-01-01`, toDate: today };
}

function escapeCsvCell(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsvFile(filename: string, rows: Array<Array<string | number>>) {
  const csvContent = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const PartyReportsDialog: React.FC<PartyReportsDialogProps> = ({
  open,
  onClose,
  companyId,
  settings,
  partyType,
  customer,
  supplier,
  employee,
  bills = [],
  dispatches = [],
  customerPayments = [],
  purchases = [],
  supplierPayments = [],
  advances = [],
  salaries = [],
}) => {
  const [preset, setPreset] = useState<PartyReportPreset>('this_year');
  const [draftFromDate, setDraftFromDate] = useState<string>(() => getPresetBounds('this_year').fromDate);
  const [draftToDate, setDraftToDate] = useState<string>(() => getPresetBounds('this_year').toDate);

  // Active applied dates after clicking Generate
  const [appliedFromDate, setAppliedFromDate] = useState<string>(() => getPresetBounds('this_year').fromDate);
  const [appliedToDate, setAppliedToDate] = useState<string>(() => getPresetBounds('this_year').toDate);
  const [generating, setGenerating] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const { printDocument, isPrinting } = usePrintDocument();

  useEffect(() => {
    if (open) {
      const initial = getPresetBounds('this_year');
      setPreset('this_year');
      setDraftFromDate(initial.fromDate);
      setDraftToDate(initial.toDate);
      setAppliedFromDate(initial.fromDate);
      setAppliedToDate(initial.toDate);
      setGenerating(true);
      const timer = window.setTimeout(() => setGenerating(false), 240);
      return () => window.clearTimeout(timer);
    }
  }, [open, partyType, customer?.id, supplier?.id, employee?.id]);

  const handleSelectPreset = (nextPreset: PartyReportPreset) => {
    setPreset(nextPreset);
    if (nextPreset !== 'custom') {
      const bounds = getPresetBounds(nextPreset);
      setDraftFromDate(bounds.fromDate);
      setDraftToDate(bounds.toDate);
      setGenerating(true);
      window.setTimeout(() => {
        setAppliedFromDate(bounds.fromDate);
        setAppliedToDate(bounds.toDate);
        setGenerating(false);
      }, 220);
    }
  };

  const handleGenerate = () => {
    if (draftFromDate && draftToDate && draftFromDate > draftToDate) {
      notify.error('Start date cannot be after end date.');
      return;
    }
    setGenerating(true);
    window.setTimeout(() => {
      setAppliedFromDate(draftFromDate);
      setAppliedToDate(draftToDate);
      setGenerating(false);
    }, 240);
  };

  // ==========================================================================
  // 1. CUSTOMER REPORT CALCULATIONS
  // ==========================================================================
  const customerReport = useMemo(() => {
    if (partyType !== 'customer' || !customer) return null;

    const custBills = bills.filter(
      (b) => b.customerId === customer.id && b.status === 'active'
    );
    const custPayments = customerPayments.filter(
      (p) => p.customerId === customer.id && p.status === 'active'
    );
    const custDispatches = dispatches.filter(
      (d) => d.customerId === customer.id && d.status === 'active'
    );

    // Full ledger up to appliedToDate (for accurate FIFO allocations & closing state)
    const billsUpToEnd = custBills.filter(
      (b) => !appliedToDate || b.date.slice(0, 10) <= appliedToDate
    );
    const paymentsUpToEnd = custPayments.filter(
      (p) => !appliedToDate || p.date.slice(0, 10) <= appliedToDate
    );

    const fullLedgerAsOfEnd = calculateCustomerLedgerAndAllocations({
      openingBalance: customer.openingBalance,
      bills: billsUpToEnd,
      payments: paymentsUpToEnd,
    });

    // Opening balance as of appliedFromDate = balance strictly before appliedFromDate
    let openingBalance = roundMoney(customer.openingBalance || 0);
    if (appliedFromDate) {
      const billsBefore = custBills.filter((b) => b.date.slice(0, 10) < appliedFromDate);
      const paymentsBefore = custPayments.filter((p) => p.date.slice(0, 10) < appliedFromDate);
      const beforeLedger = calculateCustomerLedgerAndAllocations({
        openingBalance: customer.openingBalance,
        bills: billsBefore,
        payments: paymentsBefore,
      });
      openingBalance = beforeLedger.balance;
    }

    // Period dispatches
    const periodDispatches = custDispatches
      .filter((d) => {
        const dt = d.dateTime.slice(0, 10);
        if (appliedFromDate && dt < appliedFromDate) return false;
        if (appliedToDate && dt > appliedToDate) return false;
        return true;
      })
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

    let totalDispatchedBags = new Decimal(0);
    let totalDispatchedTons = new Decimal(0);
    for (const d of periodDispatches) {
      totalDispatchedBags = roundWeight(totalDispatchedBags.plus(d.bagsCount || 0));
      totalDispatchedTons = roundWeight(totalDispatchedTons.plus(d.receivedWeightTons || 0));
    }

    // Period bills
    const allocationMap = new Map(
      fullLedgerAsOfEnd.billAllocations.map((a) => [a.billId, a])
    );
    const periodBills = billsUpToEnd
      .filter((b) => !appliedFromDate || b.date.slice(0, 10) >= appliedFromDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.docNumber.localeCompare(b.docNumber));

    let totalBilled = new Decimal(0);
    let totalBillTons = new Decimal(0);
    let totalBillDiscount = new Decimal(0);
    let totalBillsPaidPortion = new Decimal(0);
    let totalBillsRemainingPortion = new Decimal(0);

    const billRows = periodBills.map((b) => {
      const alloc = allocationMap.get(b.id);
      const tons = roundWeight(b.receivedWeightTons);
      const rate = roundMoney(b.ratePerTon);
      const discount = roundMoney(b.discount || 0);
      const amount = roundMoney(b.totalAmount);
      const paid = alloc ? alloc.paidAmount : new Decimal(0);
      const balance = alloc ? alloc.remainingAmount : amount;

      totalBillTons = roundWeight(totalBillTons.plus(tons));
      totalBillDiscount = roundMoney(totalBillDiscount.plus(discount));
      totalBilled = roundMoney(totalBilled.plus(amount));
      totalBillsPaidPortion = roundMoney(totalBillsPaidPortion.plus(paid));
      totalBillsRemainingPortion = roundMoney(totalBillsRemainingPortion.plus(balance));

      return {
        bill: b,
        tons,
        rate,
        discount,
        amount,
        paid,
        balance,
      };
    });

    // Period payments + which bills they applied to
    const appliedByPaymentId = computePaymentAppliedToBillsMap({
      openingBalance: customer.openingBalance,
      bills: billsUpToEnd,
      payments: paymentsUpToEnd,
    });
    const periodPayments = paymentsUpToEnd
      .filter((p) => !appliedFromDate || p.date.slice(0, 10) >= appliedFromDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.docNumber.localeCompare(b.docNumber));

    let totalReceived = new Decimal(0);
    const paymentRows = periodPayments.map((p) => {
      const amt = roundMoney(p.amount);
      totalReceived = roundMoney(totalReceived.plus(amt));
      const appliedText =
        appliedByPaymentId.get(p.id) || 'FIFO account allocation';

      return {
        payment: p,
        amount: amt,
        appliedText,
      };
    });

    // Period ledger entries (starting with Opening balance row as of appliedFromDate)
    const periodLedgerEntries = fullLedgerAsOfEnd.entries.filter((e) => {
      if (e.type === 'opening') return !appliedFromDate;
      if (appliedFromDate && e.date.slice(0, 10) < appliedFromDate) return false;
      if (appliedToDate && e.date.slice(0, 10) > appliedToDate) return false;
      return true;
    });

    const closingBalance = roundMoney(openingBalance.plus(totalBilled).minus(totalReceived));

    // Ageing of unpaid bills as of end date
    const refDate = appliedToDate || getTodayKarachiIsoDate();
    let age0To30 = new Decimal(0);
    let age31To60 = new Decimal(0);
    let ageOver60 = new Decimal(0);

    const unpaidBills: Array<{
      docNumber: string;
      date: string;
      ageDays: number;
      bucket: '0–30 days' | '31–60 days' | 'Over 60 days';
      totalAmount: Decimal;
      paidAmount: Decimal;
      remainingAmount: Decimal;
    }> = [];

    if (closingBalance.gt(0)) {
      const unpaidOpening = Decimal.max(
        new Decimal(0),
        roundMoney(fullLedgerAsOfEnd.openingBalance.minus(fullLedgerAsOfEnd.totalPaid))
      );
      if (unpaidOpening.gt(0)) {
        ageOver60 = roundMoney(ageOver60.plus(unpaidOpening));
      }

      for (const alloc of fullLedgerAsOfEnd.billAllocations) {
        if (alloc.remainingAmount.lte(0)) continue;
        const ageDays = diffDaysBetweenIsoDates(alloc.date, refDate);
        let bucket: '0–30 days' | '31–60 days' | 'Over 60 days' = '0–30 days';
        if (ageDays <= 30) {
          age0To30 = roundMoney(age0To30.plus(alloc.remainingAmount));
          bucket = '0–30 days';
        } else if (ageDays <= 60) {
          age31To60 = roundMoney(age31To60.plus(alloc.remainingAmount));
          bucket = '31–60 days';
        } else {
          ageOver60 = roundMoney(ageOver60.plus(alloc.remainingAmount));
          bucket = 'Over 60 days';
        }
        unpaidBills.push({
          docNumber: alloc.docNumber,
          date: alloc.date,
          ageDays,
          bucket,
          totalAmount: alloc.totalAmount,
          paidAmount: alloc.paidAmount,
          remainingAmount: alloc.remainingAmount,
        });
      }
    }

    return {
      openingBalance,
      totalBilled,
      totalReceived,
      closingBalance,
      periodDispatches,
      totalDispatchedBags,
      totalDispatchedTons,
      billRows,
      totalBillTons,
      totalBillDiscount,
      totalBillsPaidPortion,
      totalBillsRemainingPortion,
      paymentRows,
      periodLedgerEntries,
      age0To30,
      age31To60,
      ageOver60,
      unpaidBills,
    };
  }, [partyType, customer, bills, customerPayments, dispatches, appliedFromDate, appliedToDate]);

  // ==========================================================================
  // 2. SUPPLIER REPORT CALCULATIONS
  // ==========================================================================
  const supplierReport = useMemo(() => {
    if (partyType !== 'supplier' || !supplier) return null;

    const supPurchases = purchases.filter(
      (p) => p.supplierId === supplier.id && p.status === 'active'
    );
    const supPayments = supplierPayments.filter(
      (p) => p.supplierId === supplier.id && p.status === 'active'
    );

    const purchasesUpToEnd = supPurchases.filter(
      (p) => !appliedToDate || p.date.slice(0, 10) <= appliedToDate
    );
    const paymentsUpToEnd = supPayments.filter(
      (p) => !appliedToDate || p.date.slice(0, 10) <= appliedToDate
    );

    const fullLedgerAsOfEnd = calculateSupplierLedger({
      openingBalance: supplier.openingBalance,
      purchases: purchasesUpToEnd,
      payments: paymentsUpToEnd,
    });

    // Opening balance strictly before appliedFromDate
    let openingBalance = roundMoney(supplier.openingBalance || 0);
    if (appliedFromDate) {
      const beforePurchases = supPurchases.filter((p) => p.date.slice(0, 10) < appliedFromDate);
      const beforePayments = supPayments.filter((p) => p.date.slice(0, 10) < appliedFromDate);
      const beforeLedger = calculateSupplierLedger({
        openingBalance: supplier.openingBalance,
        purchases: beforePurchases,
        payments: beforePayments,
      });
      openingBalance = beforeLedger.balance;
    }

    // Period purchases & flattened item lines
    const periodPurchases = purchasesUpToEnd
      .filter((p) => !appliedFromDate || p.date.slice(0, 10) >= appliedFromDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.docNumber.localeCompare(b.docNumber));

    let totalPurchased = new Decimal(0);
    const purchaseLineRows: Array<{
      key: string;
      date: string;
      docNumber: string;
      vehicleNumber: string;
      itemId: string;
      itemName: string;
      unit: 'ton' | 'bag';
      quantity: Decimal;
      rate: Decimal;
      amount: Decimal;
    }> = [];

    const itemsSummaryMap = new Map<
      string,
      {
        itemId: string;
        itemName: string;
        unit: 'ton' | 'bag';
        totalQuantity: Decimal;
        totalAmount: Decimal;
      }
    >();

    for (const p of periodPurchases) {
      totalPurchased = roundMoney(totalPurchased.plus(p.totalAmount));
      const lines = extractNormalizedPurchaseLines(p);
      lines.forEach((l, idx) => {
        purchaseLineRows.push({
          key: `${p.id}_${idx}`,
          date: p.date.slice(0, 10),
          docNumber: p.docNumber,
          vehicleNumber: p.vehicleNumber || '—',
          itemId: l.itemId,
          itemName: l.itemName,
          unit: l.unit,
          quantity: l.quantity,
          rate: l.rate,
          amount: l.amount,
        });

        const existing = itemsSummaryMap.get(l.itemId);
        if (existing) {
          existing.totalQuantity = roundWeight(existing.totalQuantity.plus(l.quantity));
          existing.totalAmount = roundMoney(existing.totalAmount.plus(l.amount));
        } else {
          itemsSummaryMap.set(l.itemId, {
            itemId: l.itemId,
            itemName: l.itemName,
            unit: l.unit,
            totalQuantity: l.quantity,
            totalAmount: l.amount,
          });
        }
      });
    }

    const itemsSummaryRows = Array.from(itemsSummaryMap.values())
      .map((item) => ({
        ...item,
        avgRate: item.totalQuantity.gt(0)
          ? roundMoney(item.totalAmount.dividedBy(item.totalQuantity))
          : new Decimal(0),
      }))
      .sort((a, b) => b.totalAmount.comparedTo(a.totalAmount));

    // Period payments (standalone supplierPayments + paidNow on purchases in period)
    const paymentRows: Array<{
      id: string;
      date: string;
      docNumber: string;
      method: string;
      notes: string;
      amount: Decimal;
    }> = [];

    for (const p of periodPurchases) {
      const paidNow = roundMoney(p.paidNow || 0);
      if (paidNow.gt(0)) {
        paymentRows.push({
          id: `${p.id}_paidNow`,
          date: p.date.slice(0, 10),
          docNumber: p.docNumber,
          method: 'On purchase',
          notes: `Paid at time of purchase ${p.docNumber}`,
          amount: paidNow,
        });
      }
    }

    const periodStandalonePayments = paymentsUpToEnd.filter(
      (sp) => !appliedFromDate || sp.date.slice(0, 10) >= appliedFromDate
    );
    for (const sp of periodStandalonePayments) {
      paymentRows.push({
        id: sp.id,
        date: sp.date.slice(0, 10),
        docNumber: sp.docNumber,
        method: formatPaymentMethod(sp.method),
        notes: sp.notes || 'Supplier payment',
        amount: roundMoney(sp.amount),
      });
    }

    paymentRows.sort(
      (a, b) => a.date.localeCompare(b.date) || a.docNumber.localeCompare(b.docNumber)
    );

    const totalPaid = paymentRows.reduce(
      (acc, r) => roundMoney(acc.plus(r.amount)),
      new Decimal(0)
    );

    const closingBalance = roundMoney(openingBalance.plus(totalPurchased).minus(totalPaid));

    const periodLedgerEntries = fullLedgerAsOfEnd.entries.filter((e) => {
      if (e.id === 'opening' || e.date === '—') return !appliedFromDate;
      if (appliedFromDate && e.date.slice(0, 10) < appliedFromDate) return false;
      if (appliedToDate && e.date.slice(0, 10) > appliedToDate) return false;
      return true;
    });

    return {
      openingBalance,
      totalPurchased,
      totalPaid,
      closingBalance,
      purchaseLineRows,
      paymentRows,
      itemsSummaryRows,
      periodLedgerEntries,
    };
  }, [partyType, supplier, purchases, supplierPayments, appliedFromDate, appliedToDate]);

  // ==========================================================================
  // 3. EMPLOYEE REPORT CALCULATIONS
  // ==========================================================================
  const employeeReport = useMemo(() => {
    if (partyType !== 'employee' || !employee) return null;

    const empAdvances = advances.filter(
      (a) => a.employeeId === employee.id && a.status === 'active'
    );
    const empSalaries = salaries.filter(
      (s) => s.employeeId === employee.id && s.status === 'active'
    );

    const fromMonth = appliedFromDate ? appliedFromDate.slice(0, 7) : '';
    const toMonth = appliedToDate ? appliedToDate.slice(0, 7) : '';

    const fullLedger = calculateEmployeeLedger({
      employee,
      advances: empAdvances,
      salaries: empSalaries,
    });

    const periodSalaries = empSalaries
      .filter((s) => {
        if (fromMonth && s.month < fromMonth) return false;
        if (toMonth && s.month > toMonth) return false;
        return true;
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    let totalBasic = new Decimal(0);
    let totalBonus = new Decimal(0);
    let totalEarned = new Decimal(0);
    let totalAdvanceDeducted = new Decimal(0);
    let totalNetSalary = new Decimal(0);

    for (const s of periodSalaries) {
      const basic = roundMoney(s.basicSalary);
      const bonus = roundMoney(s.bonus);
      const gross = roundMoney(basic.plus(bonus));
      const advDed = roundMoney(s.advanceDeduction);
      const net = roundMoney(s.netPayable);

      totalBasic = roundMoney(totalBasic.plus(basic));
      totalBonus = roundMoney(totalBonus.plus(bonus));
      totalEarned = roundMoney(totalEarned.plus(gross));
      totalAdvanceDeducted = roundMoney(totalAdvanceDeducted.plus(advDed));
      totalNetSalary = roundMoney(totalNetSalary.plus(net));
    }

    const periodAdvances = empAdvances
      .filter((a) => {
        const dt = a.date.slice(0, 10);
        if (appliedFromDate && dt < appliedFromDate) return false;
        if (appliedToDate && dt > appliedToDate) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.docNumber.localeCompare(b.docNumber));

    const totalAdvances = periodAdvances.reduce(
      (acc, a) => roundMoney(acc.plus(a.amount)),
      new Decimal(0)
    );

    // Salary payments in period
    const salaryPayments = periodSalaries
      .filter((s) => isSalaryRecordPaid(s))
      .map((s) => ({
        id: s.id,
        date: (s.paidDate || s.date).slice(0, 10),
        docNumber: s.docNumber,
        month: s.month,
        method: formatPaymentMethod(s.paymentMethod || 'cash'),
        amount: roundMoney(s.paidAmount ?? s.netPayable),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalPaid = salaryPayments.reduce(
      (acc, p) => roundMoney(acc.plus(p.amount)),
      new Decimal(0)
    );

    const periodLedgerEntries = fullLedger.entries.filter((e) => {
      const dt = e.date.slice(0, 10);
      if (appliedFromDate && dt < appliedFromDate) return false;
      if (appliedToDate && dt > appliedToDate) return false;
      return true;
    });

    const closingBalance =
      periodLedgerEntries.length > 0
        ? periodLedgerEntries[periodLedgerEntries.length - 1].runningBalance
        : fullLedger.currentBalance;

    return {
      monthlySalary: roundMoney(employee.basicSalary),
      totalBasic,
      totalBonus,
      totalEarned,
      totalAdvances,
      totalAdvanceDeducted,
      totalNetSalary,
      totalPaid,
      closingBalance,
      periodSalaries,
      periodAdvances,
      salaryPayments,
      periodLedgerEntries,
    };
  }, [partyType, employee, advances, salaries, appliedFromDate, appliedToDate]);

  // ==========================================================================
  // PRINTABLE METADATA (FOR PDF & PRINT HEADER)
  // ==========================================================================
  const printMeta = useMemo<PrintableDocumentMeta>(() => {
    const companyAddress = [settings?.address, settings?.city].filter(Boolean).join(', ');
    const periodText = `${appliedFromDate ? formatDate(appliedFromDate) : 'Start'} to ${
      appliedToDate ? formatDate(appliedToDate) : 'Today'
    }`;

    if (partyType === 'customer' && customer && customerReport) {
      return {
        title: 'Customer Complete Report',
        docNumber: `RPT-CUST-${customer.name.replace(/\s+/g, '-').toUpperCase().slice(0, 10)}`,
        date: formatDate(getTodayKarachiIsoDate()),
        companyName: settings?.companyName || 'MK Melting Solutions',
        companyAddress: companyAddress || undefined,
        companyPhone: settings?.phone,
        companyEmail: settings?.email,
        partyLabel: 'Customer',
        partyName: customer.name,
        partyAddress: [customer.city, customer.phone, customer.address]
          .filter(Boolean)
          .join(' · '),
        metaRows: [
          { label: 'Report period', value: periodText },
          {
            label: 'Opening balance',
            value: formatRunningBalanceLabel(customerReport.openingBalance),
          },
          { label: 'Total billed', value: formatMoney(customerReport.totalBilled) },
          { label: 'Total received', value: formatMoney(customerReport.totalReceived) },
        ],
        columns: [
          { key: 'date', header: 'Date', align: 'left' },
          { key: 'detail', header: 'Detail', align: 'left' },
          { key: 'debit', header: 'Debit', align: 'right' },
          { key: 'credit', header: 'Credit', align: 'right' },
          { key: 'balance', header: 'Running balance', align: 'right' },
        ],
        rows: customerReport.periodLedgerEntries.map((e) => ({
          date: e.date ? formatDate(e.date) : 'Opening',
          detail: e.detail,
          debit: e.debit.gt(0) ? formatMoney(e.debit) : '—',
          credit: e.credit.gt(0) ? formatMoney(e.credit) : '—',
          balance: formatRunningBalanceLabel(e.balance),
        })),
        extraSections: [
          {
            title: 'Dispatches in period',
            columns: [
              { key: 'date', header: 'Date', align: 'left' },
              { key: 'docNumber', header: 'Dispatch #', align: 'left' },
              { key: 'vehicle', header: 'Vehicle', align: 'left' },
              { key: 'driver', header: 'Driver', align: 'left' },
              { key: 'status', header: 'Status', align: 'right' },
            ],
            rows: customerReport.periodDispatches.map((d) => ({
              date: formatDate(d.dateTime),
              docNumber: d.docNumber,
              vehicle: d.vehicleNumber,
              driver: d.driverName || '—',
              status: d.billId && d.receivedWeightTons ? 'Billed' : 'On the way',
            })),
          },
          {
            title: 'Bills in period',
            columns: [
              { key: 'date', header: 'Date', align: 'left' },
              { key: 'docNumber', header: 'Bill #', align: 'left' },
              { key: 'tons', header: 'Tons', align: 'right' },
              { key: 'rate', header: 'Rate', align: 'right' },
              { key: 'amount', header: 'Amount', align: 'right' },
              { key: 'paid', header: 'Paid', align: 'right' },
              { key: 'balance', header: 'Balance', align: 'right' },
            ],
            rows: customerReport.billRows.map((b) => ({
              date: formatDate(b.bill.date),
              docNumber: b.bill.docNumber,
              tons: `${b.tons.toString()} ton`,
              rate: formatMoney(b.rate),
              amount: formatMoney(b.amount),
              paid: formatMoney(b.paid),
              balance: formatMoney(b.balance),
            })),
          },
          {
            title: 'Payments in period',
            columns: [
              { key: 'date', header: 'Date', align: 'left' },
              { key: 'docNumber', header: 'Receipt #', align: 'left' },
              { key: 'method', header: 'Method', align: 'left' },
              { key: 'applied', header: 'Applied to', align: 'left' },
              { key: 'amount', header: 'Amount', align: 'right' },
            ],
            rows: customerReport.paymentRows.map((p) => ({
              date: formatDate(p.payment.date),
              docNumber: p.payment.docNumber,
              method: formatPaymentMethod(p.payment.method),
              applied: p.appliedText,
              amount: formatMoney(p.amount),
            })),
          },
          {
            title: 'Ageing of unpaid bills',
            columns: [
              { key: 'bucket0_30', header: '0–30 days', align: 'right' },
              { key: 'bucket31_60', header: '31–60 days', align: 'right' },
              { key: 'bucketOver60', header: 'Over 60 days', align: 'right' },
            ],
            rows: [
              {
                bucket0_30: formatMoney(customerReport.age0To30),
                bucket31_60: formatMoney(customerReport.age31To60),
                bucketOver60: formatMoney(customerReport.ageOver60),
              },
            ],
          },
        ],
        totals: [
          {
            label: 'Opening balance',
            value: formatRunningBalanceLabel(customerReport.openingBalance),
          },
          { label: 'Total billed', value: formatMoney(customerReport.totalBilled) },
          { label: 'Total received', value: formatMoney(customerReport.totalReceived) },
          {
            label: customerReport.closingBalance.lt(0)
              ? 'Closing advance'
              : 'Closing balance',
            value: formatRunningBalanceLabel(customerReport.closingBalance),
            highlight: true,
          },
        ],
      };
    }

    if (partyType === 'supplier' && supplier && supplierReport) {
      return {
        title: 'Supplier Complete Report',
        docNumber: `RPT-SUP-${supplier.name.replace(/\s+/g, '-').toUpperCase().slice(0, 10)}`,
        date: formatDate(getTodayKarachiIsoDate()),
        companyName: settings?.companyName || 'MK Melting Solutions',
        companyAddress: companyAddress || undefined,
        companyPhone: settings?.phone,
        companyEmail: settings?.email,
        partyLabel: 'Supplier',
        partyName: supplier.name,
        partyAddress: [supplier.city, supplier.phone, supplier.address]
          .filter(Boolean)
          .join(' · '),
        metaRows: [
          { label: 'Report period', value: periodText },
          { label: 'Opening balance', value: formatMoney(supplierReport.openingBalance) },
          { label: 'Total purchased', value: formatMoney(supplierReport.totalPurchased) },
          { label: 'Total paid', value: formatMoney(supplierReport.totalPaid) },
        ],
        columns: [
          { key: 'date', header: 'Date', align: 'left' },
          { key: 'detail', header: 'Detail', align: 'left' },
          { key: 'debit', header: 'Debit', align: 'right' },
          { key: 'credit', header: 'Credit', align: 'right' },
          { key: 'balance', header: 'Running balance', align: 'right' },
        ],
        rows: supplierReport.periodLedgerEntries.map((e) => ({
          date: e.date === '—' ? 'Opening' : formatDate(e.date),
          detail: e.detail,
          debit: e.debit.gt(0) ? formatMoney(e.debit) : '—',
          credit: e.credit.gt(0) ? formatMoney(e.credit) : '—',
          balance: formatMoney(e.balance),
        })),
        extraSections: [
          {
            title: 'Purchases (item lines)',
            columns: [
              { key: 'date', header: 'Date', align: 'left' },
              { key: 'docNumber', header: 'Voucher #', align: 'left' },
              { key: 'item', header: 'Item', align: 'left' },
              { key: 'qty', header: 'Quantity', align: 'right' },
              { key: 'rate', header: 'Rate', align: 'right' },
              { key: 'amount', header: 'Amount', align: 'right' },
            ],
            rows: supplierReport.purchaseLineRows.map((l) => ({
              date: formatDate(l.date),
              docNumber: l.docNumber,
              item: l.itemName,
              qty: `${l.quantity.toString()} ${l.unit}`,
              rate: formatMoney(l.rate),
              amount: formatMoney(l.amount),
            })),
          },
          {
            title: 'Payments in period',
            columns: [
              { key: 'date', header: 'Date', align: 'left' },
              { key: 'docNumber', header: 'Number', align: 'left' },
              { key: 'method', header: 'Method', align: 'left' },
              { key: 'amount', header: 'Amount', align: 'right' },
            ],
            rows: supplierReport.paymentRows.map((p) => ({
              date: formatDate(p.date),
              docNumber: p.docNumber,
              method: p.method,
              amount: formatMoney(p.amount),
            })),
          },
          {
            title: 'Items summary',
            columns: [
              { key: 'item', header: 'Item', align: 'left' },
              { key: 'qty', header: 'Total quantity', align: 'right' },
              { key: 'avgRate', header: 'Average rate', align: 'right' },
              { key: 'total', header: 'Total', align: 'right' },
            ],
            rows: supplierReport.itemsSummaryRows.map((it) => ({
              item: it.itemName,
              qty: `${it.totalQuantity.toString()} ${it.unit}`,
              avgRate: formatMoney(it.avgRate),
              total: formatMoney(it.totalAmount),
            })),
          },
        ],
        totals: [
          { label: 'Opening balance', value: formatMoney(supplierReport.openingBalance) },
          { label: 'Total purchased', value: formatMoney(supplierReport.totalPurchased) },
          { label: 'Total paid', value: formatMoney(supplierReport.totalPaid) },
          {
            label: 'Closing balance owed',
            value: formatMoney(supplierReport.closingBalance),
            highlight: true,
          },
        ],
      };
    }

    if (partyType === 'employee' && employee && employeeReport) {
      return {
        title: 'Employee Complete Report',
        docNumber: `RPT-EMP-${employee.name.replace(/\s+/g, '-').toUpperCase().slice(0, 10)}`,
        date: formatDate(getTodayKarachiIsoDate()),
        companyName: settings?.companyName || 'MK Melting Solutions',
        companyAddress: companyAddress || undefined,
        companyPhone: settings?.phone,
        companyEmail: settings?.email,
        partyLabel: 'Employee',
        partyName: `${employee.name} (${employee.role})`,
        partyAddress: [employee.phone, employee.address].filter(Boolean).join(' · '),
        metaRows: [
          { label: 'Report period', value: periodText },
          { label: 'Monthly salary', value: formatMoney(employeeReport.monthlySalary) },
          { label: 'Total earned', value: formatMoney(employeeReport.totalEarned) },
          { label: 'Total advances', value: formatMoney(employeeReport.totalAdvances) },
        ],
        columns: [
          { key: 'date', header: 'Date', align: 'left' },
          { key: 'detail', header: 'Detail', align: 'left' },
          { key: 'in', header: 'Earned (In)', align: 'right' },
          { key: 'out', header: 'Paid / Advance (Out)', align: 'right' },
          { key: 'balance', header: 'Running balance', align: 'right' },
        ],
        rows: employeeReport.periodLedgerEntries.map((e) => ({
          date: formatDate(e.date),
          detail: `${e.detail} (${e.docNumber})`,
          in: e.amountIn.gt(0) ? formatMoney(e.amountIn) : '—',
          out: e.amountOut.gt(0) ? formatMoney(e.amountOut) : '—',
          balance: formatMoney(e.runningBalance),
        })),
        extraSections: [
          {
            title: 'Salary records by month',
            columns: [
              { key: 'month', header: 'Month', align: 'left' },
              { key: 'basic', header: 'Basic', align: 'right' },
              { key: 'bonus', header: 'Bonus', align: 'right' },
              { key: 'advances', header: 'Advances', align: 'right' },
              { key: 'net', header: 'Net', align: 'right' },
              { key: 'status', header: 'Paid date', align: 'right' },
            ],
            rows: employeeReport.periodSalaries.map((s) => ({
              month: s.month,
              basic: formatMoney(s.basicSalary),
              bonus: formatMoney(s.bonus),
              advances: formatMoney(s.advanceDeduction),
              net: formatMoney(s.netPayable),
              status: isSalaryRecordPaid(s)
                ? formatDate(s.paidDate || s.date)
                : 'Unpaid',
            })),
          },
          {
            title: 'Advances in period',
            columns: [
              { key: 'date', header: 'Date', align: 'left' },
              { key: 'docNumber', header: 'Voucher #', align: 'left' },
              { key: 'month', header: 'Month reduced', align: 'left' },
              { key: 'amount', header: 'Amount', align: 'right' },
            ],
            rows: employeeReport.periodAdvances.map((a) => ({
              date: formatDate(a.date),
              docNumber: a.docNumber,
              month: a.date.slice(0, 7),
              amount: formatMoney(a.amount),
            })),
          },
        ],
        totals: [
          { label: 'Monthly salary', value: formatMoney(employeeReport.monthlySalary) },
          { label: 'Total earned', value: formatMoney(employeeReport.totalEarned) },
          { label: 'Total advances', value: formatMoney(employeeReport.totalAdvances) },
          { label: 'Total paid', value: formatMoney(employeeReport.totalPaid) },
          {
            label: 'Closing balance',
            value: formatMoney(employeeReport.closingBalance),
            highlight: true,
          },
        ],
      };
    }

    return {
      title: 'Party Report',
      columns: [],
      rows: [],
    };
  }, [
    partyType,
    customer,
    supplier,
    employee,
    customerReport,
    supplierReport,
    employeeReport,
    settings,
    appliedFromDate,
    appliedToDate,
  ]);

  const handleExportCsv = () => {
    const rows: Array<Array<string | number>> = [];

    if (partyType === 'customer' && customer && customerReport) {
      rows.push([`Customer Report: ${customer.name}`]);
      rows.push([`Period: ${appliedFromDate} to ${appliedToDate}`]);
      rows.push([]);
      rows.push(['1. Summary']);
      rows.push(['Opening balance', customerReport.openingBalance.toString()]);
      rows.push(['Total billed', customerReport.totalBilled.toString()]);
      rows.push(['Total received', customerReport.totalReceived.toString()]);
      rows.push(['Closing balance', customerReport.closingBalance.toString()]);
      rows.push([]);
      rows.push(['2. Dispatches']);
      rows.push(['Date & Time', 'Dispatch #', 'Vehicle', 'Driver', 'Status']);
      for (const d of customerReport.periodDispatches) {
        rows.push([
          d.dateTime,
          d.docNumber,
          d.vehicleNumber,
          d.driverName || '',
          d.billId && d.receivedWeightTons ? 'Billed' : 'On the way',
        ]);
      }
      rows.push([]);
      rows.push(['3. Bills']);
      rows.push(['Date', 'Bill #', 'Vehicle', 'Received tons', 'Rate', 'Discount', 'Amount', 'Paid', 'Balance']);
      for (const b of customerReport.billRows) {
        rows.push([
          b.bill.date.slice(0, 10),
          b.bill.docNumber,
          b.bill.vehicleNumber || '',
          b.tons.toString(),
          b.rate.toString(),
          b.discount.toString(),
          b.amount.toString(),
          b.paid.toString(),
          b.balance.toString(),
        ]);
      }
      rows.push([]);
      rows.push(['4. Payments']);
      rows.push(['Date', 'Receipt #', 'Method', 'Amount', 'Applied to bills']);
      for (const p of customerReport.paymentRows) {
        rows.push([
          p.payment.date.slice(0, 10),
          p.payment.docNumber,
          formatPaymentMethod(p.payment.method),
          p.amount.toString(),
          p.appliedText,
        ]);
      }
      rows.push([]);
      rows.push(['5. Ledger']);
      rows.push(['Date', 'Detail', 'Debit', 'Credit', 'Running balance']);
      for (const e of customerReport.periodLedgerEntries) {
        rows.push([
          e.date || 'Opening',
          e.detail,
          e.debit.toString(),
          e.credit.toString(),
          e.balance.toString(),
        ]);
      }
      rows.push([]);
      rows.push(['6. Ageing of unpaid bills']);
      rows.push(['0-30 days', customerReport.age0To30.toString()]);
      rows.push(['31-60 days', customerReport.age31To60.toString()]);
      rows.push(['Over 60 days', customerReport.ageOver60.toString()]);

      downloadCsvFile(
        `customer-report-${customer.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
        rows
      );
      notify.success('Customer report exported to CSV');
      return;
    }

    if (partyType === 'supplier' && supplier && supplierReport) {
      rows.push([`Supplier Report: ${supplier.name}`]);
      rows.push([`Period: ${appliedFromDate} to ${appliedToDate}`]);
      rows.push([]);
      rows.push(['1. Summary']);
      rows.push(['Opening balance', supplierReport.openingBalance.toString()]);
      rows.push(['Total purchased', supplierReport.totalPurchased.toString()]);
      rows.push(['Total paid', supplierReport.totalPaid.toString()]);
      rows.push(['Closing balance owed', supplierReport.closingBalance.toString()]);
      rows.push([]);
      rows.push(['2. Purchases (item lines)']);
      rows.push(['Date', 'Voucher #', 'Vehicle', 'Item', 'Quantity', 'Rate', 'Amount']);
      for (const l of supplierReport.purchaseLineRows) {
        rows.push([
          l.date,
          l.docNumber,
          l.vehicleNumber,
          l.itemName,
          `${l.quantity.toString()} ${l.unit}`,
          l.rate.toString(),
          l.amount.toString(),
        ]);
      }
      rows.push([]);
      rows.push(['3. Payments']);
      rows.push(['Date', 'Number', 'Method', 'Amount']);
      for (const p of supplierReport.paymentRows) {
        rows.push([p.date, p.docNumber, p.method, p.amount.toString()]);
      }
      rows.push([]);
      rows.push(['4. Items summary']);
      rows.push(['Item', 'Total quantity', 'Average rate', 'Total']);
      for (const item of supplierReport.itemsSummaryRows) {
        rows.push([
          item.itemName,
          `${item.totalQuantity.toString()} ${item.unit}`,
          item.avgRate.toString(),
          item.totalAmount.toString(),
        ]);
      }
      rows.push([]);
      rows.push(['5. Ledger']);
      rows.push(['Date', 'Detail', 'Debit', 'Credit', 'Running balance']);
      for (const e of supplierReport.periodLedgerEntries) {
        rows.push([
          e.date,
          e.detail,
          e.debit.toString(),
          e.credit.toString(),
          e.balance.toString(),
        ]);
      }

      downloadCsvFile(
        `supplier-report-${supplier.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
        rows
      );
      notify.success('Supplier report exported to CSV');
      return;
    }

    if (partyType === 'employee' && employee && employeeReport) {
      rows.push([`Employee Report: ${employee.name}`]);
      rows.push([`Period: ${appliedFromDate} to ${appliedToDate}`]);
      rows.push([]);
      rows.push(['1. Summary']);
      rows.push(['Monthly salary', employeeReport.monthlySalary.toString()]);
      rows.push(['Total earned', employeeReport.totalEarned.toString()]);
      rows.push(['Total advances', employeeReport.totalAdvances.toString()]);
      rows.push(['Total paid', employeeReport.totalPaid.toString()]);
      rows.push(['Closing balance', employeeReport.closingBalance.toString()]);
      rows.push([]);
      rows.push(['2. Salary records by month']);
      rows.push(['Month', 'Basic', 'Bonus', 'Advances', 'Earlier balance', 'Net', 'Paid date']);
      for (const s of employeeReport.periodSalaries) {
        rows.push([
          s.month,
          s.basicSalary,
          s.bonus,
          s.advanceDeduction,
          s.earlierBalance ?? '0',
          s.netPayable,
          isSalaryRecordPaid(s) ? s.paidDate || s.date : 'Unpaid',
        ]);
      }
      rows.push([]);
      rows.push(['3. Advances']);
      rows.push(['Date', 'Voucher #', 'Amount', 'Month reduced']);
      for (const a of employeeReport.periodAdvances) {
        rows.push([a.date.slice(0, 10), a.docNumber, a.amount, a.date.slice(0, 7)]);
      }
      rows.push([]);
      rows.push(['4. Payments']);
      rows.push(['Date', 'Voucher #', 'Method', 'Amount']);
      for (const p of employeeReport.salaryPayments) {
        rows.push([p.date, p.docNumber, p.method, p.amount.toString()]);
      }
      rows.push([]);
      rows.push(['5. Ledger']);
      rows.push(['Date', 'Detail', 'Amount in', 'Amount out', 'Running balance']);
      for (const e of employeeReport.periodLedgerEntries) {
        rows.push([
          e.date.slice(0, 10),
          e.detail,
          e.amountIn.toString(),
          e.amountOut.toString(),
          e.runningBalance.toString(),
        ]);
      }

      downloadCsvFile(
        `employee-report-${employee.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
        rows
      );
      notify.success('Employee report exported to CSV');
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await downloadDocumentPdf(printMeta, companyId);
      notify.success('PDF downloaded');
    } catch (err) {
      notify.error(
        'Could not generate PDF.',
        err instanceof Error ? err.message : 'Try again.'
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  const partyName =
    partyType === 'customer'
      ? customer?.name
      : partyType === 'supplier'
        ? supplier?.name
        : employee?.name;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${partyName || 'Party'} — Reports`}
      icon={<FileText className="h-4 w-4" />}
      maxWidth="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPrinting || downloadingPdf}
              onClick={() => void printDocument(printMeta, companyId)}
            >
              <Printer className="h-4 w-4" />
              <span>Print</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={downloadingPdf}
              disabled={isPrinting || downloadingPdf}
              onClick={handleDownloadPdf}
            >
              <Download className="h-4 w-4" />
              <span>Download PDF</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
          </div>
          <Button type="button" variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Filter & Preset Controls */}
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5 space-y-3 no-print">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
              <Calendar className="h-3.5 w-3.5 text-[var(--brand)]" />
              <span>Period presets</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'this_month', label: 'This month' },
                  { id: 'last_month', label: 'Last month' },
                  { id: 'this_year', label: 'This year' },
                  { id: 'custom', label: 'Custom' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleSelectPreset(chip.id)}
                  className={cn(
                    'rounded-[8px] px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
                    preset === chip.id
                      ? 'bg-[var(--brand)] text-white shadow-[var(--shadow-sm)]'
                      : 'bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <DatePicker
              label="Start date"
              value={draftFromDate}
              onChange={(e) => {
                setPreset('custom');
                setDraftFromDate(e.target.value);
              }}
            />
            <DatePicker
              label="End date"
              value={draftToDate}
              onChange={(e) => {
                setPreset('custom');
                setDraftToDate(e.target.value);
              }}
            />
            <Button
              type="button"
              variant="primary"
              onClick={handleGenerate}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Generate</span>
            </Button>
          </div>
        </div>

        {generating ? (
          <div className="flex flex-col items-center justify-center py-12">
            <BrandLoader size="sm" label="Preparing report" labelDelayMs={0} />
          </div>
        ) : (
          <PrintLayout doc={printMeta} companyId={companyId}>
            <div className="space-y-6">
              {/* ============================================================
                  CUSTOMER REPORT SECTIONS (1 to 6)
              ============================================================ */}
              {partyType === 'customer' && customer && customerReport && (
                <>
                  {/* 1. Summary */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      1. Summary ({formatDate(appliedFromDate)} to {formatDate(appliedToDate)})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Opening balance
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold text-[var(--text)] tabular-nums break-words">
                          {formatRunningBalanceLabel(customerReport.openingBalance)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Total billed
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold text-[var(--text)] tabular-nums break-words">
                          {formatMoney(customerReport.totalBilled)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Total received
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold text-[var(--success)] tabular-nums break-words">
                          {formatMoney(customerReport.totalReceived)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--brand-soft)]/50 p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          {customerReport.closingBalance.lt(0)
                            ? 'Closing advance'
                            : 'Closing balance'}
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold text-[var(--brand)] tabular-nums break-words">
                          {formatRunningBalanceLabel(customerReport.closingBalance)}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 2. Dispatches in the period */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      2. Dispatches in the period ({customerReport.periodDispatches.length})
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date & time</th>
                            <th className="px-3 py-2 text-left font-semibold">Dispatch #</th>
                            <th className="px-3 py-2 text-left font-semibold">Vehicle</th>
                            <th className="px-3 py-2 text-left font-semibold">Driver</th>
                            <th className="px-3 py-2 text-right font-semibold">Dispatched</th>
                            <th className="px-3 py-2 text-left font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {customerReport.periodDispatches.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No dispatches in this period.
                              </td>
                            </tr>
                          ) : (
                            customerReport.periodDispatches.map((d) => {
                              const isCompleted = Boolean(d.billId && d.receivedWeightTons);
                              return (
                                <tr key={d.id}>
                                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                    {formatDateTime(d.dateTime)}
                                  </td>
                                  <td className="px-3 py-2 font-semibold tabular-nums">
                                    {d.docNumber}
                                  </td>
                                  <td className="px-3 py-2 tabular-nums">{d.vehicleNumber}</td>
                                  <td className="px-3 py-2">{d.driverName || '—'}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {d.receivedWeightTons
                                      ? formatTon(d.receivedWeightTons)
                                      : formatBags(d.bagsCount)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <StatusBadge
                                      status={isCompleted ? 'paid' : 'sent'}
                                      label={isCompleted ? 'Billed' : 'On the way'}
                                    />
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {customerReport.periodDispatches.length > 0 && (
                          <tfoot>
                            <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                              <td colSpan={4} className="px-3 py-2">
                                Total ({customerReport.periodDispatches.length} dispatches)
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatTon(customerReport.totalDispatchedTons)}
                              </td>
                              <td className="px-3 py-2" />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* 3. Bills */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      3. Bills ({customerReport.billRows.length})
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Bill #</th>
                            <th className="px-3 py-2 text-left font-semibold">Vehicle</th>
                            <th className="px-3 py-2 text-right font-semibold">Received tons</th>
                            <th className="px-3 py-2 text-right font-semibold">Rate</th>
                            <th className="px-3 py-2 text-right font-semibold">Discount</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                            <th className="px-3 py-2 text-right font-semibold">Paid</th>
                            <th className="px-3 py-2 text-right font-semibold">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {customerReport.billRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={9}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No bills in this period.
                              </td>
                            </tr>
                          ) : (
                            customerReport.billRows.map((row) => (
                              <tr key={row.bill.id}>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                  {formatDate(row.bill.date)}
                                </td>
                                <td className="px-3 py-2 font-semibold tabular-nums">
                                  {row.bill.docNumber}
                                </td>
                                <td className="px-3 py-2 tabular-nums">
                                  {row.bill.vehicleNumber || '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatTon(row.tons)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatMoney(row.rate)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {row.discount.gt(0) ? formatMoney(row.discount) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                  {formatMoney(row.amount)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-[var(--success)]">
                                  {formatMoney(row.paid)}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                  {formatMoney(row.balance)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {customerReport.billRows.length > 0 && (
                          <tfoot>
                            <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                              <td colSpan={3} className="px-3 py-2">
                                Total ({customerReport.billRows.length} bills)
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatTon(customerReport.totalBillTons)}
                              </td>
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2 text-right tabular-nums">
                                {customerReport.totalBillDiscount.gt(0)
                                  ? formatMoney(customerReport.totalBillDiscount)
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(customerReport.totalBilled)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--success)]">
                                {formatMoney(customerReport.totalBillsPaidPortion)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(customerReport.totalBillsRemainingPortion)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* 4. Payments */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      4. Payments ({customerReport.paymentRows.length})
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Receipt #</th>
                            <th className="px-3 py-2 text-left font-semibold">Method</th>
                            <th className="px-3 py-2 text-left font-semibold">
                              Applied to which bills
                            </th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {customerReport.paymentRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No payments in this period.
                              </td>
                            </tr>
                          ) : (
                            customerReport.paymentRows.map((row) => (
                              <tr key={row.payment.id}>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                  {formatDate(row.payment.date)}
                                </td>
                                <td className="px-3 py-2 font-semibold tabular-nums">
                                  {row.payment.docNumber}
                                </td>
                                <td className="px-3 py-2">
                                  {formatPaymentMethod(row.payment.method)}
                                </td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">
                                  {row.appliedText}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--success)]">
                                  {formatMoney(row.amount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {customerReport.paymentRows.length > 0 && (
                          <tfoot>
                            <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                              <td colSpan={4} className="px-3 py-2">
                                Total received ({customerReport.paymentRows.length} payments)
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--success)]">
                                {formatMoney(customerReport.totalReceived)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* 5. Ledger with running balance */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      5. Ledger with running balance
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Detail</th>
                            <th className="px-3 py-2 text-right font-semibold">Debit</th>
                            <th className="px-3 py-2 text-right font-semibold">Credit</th>
                            <th className="px-3 py-2 text-right font-semibold">Running balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {customerReport.periodLedgerEntries.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No ledger entries in this period.
                              </td>
                            </tr>
                          ) : (
                            customerReport.periodLedgerEntries.map((e) => (
                              <tr key={e.id}>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                  {e.date ? formatDate(e.date) : 'Opening'}
                                </td>
                                <td className="px-3 py-2">{e.detail}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {e.debit.gt(0) ? formatMoney(e.debit) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-[var(--success)]">
                                  {e.credit.gt(0) ? formatMoney(e.credit) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                  {formatRunningBalanceLabel(e.balance)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                            <td colSpan={2} className="px-3 py-2">
                              Period totals & closing balance
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatMoney(customerReport.totalBilled)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--success)]">
                              {formatMoney(customerReport.totalReceived)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--brand)]">
                              {formatRunningBalanceLabel(customerReport.closingBalance)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>

                  {/* 6. Ageing of unpaid bills as of end date */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      6. Ageing of unpaid bills as of {formatDate(appliedToDate)}
                    </h3>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)]">0–30 days</div>
                        <div className="mt-1 font-heading text-sm font-bold tabular-nums">
                          {formatMoney(customerReport.age0To30)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)]">31–60 days</div>
                        <div className="mt-1 font-heading text-sm font-bold tabular-nums text-[var(--warning)]">
                          {formatMoney(customerReport.age31To60)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)]">Over 60 days</div>
                        <div className="mt-1 font-heading text-sm font-bold tabular-nums text-[var(--danger)]">
                          {formatMoney(customerReport.ageOver60)}
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* ============================================================
                  SUPPLIER REPORT SECTIONS (1 to 5)
              ============================================================ */}
              {partyType === 'supplier' && supplier && supplierReport && (
                <>
                  {/* 1. Summary */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      1. Summary ({formatDate(appliedFromDate)} to {formatDate(appliedToDate)})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Opening balance
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold tabular-nums break-words">
                          {formatMoney(supplierReport.openingBalance)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Total purchased
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold tabular-nums break-words">
                          {formatMoney(supplierReport.totalPurchased)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Total paid
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold text-[var(--success)] tabular-nums break-words">
                          {formatMoney(supplierReport.totalPaid)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--brand-soft)]/50 p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Closing balance owed
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold text-[var(--brand)] tabular-nums break-words">
                          {formatMoney(supplierReport.closingBalance)}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 2. Purchases with every item line */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      2. Purchases with every item line ({supplierReport.purchaseLineRows.length})
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Voucher #</th>
                            <th className="px-3 py-2 text-left font-semibold">Item</th>
                            <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                            <th className="px-3 py-2 text-right font-semibold">Rate</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {supplierReport.purchaseLineRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No purchase lines in this period.
                              </td>
                            </tr>
                          ) : (
                            supplierReport.purchaseLineRows.map((l) => (
                              <tr key={l.key}>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                  {formatDate(l.date)}
                                </td>
                                <td className="px-3 py-2 font-semibold tabular-nums">
                                  {l.docNumber}
                                </td>
                                <td className="px-3 py-2">{l.itemName}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {l.unit === 'ton'
                                    ? formatTon(l.quantity)
                                    : formatBags(l.quantity)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatMoney(l.rate)} / {l.unit}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                  {formatMoney(l.amount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {supplierReport.purchaseLineRows.length > 0 && (
                          <tfoot>
                            <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                              <td colSpan={5} className="px-3 py-2">
                                Total purchased
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(supplierReport.totalPurchased)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* 3. Payments */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      3. Payments ({supplierReport.paymentRows.length})
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Number</th>
                            <th className="px-3 py-2 text-left font-semibold">Method</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {supplierReport.paymentRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No payments in this period.
                              </td>
                            </tr>
                          ) : (
                            supplierReport.paymentRows.map((p) => (
                              <tr key={p.id}>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                  {formatDate(p.date)}
                                </td>
                                <td className="px-3 py-2 font-semibold tabular-nums">
                                  {p.docNumber}
                                </td>
                                <td className="px-3 py-2">{p.method}</td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--success)]">
                                  {formatMoney(p.amount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {supplierReport.paymentRows.length > 0 && (
                          <tfoot>
                            <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                              <td colSpan={3} className="px-3 py-2">
                                Total paid
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--success)]">
                                {formatMoney(supplierReport.totalPaid)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* 4. Items summary */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      4. Items summary ({supplierReport.itemsSummaryRows.length})
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Item</th>
                            <th className="px-3 py-2 text-right font-semibold">Total quantity</th>
                            <th className="px-3 py-2 text-right font-semibold">Average rate</th>
                            <th className="px-3 py-2 text-right font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {supplierReport.itemsSummaryRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No items bought in this period.
                              </td>
                            </tr>
                          ) : (
                            supplierReport.itemsSummaryRows.map((item) => (
                              <tr key={item.itemId}>
                                <td className="px-3 py-2 font-semibold">{item.itemName}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {item.unit === 'ton'
                                    ? formatTon(item.totalQuantity)
                                    : formatBags(item.totalQuantity)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatMoney(item.avgRate)} / {item.unit}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                  {formatMoney(item.totalAmount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {supplierReport.itemsSummaryRows.length > 0 && (
                          <tfoot>
                            <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                              <td colSpan={3} className="px-3 py-2">
                                Total items amount
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(supplierReport.totalPurchased)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* 5. Ledger with running balance */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      5. Ledger with running balance
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Detail</th>
                            <th className="px-3 py-2 text-right font-semibold">Debit</th>
                            <th className="px-3 py-2 text-right font-semibold">Credit</th>
                            <th className="px-3 py-2 text-right font-semibold">Running balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {supplierReport.periodLedgerEntries.map((e) => (
                            <tr key={e.id}>
                              <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                {e.date === '—' ? 'Opening' : formatDate(e.date)}
                              </td>
                              <td className="px-3 py-2">{e.detail}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {e.debit.gt(0) ? formatMoney(e.debit) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--success)]">
                                {e.credit.gt(0) ? formatMoney(e.credit) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                {formatMoney(e.balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                            <td colSpan={2} className="px-3 py-2">
                              Period totals & closing balance
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatMoney(supplierReport.totalPurchased)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--success)]">
                              {formatMoney(supplierReport.totalPaid)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--brand)]">
                              {formatMoney(supplierReport.closingBalance)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                </>
              )}

              {/* ============================================================
                  EMPLOYEE REPORT SECTIONS (1 to 5)
              ============================================================ */}
              {partyType === 'employee' && employee && employeeReport && (
                <>
                  {/* 1. Summary */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      1. Summary ({formatDate(appliedFromDate)} to {formatDate(appliedToDate)})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Monthly salary
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold tabular-nums break-words">
                          {formatMoney(employeeReport.monthlySalary)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Total earned
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold text-[var(--success)] tabular-nums break-words">
                          {formatMoney(employeeReport.totalEarned)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Total advances
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold text-[var(--brand)] tabular-nums break-words">
                          {formatMoney(employeeReport.totalAdvances)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Total paid
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold tabular-nums break-words">
                          {formatMoney(employeeReport.totalPaid)}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--brand-soft)]/50 p-3">
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Closing balance
                        </div>
                        <div className="mt-1 font-heading text-sm font-bold text-[var(--brand)] tabular-nums break-words">
                          {formatMoney(employeeReport.closingBalance)}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 2. Salary records by month */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      2. Salary records by month ({employeeReport.periodSalaries.length})
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Month</th>
                            <th className="px-3 py-2 text-right font-semibold">Basic</th>
                            <th className="px-3 py-2 text-right font-semibold">Bonus</th>
                            <th className="px-3 py-2 text-right font-semibold">Advances</th>
                            <th className="px-3 py-2 text-right font-semibold">Earlier balance</th>
                            <th className="px-3 py-2 text-right font-semibold">Net</th>
                            <th className="px-3 py-2 text-left font-semibold">Paid date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {employeeReport.periodSalaries.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No salary records in this period.
                              </td>
                            </tr>
                          ) : (
                            employeeReport.periodSalaries.map((s) => (
                              <tr key={s.id}>
                                <td className="px-3 py-2 font-semibold">
                                  {formatMonthYearLabel(s.month)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatMoney(s.basicSalary)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatMoney(s.bonus)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-[var(--brand)]">
                                  {formatMoney(s.advanceDeduction)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatMoney(s.earlierBalance ?? 0)}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                  {formatMoney(s.netPayable)}
                                </td>
                                <td className="px-3 py-2">
                                  {isSalaryRecordPaid(s)
                                    ? formatDate(s.paidDate || s.date)
                                    : 'Unpaid'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {employeeReport.periodSalaries.length > 0 && (
                          <tfoot>
                            <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                              <td className="px-3 py-2">Total</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(employeeReport.totalBasic)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(employeeReport.totalBonus)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--brand)]">
                                {formatMoney(employeeReport.totalAdvanceDeducted)}
                              </td>
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(employeeReport.totalNetSalary)}
                              </td>
                              <td className="px-3 py-2" />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* 3. Advances */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      3. Advances ({employeeReport.periodAdvances.length})
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Voucher #</th>
                            <th className="px-3 py-2 text-left font-semibold">
                              Month they reduced
                            </th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {employeeReport.periodAdvances.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No advances in this period.
                              </td>
                            </tr>
                          ) : (
                            employeeReport.periodAdvances.map((a) => (
                              <tr key={a.id}>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                  {formatDate(a.date)}
                                </td>
                                <td className="px-3 py-2 font-semibold tabular-nums">
                                  {a.docNumber}
                                </td>
                                <td className="px-3 py-2">
                                  {formatMonthYearLabel(a.date.slice(0, 7))}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                  {formatMoney(a.amount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {employeeReport.periodAdvances.length > 0 && (
                          <tfoot>
                            <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                              <td colSpan={3} className="px-3 py-2">
                                Total advances
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(employeeReport.totalAdvances)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* 4. Payments */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      4. Payments ({employeeReport.salaryPayments.length})
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Voucher #</th>
                            <th className="px-3 py-2 text-left font-semibold">Salary month</th>
                            <th className="px-3 py-2 text-left font-semibold">Method</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {employeeReport.salaryPayments.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-3 py-4 text-center text-[var(--text-muted)]"
                              >
                                No salary payments in this period.
                              </td>
                            </tr>
                          ) : (
                            employeeReport.salaryPayments.map((p) => (
                              <tr key={p.id}>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                  {formatDate(p.date)}
                                </td>
                                <td className="px-3 py-2 font-semibold tabular-nums">
                                  {p.docNumber}
                                </td>
                                <td className="px-3 py-2">{formatMonthYearLabel(p.month)}</td>
                                <td className="px-3 py-2">{p.method}</td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                  {formatMoney(p.amount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {employeeReport.salaryPayments.length > 0 && (
                          <tfoot>
                            <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                              <td colSpan={4} className="px-3 py-2">
                                Total paid
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(employeeReport.totalPaid)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* 5. Ledger with running balance */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--brand)]">
                      5. Ledger with running balance
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Detail</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount in</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount out</th>
                            <th className="px-3 py-2 text-right font-semibold">Running balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {employeeReport.periodLedgerEntries.map((e) => (
                            <tr key={e.id}>
                              <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                {formatDate(e.date)}
                              </td>
                              <td className="px-3 py-2">
                                {e.detail} ({e.docNumber})
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--success)]">
                                {e.amountIn.gt(0) ? formatMoney(e.amountIn) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--brand)]">
                                {e.amountOut.gt(0) ? formatMoney(e.amountOut) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                {formatMoney(e.runningBalance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-[var(--border)] bg-[var(--surface-subtle)] font-semibold">
                            <td colSpan={4} className="px-3 py-2">
                              Closing balance
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--brand)]">
                              {formatMoney(employeeReport.closingBalance)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </div>
          </PrintLayout>
        )}
      </div>
    </Dialog>
  );
};
