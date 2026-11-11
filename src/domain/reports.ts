import Decimal from 'decimal.js';
import {
  type AllocatedBillSummary,
  calculateAccountingInventoryInvariant,
  calculateCustomerLedgerAndAllocations,
  calculateEmployeeAdvancesState,
  calculateMonthlyExpensesAnalysis,
  calculateMonthlyProfitFromRecords,
  calculateSupplierLedger,
  getInventorySnapshot,
  getPreviousYearMonth,
  isSalaryRecordPaid,
  roundMoney,
  roundWeight,
} from './engine';
import type {
  Bill,
  Customer,
  CustomerPayment,
  Dispatch,
  Employee,
  EmployeeAdvance,
  Expense,
  InventoryItem,
  ProductionBatch,
  Purchase,
  SalaryRecord,
  Supplier,
  SupplierPayment,
} from './types';

export interface AllCompanyRecords {
  items: InventoryItem[];
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  batches: ProductionBatch[];
  dispatches: Dispatch[];
  customers: Customer[];
  bills: Bill[];
  customerPayments: CustomerPayment[];
  expenses: Expense[];
  employees: Employee[];
  advances: EmployeeAdvance[];
  salaries: SalaryRecord[];
  categoryLabels?: Record<string, string>;
  customFinalProductName?: string;
}

export function shiftYearMonth(month: string, delta: number): string {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr);
  const m = Number(mStr);
  if (!year || !m) return month;
  const totalMonths = year * 12 + (m - 1) + delta;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

export function getMonthDateBounds(month: string): { fromDate: string; toDate: string } {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr);
  const m = Number(mStr);
  if (!year || !m) {
    return { fromDate: `${month}-01`, toDate: `${month}-31` };
  }
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return {
    fromDate: `${month}-01`,
    toDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getDayBeforeIsoDate(isoDate: string): string {
  const clean = isoDate.slice(0, 10);
  const [yStr, mStr, dStr] = clean.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (!year || !month || !day) return clean;
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function formatShortMonthLabel(month: string): string {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr);
  const mIdx = Number(mStr) - 1;
  if (!year || Number.isNaN(mIdx) || mIdx < 0 || mIdx > 11) return month;
  const d = new Date(Date.UTC(year, mIdx, 1));
  return new Intl.DateTimeFormat('en-PK', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

export function diffDaysBetweenIsoDates(olderIso: string, newerIso: string): number {
  const d1 = Date.parse(`${olderIso.slice(0, 10)}T00:00:00Z`);
  const d2 = Date.parse(`${newerIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d1) || Number.isNaN(d2)) return 0;
  return Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
}

export function calculateChangePercent(
  current: Decimal,
  previous: Decimal
): Decimal | null {
  if (previous.isZero()) {
    return null;
  }
  return current
    .minus(previous)
    .dividedBy(previous.abs())
    .times(100)
    .toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
}

// ============================================================================
// 0. OVERVIEW ("FLOW") REPORT
// ============================================================================

export interface OverviewReportResult {
  fromDate: string;
  toDate: string;
  rawMaterials: {
    openingValue: Decimal;
    openingRockTons: Decimal;
    openingChemicalBags: Decimal;
    purchasesValue: Decimal;
    purchasedRockTons: Decimal;
    purchasedChemicalBags: Decimal;
    usedInProductionValue: Decimal;
    usedRockTons: Decimal;
    usedChemicalBags: Decimal;
    closingValue: Decimal;
    closingRockTons: Decimal;
    closingChemicalBags: Decimal;
  };
  powder: {
    openingValue: Decimal;
    openingTons: Decimal;
    costOfPowderMade: Decimal;
    powderMadeTons: Decimal;
    costOfPowderSold: Decimal;
    powderSoldTons: Decimal;
    closingValue: Decimal;
    closingTons: Decimal;
    vehiclesOnTheWayCount: number;
  };
  profit: {
    sales: Decimal;
    costOfPowderSold: Decimal;
    profitOnSales: Decimal;
    expenses: Decimal;
    salaries: Decimal;
    netProfit: Decimal;
  };
  moneyInAndOut: {
    receivedFromCustomers: Decimal;
    paidToSuppliers: Decimal;
    expensesPaid: Decimal;
    salariesPaid: Decimal;
    advancesGiven: Decimal;
    netCashMovement: Decimal;
  };
  consistencyCheck: ReturnType<typeof calculateAccountingInventoryInvariant>;
}

export function calculateOverviewReport(
  records: AllCompanyRecords,
  filters: {
    fromDate?: string;
    toDate?: string;
  } = {}
): OverviewReportResult {
  const fromDate = (filters.fromDate || '').slice(0, 10);
  const toDate = (filters.toDate || '').slice(0, 10);

  // Opening inventory snapshot (strictly before fromDate)
  const hasFromDate = Boolean(fromDate);
  const openingAsOf = hasFromDate ? getDayBeforeIsoDate(fromDate) : undefined;
  const openingSnap = hasFromDate
    ? getInventorySnapshot({
        catalogItems: records.items,
        purchases: records.purchases,
        batches: records.batches,
        dispatches: records.dispatches,
        asOfDate: openingAsOf,
      })
    : null;

  // Closing inventory snapshot (as of toDate, or all-time if empty)
  const closingSnap = getInventorySnapshot({
    catalogItems: records.items,
    purchases: records.purchases,
    batches: records.batches,
    dispatches: records.dispatches,
    asOfDate: toDate || undefined,
  });

  const openingRawValue = openingSnap ? openingSnap.rawMaterialsValue : new Decimal(0);
  const openingRockTons = openingSnap
    ? openingSnap.rockItems.reduce(
        (sum, r) => roundWeight(sum.plus(r.stock)),
        new Decimal(0)
      )
    : new Decimal(0);
  const openingChemBags = openingSnap
    ? openingSnap.chemicalItems.reduce(
        (sum, c) => roundWeight(sum.plus(c.stock)),
        new Decimal(0)
      )
    : new Decimal(0);

  const closingRockTons = closingSnap.rockItems.reduce(
    (sum, r) => roundWeight(sum.plus(r.stock)),
    new Decimal(0)
  );
  const closingChemBags = closingSnap.chemicalItems.reduce(
    (sum, c) => roundWeight(sum.plus(c.stock)),
    new Decimal(0)
  );

  const openingPowderValue = openingSnap ? openingSnap.powder.totalValue : new Decimal(0);
  const openingPowderTons = openingSnap ? openingSnap.powder.stock : new Decimal(0);

  // Purchases in period
  let purchasesValue = new Decimal(0);
  let purchasedRockTons = new Decimal(0);
  let purchasedChemicalBags = new Decimal(0);
  let paidOnPurchasesInPeriod = new Decimal(0);

  for (const p of records.purchases) {
    if (p.status !== 'active') continue;
    const pDate = p.date.slice(0, 10);
    if (fromDate && pDate < fromDate) continue;
    if (toDate && pDate > toDate) continue;

    purchasesValue = roundMoney(purchasesValue.plus(roundMoney(p.totalAmount)));
    paidOnPurchasesInPeriod = roundMoney(
      paidOnPurchasesInPeriod.plus(roundMoney(p.paidNow))
    );

    const lines = extractNormalizedPurchaseLines(p);
    for (const l of lines) {
      if (l.kind === 'rock') {
        purchasedRockTons = roundWeight(purchasedRockTons.plus(l.quantity));
      } else {
        purchasedChemicalBags = roundWeight(purchasedChemicalBags.plus(l.quantity));
      }
    }
  }

  // Batches in period (used in production & cost of powder made)
  let usedInProductionValue = new Decimal(0);
  let usedRockTons = new Decimal(0);
  let usedChemicalBags = new Decimal(0);
  let powderMadeTons = new Decimal(0);

  for (const b of records.batches) {
    if (b.status !== 'active') continue;
    const bDate = b.date.slice(0, 10);
    if (fromDate && bDate < fromDate) continue;
    if (toDate && bDate > toDate) continue;

    usedInProductionValue = roundMoney(
      usedInProductionValue.plus(roundMoney(b.totalCostSnapshot))
    );
    usedRockTons = roundWeight(usedRockTons.plus(roundWeight(b.rockTons)));
    for (const u of b.chemicalUsages) {
      usedChemicalBags = roundWeight(usedChemicalBags.plus(roundWeight(u.bags)));
    }
    powderMadeTons = roundWeight(powderMadeTons.plus(roundWeight(b.finalProductTons)));
  }

  const costOfPowderMade = usedInProductionValue;

  // Sales & Cost of powder sold in period
  const dispatchById = new Map<string, Dispatch>();
  for (const d of records.dispatches) {
    dispatchById.set(d.id, d);
  }

  let sales = new Decimal(0);
  let costOfPowderSold = new Decimal(0);
  let powderSoldTons = new Decimal(0);
  const countedDispatchIds = new Set<string>();

  for (const bill of records.bills) {
    if (bill.status !== 'active') continue;
    const bDate = bill.date.slice(0, 10);
    if (fromDate && bDate < fromDate) continue;
    if (toDate && bDate > toDate) continue;

    sales = roundMoney(sales.plus(roundMoney(bill.totalAmount)));
    powderSoldTons = roundWeight(
      powderSoldTons.plus(roundWeight(bill.receivedWeightTons))
    );

    const linkedDisp = bill.dispatchId ? dispatchById.get(bill.dispatchId) : undefined;
    const billCogs =
      bill.costOfPowderSoldSnapshot ??
      linkedDisp?.costOfPowderSoldSnapshot ??
      linkedDisp?.cogsSnapshot ??
      '0';
    costOfPowderSold = roundMoney(costOfPowderSold.plus(roundMoney(billCogs)));
    if (bill.dispatchId) {
      countedDispatchIds.add(bill.dispatchId);
    }
  }

  // Fallback for sold dispatches without an entry in countedDispatchIds
  for (const d of records.dispatches) {
    if (d.status !== 'active') continue;
    if (!d.billId || !d.receivedWeightTons) continue;
    if (countedDispatchIds.has(d.id)) continue;
    const sDate = (d.saleDate || d.dateTime).slice(0, 10);
    if (fromDate && sDate < fromDate) continue;
    if (toDate && sDate > toDate) continue;

    const dispCogs = d.costOfPowderSoldSnapshot ?? d.cogsSnapshot ?? '0';
    costOfPowderSold = roundMoney(costOfPowderSold.plus(roundMoney(dispCogs)));
    powderSoldTons = roundWeight(powderSoldTons.plus(roundWeight(d.receivedWeightTons)));
  }

  // Expenses in period
  let expenses = new Decimal(0);
  for (const e of records.expenses) {
    if (e.status !== 'active') continue;
    const eDate = e.date.slice(0, 10);
    if (fromDate && eDate < fromDate) continue;
    if (toDate && eDate > toDate) continue;
    expenses = roundMoney(expenses.plus(roundMoney(e.amount)));
  }

  // Salaries in period (matched by salary month within [fromMonth, toMonth])
  const fromMonth = fromDate ? fromDate.slice(0, 7) : '';
  const toMonth = toDate ? toDate.slice(0, 7) : '';
  let salaries = new Decimal(0);
  let salariesPaid = new Decimal(0);

  for (const s of records.salaries) {
    if (s.status !== 'active') continue;
    if (fromMonth && s.month < fromMonth) continue;
    if (toMonth && s.month > toMonth) continue;

    const gross = roundMoney(roundMoney(s.basicSalary).plus(roundMoney(s.bonus)));
    salaries = roundMoney(salaries.plus(gross));
    if (isSalaryRecordPaid(s)) {
      salariesPaid = roundMoney(salariesPaid.plus(roundMoney(s.netPayable)));
    }
  }

  const profitOnSales = roundMoney(sales.minus(costOfPowderSold));
  const netProfit = roundMoney(profitOnSales.minus(expenses).minus(salaries));

  // Money in and out
  let receivedFromCustomers = new Decimal(0);
  for (const cp of records.customerPayments) {
    if (cp.status !== 'active') continue;
    const cpDate = cp.date.slice(0, 10);
    if (fromDate && cpDate < fromDate) continue;
    if (toDate && cpDate > toDate) continue;
    receivedFromCustomers = roundMoney(
      receivedFromCustomers.plus(roundMoney(cp.amount))
    );
  }

  let supplierPaymentsOnly = new Decimal(0);
  for (const sp of records.supplierPayments) {
    if (sp.status !== 'active') continue;
    const spDate = sp.date.slice(0, 10);
    if (fromDate && spDate < fromDate) continue;
    if (toDate && spDate > toDate) continue;
    supplierPaymentsOnly = roundMoney(supplierPaymentsOnly.plus(roundMoney(sp.amount)));
  }

  const paidToSuppliers = roundMoney(paidOnPurchasesInPeriod.plus(supplierPaymentsOnly));

  let advancesGiven = new Decimal(0);
  for (const adv of records.advances) {
    if (adv.status !== 'active') continue;
    const aDate = adv.date.slice(0, 10);
    if (fromDate && aDate < fromDate) continue;
    if (toDate && aDate > toDate) continue;
    advancesGiven = roundMoney(advancesGiven.plus(roundMoney(adv.amount)));
  }

  const netCashMovement = roundMoney(
    receivedFromCustomers
      .minus(paidToSuppliers)
      .minus(expenses)
      .minus(salariesPaid)
      .minus(advancesGiven)
  );

  const consistencyCheck = calculateAccountingInventoryInvariant({
    purchases: records.purchases,
    items: records.items,
    batches: records.batches,
    dispatches: records.dispatches,
    bills: records.bills,
    asOfDate: toDate || undefined,
  });

  return {
    fromDate,
    toDate,
    rawMaterials: {
      openingValue: openingRawValue,
      openingRockTons,
      openingChemicalBags: openingChemBags,
      purchasesValue,
      purchasedRockTons,
      purchasedChemicalBags,
      usedInProductionValue,
      usedRockTons,
      usedChemicalBags,
      closingValue: closingSnap.rawMaterialsValue,
      closingRockTons,
      closingChemicalBags: closingChemBags,
    },
    powder: {
      openingValue: openingPowderValue,
      openingTons: openingPowderTons,
      costOfPowderMade,
      powderMadeTons,
      costOfPowderSold,
      powderSoldTons,
      closingValue: closingSnap.powder.totalValue,
      closingTons: closingSnap.powder.stock,
      vehiclesOnTheWayCount: closingSnap.vehiclesOnTheWayCount,
    },
    profit: {
      sales,
      costOfPowderSold,
      profitOnSales,
      expenses,
      salaries,
      netProfit,
    },
    moneyInAndOut: {
      receivedFromCustomers,
      paidToSuppliers,
      expensesPaid: expenses,
      salariesPaid,
      advancesGiven,
      netCashMovement,
    },
    consistencyCheck,
  };
}

// ============================================================================
// 1. PROFIT AND LOSS REPORT (MONTHLY)
// ============================================================================

export interface ProfitAndLossLine {
  key: string;
  label: string;
  infoText?: string;
  kind:
    | 'revenue'
    | 'cogs'
    | 'subtotal'
    | 'expense_category'
    | 'salaries'
    | 'salary_employee'
    | 'net_profit';
  currentAmount: Decimal;
  previousAmount: Decimal;
  difference: Decimal;
  changePercent: Decimal | null;
}

export interface ProfitAndLossSixMonthPoint {
  month: string;
  label: string;
  sales: number;
  expenses: number;
  salaries: number;
  netProfit: number;
}

export interface ProfitAndLossReportResult {
  month: string;
  previousMonth: string;
  sales: Decimal;
  cogs: Decimal;
  grossProfit: Decimal;
  expenses: Decimal;
  salaries: Decimal;
  netProfit: Decimal;
  tonsSold: Decimal;
  profitPerTonSold: Decimal;
  profitMarginPercent: Decimal;
  netMarginPercent: Decimal;
  prevSales: Decimal;
  prevCogs: Decimal;
  prevGrossProfit: Decimal;
  prevExpenses: Decimal;
  prevSalaries: Decimal;
  prevNetProfit: Decimal;
  expenseCategoryLines: ProfitAndLossLine[];
  salaryEmployeeLines: ProfitAndLossLine[];
  lines: ProfitAndLossLine[];
  sixMonthTrend: ProfitAndLossSixMonthPoint[];
}

export function calculateProfitAndLossReport(
  records: AllCompanyRecords,
  month: string
): ProfitAndLossReportResult {
  const previousMonth = getPreviousYearMonth(month);

  const currProfit = calculateMonthlyProfitFromRecords({
    month,
    bills: records.bills,
    dispatches: records.dispatches,
    expenses: records.expenses,
    salaries: records.salaries,
  });

  const prevProfit = calculateMonthlyProfitFromRecords({
    month: previousMonth,
    bills: records.bills,
    dispatches: records.dispatches,
    expenses: records.expenses,
    salaries: records.salaries,
  });

  // Calculate tons sold in current month for Profit per ton sold card
  let tonsSold = new Decimal(0);
  for (const b of records.bills) {
    if (b.status === 'active' && b.date.startsWith(month)) {
      tonsSold = roundWeight(tonsSold.plus(roundWeight(b.receivedWeightTons)));
    }
  }

  const profitPerTonSold = tonsSold.gt(0)
    ? roundMoney(currProfit.grossProfit.dividedBy(tonsSold))
    : new Decimal(0);

  const profitMarginPercent = currProfit.sales.gt(0)
    ? currProfit.grossProfit
        .dividedBy(currProfit.sales)
        .times(100)
        .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
    : new Decimal(0);

  const netMarginPercent = currProfit.sales.gt(0)
    ? currProfit.netProfit
        .dividedBy(currProfit.sales)
        .times(100)
        .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
    : new Decimal(0);

  const currExpAnalysis = calculateMonthlyExpensesAnalysis({
    expenses: records.expenses,
    month,
    categoryLabels: records.categoryLabels,
  });

  const prevExpAnalysis = calculateMonthlyExpensesAnalysis({
    expenses: records.expenses,
    month: previousMonth,
    categoryLabels: records.categoryLabels,
  });

  // Collect all categories present in current or previous month
  const catOrder: string[] = [];
  const catLabelMap = new Map<string, string>();
  const currCatMap = new Map<string, Decimal>();
  const prevCatMap = new Map<string, Decimal>();

  for (const item of currExpAnalysis.categoryBreakdown) {
    if (!catOrder.includes(item.category)) catOrder.push(item.category);
    catLabelMap.set(item.category, item.label);
    currCatMap.set(item.category, item.amount);
  }
  for (const item of prevExpAnalysis.categoryBreakdown) {
    if (!catOrder.includes(item.category)) catOrder.push(item.category);
    if (!catLabelMap.has(item.category)) catLabelMap.set(item.category, item.label);
    prevCatMap.set(item.category, item.amount);
  }

  const expenseCategoryLines: ProfitAndLossLine[] = catOrder.map((cat) => {
    const currAmt = currCatMap.get(cat) ?? new Decimal(0);
    const prevAmt = prevCatMap.get(cat) ?? new Decimal(0);
    return {
      key: `exp_${cat}`,
      label: `${catLabelMap.get(cat) || cat}`,
      kind: 'expense_category',
      currentAmount: currAmt,
      previousAmount: prevAmt,
      difference: roundMoney(currAmt.minus(prevAmt)),
      changePercent: calculateChangePercent(currAmt, prevAmt),
    };
  });

  // Collect employee salary breakdown for current and previous month
  const empOrder: string[] = [];
  const empNameMap = new Map<string, string>();
  const currEmpSalMap = new Map<string, Decimal>();
  const prevEmpSalMap = new Map<string, Decimal>();

  for (const s of records.salaries) {
    if (s.status !== 'active') continue;
    const gross = roundMoney(roundMoney(s.basicSalary).plus(roundMoney(s.bonus)));
    if (s.month === month) {
      if (!empOrder.includes(s.employeeId)) empOrder.push(s.employeeId);
      empNameMap.set(s.employeeId, s.employeeName);
      currEmpSalMap.set(
        s.employeeId,
        roundMoney((currEmpSalMap.get(s.employeeId) ?? new Decimal(0)).plus(gross))
      );
    } else if (s.month === previousMonth) {
      if (!empOrder.includes(s.employeeId)) empOrder.push(s.employeeId);
      if (!empNameMap.has(s.employeeId)) empNameMap.set(s.employeeId, s.employeeName);
      prevEmpSalMap.set(
        s.employeeId,
        roundMoney((prevEmpSalMap.get(s.employeeId) ?? new Decimal(0)).plus(gross))
      );
    }
  }

  const salaryEmployeeLines: ProfitAndLossLine[] = empOrder.map((empId) => {
    const currAmt = currEmpSalMap.get(empId) ?? new Decimal(0);
    const prevAmt = prevEmpSalMap.get(empId) ?? new Decimal(0);
    return {
      key: `sal_${empId}`,
      label: empNameMap.get(empId) || 'Employee',
      kind: 'salary_employee',
      currentAmount: currAmt,
      previousAmount: prevAmt,
      difference: roundMoney(currAmt.minus(prevAmt)),
      changePercent: calculateChangePercent(currAmt, prevAmt),
    };
  });

  const lines: ProfitAndLossLine[] = [
    {
      key: 'sales',
      label: 'Sales (powder sold)',
      infoText: 'Total bill amount for the powder that was sold in this month.',
      kind: 'revenue',
      currentAmount: currProfit.sales,
      previousAmount: prevProfit.sales,
      difference: roundMoney(currProfit.sales.minus(prevProfit.sales)),
      changePercent: calculateChangePercent(currProfit.sales, prevProfit.sales),
    },
    {
      key: 'cogs',
      label: 'Cost of powder sold',
      infoText: 'What the rock and chemicals cost for the powder that was sold.',
      kind: 'cogs',
      currentAmount: currProfit.cogs,
      previousAmount: prevProfit.cogs,
      difference: roundMoney(currProfit.cogs.minus(prevProfit.cogs)),
      changePercent: calculateChangePercent(currProfit.cogs, prevProfit.cogs),
    },
    {
      key: 'gross_profit',
      label: 'Profit on sales',
      infoText: 'Sales minus the cost of the powder that was sold.',
      kind: 'subtotal',
      currentAmount: currProfit.grossProfit,
      previousAmount: prevProfit.grossProfit,
      difference: roundMoney(currProfit.grossProfit.minus(prevProfit.grossProfit)),
      changePercent: calculateChangePercent(
        currProfit.grossProfit,
        prevProfit.grossProfit
      ),
    },
    ...expenseCategoryLines,
    {
      key: 'total_expenses',
      label: 'Expenses',
      infoText: 'Factory and operating expenses recorded in this month.',
      kind: 'subtotal',
      currentAmount: currProfit.expenses,
      previousAmount: prevProfit.expenses,
      difference: roundMoney(currProfit.expenses.minus(prevProfit.expenses)),
      changePercent: calculateChangePercent(currProfit.expenses, prevProfit.expenses),
    },
    {
      key: 'salaries',
      label: 'Salaries',
      infoText: 'Monthly staff salaries (basic plus bonus) for this month.',
      kind: 'salaries',
      currentAmount: currProfit.salaries,
      previousAmount: prevProfit.salaries,
      difference: roundMoney(currProfit.salaries.minus(prevProfit.salaries)),
      changePercent: calculateChangePercent(currProfit.salaries, prevProfit.salaries),
    },
    {
      key: 'net_profit',
      label: 'Net profit',
      infoText: 'Final profit or loss after subtracting expenses and salaries from profit on sales.',
      kind: 'net_profit',
      currentAmount: currProfit.netProfit,
      previousAmount: prevProfit.netProfit,
      difference: roundMoney(currProfit.netProfit.minus(prevProfit.netProfit)),
      changePercent: calculateChangePercent(currProfit.netProfit, prevProfit.netProfit),
    },
  ];

  // 6-month chart series ending at `month`
  const sixMonthTrend: ProfitAndLossSixMonthPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = shiftYearMonth(month, -i);
    const mProfit = calculateMonthlyProfitFromRecords({
      month: m,
      bills: records.bills,
      dispatches: records.dispatches,
      expenses: records.expenses,
      salaries: records.salaries,
    });
    sixMonthTrend.push({
      month: m,
      label: formatShortMonthLabel(m),
      sales: mProfit.sales.toNumber(),
      expenses: mProfit.expenses.plus(mProfit.salaries).toNumber(),
      salaries: mProfit.salaries.toNumber(),
      netProfit: mProfit.netProfit.toNumber(),
    });
  }

  return {
    month,
    previousMonth,
    sales: currProfit.sales,
    cogs: currProfit.cogs,
    grossProfit: currProfit.grossProfit,
    expenses: currProfit.expenses,
    salaries: currProfit.salaries,
    netProfit: currProfit.netProfit,
    tonsSold,
    profitPerTonSold,
    profitMarginPercent,
    netMarginPercent,
    prevSales: prevProfit.sales,
    prevCogs: prevProfit.cogs,
    prevGrossProfit: prevProfit.grossProfit,
    prevExpenses: prevProfit.expenses,
    prevSalaries: prevProfit.salaries,
    prevNetProfit: prevProfit.netProfit,
    expenseCategoryLines,
    salaryEmployeeLines,
    lines,
    sixMonthTrend,
  };
}

// ============================================================================
// 2. SALES BY CUSTOMER AND BY DATE REPORT
// ============================================================================

export interface SalesByDateRow {
  billId: string;
  docNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  vehicleNumber: string;
  receivedTons: Decimal;
  ratePerTon: Decimal;
  amount: Decimal;
  cost: Decimal;
  profit: Decimal;
  paidAmount: Decimal;
  balance: Decimal;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
}

export interface SalesByCustomerRow {
  customerId: string;
  customerName: string;
  city: string;
  billsCount: number;
  receivedTons: Decimal;
  amount: Decimal;
  cost: Decimal;
  profit: Decimal;
  paidAmount: Decimal;
  balance: Decimal;
}

export interface SalesMonthlyTonsChartPoint {
  month: string;
  label: string;
  tons: number;
  amount: number;
  profit: number;
}

export interface SalesReportResult {
  billRows: SalesByDateRow[];
  customerRows: SalesByCustomerRow[];
  tonsSoldByMonth: SalesMonthlyTonsChartPoint[];
  totals: {
    billsCount: number;
    receivedTons: Decimal;
    amount: Decimal;
    cost: Decimal;
    profit: Decimal;
    paidAmount: Decimal;
    balance: Decimal;
  };
}

export function calculateSalesReport(
  records: AllCompanyRecords,
  filters: {
    fromDate?: string;
    toDate?: string;
    customerId?: string;
    search?: string;
  } = {}
): SalesReportResult {
  // Compute FIFO bill allocations per customer so paid/balance on each bill is exact
  const allocationByBillId = new Map<string, AllocatedBillSummary>();
  const customerCityMap = new Map<string, string>();
  const dispatchById = new Map<string, Dispatch>();

  for (const d of records.dispatches) {
    dispatchById.set(d.id, d);
  }

  for (const cust of records.customers) {
    customerCityMap.set(cust.id, cust.city || '—');
    const custBills = records.bills.filter((b) => b.customerId === cust.id);
    const custPays = records.customerPayments.filter((p) => p.customerId === cust.id);
    const ledger = calculateCustomerLedgerAndAllocations({
      openingBalance: cust.openingBalance,
      bills: custBills,
      payments: custPays,
    });
    for (const alloc of ledger.billAllocations) {
      allocationByBillId.set(alloc.billId, alloc);
    }
  }

  const q = (filters.search || '').trim().toLowerCase();

  const activeBills = records.bills
    .filter((b) => b.status === 'active')
    .filter((b) => {
      const bDate = b.date.slice(0, 10);
      if (filters.fromDate && bDate < filters.fromDate) return false;
      if (filters.toDate && bDate > filters.toDate) return false;
      if (filters.customerId && b.customerId !== filters.customerId) return false;
      if (q) {
        const matchDoc = b.docNumber.toLowerCase().includes(q);
        const matchCust = b.customerName.toLowerCase().includes(q);
        const matchVeh = (b.vehicleNumber || '').toLowerCase().includes(q);
        if (!matchDoc && !matchCust && !matchVeh) return false;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber));

  let totalTons = new Decimal(0);
  let totalAmount = new Decimal(0);
  let totalCost = new Decimal(0);
  let totalProfit = new Decimal(0);
  let totalPaid = new Decimal(0);
  let totalBalance = new Decimal(0);

  const byCustomerMap = new Map<string, SalesByCustomerRow>();
  const monthlyTonsMap = new Map<
    string,
    { tons: Decimal; amount: Decimal; profit: Decimal }
  >();

  const billRows: SalesByDateRow[] = activeBills.map((b) => {
    const alloc = allocationByBillId.get(b.id);
    const linkedDisp = b.dispatchId ? dispatchById.get(b.dispatchId) : undefined;
    const tons = roundWeight(b.receivedWeightTons);
    const rate = roundMoney(b.ratePerTon);
    const amount = roundMoney(b.totalAmount);
    const rawCogs =
      b.costOfPowderSoldSnapshot ??
      linkedDisp?.costOfPowderSoldSnapshot ??
      linkedDisp?.cogsSnapshot ??
      '0';
    const cost = roundMoney(rawCogs);
    const profit = roundMoney(amount.minus(cost));

    const paidAmount = alloc ? alloc.paidAmount : new Decimal(0);
    const balance = alloc ? alloc.remainingAmount : amount;
    const paymentStatus = alloc ? alloc.paymentStatus : 'unpaid';

    totalTons = roundWeight(totalTons.plus(tons));
    totalAmount = roundMoney(totalAmount.plus(amount));
    totalCost = roundMoney(totalCost.plus(cost));
    totalProfit = roundMoney(totalProfit.plus(profit));
    totalPaid = roundMoney(totalPaid.plus(paidAmount));
    totalBalance = roundMoney(totalBalance.plus(balance));

    const bMonth = b.date.slice(0, 7);
    const prevMonthStat = monthlyTonsMap.get(bMonth) || {
      tons: new Decimal(0),
      amount: new Decimal(0),
      profit: new Decimal(0),
    };
    monthlyTonsMap.set(bMonth, {
      tons: roundWeight(prevMonthStat.tons.plus(tons)),
      amount: roundMoney(prevMonthStat.amount.plus(amount)),
      profit: roundMoney(prevMonthStat.profit.plus(profit)),
    });

    const existingCust = byCustomerMap.get(b.customerId);
    if (existingCust) {
      existingCust.billsCount += 1;
      existingCust.receivedTons = roundWeight(existingCust.receivedTons.plus(tons));
      existingCust.amount = roundMoney(existingCust.amount.plus(amount));
      existingCust.cost = roundMoney(existingCust.cost.plus(cost));
      existingCust.profit = roundMoney(existingCust.profit.plus(profit));
      existingCust.paidAmount = roundMoney(existingCust.paidAmount.plus(paidAmount));
      existingCust.balance = roundMoney(existingCust.balance.plus(balance));
    } else {
      byCustomerMap.set(b.customerId, {
        customerId: b.customerId,
        customerName: b.customerName,
        city: customerCityMap.get(b.customerId) || '—',
        billsCount: 1,
        receivedTons: tons,
        amount,
        cost,
        profit,
        paidAmount,
        balance,
      });
    }

    return {
      billId: b.id,
      docNumber: b.docNumber,
      date: b.date.slice(0, 10),
      customerId: b.customerId,
      customerName: b.customerName,
      vehicleNumber: b.vehicleNumber || linkedDisp?.vehicleNumber || '—',
      receivedTons: tons,
      ratePerTon: rate,
      amount,
      cost,
      profit,
      paidAmount,
      balance,
      paymentStatus,
    };
  });

  // Also build monthly tons sold chart across active bills (filtered by customer if selected)
  const allCustomerBills = records.bills.filter(
    (b) =>
      b.status === 'active' &&
      (!filters.customerId || b.customerId === filters.customerId)
  );
  const allMonthsMap = new Map<
    string,
    { tons: Decimal; amount: Decimal; profit: Decimal }
  >();
  for (const b of allCustomerBills) {
    const m = b.date.slice(0, 7);
    const linkedDisp = b.dispatchId ? dispatchById.get(b.dispatchId) : undefined;
    const tons = roundWeight(b.receivedWeightTons);
    const amount = roundMoney(b.totalAmount);
    const cost = roundMoney(
      b.costOfPowderSoldSnapshot ??
        linkedDisp?.costOfPowderSoldSnapshot ??
        linkedDisp?.cogsSnapshot ??
        '0'
    );
    const profit = roundMoney(amount.minus(cost));
    const prev = allMonthsMap.get(m) || {
      tons: new Decimal(0),
      amount: new Decimal(0),
      profit: new Decimal(0),
    };
    allMonthsMap.set(m, {
      tons: roundWeight(prev.tons.plus(tons)),
      amount: roundMoney(prev.amount.plus(amount)),
      profit: roundMoney(prev.profit.plus(profit)),
    });
  }

  const chartSourceMap =
    monthlyTonsMap.size >= 2 ? monthlyTonsMap : allMonthsMap;
  const tonsSoldByMonth: SalesMonthlyTonsChartPoint[] = Array.from(
    chartSourceMap.entries()
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, data]) => ({
      month,
      label: formatShortMonthLabel(month),
      tons: data.tons.toNumber(),
      amount: data.amount.toNumber(),
      profit: data.profit.toNumber(),
    }));

  const customerRows = Array.from(byCustomerMap.values()).sort((a, b) =>
    b.amount.comparedTo(a.amount)
  );

  return {
    billRows,
    customerRows,
    tonsSoldByMonth,
    totals: {
      billsCount: billRows.length,
      receivedTons: totalTons,
      amount: totalAmount,
      cost: totalCost,
      profit: totalProfit,
      paidAmount: totalPaid,
      balance: totalBalance,
    },
  };
}

// ============================================================================
// 3. PURCHASES BY SUPPLIER AND BY ITEM REPORT
// ============================================================================

export interface PurchaseLineReportRow {
  id: string;
  purchaseId: string;
  docNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  itemId: string;
  itemName: string;
  kind: 'rock' | 'chemical';
  unit: 'ton' | 'bag';
  quantity: Decimal;
  rate: Decimal;
  amount: Decimal;
}

export interface PurchasesBySupplierRow {
  supplierId: string;
  supplierName: string;
  purchasesCount: number;
  rockTons: Decimal;
  chemicalBags: Decimal;
  totalAmount: Decimal;
  paidOnPurchases: Decimal;
  balanceOnPurchases: Decimal;
}

export interface PurchasesByItemRow {
  itemId: string;
  itemName: string;
  kind: 'rock' | 'chemical';
  unit: 'ton' | 'bag';
  quantity: Decimal;
  avgRate: Decimal;
  amount: Decimal;
}

export interface PurchaseRateTrendPoint {
  date: string;
  label: string;
  docNumber: string;
  itemId: string;
  itemName: string;
  unit: 'ton' | 'bag';
  rate: number;
  quantity: number;
}

export interface PurchasesReportResult {
  lineRows: PurchaseLineReportRow[];
  supplierRows: PurchasesBySupplierRow[];
  itemRows: PurchasesByItemRow[];
  rateTrendByItem: PurchaseRateTrendPoint[];
  totals: {
    linesCount: number;
    rockTons: Decimal;
    chemicalBags: Decimal;
    amount: Decimal;
    paidOnPurchases: Decimal;
    balanceOnPurchases: Decimal;
  };
}

export function extractNormalizedPurchaseLines(purchase: Purchase): Array<{
  itemId: string;
  itemName: string;
  kind: 'rock' | 'chemical';
  unit: 'ton' | 'bag';
  quantity: Decimal;
  rate: Decimal;
  amount: Decimal;
}> {
  if (purchase.lines && purchase.lines.length > 0) {
    return purchase.lines.map((l) => ({
      itemId: l.itemId,
      itemName: l.itemName,
      kind: l.kind,
      unit: l.kind === 'rock' ? 'ton' : 'bag',
      quantity: roundWeight(l.quantity),
      rate: roundMoney(l.rate),
      amount: roundMoney(l.amount),
    }));
  }

  const out: Array<{
    itemId: string;
    itemName: string;
    kind: 'rock' | 'chemical';
    unit: 'ton' | 'bag';
    quantity: Decimal;
    rate: Decimal;
    amount: Decimal;
  }> = [];

  if (purchase.rockLine && roundWeight(purchase.rockLine.tons).gt(0)) {
    out.push({
      itemId: purchase.rockLine.itemId,
      itemName: purchase.rockLine.itemName,
      kind: 'rock',
      unit: 'ton',
      quantity: roundWeight(purchase.rockLine.tons),
      rate: roundMoney(purchase.rockLine.ratePerTon),
      amount: roundMoney(purchase.rockLine.amount),
    });
  }

  for (const c of purchase.chemicalLines || []) {
    if (roundWeight(c.bags).gt(0)) {
      out.push({
        itemId: c.itemId,
        itemName: c.itemName,
        kind: 'chemical',
        unit: 'bag',
        quantity: roundWeight(c.bags),
        rate: roundMoney(c.ratePerBag),
        amount: roundMoney(c.amount),
      });
    }
  }

  return out;
}

export function calculatePurchasesReport(
  records: AllCompanyRecords,
  filters: {
    fromDate?: string;
    toDate?: string;
    supplierId?: string;
    itemId?: string;
    search?: string;
  } = {}
): PurchasesReportResult {
  const q = (filters.search || '').trim().toLowerCase();

  const activePurchases = records.purchases
    .filter((p) => p.status === 'active')
    .filter((p) => {
      const pDate = p.date.slice(0, 10);
      if (filters.fromDate && pDate < filters.fromDate) return false;
      if (filters.toDate && pDate > filters.toDate) return false;
      if (filters.supplierId && p.supplierId !== filters.supplierId) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber));

  const lineRows: PurchaseLineReportRow[] = [];
  const bySupplierMap = new Map<string, PurchasesBySupplierRow>();
  const byItemMap = new Map<string, PurchasesByItemRow>();

  let totalRockTons = new Decimal(0);
  let totalChemBags = new Decimal(0);
  let totalAmount = new Decimal(0);
  let totalPaidOnPurchases = new Decimal(0);
  let totalBalanceOnPurchases = new Decimal(0);

  for (const p of activePurchases) {
    const rawLines = extractNormalizedPurchaseLines(p);
    const matchingLines = rawLines.filter((l) => {
      if (filters.itemId && l.itemId !== filters.itemId) return false;
      if (q) {
        const matchDoc = p.docNumber.toLowerCase().includes(q);
        const matchSup = p.supplierName.toLowerCase().includes(q);
        const matchItem = l.itemName.toLowerCase().includes(q);
        if (!matchDoc && !matchSup && !matchItem) return false;
      }
      return true;
    });

    if (matchingLines.length === 0) continue;

    let purchaseFilteredAmount = new Decimal(0);
    let purchaseFilteredRock = new Decimal(0);
    let purchaseFilteredBags = new Decimal(0);

    matchingLines.forEach((l, idx) => {
      lineRows.push({
        id: `${p.id}_${idx}`,
        purchaseId: p.id,
        docNumber: p.docNumber,
        date: p.date.slice(0, 10),
        supplierId: p.supplierId,
        supplierName: p.supplierName,
        itemId: l.itemId,
        itemName: l.itemName,
        kind: l.kind,
        unit: l.unit,
        quantity: l.quantity,
        rate: l.rate,
        amount: l.amount,
      });

      purchaseFilteredAmount = roundMoney(purchaseFilteredAmount.plus(l.amount));
      if (l.kind === 'rock') {
        purchaseFilteredRock = roundWeight(purchaseFilteredRock.plus(l.quantity));
        totalRockTons = roundWeight(totalRockTons.plus(l.quantity));
      } else {
        purchaseFilteredBags = roundWeight(purchaseFilteredBags.plus(l.quantity));
        totalChemBags = roundWeight(totalChemBags.plus(l.quantity));
      }
      totalAmount = roundMoney(totalAmount.plus(l.amount));

      const existingItem = byItemMap.get(l.itemId);
      if (existingItem) {
        existingItem.quantity = roundWeight(existingItem.quantity.plus(l.quantity));
        existingItem.amount = roundMoney(existingItem.amount.plus(l.amount));
        existingItem.avgRate = existingItem.quantity.gt(0)
          ? roundMoney(existingItem.amount.dividedBy(existingItem.quantity))
          : new Decimal(0);
      } else {
        byItemMap.set(l.itemId, {
          itemId: l.itemId,
          itemName: l.itemName,
          kind: l.kind,
          unit: l.unit,
          quantity: l.quantity,
          avgRate: l.quantity.gt(0) ? roundMoney(l.amount.dividedBy(l.quantity)) : l.rate,
          amount: l.amount,
        });
      }
    });

    // If item filter is active, paidNow is prorated or capped at purchaseFilteredAmount; otherwise full paidNow
    const paidForThisPurchase = filters.itemId
      ? Decimal.min(roundMoney(p.paidNow), purchaseFilteredAmount)
      : roundMoney(p.paidNow);
    const balForThisPurchase = roundMoney(purchaseFilteredAmount.minus(paidForThisPurchase));

    totalPaidOnPurchases = roundMoney(totalPaidOnPurchases.plus(paidForThisPurchase));
    totalBalanceOnPurchases = roundMoney(totalBalanceOnPurchases.plus(balForThisPurchase));

    const existingSup = bySupplierMap.get(p.supplierId);
    if (existingSup) {
      existingSup.purchasesCount += 1;
      existingSup.rockTons = roundWeight(existingSup.rockTons.plus(purchaseFilteredRock));
      existingSup.chemicalBags = roundWeight(
        existingSup.chemicalBags.plus(purchaseFilteredBags)
      );
      existingSup.totalAmount = roundMoney(
        existingSup.totalAmount.plus(purchaseFilteredAmount)
      );
      existingSup.paidOnPurchases = roundMoney(
        existingSup.paidOnPurchases.plus(paidForThisPurchase)
      );
      existingSup.balanceOnPurchases = roundMoney(
        existingSup.balanceOnPurchases.plus(balForThisPurchase)
      );
    } else {
      bySupplierMap.set(p.supplierId, {
        supplierId: p.supplierId,
        supplierName: p.supplierName,
        purchasesCount: 1,
        rockTons: purchaseFilteredRock,
        chemicalBags: purchaseFilteredBags,
        totalAmount: purchaseFilteredAmount,
        paidOnPurchases: paidForThisPurchase,
        balanceOnPurchases: balForThisPurchase,
      });
    }
  }

  const rateTrendByItem: PurchaseRateTrendPoint[] = [...lineRows]
    .sort((a, b) => a.date.localeCompare(b.date) || a.docNumber.localeCompare(b.docNumber))
    .map((r) => ({
      date: r.date,
      label: `${r.itemName} (${r.date.slice(5)})`,
      docNumber: r.docNumber,
      itemId: r.itemId,
      itemName: r.itemName,
      unit: r.unit,
      rate: r.rate.toNumber(),
      quantity: r.quantity.toNumber(),
    }));

  return {
    lineRows,
    supplierRows: Array.from(bySupplierMap.values()).sort((a, b) =>
      b.totalAmount.comparedTo(a.totalAmount)
    ),
    itemRows: Array.from(byItemMap.values()).sort((a, b) =>
      b.amount.comparedTo(a.amount)
    ),
    rateTrendByItem,
    totals: {
      linesCount: lineRows.length,
      rockTons: totalRockTons,
      chemicalBags: totalChemBags,
      amount: totalAmount,
      paidOnPurchases: totalPaidOnPurchases,
      balanceOnPurchases: totalBalanceOnPurchases,
    },
  };
}

// ============================================================================
// 4. STOCK SUMMARY WITH VALUE REPORT (USES getInventorySnapshot)
// ============================================================================

export interface StockSummaryRow {
  itemId: string;
  itemName: string;
  kind: 'rock' | 'chemical' | 'final_product';
  typeLabel: string;
  unit: 'ton' | 'bag';
  quantity: Decimal;
  avgCost: Decimal;
  totalValue: Decimal;
  isLow: boolean;
}

export interface StockSummaryReportResult {
  rows: StockSummaryRow[];
  rockTons: Decimal;
  chemicalBags: Decimal;
  finalProductTons: Decimal;
  rawMaterialsValue: Decimal;
  powderValue: Decimal;
  vehiclesOnTheWayCount: number;
  totalValue: Decimal;
}

export function calculateStockSummaryReport(
  records: AllCompanyRecords,
  filters: {
    kind?: 'all' | 'rock' | 'chemical' | 'final_product';
    search?: string;
    asOfDate?: string;
  } = {}
): StockSummaryReportResult {
  const snapshot = getInventorySnapshot({
    catalogItems: records.items,
    purchases: records.purchases,
    batches: records.batches,
    dispatches: records.dispatches,
    asOfDate: filters.asOfDate,
  });

  const powderName = records.customFinalProductName || snapshot.powder.itemName;

  const allItems = [
    ...snapshot.rockItems,
    ...snapshot.chemicalItems,
    {
      ...snapshot.powder,
      itemName: powderName,
    },
  ];

  const q = (filters.search || '').trim().toLowerCase();
  const kindFilter = filters.kind || 'all';

  let rockTons = new Decimal(0);
  let chemicalBags = new Decimal(0);
  let finalProductTons = new Decimal(0);
  let totalValue = new Decimal(0);

  const rows: StockSummaryRow[] = [];

  for (const st of allItems) {
    if (kindFilter !== 'all' && st.kind !== kindFilter) continue;
    if (q && !st.itemName.toLowerCase().includes(q)) continue;

    const typeLabel =
      st.kind === 'rock'
        ? 'Rock'
        : st.kind === 'chemical'
          ? 'Chemical'
          : 'Final powder';

    if (st.kind === 'rock') {
      rockTons = roundWeight(rockTons.plus(st.stock));
    } else if (st.kind === 'chemical') {
      chemicalBags = roundWeight(chemicalBags.plus(st.stock));
    } else {
      finalProductTons = roundWeight(finalProductTons.plus(st.stock));
    }

    totalValue = roundMoney(totalValue.plus(st.totalValue));

    rows.push({
      itemId: st.itemId,
      itemName: st.itemName,
      kind: st.kind,
      typeLabel,
      unit: st.unit,
      quantity: st.stock,
      avgCost: st.avgCost,
      totalValue: st.totalValue,
      isLow: st.stock.lte(0),
    });
  }

  return {
    rows,
    rockTons,
    chemicalBags,
    finalProductTons,
    rawMaterialsValue: snapshot.rawMaterialsValue,
    powderValue: snapshot.powder.totalValue,
    vehiclesOnTheWayCount: snapshot.vehiclesOnTheWayCount,
    totalValue,
  };
}

// ============================================================================
// 5. PRODUCTION SUMMARY REPORT
// ============================================================================

export interface ProductionReportRow {
  batchId: string;
  docNumber: string;
  date: string;
  rockItemName: string;
  rockTons: Decimal;
  chemicalsSummary: string;
  chemicalBags: Decimal;
  finalProductTons: Decimal;
  costPerTon: Decimal;
  totalCost: Decimal;
}

export interface ProductionSummaryReportResult {
  rows: ProductionReportRow[];
  totals: {
    batchesCount: number;
    rockTons: Decimal;
    chemicalBags: Decimal;
    finalProductTons: Decimal;
    avgCostPerTon: Decimal;
    totalCost: Decimal;
  };
}

export function calculateProductionSummaryReport(
  records: AllCompanyRecords,
  filters: {
    fromDate?: string;
    toDate?: string;
    search?: string;
  } = {}
): ProductionSummaryReportResult {
  const q = (filters.search || '').trim().toLowerCase();

  const activeBatches = records.batches
    .filter((b) => b.status === 'active')
    .filter((b) => {
      const bDate = b.date.slice(0, 10);
      if (filters.fromDate && bDate < filters.fromDate) return false;
      if (filters.toDate && bDate > filters.toDate) return false;
      if (q) {
        const chemText = b.chemicalUsages.map((c) => c.itemName).join(' ').toLowerCase();
        if (
          !b.docNumber.toLowerCase().includes(q) &&
          !b.rockItemName.toLowerCase().includes(q) &&
          !chemText.includes(q)
        ) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber));

  let totalRockTons = new Decimal(0);
  let totalChemBags = new Decimal(0);
  let totalFinalTons = new Decimal(0);
  let totalCost = new Decimal(0);

  const rows: ProductionReportRow[] = activeBatches.map((b) => {
    const rockTons = roundWeight(b.rockTons);
    const chemBags = b.chemicalUsages.reduce(
      (acc, u) => roundWeight(acc.plus(roundWeight(u.bags))),
      new Decimal(0)
    );
    const chemSummary =
      b.chemicalUsages.length > 0
        ? b.chemicalUsages
            .map((u) => `${u.itemName} (${roundWeight(u.bags).toString()} bag)`)
            .join(', ')
        : '—';
    const finalTons = roundWeight(b.finalProductTons);
    const costPerTon = roundMoney(b.costPerTonSnapshot);
    const batchCost = roundMoney(b.totalCostSnapshot);

    totalRockTons = roundWeight(totalRockTons.plus(rockTons));
    totalChemBags = roundWeight(totalChemBags.plus(chemBags));
    totalFinalTons = roundWeight(totalFinalTons.plus(finalTons));
    totalCost = roundMoney(totalCost.plus(batchCost));

    return {
      batchId: b.id,
      docNumber: b.docNumber,
      date: b.date.slice(0, 10),
      rockItemName: b.rockItemName,
      rockTons,
      chemicalsSummary: chemSummary,
      chemicalBags: chemBags,
      finalProductTons: finalTons,
      costPerTon,
      totalCost: batchCost,
    };
  });

  const avgCostPerTon = totalFinalTons.gt(0)
    ? roundMoney(totalCost.dividedBy(totalFinalTons))
    : new Decimal(0);

  return {
    rows,
    totals: {
      batchesCount: rows.length,
      rockTons: totalRockTons,
      chemicalBags: totalChemBags,
      finalProductTons: totalFinalTons,
      avgCostPerTon,
      totalCost,
    },
  };
}

// ============================================================================
// 6. CUSTOMERS (RECEIVABLES & ADVANCES WITH 0-30, 31-60, 60+ DAYS AGEING)
// ============================================================================

export interface ReceivableCustomerRow {
  customerId: string;
  customerName: string;
  phone: string;
  city: string;
  totalSold: Decimal;
  totalPaid: Decimal;
  lastPaymentDate: string | null;
  lastPaymentAmount: Decimal;
  days0To30: Decimal;
  days31To60: Decimal;
  days60Plus: Decimal;
  advanceAvailable: Decimal;
  balance: Decimal; // Positive receivable (0 when customer is in advance)
  netLedgerBalance: Decimal; // Positive (owes MK) or negative (advance)
}

export interface OverdueBillAlertItem {
  billId: string;
  docNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  ageDays: number;
  remainingAmount: Decimal;
}

export interface ReceivablesReportResult {
  rows: ReceivableCustomerRow[];
  overdueBills30Plus: OverdueBillAlertItem[];
  totals: {
    customersCount: number;
    totalSold: Decimal;
    totalPaid: Decimal;
    days0To30: Decimal;
    days31To60: Decimal;
    days60Plus: Decimal;
    advanceAvailable: Decimal;
    balance: Decimal;
  };
}

export function calculateReceivablesReport(
  records: AllCompanyRecords,
  filters: {
    search?: string;
    city?: string;
    customerId?: string;
    onlyPositive?: boolean;
    asOfDate?: string;
  } = {}
): ReceivablesReportResult {
  const q = (filters.search || '').trim().toLowerCase();
  const cityFilter = (filters.city || '').trim().toLowerCase();
  const onlyPositive = filters.onlyPositive ?? true;

  // Determine reference date for aging: explicit asOfDate, or latest bill/payment date, or today
  let refDate = filters.asOfDate || '';
  if (!refDate) {
    for (const b of records.bills) {
      if (b.status === 'active' && b.date.slice(0, 10) > refDate) {
        refDate = b.date.slice(0, 10);
      }
    }
    if (!refDate) {
      refDate = new Date().toISOString().slice(0, 10);
    }
  }

  let totalSold = new Decimal(0);
  let totalPaid = new Decimal(0);
  let total0To30 = new Decimal(0);
  let total31To60 = new Decimal(0);
  let total60Plus = new Decimal(0);
  let totalAdvance = new Decimal(0);
  let totalBalance = new Decimal(0);

  const rows: ReceivableCustomerRow[] = [];
  const overdueBills30Plus: OverdueBillAlertItem[] = [];

  const activeCustomers = records.customers
    .filter((c) => c.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const cust of activeCustomers) {
    if (filters.customerId && cust.id !== filters.customerId) continue;
    if (cityFilter && (cust.city || '').toLowerCase() !== cityFilter) continue;
    if (
      q &&
      !cust.name.toLowerCase().includes(q) &&
      !(cust.city || '').toLowerCase().includes(q) &&
      !(cust.phone || '').toLowerCase().includes(q)
    ) {
      continue;
    }

    const custBills = records.bills.filter((b) => b.customerId === cust.id);
    const custPays = records.customerPayments.filter(
      (p) => p.customerId === cust.id && p.status === 'active'
    );

    const sortedPays = [...custPays].sort(
      (a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber)
    );
    const lastPay = sortedPays[0];
    const lastPaymentDate = lastPay ? lastPay.date.slice(0, 10) : null;
    const lastPaymentAmount = lastPay ? roundMoney(lastPay.amount) : new Decimal(0);

    const ledger = calculateCustomerLedgerAndAllocations({
      openingBalance: cust.openingBalance,
      bills: custBills,
      payments: custPays,
    });

    const positiveReceivable = ledger.balance.gt(0) ? ledger.balance : new Decimal(0);
    if (onlyPositive && positiveReceivable.lte(0)) {
      continue;
    }

    let d0_30 = new Decimal(0);
    let d31_60 = new Decimal(0);
    let d60Plus = new Decimal(0);

    if (positiveReceivable.gt(0)) {
      // Unpaid portion of positive opening balance (if payments haven't covered opening balance yet)
      const unpaidOpening = Decimal.max(
        new Decimal(0),
        roundMoney(ledger.openingBalance.minus(ledger.totalPaid))
      );
      if (unpaidOpening.gt(0)) {
        d60Plus = roundMoney(d60Plus.plus(unpaidOpening));
      }

      for (const alloc of ledger.billAllocations) {
        if (alloc.remainingAmount.lte(0)) continue;
        const ageDays = diffDaysBetweenIsoDates(alloc.date, refDate);
        if (ageDays <= 30) {
          d0_30 = roundMoney(d0_30.plus(alloc.remainingAmount));
        } else if (ageDays <= 60) {
          d31_60 = roundMoney(d31_60.plus(alloc.remainingAmount));
          overdueBills30Plus.push({
            billId: alloc.billId,
            docNumber: alloc.docNumber,
            date: alloc.date,
            customerId: cust.id,
            customerName: cust.name,
            ageDays,
            remainingAmount: alloc.remainingAmount,
          });
        } else {
          d60Plus = roundMoney(d60Plus.plus(alloc.remainingAmount));
          overdueBills30Plus.push({
            billId: alloc.billId,
            docNumber: alloc.docNumber,
            date: alloc.date,
            customerId: cust.id,
            customerName: cust.name,
            ageDays,
            remainingAmount: alloc.remainingAmount,
          });
        }
      }
    }

    totalSold = roundMoney(totalSold.plus(ledger.totalSold));
    totalPaid = roundMoney(totalPaid.plus(ledger.totalPaid));
    total0To30 = roundMoney(total0To30.plus(d0_30));
    total31To60 = roundMoney(total31To60.plus(d31_60));
    total60Plus = roundMoney(total60Plus.plus(d60Plus));
    totalAdvance = roundMoney(totalAdvance.plus(ledger.advanceAvailable));
    totalBalance = roundMoney(totalBalance.plus(positiveReceivable));

    rows.push({
      customerId: cust.id,
      customerName: cust.name,
      phone: cust.phone || '—',
      city: cust.city || '—',
      totalSold: ledger.totalSold,
      totalPaid: ledger.totalPaid,
      lastPaymentDate,
      lastPaymentAmount,
      days0To30: d0_30,
      days31To60: d31_60,
      days60Plus: d60Plus,
      advanceAvailable: ledger.advanceAvailable,
      balance: positiveReceivable,
      netLedgerBalance: ledger.balance,
    });
  }

  rows.sort(
    (a, b) =>
      b.balance.comparedTo(a.balance) ||
      b.advanceAvailable.comparedTo(a.advanceAvailable)
  );

  return {
    rows,
    overdueBills30Plus,
    totals: {
      customersCount: rows.length,
      totalSold,
      totalPaid,
      days0To30: total0To30,
      days31To60: total31To60,
      days60Plus: total60Plus,
      advanceAvailable: totalAdvance,
      balance: totalBalance,
    },
  };
}

// ============================================================================
// 7. SUPPLIERS (PAYABLES REPORT)
// ============================================================================

export interface PayableSupplierRow {
  supplierId: string;
  supplierName: string;
  phone: string;
  city: string;
  openingBalance: Decimal;
  totalPurchased: Decimal;
  totalPaid: Decimal;
  lastPaymentDate: string | null;
  lastPaymentAmount: Decimal;
  balance: Decimal;
}

export interface PayablesReportResult {
  rows: PayableSupplierRow[];
  totals: {
    suppliersCount: number;
    openingBalance: Decimal;
    totalPurchased: Decimal;
    totalPaid: Decimal;
    balance: Decimal;
  };
}

export function calculatePayablesReport(
  records: AllCompanyRecords,
  filters: {
    search?: string;
    city?: string;
    supplierId?: string;
    onlyPositive?: boolean;
  } = {}
): PayablesReportResult {
  const q = (filters.search || '').trim().toLowerCase();
  const cityFilter = (filters.city || '').trim().toLowerCase();
  const onlyPositive = filters.onlyPositive ?? true;

  let totalOpening = new Decimal(0);
  let totalPurchased = new Decimal(0);
  let totalPaid = new Decimal(0);
  let totalBalance = new Decimal(0);

  const rows: PayableSupplierRow[] = [];

  const activeSuppliers = records.suppliers
    .filter((s) => s.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const sup of activeSuppliers) {
    if (filters.supplierId && sup.id !== filters.supplierId) continue;
    if (cityFilter && (sup.city || '').toLowerCase() !== cityFilter) continue;
    if (
      q &&
      !sup.name.toLowerCase().includes(q) &&
      !(sup.city || '').toLowerCase().includes(q) &&
      !(sup.phone || '').toLowerCase().includes(q)
    ) {
      continue;
    }

    const supPurchases = records.purchases.filter((p) => p.supplierId === sup.id);
    const supPayments = records.supplierPayments.filter((p) => p.supplierId === sup.id);

    // Find latest payment event (either standalone supplierPayment or paidNow on a purchase)
    const paymentEvents: Array<{ date: string; amount: Decimal }> = [];
    for (const sp of supPayments) {
      if (sp.status === 'active' && roundMoney(sp.amount).gt(0)) {
        paymentEvents.push({
          date: sp.date.slice(0, 10),
          amount: roundMoney(sp.amount),
        });
      }
    }
    for (const p of supPurchases) {
      if (p.status === 'active' && roundMoney(p.paidNow).gt(0)) {
        paymentEvents.push({
          date: p.date.slice(0, 10),
          amount: roundMoney(p.paidNow),
        });
      }
    }
    paymentEvents.sort((a, b) => b.date.localeCompare(a.date));
    const latestPay = paymentEvents[0];

    const ledger = calculateSupplierLedger({
      openingBalance: sup.openingBalance,
      purchases: supPurchases,
      payments: supPayments,
    });

    const positivePayable = ledger.balance.gt(0) ? ledger.balance : new Decimal(0);
    if (onlyPositive && positivePayable.lte(0)) {
      continue;
    }

    totalOpening = roundMoney(totalOpening.plus(ledger.openingBalance));
    totalPurchased = roundMoney(totalPurchased.plus(ledger.totalPurchased));
    totalPaid = roundMoney(totalPaid.plus(ledger.totalPaid));
    totalBalance = roundMoney(totalBalance.plus(positivePayable));

    rows.push({
      supplierId: sup.id,
      supplierName: sup.name,
      phone: sup.phone || '—',
      city: sup.city || '—',
      openingBalance: ledger.openingBalance,
      totalPurchased: ledger.totalPurchased,
      totalPaid: ledger.totalPaid,
      lastPaymentDate: latestPay ? latestPay.date : null,
      lastPaymentAmount: latestPay ? latestPay.amount : new Decimal(0),
      balance: positivePayable,
    });
  }

  rows.sort((a, b) => b.balance.comparedTo(a.balance));

  return {
    rows,
    totals: {
      suppliersCount: rows.length,
      openingBalance: totalOpening,
      totalPurchased,
      totalPaid,
      balance: totalBalance,
    },
  };
}

// ============================================================================
// 8. EXPENSES BY CATEGORY AND BY DATE REPORT
// ============================================================================

export interface ExpenseReportDateRow {
  expenseId: string;
  docNumber: string;
  date: string;
  category: string;
  categoryLabel: string;
  description: string;
  paidTo: string;
  amount: Decimal;
}

export interface ExpenseReportCategoryRow {
  category: string;
  categoryLabel: string;
  expensesCount: number;
  sharePercent: Decimal;
  amount: Decimal;
}

export interface ExpensesReportResult {
  dateRows: ExpenseReportDateRow[];
  categoryRows: ExpenseReportCategoryRow[];
  totals: {
    expensesCount: number;
    amount: Decimal;
  };
}

export function formatCategoryDisplayName(
  cat: string,
  customLabels?: Record<string, string>
): string {
  if (customLabels && customLabels[cat]) return customLabels[cat];
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
      return cat.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function calculateExpensesReport(
  records: AllCompanyRecords,
  filters: {
    fromDate?: string;
    toDate?: string;
    category?: string;
    search?: string;
  } = {}
): ExpensesReportResult {
  const q = (filters.search || '').trim().toLowerCase();

  const matching = records.expenses
    .filter((e) => e.status === 'active')
    .filter((e) => {
      const eDate = e.date.slice(0, 10);
      if (filters.fromDate && eDate < filters.fromDate) return false;
      if (filters.toDate && eDate > filters.toDate) return false;
      if (filters.category && e.category !== filters.category) return false;
      if (q) {
        const catLabel = formatCategoryDisplayName(e.category, records.categoryLabels).toLowerCase();
        if (
          !e.docNumber.toLowerCase().includes(q) &&
          !e.description.toLowerCase().includes(q) &&
          !(e.paidTo || '').toLowerCase().includes(q) &&
          !catLabel.includes(q)
        ) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber));

  let totalAmount = new Decimal(0);
  const byCatMap = new Map<string, { label: string; count: number; amount: Decimal }>();

  const dateRows: ExpenseReportDateRow[] = matching.map((e) => {
    const amt = roundMoney(e.amount);
    const catLabel = formatCategoryDisplayName(e.category, records.categoryLabels);
    totalAmount = roundMoney(totalAmount.plus(amt));

    const existingCat = byCatMap.get(e.category);
    if (existingCat) {
      existingCat.count += 1;
      existingCat.amount = roundMoney(existingCat.amount.plus(amt));
    } else {
      byCatMap.set(e.category, {
        label: catLabel,
        count: 1,
        amount: amt,
      });
    }

    return {
      expenseId: e.id,
      docNumber: e.docNumber,
      date: e.date.slice(0, 10),
      category: e.category,
      categoryLabel: catLabel,
      description: e.description || catLabel,
      paidTo: e.paidTo || '—',
      amount: amt,
    };
  });

  const categoryRows: ExpenseReportCategoryRow[] = Array.from(byCatMap.entries())
    .map(([category, data]) => ({
      category,
      categoryLabel: data.label,
      expensesCount: data.count,
      sharePercent: totalAmount.gt(0)
        ? data.amount.dividedBy(totalAmount).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
        : new Decimal(0),
      amount: data.amount,
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));

  return {
    dateRows,
    categoryRows,
    totals: {
      expensesCount: dateRows.length,
      amount: totalAmount,
    },
  };
}

// ============================================================================
// 9. SALARIES AND ADVANCES BY MONTH REPORT
// ============================================================================

export interface SalariesAndAdvancesRow {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  active: boolean;
  month: string;
  salaryDocNumber: string;
  basicSalary: Decimal;
  bonus: Decimal;
  grossSalary: Decimal;
  earlierBalance: Decimal;
  advanceDeduction: Decimal;
  netPayable: Decimal;
  paidAmount: Decimal;
  isPaid: boolean;
  advancesGivenInMonth: Decimal;
  openAdvanceBalance: Decimal;
}

export interface SalariesAndAdvancesReportResult {
  month: string;
  rows: SalariesAndAdvancesRow[];
  totals: {
    employeesCount: number;
    basicSalary: Decimal;
    bonus: Decimal;
    grossSalary: Decimal;
    earlierBalance: Decimal;
    advanceDeduction: Decimal;
    netPayable: Decimal;
    paidAmount: Decimal;
    advancesGivenInMonth: Decimal;
    openAdvanceBalance: Decimal;
  };
}

export function calculateSalariesAndAdvancesReport(
  records: AllCompanyRecords,
  filters: {
    month: string;
    employeeId?: string;
    search?: string;
  }
): SalariesAndAdvancesReportResult {
  const { month, employeeId } = filters;
  const q = (filters.search || '').trim().toLowerCase();

  // Map salary records for the selected month
  const monthSalaryByEmp = new Map<string, SalaryRecord>();
  for (const s of records.salaries) {
    if (s.status === 'active' && s.month === month) {
      monthSalaryByEmp.set(s.employeeId, s);
    }
  }

  // Include active employees AND soft-deleted employees who have a salary record or advance in this historical month
  const candidateEmployees = records.employees
    .filter(
      (e) =>
        e.status === 'active' ||
        monthSalaryByEmp.has(e.id) ||
        records.advances.some(
          (a) => a.status === 'active' && a.employeeId === e.id && a.date.startsWith(month)
        )
    )
    .filter((e) => {
      if (employeeId && e.id !== employeeId) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.role.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));

  let totalBasic = new Decimal(0);
  let totalBonus = new Decimal(0);
  let totalGross = new Decimal(0);
  let totalEarlier = new Decimal(0);
  let totalAdvDed = new Decimal(0);
  let totalNet = new Decimal(0);
  let totalPaid = new Decimal(0);
  let totalAdvGivenMonth = new Decimal(0);
  let totalOpenAdv = new Decimal(0);

  const rows: SalariesAndAdvancesRow[] = [];

  for (const emp of candidateEmployees) {
    const sal = monthSalaryByEmp.get(emp.id);
    const advState = calculateEmployeeAdvancesState({
      advances: records.advances,
      salaries: records.salaries,
      employeeId: emp.id,
    });

    const advGivenInMonth = records.advances
      .filter(
        (a) =>
          a.status === 'active' &&
          a.employeeId === emp.id &&
          a.date.startsWith(month)
      )
      .reduce((acc, a) => roundMoney(acc.plus(roundMoney(a.amount))), new Decimal(0));

    if (!sal && advGivenInMonth.lte(0) && advState.openBalance.lte(0) && emp.status !== 'active') {
      continue;
    }

    const basic = sal ? roundMoney(sal.basicSalary) : new Decimal(0);
    const bonus = sal ? roundMoney(sal.bonus) : new Decimal(0);
    const gross = roundMoney(basic.plus(bonus));
    const earlierBalance = sal ? roundMoney(sal.earlierBalance ?? 0) : new Decimal(0);
    const advDed = sal ? roundMoney(sal.advanceDeduction) : new Decimal(0);
    const netPayable = sal ? roundMoney(sal.netPayable) : new Decimal(0);
    const paid = sal ? isSalaryRecordPaid(sal) : false;
    const paidAmount = paid ? roundMoney(sal?.paidAmount ?? netPayable) : new Decimal(0);

    totalBasic = roundMoney(totalBasic.plus(basic));
    totalBonus = roundMoney(totalBonus.plus(bonus));
    totalGross = roundMoney(totalGross.plus(gross));
    totalEarlier = roundMoney(totalEarlier.plus(earlierBalance));
    totalAdvDed = roundMoney(totalAdvDed.plus(advDed));
    totalNet = roundMoney(totalNet.plus(netPayable));
    totalPaid = roundMoney(totalPaid.plus(paidAmount));
    totalAdvGivenMonth = roundMoney(totalAdvGivenMonth.plus(advGivenInMonth));
    totalOpenAdv = roundMoney(totalOpenAdv.plus(advState.openBalance));

    rows.push({
      employeeId: emp.id,
      employeeName: emp.name,
      employeeRole: emp.role,
      active: emp.status === 'active' && emp.active,
      month,
      salaryDocNumber: sal ? sal.docNumber : 'Not generated',
      basicSalary: basic,
      bonus,
      grossSalary: gross,
      earlierBalance,
      advanceDeduction: advDed,
      netPayable,
      paidAmount,
      isPaid: paid,
      advancesGivenInMonth: advGivenInMonth,
      openAdvanceBalance: advState.openBalance,
    });
  }

  return {
    month,
    rows,
    totals: {
      employeesCount: rows.length,
      basicSalary: totalBasic,
      bonus: totalBonus,
      grossSalary: totalGross,
      earlierBalance: totalEarlier,
      advanceDeduction: totalAdvDed,
      netPayable: totalNet,
      paidAmount: totalPaid,
      advancesGivenInMonth: totalAdvGivenMonth,
      openAdvanceBalance: totalOpenAdv,
    },
  };
}

// ============================================================================
// 10. UNIFIED DASHBOARD ANALYTICS (USES EXACT SAME REPORT FUNCTIONS)
// ============================================================================

export interface DashboardAnalyticsResult {
  month: string;
  // Financial KPIs (identical to Profit & Loss report + Receivables/Payables reports)
  sales: Decimal;
  cogs: Decimal;
  grossProfit: Decimal;
  expenses: Decimal;
  salaries: Decimal;
  netProfit: Decimal;
  receivables: Decimal;
  payables: Decimal;
  // Stock KPIs (identical to Stock summary report)
  rockStockTons: Decimal;
  chemicalBagsTotal: Decimal;
  finalPowderTons: Decimal;
  totalStockValue: Decimal;
  // 4 Charts
  salesVsExpenses6Months: Array<{
    month: string;
    label: string;
    sales: number;
    expenses: number;
    salaries: number;
    netProfit: number;
  }>;
  dispatchedTonsPerDay: Array<{
    date: string;
    dayLabel: string;
    tons: number;
    dispatchesCount: number;
  }>;
  expensesByCategory: Array<{
    category: string;
    label: string;
    amount: number;
    percent: number;
  }>;
  top5CustomersBySales: Array<{
    customerId: string;
    customerName: string;
    sales: number;
    billsCount: number;
  }>;
  // Needs attention items
  needsAttention: {
    waitingForWeightDispatches: Array<{
      id: string;
      docNumber: string;
      date: string;
      customerName: string;
      vehicleNumber: string;
    }>;
    overdueBills30Plus: OverdueBillAlertItem[];
    zeroOrLowStockItems: Array<{
      itemId: string;
      itemName: string;
      typeLabel: string;
      unit: 'ton' | 'bag';
      quantity: string;
    }>;
    openAdvances: Array<{
      employeeId: string;
      employeeName: string;
      role: string;
      openBalance: Decimal;
    }>;
  };
}

export function calculateDashboardAnalytics(
  records: AllCompanyRecords,
  month: string,
  asOfDate?: string
): DashboardAnalyticsResult {
  // 1. Profit & Loss for selected month
  const pnl = calculateProfitAndLossReport(records, month);

  // 2. Stock summary
  const stockReport = calculateStockSummaryReport(records);

  // 3. Receivables & Payables
  const receivablesReport = calculateReceivablesReport(records, {
    onlyPositive: true,
    asOfDate,
  });
  const payablesReport = calculatePayablesReport(records, {
    onlyPositive: true,
  });

  // 4. Chart 1: Sales vs Expenses for the last 6 months ending at `month`
  const salesVsExpenses6Months: DashboardAnalyticsResult['salesVsExpenses6Months'] = [];
  for (let i = 5; i >= 0; i--) {
    const m = shiftYearMonth(month, -i);
    const mProfit = calculateMonthlyProfitFromRecords({
      month: m,
      bills: records.bills,
      dispatches: records.dispatches,
      expenses: records.expenses,
      salaries: records.salaries,
    });
    salesVsExpenses6Months.push({
      month: m,
      label: formatShortMonthLabel(m),
      sales: mProfit.sales.toNumber(),
      expenses: mProfit.expenses.toNumber(),
      salaries: mProfit.salaries.toNumber(),
      netProfit: mProfit.netProfit.toNumber(),
    });
  }

  // 5. Chart 2: Dispatched tons per day this month (powder sold)
  const dailyTonsMap = new Map<string, { tons: Decimal; count: number }>();
  for (const d of records.dispatches) {
    if (d.status !== 'active' || !d.receivedWeightTons || !d.billId) continue;
    const saleDate = (d.saleDate || d.dateTime).slice(0, 10);
    if (!saleDate.startsWith(month)) continue;
    const prev = dailyTonsMap.get(saleDate) || { tons: new Decimal(0), count: 0 };
    dailyTonsMap.set(saleDate, {
      tons: roundWeight(prev.tons.plus(roundWeight(d.receivedWeightTons))),
      count: prev.count + 1,
    });
  }
  const dispatchedTonsPerDay = Array.from(dailyTonsMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, info]) => ({
      date,
      dayLabel: `${Number(date.slice(8, 10))} ${formatShortMonthLabel(month).split(' ')[0]}`,
      tons: info.tons.toNumber(),
      dispatchesCount: info.count,
    }));

  // 6. Chart 3: Expenses by category for selected month
  const expAnalysis = calculateMonthlyExpensesAnalysis({
    expenses: records.expenses,
    month,
    categoryLabels: records.categoryLabels,
  });
  const expensesByCategory = expAnalysis.categoryBreakdown.map((c) => ({
    category: c.category,
    label: c.label,
    amount: c.amount.toNumber(),
    percent: c.percent.toNumber(),
  }));

  // 7. Chart 4: Top 5 customers by sales in selected month
  const monthSalesReport = calculateSalesReport(records, {
    fromDate: `${month}-01`,
    toDate: `${month}-31`,
  });
  const top5CustomersBySales = monthSalesReport.customerRows.slice(0, 5).map((c) => ({
    customerId: c.customerId,
    customerName: c.customerName,
    sales: c.amount.toNumber(),
    billsCount: c.billsCount,
  }));

  // 8. Needs attention list
  const waitingForWeightDispatches = records.dispatches
    .filter((d) => d.status === 'active' && (!d.billId || !d.receivedWeightTons))
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
    .map((d) => ({
      id: d.id,
      docNumber: d.docNumber,
      date: d.dateTime.slice(0, 10),
      customerName: d.customerName,
      vehicleNumber: d.vehicleNumber,
    }));

  const zeroOrLowStockItems = stockReport.rows
    .filter((r) => r.isLow)
    .map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      typeLabel: r.typeLabel,
      unit: r.unit,
      quantity: r.quantity.toString(),
    }));

  const openAdvances: DashboardAnalyticsResult['needsAttention']['openAdvances'] = [];
  for (const emp of records.employees.filter((e) => e.status === 'active')) {
    const st = calculateEmployeeAdvancesState({
      advances: records.advances,
      salaries: records.salaries,
      employeeId: emp.id,
    });
    if (st.openBalance.gt(0)) {
      openAdvances.push({
        employeeId: emp.id,
        employeeName: emp.name,
        role: emp.role,
        openBalance: st.openBalance,
      });
    }
  }

  return {
    month,
    sales: pnl.sales,
    cogs: pnl.cogs,
    grossProfit: pnl.grossProfit,
    expenses: pnl.expenses,
    salaries: pnl.salaries,
    netProfit: pnl.netProfit,
    receivables: receivablesReport.totals.balance,
    payables: payablesReport.totals.balance,
    rockStockTons: stockReport.rockTons,
    chemicalBagsTotal: stockReport.chemicalBags,
    finalPowderTons: stockReport.finalProductTons,
    totalStockValue: stockReport.totalValue,
    salesVsExpenses6Months,
    dispatchedTonsPerDay,
    expensesByCategory,
    top5CustomersBySales,
    needsAttention: {
      waitingForWeightDispatches,
      overdueBills30Plus: receivablesReport.overdueBills30Plus,
      zeroOrLowStockItems,
      openAdvances,
    },
  };
}
