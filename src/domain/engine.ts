import Decimal from 'decimal.js';
import type {
  Bill,
  BillPaymentStatus,
  CustomerPayment,
  Dispatch,
  EmployeeAdvance,
  Expense,
  InventoryItem,
  ProductionBatch,
  Purchase,
  SalaryRecord,
  SupplierPayment,
} from './types';

// Configure Decimal for high internal precision and standard half-up rounding
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function toDecimal(value: Decimal.Value | undefined | null): Decimal {
  if (value === undefined || value === null || value === '') {
    return new Decimal(0);
  }
  return new Decimal(value);
}

/**
 * Money rounded to 2 decimals (ROUND_HALF_UP)
 */
export function roundMoney(value: Decimal.Value): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Weights keep up to 3 decimals (ROUND_HALF_UP)
 */
export function roundWeight(value: Decimal.Value): Decimal {
  return toDecimal(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/**
 * 1. Weighted average cost step:
 * newAvg = (oldStock * oldAvg + qty * rate) / (oldStock + qty)
 * If old stock is zero (or <= 0), the average is the new rate.
 */
export function computeNextWeightedAverage(
  oldStock: Decimal.Value,
  oldAvg: Decimal.Value,
  addedQty: Decimal.Value,
  addedRate: Decimal.Value
): {
  stock: Decimal;
  avgCost: Decimal; // rounded to 2 decimals for display
  rawAvgCost: Decimal; // full precision for subsequent calculations
} {
  const sOld = roundWeight(oldStock);
  const aOld = toDecimal(oldAvg);
  const qty = roundWeight(addedQty);
  const rate = toDecimal(addedRate);

  const newStock = roundWeight(sOld.plus(qty));

  if (qty.lte(0)) {
    return {
      stock: newStock,
      avgCost: roundMoney(aOld),
      rawAvgCost: aOld,
    };
  }

  if (sOld.lte(0)) {
    return {
      stock: qty,
      avgCost: roundMoney(rate),
      rawAvgCost: rate,
    };
  }

  const totalValue = sOld.times(aOld).plus(qty.times(rate));
  const rawAvg = totalValue.dividedBy(newStock);

  return {
    stock: newStock,
    avgCost: roundMoney(rawAvg),
    rawAvgCost: rawAvg,
  };
}

/**
 * Replay purchases for a single item to compute weighted average cost.
 */
export function calculateItemAverageFromPurchases(
  entries: Array<{ qty: Decimal.Value; rate: Decimal.Value }>
): {
  stock: Decimal;
  avgCost: Decimal;
  rawAvgCost: Decimal;
} {
  let stock = new Decimal(0);
  let rawAvg = new Decimal(0);

  for (const entry of entries) {
    const next = computeNextWeightedAverage(stock, rawAvg, entry.qty, entry.rate);
    stock = next.stock;
    rawAvg = next.rawAvgCost;
  }

  return {
    stock,
    avgCost: roundMoney(rawAvg),
    rawAvgCost: rawAvg,
  };
}

/**
 * 2. Production batch cost calculation:
 * Batch cost = rockTons * rockAverage + Σ(bags * chemicalAverage)
 * Cost per ton of final product = totalCost / finalTons
 */
export function calculateProductionBatchCost(input: {
  rockTons: Decimal.Value;
  rockAvgCost: Decimal.Value;
  chemicals: Array<{
    itemId?: string;
    itemName?: string;
    bags: Decimal.Value;
    avgCostPerBag: Decimal.Value;
  }>;
  finalProductTons: Decimal.Value;
}): {
  rockCost: Decimal;
  chemicalCosts: Array<{
    itemId?: string;
    itemName?: string;
    bags: Decimal;
    avgCostPerBag: Decimal;
    lineCost: Decimal;
  }>;
  totalChemicalCost: Decimal;
  totalCost: Decimal;
  costPerTon: Decimal; // Rounded to 2 decimals
  rawCostPerTon: Decimal; // Full precision Decimal
} {
  const rockTons = roundWeight(input.rockTons);
  const rockAvg = toDecimal(input.rockAvgCost);
  const rockCost = roundMoney(rockTons.times(rockAvg));

  let totalChemicalCost = new Decimal(0);
  const chemicalCosts = input.chemicals.map((chem) => {
    const bags = roundWeight(chem.bags);
    const avgCostPerBag = toDecimal(chem.avgCostPerBag);
    const lineCost = roundMoney(bags.times(avgCostPerBag));
    totalChemicalCost = totalChemicalCost.plus(lineCost);
    return {
      itemId: chem.itemId,
      itemName: chem.itemName,
      bags,
      avgCostPerBag: roundMoney(avgCostPerBag),
      lineCost,
    };
  });

  const totalCost = roundMoney(rockCost.plus(totalChemicalCost));
  const finalTons = roundWeight(input.finalProductTons);

  if (finalTons.lte(0)) {
    return {
      rockCost,
      chemicalCosts,
      totalChemicalCost,
      totalCost,
      costPerTon: new Decimal(0),
      rawCostPerTon: new Decimal(0),
    };
  }

  const rawCostPerTon = totalCost.dividedBy(finalTons);
  const costPerTon = roundMoney(rawCostPerTon);

  return {
    rockCost,
    chemicalCosts,
    totalChemicalCost,
    totalCost,
    costPerTon,
    rawCostPerTon,
  };
}

/**
/**
 * 3. Sale & Bill calculation:
 * The powder stock decreases on the sale date by the received tons.
 * Cost of powder sold = received tons * powder average cost on that date.
 * Bill amount = received tons * rate per ton - discount (if any).
 */
export function calculateDispatchAndBill(input: {
  receivedWeightTons: Decimal.Value;
  ratePerTon: Decimal.Value;
  discount?: Decimal.Value;
  avgCostPerTon: Decimal.Value;
  totalBatchCostForExactAvg?: { totalCost: Decimal.Value; finalTons: Decimal.Value };
}): {
  receivedWeightTons: Decimal;
  subtotal: Decimal;
  discount: Decimal;
  billAmount: Decimal;
  cogs: Decimal;
} {
  const receivedWeight = roundWeight(input.receivedWeightTons);
  const rate = toDecimal(input.ratePerTon);
  const discount = roundMoney(input.discount ?? 0);

  const subtotal = roundMoney(receivedWeight.times(rate));
  const billAmount = roundMoney(subtotal.minus(discount));

  let effectiveAvgCost = toDecimal(input.avgCostPerTon);
  if (input.totalBatchCostForExactAvg) {
    effectiveAvgCost = toDecimal(input.totalBatchCostForExactAvg.totalCost).dividedBy(
      toDecimal(input.totalBatchCostForExactAvg.finalTons)
    );
  }

  const cogs = roundMoney(receivedWeight.times(effectiveAvgCost));

  return {
    receivedWeightTons: receivedWeight,
    subtotal,
    discount,
    billAmount,
    cogs,
  };
}

/**
 * 4. Customer ledger & FIFO payment allocation:
 * Balance = opening balance + Σ bills - Σ payments.
 * A negative balance means the customer paid in advance.
 * Payments (and any negative opening balance) are applied automatically to the oldest unpaid bills first;
 * any remainder stays as an advance.
 */
export interface AllocatedBillSummary {
  billId: string;
  docNumber: string;
  date: string;
  totalAmount: Decimal;
  paidAmount: Decimal;
  remainingAmount: Decimal;
  paymentStatus: BillPaymentStatus;
}

export interface CustomerLedgerEntry {
  id: string;
  date: string;
  docNumber: string;
  type: 'opening' | 'bill' | 'payment';
  detail: string;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal; // > 0 means customer owes; < 0 means customer advance
  billId?: string;
  paymentId?: string;
}

export interface CustomerLedgerResult {
  openingBalance: Decimal;
  totalSold: Decimal;
  totalSales: Decimal;
  totalPaid: Decimal;
  totalReceived: Decimal;
  balance: Decimal; // > 0 means customer owes; < 0 means customer advance
  advanceAvailable: Decimal; // positive value if customer has unallocated advance
  billAllocations: AllocatedBillSummary[];
  entries: CustomerLedgerEntry[];
}

export function calculateCustomerLedgerAndAllocations(input: {
  openingBalance: Decimal.Value;
  bills: Array<{
    id: string;
    docNumber: string;
    date: string;
    totalAmount: Decimal.Value;
    vehicleNumber?: string;
    receivedWeightTons?: Decimal.Value;
    status?: 'active' | 'cancelled';
    createdAt?: string;
  }>;
  payments: Array<{
    id: string;
    docNumber?: string;
    date: string;
    amount: Decimal.Value;
    method?: string;
    notes?: string;
    status?: 'active' | 'cancelled';
    createdAt?: string;
  }>;
}): CustomerLedgerResult {
  const openingBalance = roundMoney(input.openingBalance);

  const activeBills = input.bills
    .filter((b) => (b.status ?? 'active') === 'active')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const activePayments = input.payments
    .filter((p) => (p.status ?? 'active') === 'active')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const totalSold = activeBills.reduce(
    (acc, b) => acc.plus(roundMoney(b.totalAmount)),
    new Decimal(0)
  );

  const totalPaid = activePayments.reduce(
    (acc, p) => acc.plus(roundMoney(p.amount)),
    new Decimal(0)
  );

  const balance = roundMoney(openingBalance.plus(totalSold).minus(totalPaid));

  // Pool of payment available to allocate to bills:
  // If openingBalance > 0, payments first cover opening balance before oldest bills.
  // If openingBalance < 0, that negative opening balance is an advance that adds to the payment pool.
  let availablePool = roundMoney(totalPaid.minus(openingBalance));
  if (availablePool.lt(0)) {
    availablePool = new Decimal(0);
  }

  const billAllocations: AllocatedBillSummary[] = activeBills.map((bill) => {
    const billTotal = roundMoney(bill.totalAmount);
    if (billTotal.lte(0)) {
      return {
        billId: bill.id,
        docNumber: bill.docNumber,
        date: bill.date,
        totalAmount: billTotal,
        paidAmount: new Decimal(0),
        remainingAmount: new Decimal(0),
        paymentStatus: 'paid',
      };
    }

    const allocated = Decimal.min(billTotal, availablePool);
    availablePool = roundMoney(availablePool.minus(allocated));
    const remaining = roundMoney(billTotal.minus(allocated));

    let paymentStatus: BillPaymentStatus = 'unpaid';
    if (remaining.lte(0)) {
      paymentStatus = 'paid';
    } else if (allocated.gt(0)) {
      paymentStatus = 'partial';
    }

    return {
      billId: bill.id,
      docNumber: bill.docNumber,
      date: bill.date,
      totalAmount: billTotal,
      paidAmount: allocated,
      remainingAmount: remaining,
      paymentStatus,
    };
  });

  // Build chronological ledger entries with running balance
  const entries: CustomerLedgerEntry[] = [];
  let running = openingBalance;

  if (!openingBalance.eq(0)) {
    entries.push({
      id: 'opening_balance',
      date: '',
      docNumber: 'OPENING',
      type: 'opening',
      detail: 'Opening balance',
      debit: openingBalance.gt(0) ? openingBalance : new Decimal(0),
      credit: openingBalance.lt(0) ? openingBalance.abs() : new Decimal(0),
      balance: running,
    });
  }

  type RawCustomerEvent = {
    id: string;
    date: string;
    createdAt: string;
    order: number;
    docNumber: string;
    type: 'bill' | 'payment';
    detail: string;
    debit: Decimal;
    credit: Decimal;
    billId?: string;
    paymentId?: string;
  };

  const rawEvents: RawCustomerEvent[] = [];

  for (const b of activeBills) {
    const amt = roundMoney(b.totalAmount);
    const extraParts: string[] = [];
    if (b.vehicleNumber) extraParts.push(b.vehicleNumber);
    if (b.receivedWeightTons !== undefined) {
      extraParts.push(`${roundWeight(b.receivedWeightTons).toString()} ton`);
    }
    const suffix = extraParts.length > 0 ? ` (${extraParts.join(', ')})` : '';
    rawEvents.push({
      id: `bill_${b.id}`,
      date: b.date.slice(0, 10),
      createdAt: b.createdAt || b.date,
      order: 1,
      docNumber: b.docNumber,
      type: 'bill',
      detail: `Bill ${b.docNumber}${suffix}`,
      debit: amt,
      credit: new Decimal(0),
      billId: b.id,
    });
  }

  for (const p of activePayments) {
    const amt = roundMoney(p.amount);
    const methodLabel = p.method
      ? ` (${p.method.charAt(0).toUpperCase()}${p.method.slice(1)})`
      : '';
    const noteSuffix = p.notes ? ` — ${p.notes}` : '';
    rawEvents.push({
      id: `pay_${p.id}`,
      date: p.date.slice(0, 10),
      createdAt: p.createdAt || p.date,
      order: 2,
      docNumber: p.docNumber || 'RCV',
      type: 'payment',
      detail: `Payment ${p.docNumber || ''}${methodLabel}${noteSuffix}`.trim(),
      debit: new Decimal(0),
      credit: amt,
      paymentId: p.id,
    });
  }

  rawEvents.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt.localeCompare(b.createdAt);
  });

  for (const ev of rawEvents) {
    running = roundMoney(running.plus(ev.debit).minus(ev.credit));
    entries.push({
      id: ev.id,
      date: ev.date,
      docNumber: ev.docNumber,
      type: ev.type,
      detail: ev.detail,
      debit: ev.debit,
      credit: ev.credit,
      balance: running,
      billId: ev.billId,
      paymentId: ev.paymentId,
    });
  }

  const advanceAvailable = balance.lt(0) ? balance.abs() : new Decimal(0);

  return {
    openingBalance,
    totalSold,
    totalSales: totalSold,
    totalPaid,
    totalReceived: totalPaid,
    balance,
    advanceAvailable,
    billAllocations,
    entries,
  };
}

export interface AllocatedPurchaseSummary {
  purchaseId: string;
  docNumber: string;
  date: string;
  totalAmount: Decimal;
  paidNowAmount: Decimal;
  allocatedFromPayments: Decimal;
  paidAmount: Decimal;
  remainingAmount: Decimal;
  paymentStatus: BillPaymentStatus;
}

export interface SupplierLedgerEntry {
  id: string;
  date: string;
  docNumber: string;
  detail: string;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
}

export interface SupplierLedgerDetailResult {
  openingBalance: Decimal;
  totalPurchased: Decimal;
  totalPaid: Decimal;
  balance: Decimal;
  advanceAvailable: Decimal;
  purchaseAllocations: AllocatedPurchaseSummary[];
  entries: SupplierLedgerEntry[];
}

/**
 * 5. Supplier ledger & FIFO purchase allocation:
 * balance = opening balance + Σ purchase totals - Σ amounts paid (including "paid now" on purchase).
 * The "paid now" amount saved on a purchase counts directly toward that purchase first;
 * standalone supplier payments (and any negative opening balance / advance) allocate to the
 * oldest unpaid purchases first. Any excess becomes an Advance to supplier (balance < 0).
 */
export function calculateSupplierLedger(input: {
  openingBalance: Decimal.Value;
  purchases: Array<{
    id?: string;
    docNumber?: string;
    date?: string;
    createdAt?: string;
    totalAmount: Decimal.Value;
    paidNow?: Decimal.Value;
    status?: 'active' | 'cancelled';
  }>;
  payments?: Array<{
    id?: string;
    docNumber?: string;
    date?: string;
    createdAt?: string;
    amount: Decimal.Value;
    method?: string;
    notes?: string;
    status?: 'active' | 'cancelled';
  }>;
}): SupplierLedgerDetailResult {
  const openingBalance = roundMoney(input.openingBalance);
  const activePurchases = input.purchases
    .filter((p) => (p.status ?? 'active') === 'active')
    .slice()
    .sort((a, b) => {
      const dA = (a.date ?? '').slice(0, 10);
      const dB = (b.date ?? '').slice(0, 10);
      if (dA !== dB) return dA.localeCompare(dB);
      const cA = a.createdAt ?? dA;
      const cB = b.createdAt ?? dB;
      if (cA !== cB) return cA.localeCompare(cB);
      return (a.docNumber ?? a.id ?? '').localeCompare(b.docNumber ?? b.id ?? '');
    });

  const activePayments = (input.payments ?? [])
    .filter((p) => (p.status ?? 'active') === 'active')
    .slice()
    .sort((a, b) => {
      const dA = (a.date ?? '').slice(0, 10);
      const dB = (b.date ?? '').slice(0, 10);
      if (dA !== dB) return dA.localeCompare(dB);
      const cA = a.createdAt ?? dA;
      const cB = b.createdAt ?? dB;
      if (cA !== cB) return cA.localeCompare(cB);
      return (a.docNumber ?? a.id ?? '').localeCompare(b.docNumber ?? b.id ?? '');
    });

  let totalPurchased = new Decimal(0);
  let paidOnPurchases = new Decimal(0);
  let excessPaidNow = new Decimal(0);

  type RawEvent = {
    sortDate: string;
    sortOrder: number;
    createdAt: string;
    id: string;
    docNumber: string;
    detail: string;
    debit: Decimal;
    credit: Decimal;
  };

  const rawEvents: RawEvent[] = [];

  for (const p of activePurchases) {
    const pTotal = roundMoney(p.totalAmount);
    const pPaid = roundMoney(p.paidNow ?? 0);
    totalPurchased = roundMoney(totalPurchased.plus(pTotal));
    paidOnPurchases = roundMoney(paidOnPurchases.plus(pPaid));

    if (pPaid.gt(pTotal)) {
      excessPaidNow = roundMoney(excessPaidNow.plus(pPaid.minus(pTotal)));
    }

    const pDate = (p.date ?? '').slice(0, 10);
    const pDoc = p.docNumber ?? 'PUR';
    rawEvents.push({
      sortDate: pDate,
      sortOrder: 1,
      createdAt: p.createdAt ?? pDate,
      id: `${p.id ?? pDoc}_pur`,
      docNumber: pDoc,
      detail: `Purchase ${pDoc}`,
      debit: pTotal,
      credit: new Decimal(0),
    });

    if (pPaid.gt(0)) {
      rawEvents.push({
        sortDate: pDate,
        sortOrder: 2,
        createdAt: p.createdAt ?? pDate,
        id: `${p.id ?? pDoc}_paidnow`,
        docNumber: pDoc,
        detail: `Paid on purchase ${pDoc}`,
        debit: new Decimal(0),
        credit: pPaid,
      });
    }
  }

  let extraPayments = new Decimal(0);
  for (const pay of activePayments) {
    const amt = roundMoney(pay.amount);
    extraPayments = roundMoney(extraPayments.plus(amt));
    const payDate = (pay.date ?? '').slice(0, 10);
    const payDoc = pay.docNumber ?? 'PAY';
    const methodLabel = pay.method ? ` (${pay.method})` : '';
    const noteLabel = pay.notes ? ` · ${pay.notes}` : '';
    rawEvents.push({
      sortDate: payDate,
      sortOrder: 3,
      createdAt: pay.createdAt ?? payDate,
      id: pay.id ?? payDoc,
      docNumber: payDoc,
      detail: `Payment ${payDoc}${methodLabel}${noteLabel}`,
      debit: new Decimal(0),
      credit: amt,
    });
  }

  // FIFO allocation of standalone payments (and any excess paidNow or negative opening balance)
  // across active purchases after each purchase's own paidNow is applied to it.
  let availablePool = roundMoney(
    extraPayments.plus(excessPaidNow).minus(openingBalance)
  );
  if (availablePool.lt(0)) {
    availablePool = new Decimal(0);
  }

  const purchaseAllocations: AllocatedPurchaseSummary[] = activePurchases.map(
    (p, idx) => {
      const pTotal = roundMoney(p.totalAmount);
      const pPaidNow = Decimal.min(
        pTotal,
        Decimal.max(new Decimal(0), roundMoney(p.paidNow ?? 0))
      );
      const unpaidAfterPaidNow = roundMoney(pTotal.minus(pPaidNow));

      if (pTotal.lte(0)) {
        return {
          purchaseId: p.id ?? `pur_${idx}`,
          docNumber: p.docNumber ?? 'PUR',
          date: (p.date ?? '').slice(0, 10),
          totalAmount: pTotal,
          paidNowAmount: new Decimal(0),
          allocatedFromPayments: new Decimal(0),
          paidAmount: new Decimal(0),
          remainingAmount: new Decimal(0),
          paymentStatus: 'paid',
        };
      }

      const allocatedFromPayments = Decimal.min(unpaidAfterPaidNow, availablePool);
      availablePool = roundMoney(availablePool.minus(allocatedFromPayments));
      const paidAmount = roundMoney(pPaidNow.plus(allocatedFromPayments));
      const remainingAmount = roundMoney(pTotal.minus(paidAmount));

      let paymentStatus: BillPaymentStatus = 'unpaid';
      if (remainingAmount.lte(0)) {
        paymentStatus = 'paid';
      } else if (paidAmount.gt(0)) {
        paymentStatus = 'partial';
      }

      return {
        purchaseId: p.id ?? `pur_${idx}`,
        docNumber: p.docNumber ?? 'PUR',
        date: (p.date ?? '').slice(0, 10),
        totalAmount: pTotal,
        paidNowAmount: pPaidNow,
        allocatedFromPayments,
        paidAmount,
        remainingAmount,
        paymentStatus,
      };
    }
  );

  rawEvents.sort((a, b) => {
    const cmp = a.sortDate.localeCompare(b.sortDate);
    if (cmp !== 0) return cmp;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const entries: SupplierLedgerEntry[] = [];
  let runningBalance = openingBalance;

  if (!openingBalance.eq(0)) {
    entries.push({
      id: 'opening_balance',
      date: '—',
      docNumber: 'OPEN',
      detail: 'Opening balance',
      debit: openingBalance.gt(0) ? openingBalance : new Decimal(0),
      credit: openingBalance.lt(0) ? openingBalance.abs() : new Decimal(0),
      balance: runningBalance,
    });
  }

  for (const ev of rawEvents) {
    runningBalance = roundMoney(runningBalance.plus(ev.debit).minus(ev.credit));
    entries.push({
      id: ev.id,
      date: ev.sortDate,
      docNumber: ev.docNumber,
      detail: ev.detail,
      debit: ev.debit,
      credit: ev.credit,
      balance: runningBalance,
    });
  }

  const totalPaid = roundMoney(paidOnPurchases.plus(extraPayments));
  const balance = roundMoney(openingBalance.plus(totalPurchased).minus(totalPaid));
  const advanceAvailable = balance.lt(0) ? balance.abs() : new Decimal(0);

  return {
    openingBalance,
    totalPurchased,
    totalPaid,
    balance,
    advanceAvailable,
    purchaseAllocations,
    entries,
  };
}

/**
 * 6. Employee advance & salary calculation (Phase 5):
 * - An advance always reduces the salary of the month of its date.
 * - Running balance = Σ salaries earned − Σ advances − Σ salary paid.
 * - When a month's salary sheet is generated, the month's salary (basic + bonus) is added to the balance.
 * - Payable now = max(0, balance).
 * - If advances in a month are more than the salary, payable is 0 and the extra stays as a negative balance,
 *   which is automatically deducted from the next month's salary.
 */
export function calculateSalaryAndAdvanceStep(input: {
  basicSalary: Decimal.Value;
  bonus?: Decimal.Value;
  advancesThisMonth?: Decimal.Value;
  earlierBalance?: Decimal.Value;
  openAdvanceBalance?: Decimal.Value;
}): {
  basicSalary: Decimal;
  bonus: Decimal;
  grossPay: Decimal;
  earlierBalance: Decimal;
  advanceDeduction: Decimal;
  netPayable: Decimal;
  closingBalanceAfterSalary: Decimal;
  carryForwardBalanceAfterPay: Decimal;
} {
  const basic = roundMoney(input.basicSalary);
  const bonus = roundMoney(input.bonus ?? 0);
  const grossPay = roundMoney(basic.plus(bonus));
  const earlierBalance = roundMoney(input.earlierBalance ?? 0);
  const advancesThisMonth = roundMoney(
    input.advancesThisMonth !== undefined
      ? input.advancesThisMonth
      : (input.openAdvanceBalance ?? 0)
  );

  const closingBalanceAfterSalary = roundMoney(
    earlierBalance.plus(grossPay).minus(advancesThisMonth)
  );
  const netPayable = Decimal.max(new Decimal(0), closingBalanceAfterSalary);
  const carryForwardBalanceAfterPay = roundMoney(
    closingBalanceAfterSalary.minus(netPayable)
  );

  return {
    basicSalary: basic,
    bonus,
    grossPay,
    earlierBalance,
    advanceDeduction: advancesThisMonth,
    netPayable,
    closingBalanceAfterSalary,
    carryForwardBalanceAfterPay,
  };
}

/**
 * 7. Monthly profit:
 * Sales = Σ active bills dated in the month
 * COGS = Σ COGS of the dispatches sold in that month
 * Gross profit = Sales - COGS
 * Expenses = Σ active expenses dated in the month
 * Salaries = Σ (basic + bonus) of that month's salary records. Advances are not expenses.
 * Net profit = Gross profit - Expenses - Salaries
 */
export function calculateMonthlyProfit(input: {
  salesTotal: Decimal.Value;
  cogsTotal: Decimal.Value;
  expensesTotal: Decimal.Value;
  salariesTotal: Decimal.Value;
}): {
  sales: Decimal;
  cogs: Decimal;
  grossProfit: Decimal;
  expenses: Decimal;
  salaries: Decimal;
  netProfit: Decimal;
} {
  const sales = roundMoney(input.salesTotal);
  const cogs = roundMoney(input.cogsTotal);
  const grossProfit = roundMoney(sales.minus(cogs));
  const expenses = roundMoney(input.expensesTotal);
  const salaries = roundMoney(input.salariesTotal);
  const netProfit = roundMoney(grossProfit.minus(expenses).minus(salaries));

  return {
    sales,
    cogs,
    grossProfit,
    expenses,
    salaries,
    netProfit,
  };
}

export interface ExpenseCategoryBreakdownItem {
  category: string;
  label: string;
  amount: Decimal;
  percent: Decimal;
}

export interface MonthlyExpensesAnalysis {
  month: string;
  previousMonth: string;
  monthTotal: Decimal;
  previousMonthTotal: Decimal;
  vsLastMonthPercent: Decimal | null;
  topCategory: ExpenseCategoryBreakdownItem | null;
  categoryBreakdown: ExpenseCategoryBreakdownItem[];
}

export function getPreviousYearMonth(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return month;
  if (m === 1) {
    return `${y - 1}-12`;
  }
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function calculateMonthlyExpensesAnalysis(input: {
  expenses: Array<{
    date: string;
    category: string;
    amount: Decimal.Value;
    status?: 'active' | 'cancelled';
  }>;
  month: string; // 'YYYY-MM'
  categoryLabels?: Record<string, string>;
}): MonthlyExpensesAnalysis {
  const previousMonth = getPreviousYearMonth(input.month);
  const labels = input.categoryLabels ?? {};

  const activeCurrent = input.expenses.filter(
    (e) => (e.status ?? 'active') === 'active' && e.date.slice(0, 7) === input.month
  );
  const activePrev = input.expenses.filter(
    (e) => (e.status ?? 'active') === 'active' && e.date.slice(0, 7) === previousMonth
  );

  const monthTotal = activeCurrent.reduce(
    (acc, e) => acc.plus(roundMoney(e.amount)),
    new Decimal(0)
  );
  const previousMonthTotal = activePrev.reduce(
    (acc, e) => acc.plus(roundMoney(e.amount)),
    new Decimal(0)
  );

  let vsLastMonthPercent: Decimal | null = null;
  if (previousMonthTotal.gt(0)) {
    vsLastMonthPercent = monthTotal
      .minus(previousMonthTotal)
      .dividedBy(previousMonthTotal)
      .times(100)
      .toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  }

  const byCat = new Map<string, Decimal>();
  for (const e of activeCurrent) {
    const prev = byCat.get(e.category) ?? new Decimal(0);
    byCat.set(e.category, roundMoney(prev.plus(roundMoney(e.amount))));
  }

  const formatCatLabel = (cat: string) => {
    if (labels[cat]) return labels[cat];
    switch (cat) {
      case 'machine_maintenance':
        return 'Machine maintenance';
      case 'factory_maintenance':
        return 'Factory maintenance';
      case 'electricity':
        return 'Electricity and fuel';
      case 'transport':
        return 'Transport';
      case 'other':
        return 'Other';
      default:
        return cat
          .replace(/_/g, ' ')
          .replace(/^\w/, (c) => c.toUpperCase());
    }
  };

  const categoryBreakdown: ExpenseCategoryBreakdownItem[] = Array.from(
    byCat.entries()
  )
    .map(([category, amount]) => ({
      category,
      label: formatCatLabel(category),
      amount,
      percent: monthTotal.gt(0)
        ? amount
            .dividedBy(monthTotal)
            .times(100)
            .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
        : new Decimal(0),
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));

  return {
    month: input.month,
    previousMonth,
    monthTotal,
    previousMonthTotal,
    vsLastMonthPercent,
    topCategory: categoryBreakdown[0] ?? null,
    categoryBreakdown,
  };
}

export function calculateMonthlyProfitFromRecords(input: {
  month: string; // 'YYYY-MM'
  bills: Bill[];
  dispatches: Dispatch[];
  expenses: Expense[];
  salaries: SalaryRecord[];
}) {
  const activeMonthBills = input.bills.filter(
    (b) => b.status === 'active' && b.date.startsWith(input.month)
  );

  const dispatchMap = new Map<string, Dispatch>();
  for (const d of input.dispatches) {
    dispatchMap.set(d.id, d);
  }

  let salesTotal = new Decimal(0);
  let cogsTotal = new Decimal(0);

  for (const bill of activeMonthBills) {
    salesTotal = salesTotal.plus(roundMoney(bill.totalAmount));
    const linkedDispatch = dispatchMap.get(bill.dispatchId);
    if (linkedDispatch && linkedDispatch.status === 'active') {
      cogsTotal = cogsTotal.plus(
        roundMoney(linkedDispatch.cogsSnapshot || bill.costOfPowderSoldSnapshot || '0')
      );
    }
  }

  const expensesTotal = input.expenses
    .filter((e) => e.status === 'active' && e.date.startsWith(input.month))
    .reduce((acc, e) => acc.plus(roundMoney(e.amount)), new Decimal(0));

  const salariesTotal = input.salaries
    .filter((s) => s.status === 'active' && s.month === input.month)
    .reduce(
      (acc, s) => acc.plus(roundMoney(s.basicSalary).plus(roundMoney(s.bonus))),
      new Decimal(0)
    );

  return calculateMonthlyProfit({
    salesTotal,
    cogsTotal,
    expensesTotal,
    salariesTotal,
  });
}

/**
 * 8. Full chronological inventory replay & stock validation:
 * Block any purchase cancel, batch or dispatch that would make any stock negative at any date,
 * and name the item and the shortage in the message.
 */
export interface ItemStockState {
  itemId: string;
  itemName: string;
  kind: 'rock' | 'chemical' | 'final_product';
  unit: 'ton' | 'bag';
  quantity: Decimal;
  avgCost: Decimal; // Rounded 2 decimals
  rawAvgCost: Decimal; // Full precision
  totalValue: Decimal;
}

export interface ReplayInventoryResult {
  valid: boolean;
  errorMessage?: string;
  error?: string;
  shortageItemName?: string;
  shortageAmount?: Decimal;
  shortageUnit?: 'ton' | 'bag';
  items: Map<string, ItemStockState>;
  finalProduct: ItemStockState;
}

type ReplayEvent =
  | {
      timestamp: string;
      order: number;
      type: 'purchase';
      record: Purchase;
    }
  | {
      timestamp: string;
      order: number;
      type: 'batch';
      record: ProductionBatch;
    }
  | {
      timestamp: string;
      order: number;
      type: 'dispatch';
      record: Dispatch;
    };

export const FINAL_PRODUCT_ID = '__FINAL_PRODUCT__';

export function replayInventoryState(input: {
  catalogItems: InventoryItem[];
  purchases: Purchase[];
  batches: ProductionBatch[];
  dispatches: Dispatch[];
}): ReplayInventoryResult {
  const items = new Map<string, ItemStockState>();

  for (const item of input.catalogItems) {
    if (item.status === 'active') {
      items.set(item.id, {
        itemId: item.id,
        itemName: item.name,
        kind: item.kind,
        unit: item.kind === 'rock' ? 'ton' : 'bag',
        quantity: new Decimal(0),
        avgCost: new Decimal(0),
        rawAvgCost: new Decimal(0),
        totalValue: new Decimal(0),
      });
    }
  }

  const finalProduct: ItemStockState = {
    itemId: FINAL_PRODUCT_ID,
    itemName: 'Final Product',
    kind: 'final_product',
    unit: 'ton',
    quantity: new Decimal(0),
    avgCost: new Decimal(0),
    rawAvgCost: new Decimal(0),
    totalValue: new Decimal(0),
  };

  // Build chronological events (purchases before batches before dispatches on identical timestamps)
  const events: ReplayEvent[] = [];

  for (const p of input.purchases) {
    if (p.status === 'active') {
      events.push({ timestamp: p.date.slice(0, 10), order: 1, type: 'purchase', record: p });
    }
  }
  for (const b of input.batches) {
    if (b.status === 'active') {
      events.push({ timestamp: b.date.slice(0, 10), order: 2, type: 'batch', record: b });
    }
  }
  for (const d of input.dispatches) {
    // A dispatch that is only Sent does not change stock (A3 rule 3).
    // The powder stock decreases on the sale date by the received tons.
    if (d.status === 'active' && d.receivedWeightTons && toDecimal(d.receivedWeightTons).gt(0) && (d.billId || d.saleDate)) {
      const saleDate = (d.saleDate || d.dateTime).slice(0, 10);
      events.push({ timestamp: saleDate, order: 3, type: 'dispatch', record: d });
    }
  }

  events.sort((a, b) => {
    const cmp = a.timestamp.localeCompare(b.timestamp);
    if (cmp !== 0) return cmp;
    if (a.order !== b.order) return a.order - b.order;
    return a.record.createdAt.localeCompare(b.record.createdAt);
  });

  const ensureItem = (id: string, name: string, kind: 'rock' | 'chemical'): ItemStockState => {
    const existing = items.get(id);
    if (existing) return existing;
    const created: ItemStockState = {
      itemId: id,
      itemName: name,
      kind,
      unit: kind === 'rock' ? 'ton' : 'bag',
      quantity: new Decimal(0),
      avgCost: new Decimal(0),
      rawAvgCost: new Decimal(0),
      totalValue: new Decimal(0),
    };
    items.set(id, created);
    return created;
  };

  for (const ev of events) {
    if (ev.type === 'purchase') {
      const p = ev.record;
      if (p.lines && p.lines.length > 0) {
        for (const line of p.lines) {
          if (toDecimal(line.quantity).gt(0)) {
            const st = ensureItem(line.itemId, line.itemName, line.kind);
            const next = computeNextWeightedAverage(
              st.quantity,
              st.rawAvgCost,
              line.quantity,
              line.rate
            );
            st.quantity = next.stock;
            st.avgCost = next.avgCost;
            st.rawAvgCost = next.rawAvgCost;
            st.totalValue = roundMoney(st.quantity.times(st.rawAvgCost));
          }
        }
      } else {
        if (p.rockLine && toDecimal(p.rockLine.tons).gt(0)) {
          const st = ensureItem(p.rockLine.itemId, p.rockLine.itemName, 'rock');
          const next = computeNextWeightedAverage(
            st.quantity,
            st.rawAvgCost,
            p.rockLine.tons,
            p.rockLine.ratePerTon
          );
          st.quantity = next.stock;
          st.avgCost = next.avgCost;
          st.rawAvgCost = next.rawAvgCost;
          st.totalValue = roundMoney(st.quantity.times(st.rawAvgCost));
        }

        for (const chem of p.chemicalLines || []) {
          if (toDecimal(chem.bags).gt(0)) {
            const st = ensureItem(chem.itemId, chem.itemName, 'chemical');
            const next = computeNextWeightedAverage(
              st.quantity,
              st.rawAvgCost,
              chem.bags,
              chem.ratePerBag
            );
            st.quantity = next.stock;
            st.avgCost = next.avgCost;
            st.rawAvgCost = next.rawAvgCost;
            st.totalValue = roundMoney(st.quantity.times(st.rawAvgCost));
          }
        }
      }
    } else if (ev.type === 'batch') {
      const b = ev.record;
      const rockState = ensureItem(b.rockItemId, b.rockItemName, 'rock');
      const neededRock = roundWeight(b.rockTons);

      const shortages: Array<{
        itemId: string;
        itemName: string;
        shortage: Decimal;
        unit: 'ton' | 'bag';
      }> = [];

      if (rockState.quantity.lt(neededRock)) {
        const shortage = roundWeight(neededRock.minus(rockState.quantity));
        shortages.push({
          itemId: rockState.itemId,
          itemName: rockState.itemName,
          shortage,
          unit: 'ton',
        });
      }

      // Aggregate chemical requirements by itemId before checking against stock
      const chemList =
        b.chemicalLines && b.chemicalLines.length > 0
          ? b.chemicalLines.map((c) => ({
              itemId: c.itemId,
              itemName: c.itemName,
              bags: c.bagsUsed,
            }))
          : (b.chemicalUsages || []).map((c) => ({
              itemId: c.itemId,
              itemName: c.itemName,
              bags: c.bags,
            }));

      const chemRequirements = new Map<
        string,
        { itemId: string; itemName: string; neededBags: Decimal }
      >();
      for (const chem of chemList) {
        const neededBags = roundWeight(chem.bags);
        if (neededBags.lte(0)) continue;
        const existingReq = chemRequirements.get(chem.itemId);
        if (existingReq) {
          existingReq.neededBags = roundWeight(existingReq.neededBags.plus(neededBags));
        } else {
          chemRequirements.set(chem.itemId, {
            itemId: chem.itemId,
            itemName: chem.itemName,
            neededBags,
          });
        }
      }

      for (const req of chemRequirements.values()) {
        const chemState = ensureItem(req.itemId, req.itemName, 'chemical');
        if (chemState.quantity.lt(req.neededBags)) {
          const shortage = roundWeight(req.neededBags.minus(chemState.quantity));
          shortages.push({
            itemId: chemState.itemId,
            itemName: chemState.itemName,
            shortage,
            unit: 'bag',
          });
        }
      }

      if (shortages.length > 0) {
        const first = shortages[0];
        const errorMessage =
          shortages.length === 1
            ? `Insufficient stock for ${first.itemName}: short by ${first.shortage.toString()} ${first.unit}. Add a purchase before saving this batch.`
            : `Insufficient stock for ${shortages
                .map((s) => `${s.itemName} (short by ${s.shortage.toString()} ${s.unit})`)
                .join(', ')}. Add a purchase before saving this batch.`;

        return {
          valid: false,
          shortageItemName: shortages.map((s) => s.itemName).join(', '),
          shortageAmount: first.shortage,
          shortageUnit: first.unit,
          errorMessage,
          items,
          finalProduct,
        };
      }

      // Deduct rock & chemicals and compute batch cost using averages at batch date
      const batchCalc = calculateProductionBatchCost({
        rockTons: neededRock,
        rockAvgCost: rockState.rawAvgCost,
        chemicals: chemList.map((u) => {
          const cs = ensureItem(u.itemId, u.itemName, 'chemical');
          return {
            itemId: u.itemId,
            itemName: u.itemName,
            bags: u.bags,
            avgCostPerBag: cs.rawAvgCost,
          };
        }),
        finalProductTons: b.finalProductTons,
      });

      rockState.quantity = roundWeight(rockState.quantity.minus(neededRock));
      if (rockState.quantity.eq(0)) {
        rockState.totalValue = new Decimal(0);
      } else {
        rockState.totalValue = roundMoney(rockState.quantity.times(rockState.rawAvgCost));
      }

      for (const chem of chemList) {
        const cs = ensureItem(chem.itemId, chem.itemName, 'chemical');
        cs.quantity = roundWeight(cs.quantity.minus(roundWeight(chem.bags)));
        if (cs.quantity.eq(0)) {
          cs.totalValue = new Decimal(0);
        } else {
          cs.totalValue = roundMoney(cs.quantity.times(cs.rawAvgCost));
        }
      }

      // Add output tons to final product stock with weighted average cost
      const costPerTonToUse = batchCalc.rawCostPerTon.gt(0)
        ? batchCalc.rawCostPerTon
        : b.rawCostPerTonSnapshot
          ? toDecimal(b.rawCostPerTonSnapshot)
          : batchCalc.rawCostPerTon;

      const nextFinal = computeNextWeightedAverage(
        finalProduct.quantity,
        finalProduct.rawAvgCost,
        b.finalProductTons,
        costPerTonToUse
      );
      finalProduct.quantity = nextFinal.stock;
      finalProduct.avgCost = nextFinal.avgCost;
      finalProduct.rawAvgCost = nextFinal.rawAvgCost;
      finalProduct.totalValue = roundMoney(finalProduct.quantity.times(finalProduct.rawAvgCost));
    } else if (ev.type === 'dispatch') {
      const d = ev.record;
      const soldTons = roundWeight(d.receivedWeightTons || 0);
      if (finalProduct.quantity.lt(soldTons)) {
        const msg = `Only ${finalProduct.quantity.toString()} ton available`;
        return {
          valid: false,
          shortageItemName: finalProduct.itemName,
          shortageAmount: roundWeight(soldTons.minus(finalProduct.quantity)),
          shortageUnit: 'ton',
          errorMessage: msg,
          error: msg,
          items,
          finalProduct,
        };
      }

      finalProduct.quantity = roundWeight(finalProduct.quantity.minus(soldTons));
      if (finalProduct.quantity.eq(0)) {
        finalProduct.totalValue = new Decimal(0);
      } else {
        finalProduct.totalValue = roundMoney(
          finalProduct.quantity.times(finalProduct.rawAvgCost)
        );
      }
    }
  }

  return {
    valid: true,
    items,
    finalProduct,
  };
}

export interface RecomputeSnapshotsResult extends ReplayInventoryResult {
  batches: ProductionBatch[];
  dispatches: Dispatch[];
  bills: Bill[];
}

/**
 * Replays all active purchases, batches, dispatches, and bills chronologically,
 * validates that stock never drops below zero on any date, and updates all
 * cost/COGS snapshots on batches, dispatches, and bills so the accounting-inventory
 * consistency invariant always holds after any edit, cancel, or delete.
 */
export function recomputeInventoryAndSnapshots(input: {
  catalogItems: InventoryItem[];
  purchases: Purchase[];
  batches: ProductionBatch[];
  dispatches: Dispatch[];
  bills: Bill[];
}): RecomputeSnapshotsResult {
  const baseCheck = replayInventoryState({
    catalogItems: input.catalogItems,
    purchases: input.purchases,
    batches: input.batches,
    dispatches: input.dispatches,
  });

  if (!baseCheck.valid) {
    return {
      ...baseCheck,
      batches: input.batches,
      dispatches: input.dispatches,
      bills: input.bills,
    };
  }

  const items = new Map<string, ItemStockState>();
  for (const item of input.catalogItems) {
    if (item.status === 'active') {
      items.set(item.id, {
        itemId: item.id,
        itemName: item.name,
        kind: item.kind,
        unit: item.kind === 'rock' ? 'ton' : 'bag',
        quantity: new Decimal(0),
        avgCost: new Decimal(0),
        rawAvgCost: new Decimal(0),
        totalValue: new Decimal(0),
      });
    }
  }

  const finalProduct: ItemStockState = {
    itemId: FINAL_PRODUCT_ID,
    itemName: 'Final Product',
    kind: 'final_product',
    unit: 'ton',
    quantity: new Decimal(0),
    avgCost: new Decimal(0),
    rawAvgCost: new Decimal(0),
    totalValue: new Decimal(0),
  };

  const batchMap = new Map<string, ProductionBatch>(
    input.batches.map((b) => [
      b.id,
      {
        ...b,
        chemicalLines: b.chemicalLines ? b.chemicalLines.map((c) => ({ ...c })) : undefined,
        chemicalUsages: b.chemicalUsages ? b.chemicalUsages.map((u) => ({ ...u })) : [],
      },
    ])
  );
  const dispatchMap = new Map<string, Dispatch>(
    input.dispatches.map((d) => [d.id, { ...d }])
  );
  const billMap = new Map<string, Bill>(
    input.bills.map((b) => [b.id, { ...b }])
  );

  const events: ReplayEvent[] = [];
  for (const p of input.purchases) {
    if (p.status === 'active') {
      events.push({ timestamp: p.date.slice(0, 10), order: 1, type: 'purchase', record: p });
    }
  }
  for (const b of batchMap.values()) {
    if (b.status === 'active') {
      events.push({ timestamp: b.date.slice(0, 10), order: 2, type: 'batch', record: b });
    }
  }
  for (const d of dispatchMap.values()) {
    if (
      d.status === 'active' &&
      d.receivedWeightTons &&
      toDecimal(d.receivedWeightTons).gt(0) &&
      (d.billId || d.saleDate)
    ) {
      const saleDate = (d.saleDate || d.dateTime).slice(0, 10);
      events.push({ timestamp: saleDate, order: 3, type: 'dispatch', record: d });
    }
  }

  events.sort((a, b) => {
    const cmp = a.timestamp.localeCompare(b.timestamp);
    if (cmp !== 0) return cmp;
    if (a.order !== b.order) return a.order - b.order;
    return a.record.createdAt.localeCompare(b.record.createdAt);
  });

  const ensureItem = (id: string, name: string, kind: 'rock' | 'chemical'): ItemStockState => {
    const existing = items.get(id);
    if (existing) return existing;
    const created: ItemStockState = {
      itemId: id,
      itemName: name,
      kind,
      unit: kind === 'rock' ? 'ton' : 'bag',
      quantity: new Decimal(0),
      avgCost: new Decimal(0),
      rawAvgCost: new Decimal(0),
      totalValue: new Decimal(0),
    };
    items.set(id, created);
    return created;
  };

  for (const ev of events) {
    if (ev.type === 'purchase') {
      const p = ev.record;
      if (p.lines && p.lines.length > 0) {
        for (const line of p.lines) {
          if (toDecimal(line.quantity).gt(0)) {
            const st = ensureItem(line.itemId, line.itemName, line.kind);
            const next = computeNextWeightedAverage(
              st.quantity,
              st.rawAvgCost,
              line.quantity,
              line.rate
            );
            st.quantity = next.stock;
            st.avgCost = next.avgCost;
            st.rawAvgCost = next.rawAvgCost;
            st.totalValue = roundMoney(st.quantity.times(st.rawAvgCost));
          }
        }
      } else {
        if (p.rockLine && toDecimal(p.rockLine.tons).gt(0)) {
          const st = ensureItem(p.rockLine.itemId, p.rockLine.itemName, 'rock');
          const next = computeNextWeightedAverage(
            st.quantity,
            st.rawAvgCost,
            p.rockLine.tons,
            p.rockLine.ratePerTon
          );
          st.quantity = next.stock;
          st.avgCost = next.avgCost;
          st.rawAvgCost = next.rawAvgCost;
          st.totalValue = roundMoney(st.quantity.times(st.rawAvgCost));
        }
        for (const chem of p.chemicalLines || []) {
          if (toDecimal(chem.bags).gt(0)) {
            const st = ensureItem(chem.itemId, chem.itemName, 'chemical');
            const next = computeNextWeightedAverage(
              st.quantity,
              st.rawAvgCost,
              chem.bags,
              chem.ratePerBag
            );
            st.quantity = next.stock;
            st.avgCost = next.avgCost;
            st.rawAvgCost = next.rawAvgCost;
            st.totalValue = roundMoney(st.quantity.times(st.rawAvgCost));
          }
        }
      }
    } else if (ev.type === 'batch') {
      const b = batchMap.get(ev.record.id)!;
      const rockState = ensureItem(b.rockItemId, b.rockItemName, 'rock');
      const neededRock = roundWeight(b.rockTons);

      const chemList =
        b.chemicalLines && b.chemicalLines.length > 0
          ? b.chemicalLines.map((c) => ({
              itemId: c.itemId,
              itemName: c.itemName,
              bags: c.bagsUsed,
            }))
          : (b.chemicalUsages || []).map((c) => ({
              itemId: c.itemId,
              itemName: c.itemName,
              bags: c.bags,
            }));

      const batchCalc = calculateProductionBatchCost({
        rockTons: neededRock,
        rockAvgCost: rockState.rawAvgCost,
        chemicals: chemList.map((u) => {
          const cs = ensureItem(u.itemId, u.itemName, 'chemical');
          return {
            itemId: u.itemId,
            itemName: u.itemName,
            bags: u.bags,
            avgCostPerBag: cs.rawAvgCost,
          };
        }),
        finalProductTons: b.finalProductTons,
      });

      b.rockAvgCostSnapshot = rockState.avgCost.toFixed(2);
      b.rockCostSnapshot = batchCalc.rockCost.toFixed(2);
      b.chemicalLines = chemList.map((u, idx) => {
        const cs = ensureItem(u.itemId, u.itemName, 'chemical');
        const lineCalc = batchCalc.chemicalCosts[idx];
        return {
          itemId: u.itemId,
          itemName: u.itemName,
          bagsUsed: u.bags,
          avgCostSnapshot: cs.avgCost.toFixed(2),
          lineCost: lineCalc ? lineCalc.lineCost.toFixed(2) : '0.00',
        };
      });
      b.chemicalUsages = chemList.map((u, idx) => {
        const cs = ensureItem(u.itemId, u.itemName, 'chemical');
        const lineCalc = batchCalc.chemicalCosts[idx];
        return {
          itemId: u.itemId,
          itemName: u.itemName,
          bags: u.bags,
          avgCostPerBagSnapshot: cs.avgCost.toFixed(2),
          lineCostSnapshot: lineCalc ? lineCalc.lineCost.toFixed(2) : '0.00',
        };
      });
      b.chemicalsCostSnapshot = batchCalc.totalChemicalCost.toFixed(2);
      b.totalBatchCostSnapshot = batchCalc.totalCost.toFixed(2);
      b.totalCostSnapshot = batchCalc.totalCost.toFixed(2);
      b.costPerTonSnapshot = batchCalc.costPerTon.toFixed(2);
      b.rawCostPerTonSnapshot = batchCalc.rawCostPerTon.toString();

      rockState.quantity = roundWeight(rockState.quantity.minus(neededRock));
      rockState.totalValue = rockState.quantity.eq(0)
        ? new Decimal(0)
        : roundMoney(rockState.quantity.times(rockState.rawAvgCost));

      for (const chem of chemList) {
        const cs = ensureItem(chem.itemId, chem.itemName, 'chemical');
        cs.quantity = roundWeight(cs.quantity.minus(roundWeight(chem.bags)));
        cs.totalValue = cs.quantity.eq(0)
          ? new Decimal(0)
          : roundMoney(cs.quantity.times(cs.rawAvgCost));
      }

      const nextFinal = computeNextWeightedAverage(
        finalProduct.quantity,
        finalProduct.rawAvgCost,
        b.finalProductTons,
        batchCalc.rawCostPerTon
      );
      finalProduct.quantity = nextFinal.stock;
      finalProduct.avgCost = nextFinal.avgCost;
      finalProduct.rawAvgCost = nextFinal.rawAvgCost;
      finalProduct.totalValue = roundMoney(finalProduct.quantity.times(finalProduct.rawAvgCost));
    } else if (ev.type === 'dispatch') {
      const d = dispatchMap.get(ev.record.id)!;
      const soldTons = roundWeight(d.receivedWeightTons || 0);
      const linkedBill = d.billId ? billMap.get(d.billId) : undefined;
      const discount = linkedBill ? linkedBill.discount : 0;

      const saleCalc = calculateDispatchAndBill({
        receivedWeightTons: soldTons,
        ratePerTon: d.ratePerTon || linkedBill?.ratePerTon || 0,
        discount: discount,
        avgCostPerTon: finalProduct.rawAvgCost,
      });

      d.avgCostPerTonSnapshot = finalProduct.avgCost.toFixed(2);
      d.rawAvgCostPerTonSnapshot = finalProduct.rawAvgCost.toString();
      d.cogsSnapshot = saleCalc.cogs.toFixed(2);
      d.costOfPowderSoldSnapshot = saleCalc.cogs.toFixed(2);

      if (linkedBill && linkedBill.status === 'active') {
        linkedBill.receivedWeightTons = soldTons.toString();
        linkedBill.ratePerTon = toDecimal(d.ratePerTon || linkedBill.ratePerTon || 0).toString();
        linkedBill.subtotal = saleCalc.subtotal.toString();
        linkedBill.totalAmount = saleCalc.billAmount.toString();
        linkedBill.costOfPowderSoldSnapshot = saleCalc.cogs.toFixed(2);
      }

      finalProduct.quantity = roundWeight(finalProduct.quantity.minus(soldTons));
      finalProduct.totalValue = finalProduct.quantity.eq(0)
        ? new Decimal(0)
        : roundMoney(finalProduct.quantity.times(finalProduct.rawAvgCost));
    }
  }

  return {
    valid: true,
    items,
    finalProduct,
    batches: Array.from(batchMap.values()),
    dispatches: Array.from(dispatchMap.values()),
    bills: Array.from(billMap.values()),
  };
}

export interface InventorySnapshotItem {
  itemId: string;
  itemName: string;
  kind: 'rock' | 'chemical' | 'final_product';
  unit: 'ton' | 'bag';
  stock: Decimal;
  avgCost: Decimal;
  rawAvgCost: Decimal;
  totalValue: Decimal;
}

export interface InventorySnapshot {
  rockItems: InventorySnapshotItem[];
  chemicalItems: InventorySnapshotItem[];
  powder: InventorySnapshotItem;
  allItems: InventorySnapshotItem[];
  rawMaterialsValue: Decimal;
  powderValue: Decimal;
  totalInventoryValue: Decimal;
  vehiclesOnTheWayCount: number;
  vehiclesOnTheWay: Dispatch[];
  asOfDate?: string;
}

export interface InvariantCheckResult {
  purchasedTotal: Decimal;
  rawMaterialsInStockValue: Decimal;
  powderInStockValue: Decimal;
  costOfPowderSoldTotal: Decimal;
  accountedTotal: Decimal; // Raw materials + Powder + COGS
  difference: Decimal; // Purchased - Accounted
  isConsistent: boolean; // Math.abs(difference) <= 1
  message: string;
}

/**
 * 3.1 Single canonical inventory source:
 * Calculates exact stock, average cost and value for rock, each chemical, and powder,
 * plus vehicles on the way.
 */
export function getInventorySnapshot(input: {
  catalogItems: InventoryItem[];
  purchases: Purchase[];
  batches: ProductionBatch[];
  dispatches: Dispatch[];
  asOfDate?: string;
}): InventorySnapshot {
  const asOfDate = input.asOfDate ? input.asOfDate.slice(0, 10) : undefined;

  const filteredPurchases = asOfDate
    ? input.purchases.filter((p) => p.date.slice(0, 10) <= asOfDate)
    : input.purchases;
  const filteredBatches = asOfDate
    ? input.batches.filter((b) => b.date.slice(0, 10) <= asOfDate)
    : input.batches;
  const filteredDispatches = asOfDate
    ? input.dispatches.filter((d) => (d.saleDate || d.dateTime).slice(0, 10) <= asOfDate)
    : input.dispatches;

  const replayed = replayInventoryState({
    catalogItems: input.catalogItems,
    purchases: filteredPurchases,
    batches: filteredBatches,
    dispatches: filteredDispatches,
  });

  const rockItems: InventorySnapshotItem[] = [];
  const chemicalItems: InventorySnapshotItem[] = [];
  let rawMaterialsValue = new Decimal(0);

  for (const itemState of replayed.items.values()) {
    const itemSnapshot: InventorySnapshotItem = {
      itemId: itemState.itemId,
      itemName: itemState.itemName,
      kind: itemState.kind as 'rock' | 'chemical',
      unit: itemState.unit,
      stock: itemState.quantity,
      avgCost: itemState.avgCost,
      rawAvgCost: itemState.rawAvgCost,
      totalValue: itemState.totalValue,
    };
    if (itemState.kind === 'rock') {
      rockItems.push(itemSnapshot);
    } else if (itemState.kind === 'chemical') {
      chemicalItems.push(itemSnapshot);
    }
    rawMaterialsValue = rawMaterialsValue.plus(itemState.totalValue);
  }

  const powder: InventorySnapshotItem = {
    itemId: replayed.finalProduct.itemId,
    itemName: replayed.finalProduct.itemName,
    kind: 'final_product',
    unit: 'ton',
    stock: replayed.finalProduct.quantity,
    avgCost: replayed.finalProduct.avgCost,
    rawAvgCost: replayed.finalProduct.rawAvgCost,
    totalValue: replayed.finalProduct.totalValue,
  };

  const powderValue = powder.totalValue;
  const totalInventoryValue = rawMaterialsValue.plus(powderValue);

  // Vehicles on the way: active dispatches waiting for received weight (no billId and no receivedWeightTons)
  const vehiclesOnTheWay = input.dispatches.filter(
    (d) => d.status === 'active' && !d.billId && !d.receivedWeightTons
  );

  return {
    rockItems,
    chemicalItems,
    powder,
    allItems: [...rockItems, ...chemicalItems, powder],
    rawMaterialsValue: roundMoney(rawMaterialsValue),
    powderValue: roundMoney(powderValue),
    totalInventoryValue: roundMoney(totalInventoryValue),
    vehiclesOnTheWayCount: vehiclesOnTheWay.length,
    vehiclesOnTheWay,
    asOfDate,
  };
}

/**
 * 3.5 Consistency check running the invariant from A3 rule 10:
 * Raw materials value + Powder value + Cumulative cost of powder sold = Σ active purchase totals (tolerance Rs 1)
 */
export function calculateAccountingInventoryInvariant(input: {
  purchases: Purchase[];
  items: InventoryItem[];
  batches: ProductionBatch[];
  dispatches: Dispatch[];
  bills: Bill[];
  asOfDate?: string;
}): InvariantCheckResult {
  const asOfDate = input.asOfDate ? input.asOfDate.slice(0, 10) : undefined;

  const activePurchases = input.purchases.filter((p) => {
    if (p.status !== 'active') return false;
    if (asOfDate && p.date.slice(0, 10) > asOfDate) return false;
    return true;
  });
  const purchasedTotal = activePurchases.reduce(
    (sum, p) => sum.plus(roundMoney(p.totalAmount)),
    new Decimal(0)
  );

  const snapshot = getInventorySnapshot({
    catalogItems: input.items,
    purchases: input.purchases,
    batches: input.batches,
    dispatches: input.dispatches,
    asOfDate,
  });

  const activeBills = input.bills.filter((b) => {
    if (b.status !== 'active') return false;
    if (asOfDate && b.date.slice(0, 10) > asOfDate) return false;
    return true;
  });

  const costOfPowderSoldTotal = activeBills.reduce((sum, b) => {
    const cogs = b.costOfPowderSoldSnapshot;
    if (cogs && toDecimal(cogs).gt(0)) {
      return sum.plus(roundMoney(cogs));
    }
    const d = input.dispatches.find((dsp) => dsp.id === b.dispatchId);
    return sum.plus(roundMoney(d?.cogsSnapshot || 0));
  }, new Decimal(0));

  const accountedTotal = snapshot.rawMaterialsValue
    .plus(snapshot.powderValue)
    .plus(costOfPowderSoldTotal);

  const diff = purchasedTotal.minus(accountedTotal);
  const isConsistent = Math.abs(diff.toNumber()) <= 1.0;

  return {
    purchasedTotal: roundMoney(purchasedTotal),
    rawMaterialsInStockValue: snapshot.rawMaterialsValue,
    powderInStockValue: snapshot.powderValue,
    costOfPowderSoldTotal: roundMoney(costOfPowderSoldTotal),
    accountedTotal: roundMoney(accountedTotal),
    difference: roundMoney(diff),
    isConsistent,
    message: isConsistent
      ? 'All numbers match'
      : `Mismatch of ${diff.abs().toFixed(2)}`,
  };
}

/**
 * Simple helper to validate a single dispatch against available stock.
 */
export function validateStockAvailability(input: {
  itemName: string;
  unit: 'ton' | 'bag';
  availableQty: Decimal.Value;
  requestedQty: Decimal.Value;
}): {
  valid: boolean;
  shortage: Decimal;
  errorMessage?: string;
} {
  const available = roundWeight(input.availableQty);
  const requested = roundWeight(input.requestedQty);

  if (requested.gt(available)) {
    const shortage = roundWeight(requested.minus(available));
    return {
      valid: false,
      shortage,
      errorMessage: `Insufficient stock for ${input.itemName}: short by ${shortage.toString()} ${input.unit}.`,
    };
  }

  return {
    valid: true,
    shortage: new Decimal(0),
  };
}

export function isSalaryRecordPaid(salary: SalaryRecord): boolean {
  if (salary.status !== 'active') return false;
  if (salary.paymentStatus === 'paid') return true;
  if (salary.paymentStatus === 'unpaid') return false;
  return toDecimal(salary.paidAmount).gt(0);
}

export interface AdvanceStatusItem {
  advance: EmployeeAdvance;
  originalAmount: Decimal;
  recoveredAmount: Decimal;
  remainingBalance: Decimal;
  salaryMonth: string; // YYYY-MM (month reduced by this advance)
  advanceStatus: 'open' | 'closed' | 'cancelled';
}

const MONTH_FULL_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatMonthNameOnly(monthIso: string): string {
  const m = Number(monthIso.slice(5, 7));
  if (m >= 1 && m <= 12) return MONTH_FULL_NAMES[m - 1];
  return monthIso;
}

/**
 * Calculates an employee's running balance up to an optional month (inclusive or exclusive).
 * Running balance = Σ salaries earned − Σ advances − Σ salary paid.
 */
export function calculateEmployeeRunningBalance(input: {
  employeeId: string;
  advances: EmployeeAdvance[];
  salaries: SalaryRecord[];
  beforeMonth?: string; // strictly < beforeMonth
  upToMonth?: string; // <= upToMonth
  excludeSalaryId?: string;
}): {
  salariesEarned: Decimal;
  advancesTaken: Decimal;
  salaryPaid: Decimal;
  balance: Decimal;
} {
  let salariesEarned = new Decimal(0);
  let advancesTaken = new Decimal(0);
  let salaryPaid = new Decimal(0);

  for (const s of input.salaries) {
    if (s.status !== 'active' || s.employeeId !== input.employeeId) continue;
    if (input.excludeSalaryId && s.id === input.excludeSalaryId) continue;
    if (input.beforeMonth && s.month >= input.beforeMonth) continue;
    if (input.upToMonth && s.month > input.upToMonth) continue;

    const earned = roundMoney(s.basicSalary).plus(roundMoney(s.bonus));
    salariesEarned = roundMoney(salariesEarned.plus(earned));

    if (isSalaryRecordPaid(s)) {
      salaryPaid = roundMoney(salaryPaid.plus(roundMoney(s.paidAmount)));
    }
  }

  for (const a of input.advances) {
    if (a.status !== 'active' || a.employeeId !== input.employeeId) continue;
    const advMonth = a.date.slice(0, 7);
    if (input.beforeMonth && advMonth >= input.beforeMonth) continue;
    if (input.upToMonth && advMonth > input.upToMonth) continue;

    advancesTaken = roundMoney(advancesTaken.plus(roundMoney(a.amount)));
  }

  const balance = roundMoney(salariesEarned.minus(advancesTaken).minus(salaryPaid));

  return {
    salariesEarned,
    advancesTaken,
    salaryPaid,
    balance,
  };
}

/**
 * Computes a single month's salary sheet row for an employee using Phase 5 rules:
 * - advances = sum of active advances in `month` (automatic, not editable)
 * - earlierBalance = running balance strictly before `month`
 * - balanceAfterSalary = earlierBalance + basicSalary + bonus - advances
 * - netPayable = max(0, balanceAfterSalary)
 */
export function calculateEmployeeMonthlySalaryRow(input: {
  advances: EmployeeAdvance[];
  salaries: SalaryRecord[];
  employeeId: string;
  month: string; // YYYY-MM
  basicSalary: Decimal.Value;
  bonus?: Decimal.Value;
  excludeSalaryId?: string;
}): {
  basicSalary: Decimal;
  bonus: Decimal;
  grossSalary: Decimal;
  earlierBalance: Decimal;
  advancesThisMonth: Decimal;
  advanceDeduction: Decimal;
  balanceAfterSalary: Decimal;
  netPayable: Decimal;
} {
  const basicSalary = roundMoney(input.basicSalary);
  const bonus = roundMoney(input.bonus ?? 0);
  const grossSalary = roundMoney(basicSalary.plus(bonus));

  const prior = calculateEmployeeRunningBalance({
    employeeId: input.employeeId,
    advances: input.advances,
    salaries: input.salaries,
    beforeMonth: input.month,
    excludeSalaryId: input.excludeSalaryId,
  });

  const advancesThisMonth = input.advances
    .filter(
      (a) =>
        a.status === 'active' &&
        a.employeeId === input.employeeId &&
        a.date.slice(0, 7) === input.month
    )
    .reduce((acc, a) => roundMoney(acc.plus(roundMoney(a.amount))), new Decimal(0));

  const step = calculateSalaryAndAdvanceStep({
    basicSalary,
    bonus,
    earlierBalance: prior.balance,
    advancesThisMonth,
  });

  return {
    basicSalary,
    bonus,
    grossSalary,
    earlierBalance: step.earlierBalance,
    advancesThisMonth: step.advanceDeduction,
    advanceDeduction: step.advanceDeduction,
    balanceAfterSalary: step.closingBalanceAfterSalary,
    netPayable: step.netPayable,
  };
}

/**
 * Compatibility helper for calculating an employee's salary row.
 */
export function calculateEmployeeRecommendedSalaryRow(input: {
  advances: EmployeeAdvance[];
  salaries: SalaryRecord[];
  employeeId: string;
  month?: string;
  basicSalary: Decimal.Value;
  bonus?: Decimal.Value;
  excludeSalaryId?: string;
}): {
  basicSalary: Decimal;
  bonus: Decimal;
  earlierBalance: Decimal;
  openAdvanceBefore: Decimal;
  recommendedAdvanceDeduction: Decimal;
  advanceDeduction: Decimal;
  otherDeduction: Decimal;
  netPayable: Decimal;
  remainingAdvanceAfter: Decimal;
} {
  const targetMonth =
    input.month ||
    new Date().toISOString().slice(0, 7);

  const row = calculateEmployeeMonthlySalaryRow({
    advances: input.advances,
    salaries: input.salaries,
    employeeId: input.employeeId,
    month: targetMonth,
    basicSalary: input.basicSalary,
    bonus: input.bonus,
    excludeSalaryId: input.excludeSalaryId,
  });

  const negativeCarryOut = row.balanceAfterSalary.lt(0)
    ? row.balanceAfterSalary.abs()
    : new Decimal(0);

  return {
    basicSalary: row.basicSalary,
    bonus: row.bonus,
    earlierBalance: row.earlierBalance,
    openAdvanceBefore: row.advancesThisMonth,
    recommendedAdvanceDeduction: row.advancesThisMonth,
    advanceDeduction: row.advancesThisMonth,
    otherDeduction: new Decimal(0),
    netPayable: row.netPayable,
    remainingAdvanceAfter: negativeCarryOut,
  };
}

/**
 * Allocates earned salaries FIFO across an employee's active advances,
 * returning each advance's status and any unrecovered advance balance.
 */
export function calculateEmployeeAdvancesState(input: {
  advances: EmployeeAdvance[];
  salaries: SalaryRecord[];
  employeeId: string;
  excludeSalaryId?: string;
}): {
  totalOriginal: Decimal;
  totalRecovered: Decimal;
  openBalance: Decimal;
  items: AdvanceStatusItem[];
} {
  const empAdvances = input.advances
    .filter((a) => a.employeeId === input.employeeId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  // Under Phase 5, advances are deducted against earned salaries (basic + bonus)
  let remainingSalaryPool = input.salaries
    .filter(
      (s) =>
        s.status === 'active' &&
        s.employeeId === input.employeeId &&
        s.id !== input.excludeSalaryId
    )
    .reduce(
      (acc, s) =>
        acc.plus(
          Decimal.max(
            new Decimal(0),
            roundMoney(s.basicSalary)
              .plus(roundMoney(s.bonus))
              .minus(roundMoney(s.paidAmount))
          )
        ),
      new Decimal(0)
    );

  let totalOriginal = new Decimal(0);
  let totalRecovered = new Decimal(0);
  let openBalance = new Decimal(0);

  const items: AdvanceStatusItem[] = empAdvances.map((adv) => {
    const orig = roundMoney(adv.amount);
    const salaryMonth = adv.date.slice(0, 7);
    if (adv.status === 'cancelled') {
      return {
        advance: adv,
        originalAmount: orig,
        recoveredAmount: new Decimal(0),
        remainingBalance: new Decimal(0),
        salaryMonth,
        advanceStatus: 'cancelled',
      };
    }

    totalOriginal = roundMoney(totalOriginal.plus(orig));
    const deducted = Decimal.min(orig, remainingSalaryPool);
    remainingSalaryPool = roundMoney(remainingSalaryPool.minus(deducted));
    const rem = roundMoney(orig.minus(deducted));

    totalRecovered = roundMoney(totalRecovered.plus(deducted));
    openBalance = roundMoney(openBalance.plus(rem));

    return {
      advance: adv,
      originalAmount: orig,
      recoveredAmount: deducted,
      remainingBalance: rem,
      salaryMonth,
      advanceStatus: rem.lte(0) ? 'closed' : 'open',
    };
  });

  return {
    totalOriginal,
    totalRecovered,
    openBalance,
    items,
  };
}

export function calculateEmployeeOpenAdvanceBalance(input: {
  advances: EmployeeAdvance[];
  salaries: SalaryRecord[];
  employeeId: string;
  excludeSalaryId?: string;
}): Decimal {
  return calculateEmployeeAdvancesState(input).openBalance;
}

export interface EmployeeLedgerEntry {
  id: string;
  month: string; // YYYY-MM
  date: string; // YYYY-MM-DD
  docNumber: string;
  type: 'advance' | 'salary_earned' | 'salary_paid';
  detail: string; // 'Advance taken' | 'Salary for November' | 'Salary paid'
  note?: string;
  amountIn: Decimal; // Salary earned
  amountOut: Decimal; // Advance taken or Salary paid
  runningBalance: Decimal; // Σ salaries earned − Σ advances − Σ salary paid
}

export interface EmployeeLedgerMonthGroup {
  month: string; // YYYY-MM
  totalIn: Decimal;
  totalOut: Decimal;
  closingBalance: Decimal;
  entries: EmployeeLedgerEntry[];
}

export interface EmployeeLedgerResult {
  employeeId: string;
  totalSalariesEarned: Decimal;
  totalAdvances: Decimal;
  totalSalaryPaid: Decimal;
  currentBalance: Decimal; // Σ salaries earned − Σ advances − Σ salary paid
  thisMonth: {
    month: string;
    salary: Decimal;
    bonus: Decimal;
    earlierBalance: Decimal;
    advancesSoFar: Decimal;
    payableAtMonthEnd: Decimal;
    advancePercentOfSalary: Decimal;
    isOver80Percent: boolean;
  };
  advancesThisYear: Decimal;
  salaryPaidThisYear: Decimal;
  entries: EmployeeLedgerEntry[];
  monthGroups: EmployeeLedgerMonthGroup[];
}

/**
 * 5.5 Employee ledger calculation:
 * - Running balance = Σ salaries earned − Σ advances − Σ salary paid.
 * - Groups ledger entries by month with expandable month totals.
 */
export function calculateEmployeeLedger(input: {
  employee: {
    id: string;
    name: string;
    role: string;
    basicSalary: Decimal.Value;
  };
  advances: EmployeeAdvance[];
  salaries: SalaryRecord[];
  currentMonth?: string; // YYYY-MM
  currentYear?: string; // YYYY
}): EmployeeLedgerResult {
  const empId = input.employee.id;
  const currentMonth = input.currentMonth || new Date().toISOString().slice(0, 7);
  const currentYear = input.currentYear || currentMonth.slice(0, 4);

  const activeAdvances = input.advances
    .filter((a) => a.status === 'active' && a.employeeId === empId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const activeSalaries = input.salaries
    .filter((s) => s.status === 'active' && s.employeeId === empId)
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month) || a.date.localeCompare(b.date));

  type RawEvent = {
    id: string;
    month: string;
    date: string;
    createdAt: string;
    order: number;
    docNumber: string;
    type: 'advance' | 'salary_earned' | 'salary_paid';
    detail: string;
    note?: string;
    amountIn: Decimal;
    amountOut: Decimal;
  };

  const rawEvents: RawEvent[] = [];

  for (const adv of activeAdvances) {
    const amt = roundMoney(adv.amount);
    rawEvents.push({
      id: `adv_${adv.id}`,
      month: adv.date.slice(0, 7),
      date: adv.date.slice(0, 10),
      createdAt: adv.createdAt || adv.date,
      order: 1,
      docNumber: adv.docNumber,
      type: 'advance',
      detail: 'Advance taken',
      note: adv.notes,
      amountIn: new Decimal(0),
      amountOut: amt,
    });
  }

  for (const sal of activeSalaries) {
    const earned = roundMoney(sal.basicSalary).plus(roundMoney(sal.bonus));
    const mName = formatMonthNameOnly(sal.month);
    rawEvents.push({
      id: `sal_earn_${sal.id}`,
      month: sal.month,
      date: sal.date.slice(0, 10),
      createdAt: sal.createdAt || sal.date,
      order: 2,
      docNumber: sal.docNumber,
      type: 'salary_earned',
      detail: `Salary for ${mName}`,
      note: sal.notes,
      amountIn: earned,
      amountOut: new Decimal(0),
    });

    if (isSalaryRecordPaid(sal)) {
      const paidAmt = roundMoney(sal.paidAmount);
      if (paidAmt.gt(0)) {
        const paidDate = (sal.paidDate || sal.date).slice(0, 10);
        rawEvents.push({
          id: `sal_paid_${sal.id}`,
          month: sal.month,
          date: paidDate,
          createdAt: sal.updatedAt || sal.createdAt || paidDate,
          order: 3,
          docNumber: sal.docNumber,
          type: 'salary_paid',
          detail: 'Salary paid',
          note: sal.paymentMethod
            ? `Paid via ${sal.paymentMethod}`
            : undefined,
          amountIn: new Decimal(0),
          amountOut: paidAmt,
        });
      }
    }
  }

  rawEvents.sort((a, b) => {
    const mCmp = a.month.localeCompare(b.month);
    if (mCmp !== 0) return mCmp;
    const dCmp = a.date.localeCompare(b.date);
    if (dCmp !== 0) return dCmp;
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt.localeCompare(b.createdAt);
  });

  let runningBalance = new Decimal(0);
  let totalSalariesEarned = new Decimal(0);
  let totalAdvances = new Decimal(0);
  let totalSalaryPaid = new Decimal(0);

  const entries: EmployeeLedgerEntry[] = rawEvents.map((ev) => {
    runningBalance = roundMoney(runningBalance.plus(ev.amountIn).minus(ev.amountOut));
    if (ev.type === 'salary_earned') {
      totalSalariesEarned = roundMoney(totalSalariesEarned.plus(ev.amountIn));
    } else if (ev.type === 'advance') {
      totalAdvances = roundMoney(totalAdvances.plus(ev.amountOut));
    } else if (ev.type === 'salary_paid') {
      totalSalaryPaid = roundMoney(totalSalaryPaid.plus(ev.amountOut));
    }
    return {
      id: ev.id,
      month: ev.month,
      date: ev.date,
      docNumber: ev.docNumber,
      type: ev.type,
      detail: ev.detail,
      note: ev.note,
      amountIn: ev.amountIn,
      amountOut: ev.amountOut,
      runningBalance,
    };
  });

  // Group entries by month (descending month order for UI, with chronological rows inside each month)
  const groupMap = new Map<string, EmployeeLedgerEntry[]>();
  for (const entry of entries) {
    const list = groupMap.get(entry.month) || [];
    list.push(entry);
    groupMap.set(entry.month, list);
  }

  const monthGroups: EmployeeLedgerMonthGroup[] = Array.from(groupMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, mEntries]) => {
      const totalIn = mEntries.reduce(
        (acc, e) => roundMoney(acc.plus(e.amountIn)),
        new Decimal(0)
      );
      const totalOut = mEntries.reduce(
        (acc, e) => roundMoney(acc.plus(e.amountOut)),
        new Decimal(0)
      );
      const closingBalance =
        mEntries.length > 0
          ? mEntries[mEntries.length - 1].runningBalance
          : new Decimal(0);
      return {
        month,
        totalIn,
        totalOut,
        closingBalance,
        entries: mEntries,
      };
    });

  // This month card calculation
  const existingMonthSalary = activeSalaries.find((s) => s.month === currentMonth);
  const monthRow = calculateEmployeeMonthlySalaryRow({
    advances: activeAdvances,
    salaries: activeSalaries,
    employeeId: empId,
    month: currentMonth,
    basicSalary: existingMonthSalary ? existingMonthSalary.basicSalary : input.employee.basicSalary,
    bonus: existingMonthSalary ? existingMonthSalary.bonus : 0,
    excludeSalaryId: existingMonthSalary?.id,
  });

  const advancePercentOfSalary = monthRow.grossSalary.gt(0)
    ? monthRow.advancesThisMonth
        .dividedBy(monthRow.grossSalary)
        .times(100)
        .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
    : new Decimal(0);

  const advancesThisYear = activeAdvances
    .filter((a) => a.date.startsWith(currentYear))
    .reduce((acc, a) => roundMoney(acc.plus(roundMoney(a.amount))), new Decimal(0));

  const salaryPaidThisYear = activeSalaries
    .filter((s) => isSalaryRecordPaid(s) && (s.paidDate || s.date || s.month).startsWith(currentYear))
    .reduce((acc, s) => roundMoney(acc.plus(roundMoney(s.paidAmount))), new Decimal(0));

  return {
    employeeId: empId,
    totalSalariesEarned,
    totalAdvances,
    totalSalaryPaid,
    currentBalance: runningBalance,
    thisMonth: {
      month: currentMonth,
      salary: monthRow.grossSalary,
      bonus: monthRow.bonus,
      earlierBalance: monthRow.earlierBalance,
      advancesSoFar: monthRow.advancesThisMonth,
      payableAtMonthEnd: monthRow.netPayable,
      advancePercentOfSalary,
      isOver80Percent: advancePercentOfSalary.gt(80),
    },
    advancesThisYear,
    salaryPaidThisYear,
    entries,
    monthGroups,
  };
}

export * from './reports';
