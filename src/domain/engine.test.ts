import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  calculateAccountingInventoryInvariant,
  calculateCustomerLedgerAndAllocations,
  calculateDispatchAndBill,
  calculateEmployeeLedger,
  calculateEmployeeMonthlySalaryRow,
  calculateEmployeeRunningBalance,
  calculateItemAverageFromPurchases,
  calculateMonthlyExpensesAnalysis,
  calculateMonthlyProfit,
  calculateProductionBatchCost,
  calculateSalaryAndAdvanceStep,
  getInventorySnapshot,
  replayInventoryState,
  validateStockAvailability,
} from './engine';
import type {
  Bill,
  CompanySettings,
  Customer,
  CustomerPayment,
  Dispatch,
  Employee,
  EmployeeAdvance,
  Expense,
  Item,
  ProductionBatch,
  Purchase,
  SalaryRecord,
  Supplier,
} from './types';

function buildInMemoryTestDataset(companyId: string): {
  items: Item[];
  suppliers: Supplier[];
  customers: Customer[];
  purchases: Purchase[];
  batches: ProductionBatch[];
  dispatches: Dispatch[];
  bills: Bill[];
  customerPayments: CustomerPayment[];
  expenses: Expense[];
  employees: Employee[];
  advances: EmployeeAdvance[];
  salaries: SalaryRecord[];
} {
  const now = '2026-03-01T08:00:00.000Z';

  const items: Item[] = [
    {
      id: `${companyId}_item_rock_1`,
      companyId,
      name: 'Phosphate Rock (Grade A)',
      kind: 'rock',
      notes: 'Primary raw rock for melting and grinding',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${companyId}_item_chem_a`,
      companyId,
      name: 'Sulfuric Binder A-10',
      kind: 'chemical',
      notes: 'Standard 50kg bag chemical additive',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${companyId}_item_chem_b`,
      companyId,
      name: 'Calcined Soda S-40',
      kind: 'chemical',
      notes: 'Secondary neutralizing chemical bag',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${companyId}_item_chem_c`,
      companyId,
      name: 'Flux Stabilizer F-12',
      kind: 'chemical',
      notes: 'Fine grain flow agent bag',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const suppliers: Supplier[] = [
    {
      id: `${companyId}_sup_1`,
      companyId,
      name: 'Khyber Minerals & Quarry',
      phone: '0300-8512400',
      city: 'Abbottabad',
      openingBalance: '0',
      notes: 'Main rock supplier',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${companyId}_sup_2`,
      companyId,
      name: 'Ittehad Industrial Chemicals',
      phone: '0321-4490112',
      city: 'Sheikhupura',
      openingBalance: '45000',
      notes: 'Chemical bags supplier',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const customers: Customer[] = [
    {
      id: `${companyId}_cus_1`,
      companyId,
      name: 'Al-Noor Agro Traders',
      phone: '0301-7741220',
      city: 'Multan',
      address: 'Grain Market Gate 4, Multan',
      openingBalance: '0',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${companyId}_cus_2`,
      companyId,
      name: 'Crescent Foundry & Ceramics',
      phone: '0333-6109884',
      city: 'Gujranwala',
      address: 'GT Road Industrial Zone, Gujranwala',
      openingBalance: '120000',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${companyId}_cus_3`,
      companyId,
      name: 'Chenab Glass & Silicates',
      phone: '0345-8823109',
      city: 'Faisalabad',
      address: 'Sargodha Road, Faisalabad',
      openingBalance: '0',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const purchases: Purchase[] = [
    {
      id: `${companyId}_pur_1`,
      companyId,
      docNumber: 'PUR-2026-0001',
      date: '2026-01-05',
      supplierId: suppliers[0].id,
      supplierName: suppliers[0].name,
      lines: [
        {
          id: 'pl_1',
          itemId: items[0].id,
          itemName: items[0].name,
          kind: 'rock',
          quantity: '50',
          rate: '12000',
          amount: '600000',
        },
        {
          id: 'pl_2',
          itemId: items[1].id,
          itemName: items[1].name,
          kind: 'chemical',
          quantity: '150',
          rate: '3200',
          amount: '480000',
        },
        {
          id: 'pl_3',
          itemId: items[2].id,
          itemName: items[2].name,
          kind: 'chemical',
          quantity: '100',
          rate: '2500',
          amount: '250000',
        },
      ],
      rockLine: {
        itemId: items[0].id,
        itemName: items[0].name,
        tons: '50',
        ratePerTon: '12000',
        amount: '600000',
      },
      chemicalLines: [
        {
          id: 'pl_2',
          itemId: items[1].id,
          itemName: items[1].name,
          bags: '150',
          ratePerBag: '3200',
          amount: '480000',
        },
        {
          id: 'pl_3',
          itemId: items[2].id,
          itemName: items[2].name,
          bags: '100',
          ratePerBag: '2500',
          amount: '250000',
        },
      ],
      subtotal: '1330000',
      otherCharges: '0',
      totalAmount: '1330000',
      paidNow: '1000000',
      paymentMethod: 'bank',
      notes: 'Opening quarter stock intake',
      status: 'active',
      createdAt: '2026-01-05T10:00:00.000Z',
      updatedAt: '2026-01-05T10:00:00.000Z',
    },
    {
      id: `${companyId}_pur_2`,
      companyId,
      docNumber: 'PUR-2026-0002',
      date: '2026-02-02',
      supplierId: suppliers[1].id,
      supplierName: suppliers[1].name,
      lines: [
        {
          id: 'pl_4',
          itemId: items[0].id,
          itemName: items[0].name,
          kind: 'rock',
          quantity: '40',
          rate: '12500',
          amount: '500000',
        },
        {
          id: 'pl_5',
          itemId: items[3].id,
          itemName: items[3].name,
          kind: 'chemical',
          quantity: '80',
          rate: '1800',
          amount: '144000',
        },
      ],
      rockLine: {
        itemId: items[0].id,
        itemName: items[0].name,
        tons: '40',
        ratePerTon: '12500',
        amount: '500000',
      },
      chemicalLines: [
        {
          id: 'pl_5',
          itemId: items[3].id,
          itemName: items[3].name,
          bags: '80',
          ratePerBag: '1800',
          amount: '144000',
        },
      ],
      subtotal: '644000',
      otherCharges: '0',
      totalAmount: '644000',
      paidNow: '500000',
      paymentMethod: 'bank',
      status: 'active',
      createdAt: '2026-02-02T11:00:00.000Z',
      updatedAt: '2026-02-02T11:00:00.000Z',
    },
    {
      id: `${companyId}_pur_3`,
      companyId,
      docNumber: 'PUR-2026-0003',
      date: '2026-03-03',
      supplierId: suppliers[0].id,
      supplierName: suppliers[0].name,
      lines: [
        {
          id: 'pl_6',
          itemId: items[0].id,
          itemName: items[0].name,
          kind: 'rock',
          quantity: '30',
          rate: '12450',
          amount: '373500',
        },
        {
          id: 'pl_7',
          itemId: items[1].id,
          itemName: items[1].name,
          kind: 'chemical',
          quantity: '60',
          rate: '3200',
          amount: '192000',
        },
      ],
      rockLine: {
        itemId: items[0].id,
        itemName: items[0].name,
        tons: '30',
        ratePerTon: '12450',
        amount: '373500',
      },
      chemicalLines: [
        {
          id: 'pl_7',
          itemId: items[1].id,
          itemName: items[1].name,
          bags: '60',
          ratePerBag: '3200',
          amount: '192000',
        },
      ],
      subtotal: '565500',
      otherCharges: '0',
      totalAmount: '565500',
      paidNow: '300000',
      paymentMethod: 'bank',
      status: 'active',
      createdAt: '2026-03-03T09:30:00.000Z',
      updatedAt: '2026-03-03T09:30:00.000Z',
    },
  ];

  const batches: ProductionBatch[] = [
    {
      id: `${companyId}_bat_1`,
      companyId,
      docNumber: 'BATCH-2026-0001',
      date: '2026-01-12',
      rockItemId: items[0].id,
      rockItemName: items[0].name,
      rockTons: '30',
      rockAvgCostSnapshot: '12000.00',
      rockCostSnapshot: '360000.00',
      chemicalUsages: [
        {
          itemId: items[1].id,
          itemName: items[1].name,
          bags: '60',
          avgCostPerBagSnapshot: '3200.00',
          lineCostSnapshot: '192000.00',
        },
        {
          itemId: items[2].id,
          itemName: items[2].name,
          bags: '40',
          avgCostPerBagSnapshot: '2500.00',
          lineCostSnapshot: '100000.00',
        },
      ],
      finalProductTons: '28',
      totalCostSnapshot: '652000.00',
      costPerTonSnapshot: '23285.71',
      rawCostPerTonSnapshot: '23285.714285714285714',
      notes: 'January primary run',
      status: 'active',
      createdAt: '2026-01-12T15:00:00.000Z',
      updatedAt: '2026-01-12T15:00:00.000Z',
    },
    {
      id: `${companyId}_bat_2`,
      companyId,
      docNumber: 'BATCH-2026-0002',
      date: '2026-02-10',
      rockItemId: items[0].id,
      rockItemName: items[0].name,
      rockTons: '25',
      rockAvgCostSnapshot: '12333.33',
      rockCostSnapshot: '308333.33',
      chemicalUsages: [
        {
          itemId: items[1].id,
          itemName: items[1].name,
          bags: '50',
          avgCostPerBagSnapshot: '3200.00',
          lineCostSnapshot: '160000.00',
        },
        {
          itemId: items[3].id,
          itemName: items[3].name,
          bags: '30',
          avgCostPerBagSnapshot: '1800.00',
          lineCostSnapshot: '54000.00',
        },
      ],
      finalProductTons: '24',
      totalCostSnapshot: '522333.33',
      costPerTonSnapshot: '21763.89',
      rawCostPerTonSnapshot: '21763.888888888888889',
      notes: 'February high-yield run',
      status: 'active',
      createdAt: '2026-02-10T16:00:00.000Z',
      updatedAt: '2026-02-10T16:00:00.000Z',
    },
    {
      id: `${companyId}_bat_3`,
      companyId,
      docNumber: 'BATCH-2026-0003',
      date: '2026-03-08',
      rockItemId: items[0].id,
      rockItemName: items[0].name,
      rockTons: '28',
      rockAvgCostSnapshot: '12386.36',
      rockCostSnapshot: '346818.18',
      chemicalUsages: [
        {
          itemId: items[1].id,
          itemName: items[1].name,
          bags: '50',
          avgCostPerBagSnapshot: '3200.00',
          lineCostSnapshot: '160000.00',
        },
        {
          itemId: items[2].id,
          itemName: items[2].name,
          bags: '30',
          avgCostPerBagSnapshot: '2500.00',
          lineCostSnapshot: '75000.00',
        },
      ],
      finalProductTons: '26',
      totalCostSnapshot: '581818.18',
      costPerTonSnapshot: '22377.62',
      rawCostPerTonSnapshot: '22377.622377622377622',
      notes: 'March standard batch',
      status: 'active',
      createdAt: '2026-03-08T14:00:00.000Z',
      updatedAt: '2026-03-08T14:00:00.000Z',
    },
  ];

  const dispatches: Dispatch[] = [
    {
      id: `${companyId}_dsp_1`,
      companyId,
      docNumber: 'DSP-2026-0001',
      dateTime: '2026-01-18T11:30:00.000Z',
      customerId: customers[0].id,
      customerName: customers[0].name,
      vehicleNumber: 'MNA-4412',
      driverName: 'Muhammad Nawaz',
      driverPhone: '0302-4412990',
      destinationCity: 'Multan',
      bagsCount: 300,
      receivedWeightTons: '14.85',
      ratePerTon: '36000',
      saleDate: '2026-01-19',
      avgCostPerTonSnapshot: '23285.71',
      rawAvgCostPerTonSnapshot: '23285.714285714285714',
      cogsSnapshot: '345792.86',
      costOfPowderSoldSnapshot: '345792.86',
      billId: `${companyId}_bill_1`,
      billDocNumber: 'INV-2026-0001',
      status: 'active',
      createdAt: '2026-01-18T11:30:00.000Z',
      updatedAt: '2026-01-19T14:00:00.000Z',
    },
    {
      id: `${companyId}_dsp_2`,
      companyId,
      docNumber: 'DSP-2026-0002',
      dateTime: '2026-02-15T10:15:00.000Z',
      customerId: customers[1].id,
      customerName: customers[1].name,
      vehicleNumber: 'GA-8821',
      driverName: 'Riaz Ahmed',
      driverPhone: '0334-9910234',
      destinationCity: 'Gujranwala',
      bagsCount: 360,
      receivedWeightTons: '17.95',
      ratePerTon: '36500',
      saleDate: '2026-02-16',
      avgCostPerTonSnapshot: '22300.65',
      rawAvgCostPerTonSnapshot: '22300.653194263363755',
      cogsSnapshot: '400296.72',
      costOfPowderSoldSnapshot: '400296.72',
      billId: `${companyId}_bill_2`,
      billDocNumber: 'INV-2026-0002',
      status: 'active',
      createdAt: '2026-02-15T10:15:00.000Z',
      updatedAt: '2026-02-16T16:00:00.000Z',
    },
    {
      id: `${companyId}_dsp_3`,
      companyId,
      docNumber: 'DSP-2026-0003',
      dateTime: '2026-03-14T09:45:00.000Z',
      customerId: customers[2].id,
      customerName: customers[2].name,
      vehicleNumber: 'FSD-7105',
      driverName: 'Sajjad Hussain',
      driverPhone: '0345-7105221',
      destinationCity: 'Faisalabad',
      bagsCount: 200,
      receivedWeightTons: '9.96',
      ratePerTon: '37000',
      saleDate: '2026-03-15',
      avgCostPerTonSnapshot: '22344.91',
      rawAvgCostPerTonSnapshot: '22344.913764532828695',
      cogsSnapshot: '222555.34',
      costOfPowderSoldSnapshot: '222555.34',
      billId: `${companyId}_bill_3`,
      billDocNumber: 'INV-2026-0003',
      status: 'active',
      createdAt: '2026-03-14T09:45:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
    },
    {
      id: `${companyId}_dsp_4`,
      companyId,
      docNumber: 'DSP-2026-0004',
      dateTime: '2026-03-18T08:20:00.000Z',
      customerId: customers[0].id,
      customerName: customers[0].name,
      vehicleNumber: 'LES-3920',
      driverName: 'Bashir Ahmad',
      driverPhone: '0300-4119022',
      destinationCity: 'Multan',
      bagsCount: 240,
      notes: 'Dispatched from factory gate, awaiting Multan weighbridge slip',
      status: 'active',
      createdAt: '2026-03-18T08:20:00.000Z',
      updatedAt: '2026-03-18T08:20:00.000Z',
    },
    {
      id: `${companyId}_dsp_5`,
      companyId,
      docNumber: 'DSP-2026-0005',
      dateTime: '2026-03-19T14:10:00.000Z',
      customerId: customers[1].id,
      customerName: customers[1].name,
      vehicleNumber: 'LHR-9081',
      driverName: 'Zulfiqar Ali',
      driverPhone: '0321-8871203',
      destinationCity: 'Gujranwala',
      bagsCount: 160,
      notes: 'Evening truck loaded, in transit to Gujranwala',
      status: 'active',
      createdAt: '2026-03-19T14:10:00.000Z',
      updatedAt: '2026-03-19T14:10:00.000Z',
    },
  ];

  const bills: Bill[] = [
    {
      id: `${companyId}_bill_1`,
      companyId,
      docNumber: 'INV-2026-0001',
      date: '2026-01-19',
      customerId: customers[0].id,
      customerName: customers[0].name,
      dispatchId: dispatches[0].id,
      dispatchDocNumber: dispatches[0].docNumber,
      dispatchDateTime: dispatches[0].dateTime,
      vehicleNumber: dispatches[0].vehicleNumber,
      driverName: dispatches[0].driverName,
      bagsCount: 300,
      receivedWeightTons: '14.85',
      ratePerTon: '36000',
      subtotal: '534600.00',
      discount: '0.00',
      totalAmount: '534600.00',
      costOfPowderSoldSnapshot: '345792.86',
      status: 'active',
      createdAt: '2026-01-19T14:00:00.000Z',
      updatedAt: '2026-01-25T10:00:00.000Z',
    },
    {
      id: `${companyId}_bill_2`,
      companyId,
      docNumber: 'INV-2026-0002',
      date: '2026-02-16',
      customerId: customers[1].id,
      customerName: customers[1].name,
      dispatchId: dispatches[1].id,
      dispatchDocNumber: dispatches[1].docNumber,
      dispatchDateTime: dispatches[1].dateTime,
      vehicleNumber: dispatches[1].vehicleNumber,
      driverName: dispatches[1].driverName,
      bagsCount: 360,
      receivedWeightTons: '17.95',
      ratePerTon: '36500',
      subtotal: '655175.00',
      discount: '5175.00',
      totalAmount: '650000.00',
      costOfPowderSoldSnapshot: '400296.72',
      status: 'active',
      createdAt: '2026-02-16T16:00:00.000Z',
      updatedAt: '2026-02-20T11:00:00.000Z',
    },
    {
      id: `${companyId}_bill_3`,
      companyId,
      docNumber: 'INV-2026-0003',
      date: '2026-03-15',
      customerId: customers[2].id,
      customerName: customers[2].name,
      dispatchId: dispatches[2].id,
      dispatchDocNumber: dispatches[2].docNumber,
      dispatchDateTime: dispatches[2].dateTime,
      vehicleNumber: dispatches[2].vehicleNumber,
      driverName: dispatches[2].driverName,
      bagsCount: 200,
      receivedWeightTons: '9.96',
      ratePerTon: '37000',
      subtotal: '368520.00',
      discount: '0.00',
      totalAmount: '368520.00',
      costOfPowderSoldSnapshot: '222555.34',
      status: 'active',
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
    },
  ];

  const customerPayments: CustomerPayment[] = [
    {
      id: `${companyId}_rcp_1`,
      companyId,
      docNumber: 'RCV-2026-0001',
      date: '2026-01-25',
      customerId: customers[0].id,
      customerName: customers[0].name,
      amount: '534600',
      method: 'bank',
      reference: 'HBL-TXN-88912',
      notes: 'Full payment against INV-2026-0001',
      status: 'active',
      createdAt: '2026-01-25T10:00:00.000Z',
      updatedAt: '2026-01-25T10:00:00.000Z',
    },
    {
      id: `${companyId}_rcp_2`,
      companyId,
      docNumber: 'RCV-2026-0002',
      date: '2026-02-20',
      customerId: customers[1].id,
      customerName: customers[1].name,
      amount: '400000',
      method: 'cheque',
      reference: 'MCB-CHQ-441902',
      notes: 'Part payment on account',
      status: 'active',
      createdAt: '2026-02-20T11:00:00.000Z',
      updatedAt: '2026-02-20T11:00:00.000Z',
    },
  ];

  const expenses: Expense[] = [
    {
      id: `${companyId}_exp_1`,
      companyId,
      docNumber: 'EXP-2026-0001',
      date: '2026-01-28',
      category: 'electricity',
      description: 'Electricity and fuel',
      amount: '48000',
      paidTo: 'LESCO Industrial Billing',
      method: 'bank',
      status: 'active',
      createdAt: '2026-01-28T09:00:00.000Z',
      updatedAt: '2026-01-28T09:00:00.000Z',
    },
    {
      id: `${companyId}_exp_2`,
      companyId,
      docNumber: 'EXP-2026-0002',
      date: '2026-02-26',
      category: 'electricity',
      description: 'Electricity and fuel',
      amount: '52000',
      paidTo: 'LESCO Industrial Billing',
      method: 'bank',
      status: 'active',
      createdAt: '2026-02-26T09:00:00.000Z',
      updatedAt: '2026-02-26T09:00:00.000Z',
    },
    {
      id: `${companyId}_exp_3`,
      companyId,
      docNumber: 'EXP-2026-0003',
      date: '2026-03-10',
      category: 'repair',
      description: 'Repair and maintenance',
      amount: '18500',
      paidTo: 'Tariq Engineering Works',
      method: 'cash',
      status: 'active',
      createdAt: '2026-03-10T13:00:00.000Z',
      updatedAt: '2026-03-10T13:00:00.000Z',
    },
    {
      id: `${companyId}_exp_4`,
      companyId,
      docNumber: 'EXP-2026-0004',
      date: '2026-03-18',
      category: 'fuel',
      description: 'Electricity and fuel',
      amount: '24000',
      paidTo: 'PSO Sitara Filling Station',
      method: 'cash',
      status: 'active',
      createdAt: '2026-03-18T15:00:00.000Z',
      updatedAt: '2026-03-18T15:00:00.000Z',
    },
  ];

  const employees: Employee[] = [
    {
      id: `${companyId}_emp_1`,
      companyId,
      name: 'Master Ghulam Rasool',
      role: 'Plant Supervisor',
      phone: '0300-4198221',
      joiningDate: '2024-03-01',
      basicSalary: '65000',
      active: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${companyId}_emp_2`,
      companyId,
      name: 'Imran Masih',
      role: 'Crusher & Mill Operator',
      phone: '0322-7812390',
      joiningDate: '2024-06-15',
      basicSalary: '45000',
      active: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${companyId}_emp_3`,
      companyId,
      name: 'kashif Mehmood',
      role: 'Dispatch & Store Clerk',
      phone: '0313-5509123',
      joiningDate: '2025-01-10',
      basicSalary: '40000',
      active: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const advances: EmployeeAdvance[] = [
    {
      id: `${companyId}_adv_1`,
      companyId,
      docNumber: 'ADV-2026-0001',
      date: '2026-02-12',
      employeeId: employees[1].id,
      employeeName: employees[1].name,
      amount: '10000',
      notes: 'Medical expense at home',
      status: 'active',
      createdAt: '2026-02-12T10:00:00.000Z',
      updatedAt: '2026-02-12T10:00:00.000Z',
    },
    {
      id: `${companyId}_adv_2`,
      companyId,
      docNumber: 'ADV-2026-0002',
      date: '2026-03-07',
      employeeId: employees[0].id,
      employeeName: employees[0].name,
      amount: '15000',
      notes: 'School fee advance',
      status: 'active',
      createdAt: '2026-03-07T11:00:00.000Z',
      updatedAt: '2026-03-07T11:00:00.000Z',
    },
  ];

  const salaries: SalaryRecord[] = [
    {
      id: `${companyId}_sal_1`,
      companyId,
      docNumber: 'SAL-2026-0001',
      month: '2026-01',
      date: '2026-01-31',
      employeeId: employees[0].id,
      employeeName: employees[0].name,
      employeeRole: employees[0].role,
      basicSalary: '65000',
      bonus: '0',
      earlierBalance: '0',
      advanceDeduction: '0',
      netPayable: '65000',
      paidAmount: '65000',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      status: 'active',
      createdAt: '2026-01-31T17:00:00.000Z',
      updatedAt: '2026-01-31T17:00:00.000Z',
    },
    {
      id: `${companyId}_sal_2`,
      companyId,
      docNumber: 'SAL-2026-0002',
      month: '2026-01',
      date: '2026-01-31',
      employeeId: employees[1].id,
      employeeName: employees[1].name,
      employeeRole: employees[1].role,
      basicSalary: '45000',
      bonus: '0',
      earlierBalance: '0',
      advanceDeduction: '0',
      netPayable: '45000',
      paidAmount: '45000',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      status: 'active',
      createdAt: '2026-01-31T17:00:00.000Z',
      updatedAt: '2026-01-31T17:00:00.000Z',
    },
    {
      id: `${companyId}_sal_3`,
      companyId,
      docNumber: 'SAL-2026-0003',
      month: '2026-01',
      date: '2026-01-31',
      employeeId: employees[2].id,
      employeeName: employees[2].name,
      employeeRole: employees[2].role,
      basicSalary: '40000',
      bonus: '0',
      earlierBalance: '0',
      advanceDeduction: '0',
      netPayable: '40000',
      paidAmount: '40000',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      status: 'active',
      createdAt: '2026-01-31T17:00:00.000Z',
      updatedAt: '2026-01-31T17:00:00.000Z',
    },
    {
      id: `${companyId}_sal_4`,
      companyId,
      docNumber: 'SAL-2026-0004',
      month: '2026-02',
      date: '2026-02-28',
      employeeId: employees[0].id,
      employeeName: employees[0].name,
      employeeRole: employees[0].role,
      basicSalary: '65000',
      bonus: '0',
      earlierBalance: '0',
      advanceDeduction: '0',
      netPayable: '65000',
      paidAmount: '65000',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      status: 'active',
      createdAt: '2026-02-28T17:00:00.000Z',
      updatedAt: '2026-02-28T17:00:00.000Z',
    },
    {
      id: `${companyId}_sal_5`,
      companyId,
      docNumber: 'SAL-2026-0005',
      month: '2026-02',
      date: '2026-02-28',
      employeeId: employees[1].id,
      employeeName: employees[1].name,
      employeeRole: employees[1].role,
      basicSalary: '45000',
      bonus: '0',
      earlierBalance: '0',
      advanceDeduction: '10000',
      netPayable: '35000',
      paidAmount: '35000',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      status: 'active',
      createdAt: '2026-02-28T17:00:00.000Z',
      updatedAt: '2026-02-28T17:00:00.000Z',
    },
    {
      id: `${companyId}_sal_6`,
      companyId,
      docNumber: 'SAL-2026-0006',
      month: '2026-02',
      date: '2026-02-28',
      employeeId: employees[2].id,
      employeeName: employees[2].name,
      employeeRole: employees[2].role,
      basicSalary: '40000',
      bonus: '0',
      earlierBalance: '0',
      advanceDeduction: '0',
      netPayable: '40000',
      paidAmount: '40000',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      status: 'active',
      createdAt: '2026-02-28T17:00:00.000Z',
      updatedAt: '2026-02-28T17:00:00.000Z',
    },
  ];

  return {
    items,
    suppliers,
    customers,
    purchases,
    batches,
    dispatches,
    bills,
    customerPayments,
    expenses,
    employees,
    advances,
    salaries,
  };
}

describe('MK Solutions Domain Calculation Engine (A5 Specification)', () => {
  it('1. Rock 20 ton @ 20,000, then 10 ton @ 23,000: average = 21,000 per ton', () => {
    const result = calculateItemAverageFromPurchases([
      { qty: 20, rate: 20000 },
      { qty: 10, rate: 23000 },
    ]);

    expect(result.stock.toNumber()).toBe(30);
    expect(result.avgCost.toNumber()).toBe(21000);
  });

  it('2. Batch: 8 ton rock (average 21,000) + 8 bags of a chemical @ 3,000, final 7.6 ton: total cost 192,000, cost per ton = 25,263.16', () => {
    const batch = calculateProductionBatchCost({
      rockTons: 8,
      rockAvgCost: 21000,
      chemicals: [{ itemName: 'Chemical A', bags: 8, avgCostPerBag: 3000 }],
      finalProductTons: 7.6,
    });

    expect(batch.rockCost.toFixed(2)).toBe('168000.00');
    expect(batch.totalChemicalCost.toFixed(2)).toBe('24000.00');
    expect(batch.totalCost.toFixed(2)).toBe('192000.00');
    expect(batch.costPerTon.toFixed(2)).toBe('25263.16');
  });

  it('3. Sale: received 9.95 ton, rate 60,000 per ton: bill = 597,000.00. COGS for 9.95 ton @ 25,263.16 per ton = 251,368.42', () => {
    const batch = calculateProductionBatchCost({
      rockTons: 8,
      rockAvgCost: 21000,
      chemicals: [{ bags: 8, avgCostPerBag: 3000 }],
      finalProductTons: 7.6,
    });

    const dispatch = calculateDispatchAndBill({
      receivedWeightTons: 9.95,
      ratePerTon: 60000,
      discount: 0,
      avgCostPerTon: batch.rawCostPerTon,
    });

    expect(dispatch.billAmount.toFixed(2)).toBe('597000.00');
    expect(dispatch.cogs.toFixed(2)).toBe('251368.42');
  });

  it('4. Payment: bills of 597,000 and 200,000, payment of 700,000: first bill paid, second bill has 103,000 paid and 97,000 left, customer balance 97,000', () => {
    const ledger = calculateCustomerLedgerAndAllocations({
      openingBalance: 0,
      bills: [
        { id: 'bill-1', docNumber: 'INV-2026-0001', date: '2026-03-01', totalAmount: 597000 },
        { id: 'bill-2', docNumber: 'INV-2026-0002', date: '2026-03-05', totalAmount: 200000 },
      ],
      payments: [{ id: 'pay-1', date: '2026-03-10', amount: 700000 }],
    });

    expect(ledger.billAllocations[0].paymentStatus).toBe('paid');
    expect(ledger.billAllocations[0].paidAmount.toNumber()).toBe(597000);
    expect(ledger.billAllocations[0].remainingAmount.toNumber()).toBe(0);

    expect(ledger.billAllocations[1].paymentStatus).toBe('partial');
    expect(ledger.billAllocations[1].paidAmount.toNumber()).toBe(103000);
    expect(ledger.billAllocations[1].remainingAmount.toNumber()).toBe(97000);

    expect(ledger.balance.toNumber()).toBe(97000);
  });

  it('5. Advance & salary step: basic 50,000 with 20,000 advance in month -> payable 30,000; if 60,000 advance -> payable 0 and -10,000 carry forward', () => {
    const step1 = calculateSalaryAndAdvanceStep({
      basicSalary: 50000,
      bonus: 0,
      advancesThisMonth: 20000,
      earlierBalance: 0,
    });
    expect(step1.advanceDeduction.toNumber()).toBe(20000);
    expect(step1.netPayable.toNumber()).toBe(30000);
    expect(step1.carryForwardBalanceAfterPay.toNumber()).toBe(0);

    const step2 = calculateSalaryAndAdvanceStep({
      basicSalary: 50000,
      bonus: 0,
      advancesThisMonth: 60000,
      earlierBalance: 0,
    });
    expect(step2.advanceDeduction.toNumber()).toBe(60000);
    expect(step2.netPayable.toNumber()).toBe(0);
    expect(step2.closingBalanceAfterSalary.toNumber()).toBe(-10000);
    expect(step2.carryForwardBalanceAfterPay.toNumber()).toBe(-10000);
  });

  it('6. Monthly profit: sales 2,000,000, COGS 850,000, expenses 150,000, salaries 300,000: net profit 700,000', () => {
    const profit = calculateMonthlyProfit({
      salesTotal: 2000000,
      cogsTotal: 850000,
      expensesTotal: 150000,
      salariesTotal: 300000,
    });

    expect(profit.grossProfit.toNumber()).toBe(1150000);
    expect(profit.netProfit.toNumber()).toBe(700000);
  });

  it('7. A dispatch larger than the stock is rejected with a message naming the shortage', () => {
    const check = validateStockAvailability({
      itemName: 'Final Product',
      unit: 'ton',
      availableQty: 7.6,
      requestedQty: 10,
    });

    expect(check.valid).toBe(false);
    expect(check.shortage.toNumber()).toBe(2.4);
    expect(check.errorMessage).toContain('Final Product');
    expect(check.errorMessage).toContain('2.4 ton');
  });

  it('8. In-memory dataset replays chronologically with positive stock and valid snapshots', async () => {
    const { replayInventoryState } = await import('./engine');
    const fixture = buildInMemoryTestDataset('test_co');
    const replay = replayInventoryState({
      catalogItems: fixture.items,
      purchases: fixture.purchases,
      batches: fixture.batches,
      dispatches: fixture.dispatches,
    });

    expect(replay.valid).toBe(true);
    expect(replay.finalProduct.quantity.toNumber()).toBe(35.24); // 78 produced - 42.76 sold = 35.24 ton (vehicles 6, 7, 8 are on the way)
  });

  it('9. Supplier ledger calculates debit, credit and running balance after partial payment and later payment', async () => {
    const { calculateSupplierLedger } = await import('./engine');
    const ledger = calculateSupplierLedger({
      openingBalance: 50000,
      purchases: [
        {
          id: 'p1',
          docNumber: 'PUR-2026-0001',
          date: '2026-03-01',
          totalAmount: 400000,
          paidNow: 150000,
          status: 'active',
        },
      ],
      payments: [
        {
          id: 'sp1',
          docNumber: 'PAY-2026-0001',
          date: '2026-03-05',
          amount: 100000,
          method: 'bank',
          status: 'active',
        },
      ],
    });

    expect(ledger.totalPurchased.toNumber()).toBe(400000);
    expect(ledger.totalPaid.toNumber()).toBe(250000);
    expect(ledger.balance.toNumber()).toBe(200000); // 50,000 + 400,000 - 250,000
    expect(ledger.entries.length).toBe(4); // Opening, Purchase debit, Paid on purchase credit, Later payment credit
  });

  it('10. Cancelling a purchase that would make stock negative is blocked with item and shortage named', async () => {
    const { replayInventoryState } = await import('./engine');
    const check = replayInventoryState({
      catalogItems: [
        {
          id: 'rock_1',
          companyId: 'c1',
          name: 'White Rock',
          kind: 'rock',
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
      purchases: [
        {
          id: 'pur_1',
          companyId: 'c1',
          docNumber: 'PUR-2026-0001',
          date: '2026-03-01',
          supplierId: 'sup_1',
          supplierName: 'Supplier 1',
          lines: [
            {
              id: 'l1',
              itemId: 'rock_1',
              itemName: 'White Rock',
              kind: 'rock',
              quantity: '20',
              rate: '20000',
              amount: '400000',
            },
          ],
          chemicalLines: [],
          subtotal: '400000',
          otherCharges: '0',
          totalAmount: '400000',
          paidNow: '0',
          status: 'cancelled', // Simulating cancellation of this purchase
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
      batches: [
        {
          id: 'batch_1',
          companyId: 'c1',
          docNumber: 'BATCH-2026-0001',
          date: '2026-03-02',
          rockItemId: 'rock_1',
          rockItemName: 'White Rock',
          rockTons: '15',
          rockAvgCostSnapshot: '20000',
          rockCostSnapshot: '300000',
          chemicalUsages: [],
          finalProductTons: '14',
          totalCostSnapshot: '300000',
          costPerTonSnapshot: '21428.57',
          rawCostPerTonSnapshot: '21428.57142857143',
          status: 'active',
          createdAt: '2026-03-02T00:00:00Z',
          updatedAt: '2026-03-02T00:00:00Z',
        },
      ],
      dispatches: [],
    });

    expect(check.valid).toBe(false);
    expect(check.errorMessage).toContain('White Rock');
    expect(check.errorMessage).toContain('15 ton');
  });

  it('11. Stock after purchases, batch, and dispatch matches exact domain averages and values', async () => {
    const { replayInventoryState } = await import('./engine');
    const replay = replayInventoryState({
      catalogItems: [
        {
          id: 'rock_1',
          companyId: 'c1',
          name: 'White Rock',
          kind: 'rock',
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
        {
          id: 'chem_1',
          companyId: 'c1',
          name: 'Flux Binder A',
          kind: 'chemical',
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
      purchases: [
        {
          id: 'p1',
          companyId: 'c1',
          docNumber: 'PUR-2026-0001',
          date: '2026-03-01',
          supplierId: 's1',
          supplierName: 'Supplier 1',
          lines: [
            {
              id: 'l1',
              itemId: 'rock_1',
              itemName: 'White Rock',
              kind: 'rock',
              quantity: '20',
              rate: '20000',
              amount: '400000',
            },
            {
              id: 'l2',
              itemId: 'chem_1',
              itemName: 'Flux Binder A',
              kind: 'chemical',
              quantity: '20',
              rate: '3000',
              amount: '60000',
            },
          ],
          chemicalLines: [],
          subtotal: '460000',
          otherCharges: '0',
          totalAmount: '460000',
          paidNow: '460000',
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
        {
          id: 'p2',
          companyId: 'c1',
          docNumber: 'PUR-2026-0002',
          date: '2026-03-02',
          supplierId: 's1',
          supplierName: 'Supplier 1',
          lines: [
            {
              id: 'l3',
              itemId: 'rock_1',
              itemName: 'White Rock',
              kind: 'rock',
              quantity: '10',
              rate: '23000',
              amount: '230000',
            },
          ],
          chemicalLines: [],
          subtotal: '230000',
          otherCharges: '0',
          totalAmount: '230000',
          paidNow: '230000',
          status: 'active',
          createdAt: '2026-03-02T00:00:00Z',
          updatedAt: '2026-03-02T00:00:00Z',
        },
      ],
      batches: [
        {
          id: 'b1',
          companyId: 'c1',
          docNumber: 'BATCH-2026-0001',
          date: '2026-03-03',
          rockItemId: 'rock_1',
          rockItemName: 'White Rock',
          rockTons: '8',
          rockAvgCostSnapshot: '21000',
          rockCostSnapshot: '168000',
          chemicalUsages: [
            {
              itemId: 'chem_1',
              itemName: 'Flux Binder A',
              bags: '8',
              avgCostPerBagSnapshot: '3000',
              lineCostSnapshot: '24000',
            },
          ],
          finalProductTons: '7.6',
          totalCostSnapshot: '192000',
          costPerTonSnapshot: '25263.16',
          rawCostPerTonSnapshot: '25263.15789473684210526315789',
          status: 'active',
          createdAt: '2026-03-03T00:00:00Z',
          updatedAt: '2026-03-03T00:00:00Z',
        },
      ],
      dispatches: [
        {
          id: 'd1',
          companyId: 'c1',
          docNumber: 'DSP-2026-0001',
          dateTime: '2026-03-04T10:00:00Z',
          customerId: 'cust1',
          customerName: 'Customer 1',
          vehicleNumber: 'LES-1111',
          bagsCount: 100,
          receivedWeightTons: '5',
          saleDate: '2026-03-04',
          billId: 'bill_1',
          avgCostPerTonSnapshot: '25263.16',
          rawAvgCostPerTonSnapshot: '25263.15789473684210526315789',
          cogsSnapshot: '126315.79',
          status: 'active',
          createdAt: '2026-03-04T10:00:00Z',
          updatedAt: '2026-03-04T10:00:00Z',
        },
      ],
    });

    expect(replay.valid).toBe(true);
    const rock = replay.items.get('rock_1')!;
    const chem = replay.items.get('chem_1')!;
    expect(rock.quantity.toNumber()).toBe(22); // 30 - 8
    expect(rock.avgCost.toNumber()).toBe(21000);
    expect(rock.totalValue.toNumber()).toBe(462000); // 22 * 21000

    expect(chem.quantity.toNumber()).toBe(12); // 20 - 8
    expect(chem.avgCost.toNumber()).toBe(3000);
    expect(chem.totalValue.toNumber()).toBe(36000); // 12 * 3000

    expect(replay.finalProduct.quantity.toNumber()).toBe(2.6); // 7.6 - 5
    expect(replay.finalProduct.avgCost.toFixed(2)).toBe('25263.16');
  });

  it('12. Batch validation names every short item and blocks cancelling a batch if later dispatch stock goes negative', () => {
    // Only 10 ton White Rock and 5 bags Flux Binder A in stock
    const shortageCheck = replayInventoryState({
      catalogItems: [
        {
          id: 'rock_1',
          companyId: 'c1',
          name: 'White Rock',
          kind: 'rock',
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
        {
          id: 'chem_1',
          companyId: 'c1',
          name: 'Flux Binder A',
          kind: 'chemical',
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
      purchases: [
        {
          id: 'p1',
          companyId: 'c1',
          docNumber: 'PUR-2026-0001',
          date: '2026-03-01',
          supplierId: 's1',
          supplierName: 'Supplier 1',
          rockLine: {
            itemId: 'rock_1',
            itemName: 'White Rock',
            tons: '10',
            ratePerTon: '20000',
            amount: '200000',
          },
          chemicalLines: [
            {
              id: 'cl1',
              itemId: 'chem_1',
              itemName: 'Flux Binder A',
              bags: '5',
              ratePerBag: '3000',
              amount: '15000',
            },
          ],
          subtotal: '215000',
          otherCharges: '0',
          totalAmount: '215000',
          paidNow: '0',
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
      batches: [
        {
          id: 'b_short',
          companyId: 'c1',
          docNumber: 'BATCH-2026-0001',
          date: '2026-03-02',
          rockItemId: 'rock_1',
          rockItemName: 'White Rock',
          rockTons: '15', // short by 5 ton
          rockAvgCostSnapshot: '20000',
          rockCostSnapshot: '300000',
          chemicalUsages: [
            {
              itemId: 'chem_1',
              itemName: 'Flux Binder A',
              bags: '12', // short by 7 bag
              avgCostPerBagSnapshot: '3000',
              lineCostSnapshot: '36000',
            },
          ],
          finalProductTons: '14',
          totalCostSnapshot: '336000',
          costPerTonSnapshot: '24000',
          rawCostPerTonSnapshot: '24000',
          status: 'active',
          createdAt: '2026-03-02T00:00:00Z',
          updatedAt: '2026-03-02T00:00:00Z',
        },
      ],
      dispatches: [],
    });

    expect(shortageCheck.valid).toBe(false);
    expect(shortageCheck.errorMessage).toContain('White Rock (short by 5 ton)');
    expect(shortageCheck.errorMessage).toContain('Flux Binder A (short by 7 bag)');

    // Now test cancelling a batch when a later dispatch already used the produced final product
    const cancelBatchCheck = replayInventoryState({
      catalogItems: [],
      purchases: [
        {
          id: 'p1',
          companyId: 'c1',
          docNumber: 'PUR-2026-0001',
          date: '2026-03-01',
          supplierId: 's1',
          supplierName: 'Supplier 1',
          rockLine: {
            itemId: 'rock_1',
            itemName: 'White Rock',
            tons: '20',
            ratePerTon: '20000',
            amount: '400000',
          },
          chemicalLines: [],
          subtotal: '400000',
          otherCharges: '0',
          totalAmount: '400000',
          paidNow: '0',
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
      batches: [
        {
          id: 'b1',
          companyId: 'c1',
          docNumber: 'BATCH-2026-0001',
          date: '2026-03-02',
          rockItemId: 'rock_1',
          rockItemName: 'White Rock',
          rockTons: '10',
          rockAvgCostSnapshot: '20000',
          rockCostSnapshot: '200000',
          chemicalUsages: [],
          finalProductTons: '9.5',
          totalCostSnapshot: '200000',
          costPerTonSnapshot: '21052.63',
          rawCostPerTonSnapshot: '21052.63157894736842105263158',
          status: 'cancelled', // Simulating cancellation
          createdAt: '2026-03-02T00:00:00Z',
          updatedAt: '2026-03-02T00:00:00Z',
        },
      ],
      dispatches: [
        {
          id: 'd1',
          companyId: 'c1',
          docNumber: 'DSP-2026-0001',
          dateTime: '2026-03-03T10:00:00Z',
          customerId: 'cust1',
          customerName: 'Customer 1',
          vehicleNumber: 'LES-1111',
          bagsCount: 100,
          receivedWeightTons: '5',
          saleDate: '2026-03-03',
          billId: 'bill_1',
          avgCostPerTonSnapshot: '21052.63',
          rawAvgCostPerTonSnapshot: '21052.63157894736842105263158',
          cogsSnapshot: '105263.16',
          status: 'active',
          createdAt: '2026-03-03T10:00:00Z',
          updatedAt: '2026-03-03T10:00:00Z',
        },
      ],
    });

    expect(cancelBatchCheck.valid).toBe(false);
    expect(cancelBatchCheck.shortageItemName).toBe('Final Product');
  });

  it('13. Cancelling a bill updates the customer balance and returns the dispatch status to Sent', () => {
    const activeLedger = calculateCustomerLedgerAndAllocations({
      openingBalance: 0,
      bills: [
        {
          id: 'b1',
          docNumber: 'INV-2026-0001',
          date: '2026-03-05',
          totalAmount: 597000,
          status: 'active',
        },
        {
          id: 'b2',
          docNumber: 'INV-2026-0002',
          date: '2026-03-06',
          totalAmount: 200000,
          status: 'active',
        },
      ],
      payments: [
        {
          id: 'p1',
          date: '2026-03-06',
          amount: 100000,
          status: 'active',
        },
      ],
    });

    expect(activeLedger.balance.toNumber()).toBe(697000);

    // Cancel bill b1 -> customer balance drops by 597,000 to 100,000 and payment allocates to b2
    const afterCancelLedger = calculateCustomerLedgerAndAllocations({
      openingBalance: 0,
      bills: [
        {
          id: 'b1',
          docNumber: 'INV-2026-0001',
          date: '2026-03-05',
          totalAmount: 597000,
          status: 'cancelled',
        },
        {
          id: 'b2',
          docNumber: 'INV-2026-0002',
          date: '2026-03-06',
          totalAmount: 200000,
          status: 'active',
        },
      ],
      payments: [
        {
          id: 'p1',
          date: '2026-03-06',
          amount: 100000,
          status: 'active',
        },
      ],
    });

    expect(afterCancelLedger.balance.toNumber()).toBe(100000);
    expect(afterCancelLedger.billAllocations).toHaveLength(1);
    expect(afterCancelLedger.billAllocations[0].billId).toBe('b2');
    expect(afterCancelLedger.billAllocations[0].paidAmount.toNumber()).toBe(100000);
    expect(afterCancelLedger.billAllocations[0].remainingAmount.toNumber()).toBe(100000);
    expect(afterCancelLedger.billAllocations[0].paymentStatus).toBe('partial');
  });

  it('14. Customer ledger tracks running balance, creates an advance when payment exceeds balance, and restores bill statuses when a payment is cancelled', () => {
    // Bills of 597,000 and 200,000 (total 797,000), payment 1 of 700,000, payment 2 of 150,000 (total paid 850,000 -> 53,000 advance)
    const withAdvance = calculateCustomerLedgerAndAllocations({
      openingBalance: 0,
      bills: [
        {
          id: 'b1',
          docNumber: 'INV-2026-0001',
          date: '2026-03-01',
          totalAmount: 597000,
          status: 'active',
        },
        {
          id: 'b2',
          docNumber: 'INV-2026-0002',
          date: '2026-03-02',
          totalAmount: 200000,
          status: 'active',
        },
      ],
      payments: [
        {
          id: 'p1',
          docNumber: 'RCV-2026-0001',
          date: '2026-03-03',
          amount: 700000,
          method: 'bank',
          status: 'active',
        },
        {
          id: 'p2',
          docNumber: 'RCV-2026-0002',
          date: '2026-03-04',
          amount: 150000,
          method: 'online',
          status: 'active',
        },
      ],
    });

    // Both bills paid, balance is -53,000 (53,000 advance)
    expect(withAdvance.balance.toNumber()).toBe(-53000);
    expect(withAdvance.advanceAvailable.toNumber()).toBe(53000);
    expect(withAdvance.billAllocations[0].paymentStatus).toBe('paid');
    expect(withAdvance.billAllocations[1].paymentStatus).toBe('paid');

    // Check chronological ledger entries running balance:
    // 1. Bill 1: +597,000
    // 2. Bill 2: +797,000
    // 3. Payment 1 (-700,000): +97,000
    // 4. Payment 2 (-150,000): -53,000
    expect(withAdvance.entries.map((e) => e.balance.toNumber())).toEqual([
      597000,
      797000,
      97000,
      -53000,
    ]);

    // Cancel payment 2 -> balance returns to 97,000, bill 1 paid, bill 2 partial (103,000 paid, 97,000 left)
    const afterCancelPayment2 = calculateCustomerLedgerAndAllocations({
      openingBalance: 0,
      bills: [
        {
          id: 'b1',
          docNumber: 'INV-2026-0001',
          date: '2026-03-01',
          totalAmount: 597000,
          status: 'active',
        },
        {
          id: 'b2',
          docNumber: 'INV-2026-0002',
          date: '2026-03-02',
          totalAmount: 200000,
          status: 'active',
        },
      ],
      payments: [
        {
          id: 'p1',
          docNumber: 'RCV-2026-0001',
          date: '2026-03-03',
          amount: 700000,
          method: 'bank',
          status: 'active',
        },
        {
          id: 'p2',
          docNumber: 'RCV-2026-0002',
          date: '2026-03-04',
          amount: 150000,
          method: 'online',
          status: 'cancelled',
        },
      ],
    });

    expect(afterCancelPayment2.balance.toNumber()).toBe(97000);
    expect(afterCancelPayment2.advanceAvailable.toNumber()).toBe(0);
    expect(afterCancelPayment2.billAllocations[0].paymentStatus).toBe('paid');
    expect(afterCancelPayment2.billAllocations[1].paymentStatus).toBe('partial');
    expect(afterCancelPayment2.billAllocations[1].paidAmount.toNumber()).toBe(103000);
    expect(afterCancelPayment2.billAllocations[1].remainingAmount.toNumber()).toBe(97000);
  });

  it('15. Monthly expenses analysis calculates exact month total, comparison percent vs last month, and category breakdown', () => {
    const analysis = calculateMonthlyExpensesAnalysis({
      month: '2026-03',
      categoryLabels: {
        lab_testing: 'Lab testing',
      },
      expenses: [
        // Previous month (2026-02): total 100,000
        { date: '2026-02-10', category: 'electricity', amount: 60000, status: 'active' },
        { date: '2026-02-18', category: 'machine_maintenance', amount: 40000, status: 'active' },
        // Current month (2026-03): active total = 80,000 + 35,000 + 10,000 = 125,000 (+25.0% vs 100,000)
        { date: '2026-03-04', category: 'electricity', amount: 80000, status: 'active' },
        { date: '2026-03-11', category: 'machine_maintenance', amount: 35000, status: 'active' },
        { date: '2026-03-15', category: 'lab_testing', amount: 10000, status: 'active' },
        { date: '2026-03-20', category: 'transport', amount: 20000, status: 'cancelled' },
      ],
    });

    expect(analysis.monthTotal.toNumber()).toBe(125000);
    expect(analysis.previousMonthTotal.toNumber()).toBe(100000);
    expect(analysis.vsLastMonthPercent?.toNumber()).toBe(25);
    expect(analysis.topCategory?.category).toBe('electricity');
    expect(analysis.topCategory?.label).toBe('Electricity and fuel');
    expect(analysis.topCategory?.amount.toNumber()).toBe(80000);
    expect(analysis.categoryBreakdown.map((c) => ({ label: c.label, amount: c.amount.toNumber() }))).toEqual([
      { label: 'Electricity and fuel', amount: 80000 },
      { label: 'Machine maintenance', amount: 35000 },
      { label: 'Lab testing', amount: 10000 },
    ]);
  });

  it('16. Monthly advance rule reduces the salary of its month and carries negative balance forward automatically', async () => {
    const {
      calculateEmployeeAdvancesState,
      calculateEmployeeMonthlySalaryRow,
    } = await import('./engine');

    const advances = [
      {
        id: 'adv_1',
        companyId: 'c1',
        docNumber: 'ADV-2026-0001',
        date: '2026-03-05',
        employeeId: 'emp_2',
        employeeName: 'Muhammad Asif',
        amount: '30000',
        status: 'active' as const,
        createdAt: '2026-03-05T10:00:00Z',
        updatedAt: '2026-03-05T10:00:00Z',
      },
      {
        id: 'adv_big',
        companyId: 'c1',
        docNumber: 'ADV-2026-0002',
        date: '2026-03-10',
        employeeId: 'emp_4',
        employeeName: 'Bilal Hussain',
        amount: '60000',
        status: 'active' as const,
        createdAt: '2026-03-10T10:00:00Z',
        updatedAt: '2026-03-10T10:00:00Z',
      },
    ];

    // Month 1 (2026-03) for emp_2 (salary 52,000, advance 30,000 in 2026-03):
    const m1Calc = calculateEmployeeMonthlySalaryRow({
      advances,
      salaries: [],
      employeeId: 'emp_2',
      month: '2026-03',
      basicSalary: 52000,
      bonus: 0,
    });
    expect(m1Calc.advancesThisMonth.toNumber()).toBe(30000);
    expect(m1Calc.earlierBalance.toNumber()).toBe(0);
    expect(m1Calc.netPayable.toNumber()).toBe(22000);

    const paidSalaries = [
      {
        id: 'sal_1',
        companyId: 'c1',
        docNumber: 'SAL-2026-0001',
        month: '2026-03',
        date: '2026-03-28',
        employeeId: 'emp_2',
        employeeName: 'Muhammad Asif',
        employeeRole: 'Operator',
        basicSalary: '52000',
        bonus: '0',
        earlierBalance: '0',
        advanceDeduction: '30000',
        netPayable: '22000',
        paidAmount: '22000',
        paymentStatus: 'paid' as const,
        status: 'active' as const,
        createdAt: '2026-03-28T10:00:00Z',
        updatedAt: '2026-03-28T10:00:00Z',
      },
    ];

    const afterPaidMonth = calculateEmployeeAdvancesState({
      advances,
      salaries: paidSalaries,
      employeeId: 'emp_2',
    });
    expect(afterPaidMonth.openBalance.toNumber()).toBe(0);
    expect(afterPaidMonth.items[0].advanceStatus).toBe('closed');

    // emp_4: 60,000 advance in 2026-03 on basic 42,000 + bonus 3,000 = 45,000:
    // Payable is 0 and balance after salary is -15,000
    const excessAdvRow = calculateEmployeeMonthlySalaryRow({
      advances,
      salaries: [],
      employeeId: 'emp_4',
      month: '2026-03',
      basicSalary: 42000,
      bonus: 3000,
    });
    expect(excessAdvRow.advancesThisMonth.toNumber()).toBe(60000);
    expect(excessAdvRow.netPayable.toNumber()).toBe(0);
    expect(excessAdvRow.balanceAfterSalary.toNumber()).toBe(-15000);
  });

  it('17. Dashboard figures match Reports identically on in-memory dataset and every report total equals the sum of its rows', async () => {
    const {
      calculateDashboardAnalytics,
      calculateProfitAndLossReport,
      calculateSalesReport,
      calculatePurchasesReport,
      calculateStockSummaryReport,
      calculateProductionSummaryReport,
      calculateReceivablesReport,
      calculatePayablesReport,
      calculateExpensesReport,
      calculateSalariesAndAdvancesReport,
      roundMoney,
    } = await import('./engine');
    const D = roundMoney;

    const fixture = buildInMemoryTestDataset('test_co');
    const month = '2026-03';
    const asOfDate = '2026-03-31';

    const records = {
      items: fixture.items,
      suppliers: fixture.suppliers,
      purchases: fixture.purchases,
      supplierPayments: [],
      batches: fixture.batches,
      dispatches: fixture.dispatches,
      customers: fixture.customers,
      bills: fixture.bills,
      customerPayments: fixture.customerPayments,
      expenses: fixture.expenses,
      employees: fixture.employees,
      advances: fixture.advances,
      salaries: fixture.salaries,
    };

    const dashboard = calculateDashboardAnalytics(records, month, asOfDate);
    const pnl = calculateProfitAndLossReport(records, month);
    const stockReport = calculateStockSummaryReport(records);
    const receivablesReport = calculateReceivablesReport(records, {
      onlyPositive: true,
      asOfDate,
    });
    const payablesReport = calculatePayablesReport(records, {
      onlyPositive: true,
    });

    // 1. Dashboard figures vs Report figures parity
    expect(dashboard.sales.equals(pnl.sales)).toBe(true);
    expect(dashboard.cogs.equals(pnl.cogs)).toBe(true);
    expect(dashboard.grossProfit.equals(pnl.grossProfit)).toBe(true);
    expect(dashboard.expenses.equals(pnl.expenses)).toBe(true);
    expect(dashboard.salaries.equals(pnl.salaries)).toBe(true);
    expect(dashboard.netProfit.equals(pnl.netProfit)).toBe(true);

    expect(dashboard.receivables.equals(receivablesReport.totals.balance)).toBe(true);
    expect(dashboard.payables.equals(payablesReport.totals.balance)).toBe(true);

    expect(dashboard.rockStockTons.equals(stockReport.rockTons)).toBe(true);
    expect(dashboard.chemicalBagsTotal.equals(stockReport.chemicalBags)).toBe(true);
    expect(dashboard.finalPowderTons.equals(stockReport.finalProductTons)).toBe(true);
    expect(dashboard.totalStockValue.equals(stockReport.totalValue)).toBe(true);

    // 2. Verify every report's totals equal the sum of its visible rows
    const salesReport = calculateSalesReport(records);
    const sumSalesBillsTons = salesReport.billRows.reduce(
      (acc, r) => acc.plus(r.receivedTons),
      D(0)
    );
    const sumSalesBillsAmount = salesReport.billRows.reduce(
      (acc, r) => acc.plus(r.amount),
      D(0)
    );
    const sumSalesBillsPaid = salesReport.billRows.reduce(
      (acc, r) => acc.plus(r.paidAmount),
      D(0)
    );
    const sumSalesBillsBalance = salesReport.billRows.reduce(
      (acc, r) => acc.plus(r.balance),
      D(0)
    );
    expect(salesReport.totals.receivedTons.equals(sumSalesBillsTons)).toBe(true);
    expect(salesReport.totals.amount.equals(sumSalesBillsAmount)).toBe(true);
    expect(salesReport.totals.paidAmount.equals(sumSalesBillsPaid)).toBe(true);
    expect(salesReport.totals.balance.equals(sumSalesBillsBalance)).toBe(true);

    const sumCustSalesAmount = salesReport.customerRows.reduce(
      (acc, r) => acc.plus(r.amount),
      D(0)
    );
    expect(salesReport.totals.amount.equals(sumCustSalesAmount)).toBe(true);

    const purchasesReport = calculatePurchasesReport(records);
    const sumPurLineAmount = purchasesReport.lineRows.reduce(
      (acc, r) => acc.plus(r.amount),
      D(0)
    );
    const sumPurSupplierTotal = purchasesReport.supplierRows.reduce(
      (acc, r) => acc.plus(r.totalAmount),
      D(0)
    );
    const sumPurItemAmount = purchasesReport.itemRows.reduce(
      (acc, r) => acc.plus(r.amount),
      D(0)
    );
    expect(purchasesReport.totals.amount.equals(sumPurLineAmount)).toBe(true);
    expect(purchasesReport.totals.amount.equals(sumPurSupplierTotal)).toBe(true);
    expect(purchasesReport.totals.amount.equals(sumPurItemAmount)).toBe(true);

    const sumStockValue = stockReport.rows.reduce((acc, r) => acc.plus(r.totalValue), D(0));
    expect(stockReport.totalValue.equals(sumStockValue)).toBe(true);

    const prodReport = calculateProductionSummaryReport(records);
    const sumProdRock = prodReport.rows.reduce((acc, r) => acc.plus(r.rockTons), D(0));
    const sumProdFinal = prodReport.rows.reduce(
      (acc, r) => acc.plus(r.finalProductTons),
      D(0)
    );
    const sumProdCost = prodReport.rows.reduce((acc, r) => acc.plus(r.totalCost), D(0));
    expect(prodReport.totals.rockTons.equals(sumProdRock)).toBe(true);
    expect(prodReport.totals.finalProductTons.equals(sumProdFinal)).toBe(true);
    expect(prodReport.totals.totalCost.equals(sumProdCost)).toBe(true);

    const sumRecBalance = receivablesReport.rows.reduce((acc, r) => acc.plus(r.balance), D(0));
    const sumRec0To30 = receivablesReport.rows.reduce((acc, r) => acc.plus(r.days0To30), D(0));
    const sumRec31To60 = receivablesReport.rows.reduce((acc, r) => acc.plus(r.days31To60), D(0));
    const sumRec60Plus = receivablesReport.rows.reduce((acc, r) => acc.plus(r.days60Plus), D(0));
    expect(receivablesReport.totals.balance.equals(sumRecBalance)).toBe(true);
    expect(receivablesReport.totals.days0To30.equals(sumRec0To30)).toBe(true);
    expect(receivablesReport.totals.days31To60.equals(sumRec31To60)).toBe(true);
    expect(receivablesReport.totals.days60Plus.equals(sumRec60Plus)).toBe(true);
    expect(
      receivablesReport.totals.days0To30
        .plus(receivablesReport.totals.days31To60)
        .plus(receivablesReport.totals.days60Plus)
        .equals(receivablesReport.totals.balance)
    ).toBe(true);

    const sumPayBalance = payablesReport.rows.reduce((acc, r) => acc.plus(r.balance), D(0));
    expect(payablesReport.totals.balance.equals(sumPayBalance)).toBe(true);

    const expReport = calculateExpensesReport(records);
    const sumExpDate = expReport.dateRows.reduce((acc, r) => acc.plus(r.amount), D(0));
    const sumExpCat = expReport.categoryRows.reduce((acc, r) => acc.plus(r.amount), D(0));
    expect(expReport.totals.amount.equals(sumExpDate)).toBe(true);
    expect(expReport.totals.amount.equals(sumExpCat)).toBe(true);

    const salReport = calculateSalariesAndAdvancesReport(records, { month });
    const sumSalNet = salReport.rows.reduce((acc, r) => acc.plus(r.netPayable), D(0));
    const sumSalOpenAdv = salReport.rows.reduce(
      (acc, r) => acc.plus(r.openAdvanceBalance),
      D(0)
    );
    expect(salReport.totals.netPayable.equals(sumSalNet)).toBe(true);
    expect(salReport.totals.openAdvanceBalance.equals(sumSalOpenAdv)).toBe(true);
  });

  it('18. End-to-end full business flow on in-memory dataset (purchase -> batch -> dispatch -> bill -> print metadata -> customer payment -> expense -> advance -> salaries -> dashboard & P&L parity)', async () => {
    const {
      calculateCustomerLedgerAndAllocations,
      calculateDashboardAnalytics,
      calculateDispatchAndBill,
      calculateEmployeeRecommendedSalaryRow,
      calculateProductionBatchCost,
      calculateProfitAndLossReport,
      replayInventoryState,
      roundMoney,
    } = await import('./engine');
    const { buildBillPrintMeta } = await import('../features/dispatch/dispatchHelpers');
    const { buildPaymentReceiptPrintMeta, buildCustomerStatementPrintMeta } = await import(
      '../features/customers/customerHelpers'
    );
    const { buildPurchaseVoucherPrintMeta } = await import('../features/purchases/purchaseHelpers');
    const {
      buildAdvanceVoucherPrintMeta,
      buildSalarySlipPrintMeta,
      buildMonthlySalarySheetPrintMeta,
    } = await import('../features/employees/employeeHelpers');
    type CompanySettings = import('./types').CompanySettings;
    type Purchase = import('./types').Purchase;
    type ProductionBatch = import('./types').ProductionBatch;
    type Dispatch = import('./types').Dispatch;
    type Bill = import('./types').Bill;
    type CustomerPayment = import('./types').CustomerPayment;
    type Expense = import('./types').Expense;
    type EmployeeAdvance = import('./types').EmployeeAdvance;
    type SalaryRecord = import('./types').SalaryRecord;

    const fixture = buildInMemoryTestDataset('test_co');
    const companySettings: CompanySettings = {
      id: 'settings_1',
      companyId: 'test_co',
      companyName: 'MK Melting Solutions',
      address: 'Plot 14, Industrial Estate',
      phone: '0300-1234567',
      email: 'info@mkmelting.pk',
      city: 'Lahore',
      prefixes: {
        purchase: 'PUR',
        batch: 'BATCH',
        dispatch: 'DSP',
        receipt: 'RCV',
        expense: 'EXP',
        advance: 'ADV',
        salary: 'SAL',
      },
      updatedAt: '2026-04-01T00:00:00Z',
    };

    const rockItem = fixture.items.find((i) => i.kind === 'rock')!;
    const chemItem = fixture.items.find((i) => i.kind === 'chemical')!;

    // 1. Purchase rock (20 tons @ 13,000 = 260,000) and chemicals (100 bags @ 3,300 = 330,000)
    const newPurchase: Purchase = {
      id: 'pur_e2e_1',
      companyId: 'test_co',
      docNumber: 'PUR-2026-0099',
      date: '2026-04-02',
      supplierId: fixture.suppliers[0].id,
      supplierName: fixture.suppliers[0].name,
      lines: [
        {
          id: 'pl_e2e_1',
          itemId: rockItem.id,
          itemName: rockItem.name,
          kind: 'rock',
          quantity: '20',
          rate: '13000',
          amount: '260000',
        },
        {
          id: 'pl_e2e_2',
          itemId: chemItem.id,
          itemName: chemItem.name,
          kind: 'chemical',
          quantity: '100',
          rate: '3300',
          amount: '330000',
        },
      ],
      rockLine: {
        itemId: rockItem.id,
        itemName: rockItem.name,
        tons: '20',
        ratePerTon: '13000',
        amount: '260000',
      },
      chemicalLines: [
        {
          id: 'cl_e2e_1',
          itemId: chemItem.id,
          itemName: chemItem.name,
          bags: '100',
          ratePerBag: '3300',
          amount: '330000',
        },
      ],
      subtotal: '590000',
      otherCharges: '0',
      totalAmount: '590000',
      paidNow: '290000',
      paymentMethod: 'bank',
      status: 'active',
      createdAt: '2026-04-02T09:00:00Z',
      updatedAt: '2026-04-02T09:00:00Z',
    };
    const purchases = [...fixture.purchases, newPurchase];

    // 2. Production batch in April 2026: 15 tons rock + 30 bags chemical -> 14 tons Final Product
    const stateBeforeBatch = replayInventoryState({
      catalogItems: fixture.items,
      purchases,
      batches: fixture.batches,
      dispatches: fixture.dispatches,
    });
    const rockState = stateBeforeBatch.items.get(rockItem.id)!;
    const chemState = stateBeforeBatch.items.get(chemItem.id)!;

    const batchCalc = calculateProductionBatchCost({
      rockTons: 15,
      rockAvgCost: rockState.rawAvgCost,
      chemicals: [{ itemId: chemItem.id, itemName: chemItem.name, bags: 30, avgCostPerBag: chemState.rawAvgCost }],
      finalProductTons: 14,
    });

    const newBatch: ProductionBatch = {
      id: 'bat_e2e_1',
      companyId: 'test_co',
      docNumber: 'BATCH-2026-0099',
      date: '2026-04-05',
      rockItemId: rockItem.id,
      rockItemName: rockItem.name,
      rockTons: '15',
      rockAvgCostSnapshot: rockState.avgCost.toFixed(2),
      rockCostSnapshot: batchCalc.rockCost.toFixed(2),
      chemicalUsages: [
        {
          itemId: chemItem.id,
          itemName: chemItem.name,
          bags: '30',
          avgCostPerBagSnapshot: chemState.avgCost.toFixed(2),
          lineCostSnapshot: batchCalc.chemicalCosts[0].lineCost.toFixed(2),
        },
      ],
      finalProductTons: '14',
      totalCostSnapshot: batchCalc.totalCost.toFixed(2),
      costPerTonSnapshot: batchCalc.costPerTon.toFixed(2),
      rawCostPerTonSnapshot: batchCalc.rawCostPerTon.toString(),
      status: 'active',
      createdAt: '2026-04-05T10:00:00Z',
      updatedAt: '2026-04-05T10:00:00Z',
    };
    const batches = [...fixture.batches, newBatch];

    // 3. Dispatch with vehicle number -> Received weight (9.95 tons @ 60,000/ton = 597,000)
    const stateBeforeDispatch = replayInventoryState({
      catalogItems: fixture.items,
      purchases,
      batches,
      dispatches: fixture.dispatches,
    });

    const billCalc = calculateDispatchAndBill({
      receivedWeightTons: 9.95,
      ratePerTon: 60000,
      discount: 0,
      avgCostPerTon: stateBeforeDispatch.finalProduct.rawAvgCost,
    });
    expect(billCalc.billAmount.toNumber()).toBe(597000);

    const newDispatch: Dispatch = {
      id: 'dsp_e2e_1',
      companyId: 'test_co',
      docNumber: 'DSP-2026-0099',
      dateTime: '2026-04-08T11:00:00Z',
      customerId: fixture.customers[0].id,
      customerName: fixture.customers[0].name,
      vehicleNumber: 'LES-9988',
      driverName: 'Tariq Mehmood',
      bagsCount: 200,
      receivedWeightTons: '9.95',
      ratePerTon: '60000',
      saleDate: '2026-04-08',
      avgCostPerTonSnapshot: stateBeforeDispatch.finalProduct.avgCost.toFixed(2),
      rawAvgCostPerTonSnapshot: stateBeforeDispatch.finalProduct.rawAvgCost.toString(),
      cogsSnapshot: billCalc.cogs.toFixed(2),
      costOfPowderSoldSnapshot: billCalc.cogs.toFixed(2),
      billId: 'bill_e2e_1',
      billDocNumber: 'INV-2026-0099',
      status: 'active',
      createdAt: '2026-04-08T11:00:00Z',
      updatedAt: '2026-04-08T14:00:00Z',
    };
    const newBill: Bill = {
      id: 'bill_e2e_1',
      companyId: 'test_co',
      docNumber: 'INV-2026-0099',
      date: '2026-04-08',
      customerId: fixture.customers[0].id,
      customerName: fixture.customers[0].name,
      dispatchId: 'dsp_e2e_1',
      dispatchDocNumber: 'DSP-2026-0099',
      dispatchDateTime: '2026-04-08T11:00:00Z',
      vehicleNumber: 'LES-9988',
      bagsCount: 200,
      receivedWeightTons: '9.95',
      ratePerTon: '60000',
      subtotal: '597000',
      discount: '0',
      totalAmount: '597000',
      costOfPowderSoldSnapshot: billCalc.cogs.toFixed(2),
      status: 'active',
      createdAt: '2026-04-08T14:00:00Z',
      updatedAt: '2026-04-10T10:00:00Z',
    };
    const dispatches = [...fixture.dispatches, newDispatch];
    const bills = [...fixture.bills, newBill];

    // 4. Receive customer payment (400,000)
    const newPayment: CustomerPayment = {
      id: 'rcp_e2e_1',
      companyId: 'test_co',
      docNumber: 'RCV-2026-0099',
      date: '2026-04-10',
      customerId: fixture.customers[0].id,
      customerName: fixture.customers[0].name,
      amount: '400000',
      method: 'bank',
      status: 'active',
      createdAt: '2026-04-10T10:00:00Z',
      updatedAt: '2026-04-10T10:00:00Z',
    };
    const customerPayments = [...fixture.customerPayments, newPayment];

    // 5. Add an expense in April 2026 (45,000 electricity)
    const newExpense: Expense = {
      id: 'exp_e2e_1',
      companyId: 'test_co',
      docNumber: 'EXP-2026-0099',
      date: '2026-04-12',
      category: 'electricity',
      description: 'Electricity and fuel',
      amount: '45000',
      paidTo: 'LESCO',
      method: 'bank',
      status: 'active',
      createdAt: '2026-04-12T10:00:00Z',
      updatedAt: '2026-04-12T10:00:00Z',
    };
    const expenses = [...fixture.expenses, newExpense];

    // 6. Give an employee advance (15,000 in April 2026) and generate April 2026 salaries
    const newAdvance: EmployeeAdvance = {
      id: 'adv_e2e_1',
      companyId: 'test_co',
      docNumber: 'ADV-2026-0099',
      date: '2026-04-14',
      employeeId: fixture.employees[0].id,
      employeeName: fixture.employees[0].name,
      amount: '15000',
      status: 'active',
      createdAt: '2026-04-14T10:00:00Z',
      updatedAt: '2026-04-14T10:00:00Z',
    };
    const advances = [...fixture.advances, newAdvance];

    const activeEmployees = fixture.employees.filter((e) => e.active && e.status === 'active');
    const aprilSalaries: SalaryRecord[] = activeEmployees.map((emp, idx) => {
      const rec = calculateEmployeeMonthlySalaryRow({
        advances,
        salaries: fixture.salaries,
        employeeId: emp.id,
        month: '2026-04',
        basicSalary: emp.basicSalary,
        bonus: 0,
      });
      return {
        id: `sal_e2e_${idx + 1}`,
        companyId: 'test_co',
        docNumber: `SAL-2026-010${idx + 1}`,
        month: '2026-04',
        date: '2026-04-28',
        employeeId: emp.id,
        employeeName: emp.name,
        employeeRole: emp.role,
        basicSalary: emp.basicSalary,
        bonus: '0',
        earlierBalance: rec.earlierBalance.toFixed(2),
        advanceDeduction: rec.advanceDeduction.toFixed(2),
        netPayable: rec.netPayable.toFixed(2),
        paidAmount: rec.netPayable.toFixed(2),
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        status: 'active',
        createdAt: '2026-04-28T10:00:00Z',
        updatedAt: '2026-04-28T10:00:00Z',
      };
    });
    const salaries = [...fixture.salaries, ...aprilSalaries];

    // 7. Verify document print metadata builders (Bill, Receipt, Customer Statement, Purchase Voucher, Advance Voucher, Salary Slip, Salary Sheet)
    const billMeta = buildBillPrintMeta(newBill, companySettings);
    expect(billMeta.docNumber).toBe('INV-2026-0099');
    expect(billMeta.amountInWordsText).toBe('Rupees Five Lakh Ninety Seven Thousand Only');

    const custLedger = calculateCustomerLedgerAndAllocations({
      openingBalance: fixture.customers[0].openingBalance,
      bills: bills
        .filter((b) => b.customerId === fixture.customers[0].id)
        .map((b) => ({
          id: b.id,
          docNumber: b.docNumber,
          date: b.date,
          vehicleNumber: b.vehicleNumber,
          receivedWeightTons: b.receivedWeightTons,
          ratePerTon: b.ratePerTon,
          totalAmount: b.totalAmount,
          status: b.status,
        })),
      payments: customerPayments
        .filter((p) => p.customerId === fixture.customers[0].id)
        .map((p) => ({
          id: p.id,
          docNumber: p.docNumber,
          date: p.date,
          amount: p.amount,
          method: p.method,
          status: p.status,
        })),
    });

    const receiptMeta = buildPaymentReceiptPrintMeta(
      newPayment,
      fixture.customers[0],
      companySettings,
      {
        balanceBefore: roundMoney(597000),
        balanceAfter: roundMoney(197000),
      }
    );
    expect(receiptMeta.docNumber).toBe('RCV-2026-0099');
    expect(receiptMeta.amountInWordsText).toBe('Rupees Four Lakh Only');

    const statementMeta = buildCustomerStatementPrintMeta(
      fixture.customers[0],
      custLedger,
      custLedger.entries,
      companySettings
    );
    expect(statementMeta.title).toBe('Customer Statement of Account');

    const purchaseMeta = buildPurchaseVoucherPrintMeta(newPurchase, companySettings);
    expect(purchaseMeta.docNumber).toBe('PUR-2026-0099');
    expect(purchaseMeta.amountInWordsText).toBe('Rupees Five Lakh Ninety Thousand Only');

    const advanceMeta = buildAdvanceVoucherPrintMeta({
      advance: newAdvance,
      employeeRole: fixture.employees[0].role,
      remainingBalance: '10000',
      company: companySettings,
    });
    expect(advanceMeta.docNumber).toBe('ADV-2026-0099');
    expect(advanceMeta.amountInWordsText).toBe('Rupees Fifteen Thousand Only');

    const slipMeta = buildSalarySlipPrintMeta({
      salary: aprilSalaries[0],
      company: companySettings,
    });
    expect(slipMeta.title).toContain('Salary slip');
    expect(slipMeta.amountInWordsText).toBeTruthy();

    const sheetMeta = buildMonthlySalarySheetPrintMeta({
      month: '2026-04',
      rows: aprilSalaries,
      company: companySettings,
    });
    expect(sheetMeta.title).toContain('Monthly salary sheet');
    expect(sheetMeta.amountInWordsText).toBeTruthy();

    // 8. Verify Dashboard and Profit & Loss report match 100% in April 2026
    const updatedRecords = {
      items: fixture.items,
      suppliers: fixture.suppliers,
      purchases,
      supplierPayments: [],
      batches,
      dispatches,
      customers: fixture.customers,
      bills,
      customerPayments,
      expenses,
      employees: fixture.employees,
      advances,
      salaries,
    };

    const aprDashboard = calculateDashboardAnalytics(updatedRecords, '2026-04', '2026-04-30');
    const aprPnl = calculateProfitAndLossReport(updatedRecords, '2026-04');

    expect(aprDashboard.sales.toNumber()).toBe(597000);
    expect(aprPnl.sales.toNumber()).toBe(597000);
    expect(aprDashboard.expenses.toNumber()).toBe(45000);
    expect(aprPnl.expenses.toNumber()).toBe(45000);
    expect(aprDashboard.cogs.equals(aprPnl.cogs)).toBe(true);
    expect(aprDashboard.grossProfit.equals(aprPnl.grossProfit)).toBe(true);
    expect(aprDashboard.salaries.equals(aprPnl.salaries)).toBe(true);
    expect(aprDashboard.netProfit.equals(aprPnl.netProfit)).toBe(true);
  });

  it('19. A4 Acceptance Data: purchases, production, dispatch, sale COGS, inventory invariant, and shortage rejection', () => {
    const catalogItems: Item[] = [
      { id: 'item_rock', companyId: 'test_co', name: 'White Rock', kind: 'rock', status: 'active', createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' },
      { id: 'item_chem', companyId: 'test_co', name: 'Binder Chem', kind: 'chemical', status: 'active', createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' },
    ];

    // 1. Purchase: 100 ton rock @ 15,000 + 50 bags chem @ 5,000 = 1,750,000
    const purchases: Purchase[] = [
      {
        id: 'pur_1',
        companyId: 'test_co',
        docNumber: 'PUR-2026-0001',
        date: '2026-05-01',
        supplierId: 'sup_1',
        supplierName: 'Supplier 1',
        subtotal: '1500000',
        otherCharges: '0',
        totalAmount: '1500000',
        paidNow: '0',
        rockLine: {
          itemId: 'item_rock',
          itemName: 'White Rock',
          tons: '100',
          ratePerTon: '15000',
          amount: '1500000',
        },
        chemicalLines: [],
        status: 'active',
        createdAt: '2026-05-01T10:00:00Z',
        updatedAt: '2026-05-01T10:00:00Z',
      },
      {
        id: 'pur_2',
        companyId: 'test_co',
        docNumber: 'PUR-2026-0002',
        date: '2026-05-01',
        supplierId: 'sup_2',
        supplierName: 'Supplier 2',
        subtotal: '250000',
        otherCharges: '0',
        totalAmount: '250000',
        paidNow: '0',
        rockLine: null,
        chemicalLines: [
          {
            id: 'chem_line_1',
            itemId: 'item_chem',
            itemName: 'Binder Chem',
            bags: '50',
            ratePerBag: '5000',
            amount: '250000',
          },
        ],
        status: 'active',
        createdAt: '2026-05-01T11:00:00Z',
        updatedAt: '2026-05-01T11:00:00Z',
      },
    ];

    const totalPurchases = new Decimal(1500000).plus(250000);
    expect(totalPurchases.toNumber()).toBe(1750000);

    // 2. Batch: 40 ton rock + 15 bags chem -> makes 43.5 ton powder
    const batchCost = calculateProductionBatchCost({
      rockTons: 40,
      rockAvgCost: 15000,
      chemicals: [{ bags: 15, avgCostPerBag: 5000 }],
      finalProductTons: 43.5,
    });
    expect(batchCost.totalCost.toNumber()).toBe(675000); // 40*15000 + 15*5000 = 600000 + 75000
    expect(batchCost.costPerTon.toFixed(2)).toBe('15517.24');

    const batches: ProductionBatch[] = [
      {
        id: 'batch_1',
        companyId: 'test_co',
        docNumber: 'BAT-2026-0001',
        date: '2026-05-02',
        rockItemId: 'item_rock',
        rockItemName: 'White Rock',
        rockTons: '40',
        rockAvgCostSnapshot: '15000',
        rockCostSnapshot: '600000',
        chemicalUsages: [
          {
            itemId: 'item_chem',
            itemName: 'Binder Chem',
            bags: '15',
            avgCostPerBagSnapshot: '5000',
            lineCostSnapshot: '75000',
          },
        ],
        finalProductTons: '43.5',
        totalCostSnapshot: '675000',
        costPerTonSnapshot: '15517.24',
        rawCostPerTonSnapshot: batchCost.rawCostPerTon.toString(),
        status: 'active',
        createdAt: '2026-05-02T12:00:00Z',
        updatedAt: '2026-05-02T12:00:00Z',
      },
    ];

    // 3. Dispatch vehicle (Sent, stock stays 43.5 ton)
    const sentDispatch: Dispatch = {
      id: 'dsp_sent',
      companyId: 'test_co',
      docNumber: 'DSP-2026-0001',
      dateTime: '2026-05-03T10:00:00Z',
      customerId: 'cust_1',
      customerName: 'Customer 1',
      vehicleNumber: 'LES-1234',
      bagsCount: 0,
      status: 'active',
      createdAt: '2026-05-03T10:00:00Z',
      updatedAt: '2026-05-03T10:00:00Z',
    };

    const stateAfterSent = replayInventoryState({
      catalogItems,
      purchases,
      batches,
      dispatches: [sentDispatch],
    });
    expect(stateAfterSent.valid).toBe(true);
    // Sent dispatch does not change powder stock
    expect(stateAfterSent.finalProduct.quantity.toNumber()).toBe(43.5);

    // 4. Enter received weight: 29 ton @ 25,000/ton -> Sales 725,000, COGS 450,000, Profit 275,000
    const sale1Calc = calculateDispatchAndBill({
      receivedWeightTons: 29,
      ratePerTon: 25000,
      discount: 0,
      avgCostPerTon: batchCost.rawCostPerTon,
    });
    expect(sale1Calc.billAmount.toNumber()).toBe(725000); // 29 * 25000
    expect(sale1Calc.cogs.toFixed(2)).toBe('450000.00'); // 29 * (675000 / 43.5) = 450000
    const profitOnSales = sale1Calc.billAmount.minus(sale1Calc.cogs);
    expect(profitOnSales.toFixed(2)).toBe('275000.00');

    const soldDispatch1: Dispatch = {
      ...sentDispatch,
      receivedWeightTons: '29',
      ratePerTon: '25000',
      saleDate: '2026-05-04',
      billId: 'bill_1',
      billDocNumber: 'INV-2026-0001',
      cogsSnapshot: '450000.00',
      costOfPowderSoldSnapshot: '450000.00',
      avgCostPerTonSnapshot: '15517.24',
      rawAvgCostPerTonSnapshot: batchCost.rawCostPerTon.toString(),
    };

    const stateAfterSale1 = replayInventoryState({
      catalogItems,
      purchases,
      batches,
      dispatches: [soldDispatch1],
    });
    expect(stateAfterSale1.valid).toBe(true);
    // Powder left = 43.5 - 29 = 14.5 ton
    expect(stateAfterSale1.finalProduct.quantity.toNumber()).toBe(14.5);
    expect(stateAfterSale1.finalProduct.totalValue.toFixed(2)).toBe('225000.00'); // 14.5 * (675000 / 43.5)

    // Check remaining raw materials:
    const remainingRock = stateAfterSale1.items.get('item_rock')!;
    const remainingChem = stateAfterSale1.items.get('item_chem')!;
    expect(remainingRock.quantity.toNumber()).toBe(60); // 100 - 40
    expect(remainingRock.totalValue.toNumber()).toBe(900000); // 60 * 15000
    expect(remainingChem.quantity.toNumber()).toBe(35); // 50 - 15
    expect(remainingChem.totalValue.toNumber()).toBe(175000); // 35 * 5000

    const rawMaterialsValue = remainingRock.totalValue.plus(remainingChem.totalValue);
    expect(rawMaterialsValue.toNumber()).toBe(1075000);

    // Invariant: Raw materials value + Powder value + Cumulative cost of powder sold = Total active purchases (tolerance Rs 1)
    const powderValue = stateAfterSale1.finalProduct.totalValue;
    const cogsCumulative = new Decimal('450000.00');
    const totalInventoryAndCOGS = rawMaterialsValue.plus(powderValue).plus(cogsCumulative);
    expect(Math.abs(totalInventoryAndCOGS.minus(totalPurchases).toNumber())).toBeLessThanOrEqual(1);

    // 5. Shortage rejection: entering received 15 ton when only 14.5 ton is left is rejected with 'Only 14.5 ton available'
    const excessDispatch: Dispatch = {
      id: 'dsp_excess',
      companyId: 'test_co',
      docNumber: 'DSP-2026-0002',
      dateTime: '2026-05-05T10:00:00Z',
      customerId: 'cust_1',
      customerName: 'Customer 1',
      vehicleNumber: 'LES-5555',
      bagsCount: 0,
      receivedWeightTons: '15',
      ratePerTon: '25000',
      saleDate: '2026-05-05',
      billId: 'bill_2',
      status: 'active',
      createdAt: '2026-05-05T10:00:00Z',
      updatedAt: '2026-05-05T10:00:00Z',
    };

    const shortageState = replayInventoryState({
      catalogItems,
      purchases,
      batches,
      dispatches: [soldDispatch1, excessDispatch],
    });
    expect(shortageState.valid).toBe(false);
    expect(shortageState.error).toBe('Only 14.5 ton available');
  });

  it('20. Phase 3: getInventorySnapshot and calculateAccountingInventoryInvariant match A4 numbers and hold across 50 randomized sequences of purchases, batches, sales, and cancellations', () => {
    const catalogItems: Item[] = [
      {
        id: 'item_rock',
        companyId: 'test_co',
        name: 'White Rock',
        kind: 'rock',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'item_chem_a',
        companyId: 'test_co',
        name: 'Borax',
        kind: 'chemical',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'item_chem_b',
        companyId: 'test_co',
        name: 'Soda Ash',
        kind: 'chemical',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    // Part A: Verify exact A4 dataset with getInventorySnapshot & calculateAccountingInventoryInvariant
    const a4Purchases: Purchase[] = [
      {
        id: 'p_a4_1',
        companyId: 'test_co',
        docNumber: 'PUR-2026-0001',
        date: '2026-05-01',
        supplierId: 'sup_1',
        supplierName: 'Supplier 1',
        lines: [
          {
            id: 'l_1',
            itemId: 'item_rock',
            itemName: 'White Rock',
            kind: 'rock',
            quantity: '100',
            rate: '15000',
            amount: '1500000',
          },
          {
            id: 'l_2',
            itemId: 'item_chem_a',
            itemName: 'Borax',
            kind: 'chemical',
            quantity: '50',
            rate: '5000',
            amount: '250000',
          },
        ],
        chemicalLines: [],
        subtotal: '1750000',
        otherCharges: '0',
        totalAmount: '1750000',
        paidNow: '0',
        paymentMethod: 'cash',
        status: 'active',
        createdAt: '2026-05-01T08:00:00Z',
        updatedAt: '2026-05-01T08:00:00Z',
      },
    ];

    const a4BatchCalc = calculateProductionBatchCost({
      rockTons: '40',
      rockAvgCost: '15000',
      chemicals: [
        {
          itemId: 'item_chem_a',
          itemName: 'Borax',
          bags: '15',
          avgCostPerBag: '5000',
        },
      ],
      finalProductTons: '43.5',
    });

    const a4Batches: ProductionBatch[] = [
      {
        id: 'b_a4_1',
        companyId: 'test_co',
        docNumber: 'BATCH-2026-0001',
        date: '2026-05-02',
        rockItemId: 'item_rock',
        rockItemName: 'White Rock',
        rockTons: '40',
        rockAvgCostSnapshot: '15000',
        rockCostSnapshot: '600000',
        chemicalUsages: [
          {
            itemId: 'item_chem_a',
            itemName: 'Borax',
            bags: '15',
            avgCostPerBagSnapshot: '5000',
            lineCostSnapshot: '75000',
          },
        ],
        finalProductTons: '43.5',
        totalCostSnapshot: '675000',
        costPerTonSnapshot: a4BatchCalc.costPerTon.toFixed(2),
        rawCostPerTonSnapshot: a4BatchCalc.rawCostPerTon.toString(),
        status: 'active',
        createdAt: '2026-05-02T09:00:00Z',
        updatedAt: '2026-05-02T09:00:00Z',
      },
    ];

    const a4Dispatches: Dispatch[] = [
      {
        id: 'd_a4_sold',
        companyId: 'test_co',
        docNumber: 'DSP-2026-0001',
        dateTime: '2026-05-03T10:00:00Z',
        customerId: 'c_1',
        customerName: 'Customer 1',
        vehicleNumber: 'LES-1001',
        bagsCount: 580,
        receivedWeightTons: '29',
        ratePerTon: '25000',
        saleDate: '2026-05-04',
        billId: 'bill_a4_1',
        billDocNumber: 'INV-2026-0001',
        cogsSnapshot: '450000.00',
        costOfPowderSoldSnapshot: '450000.00',
        avgCostPerTonSnapshot: '15517.24',
        rawAvgCostPerTonSnapshot: a4BatchCalc.rawCostPerTon.toString(),
        status: 'active',
        createdAt: '2026-05-03T10:00:00Z',
        updatedAt: '2026-05-04T10:00:00Z',
      },
      {
        id: 'd_a4_sent',
        companyId: 'test_co',
        docNumber: 'DSP-2026-0002',
        dateTime: '2026-05-04T12:00:00Z',
        customerId: 'c_1',
        customerName: 'Customer 1',
        vehicleNumber: 'LES-2002',
        bagsCount: 200,
        status: 'active',
        createdAt: '2026-05-04T12:00:00Z',
        updatedAt: '2026-05-04T12:00:00Z',
      },
    ];

    const a4Bills: Bill[] = [
      {
        id: 'bill_a4_1',
        companyId: 'test_co',
        docNumber: 'INV-2026-0001',
        date: '2026-05-04',
        customerId: 'c_1',
        customerName: 'Customer 1',
        dispatchId: 'd_a4_sold',
        dispatchDocNumber: 'DSP-2026-0001',
        dispatchDateTime: '2026-05-03T10:00:00Z',
        vehicleNumber: 'LES-1001',
        bagsCount: 580,
        receivedWeightTons: '29',
        ratePerTon: '25000',
        subtotal: '725000.00',
        discount: '0',
        totalAmount: '725000.00',
        costOfPowderSoldSnapshot: '450000.00',
        status: 'active',
        createdAt: '2026-05-04T10:00:00Z',
        updatedAt: '2026-05-04T10:00:00Z',
      },
    ];

    const a4Snap = getInventorySnapshot({
      catalogItems,
      purchases: a4Purchases,
      batches: a4Batches,
      dispatches: a4Dispatches,
    });

    expect(a4Snap.powder.stock.toNumber()).toBe(14.5);
    expect(a4Snap.powder.totalValue.toNumber()).toBe(225000);
    expect(a4Snap.rawMaterialsValue.toNumber()).toBe(1075000);
    expect(a4Snap.vehiclesOnTheWayCount).toBe(1);

    const a4Inv = calculateAccountingInventoryInvariant({
      purchases: a4Purchases,
      items: catalogItems,
      batches: a4Batches,
      dispatches: a4Dispatches,
      bills: a4Bills,
    });

    expect(a4Inv.purchasedTotal.toNumber()).toBe(1750000);
    expect(a4Inv.rawMaterialsInStockValue.toNumber()).toBe(1075000);
    expect(a4Inv.powderInStockValue.toNumber()).toBe(225000);
    expect(a4Inv.costOfPowderSoldTotal.toNumber()).toBe(450000);
    expect(a4Inv.difference.toNumber()).toBe(0);
    expect(a4Inv.isConsistent).toBe(true);
    expect(a4Inv.message).toBe('All numbers match');

    // Part B: 50 deterministic pseudo-random runs of multi-step purchases, batches, sales, and cancellations
    let rngState = 42;
    const nextRand = () => {
      rngState = (rngState * 1664525 + 1013904223) % 4294967296;
      return rngState / 4294967296;
    };

    for (let run = 0; run < 50; run++) {
      const purchases: Purchase[] = [];
      const batches: ProductionBatch[] = [];
      const dispatches: Dispatch[] = [];
      const bills: Bill[] = [];

      // Create 2 to 4 purchases
      const numPurchases = 2 + Math.floor(nextRand() * 3);
      for (let i = 0; i < numPurchases; i++) {
        const rockQty = Math.floor(50 + nextRand() * 100);
        const rockRate = Math.floor(12000 + nextRand() * 10000);
        const chemAQty = Math.floor(30 + nextRand() * 60);
        const chemARate = Math.floor(3000 + nextRand() * 4000);
        const chemBQty = Math.floor(20 + nextRand() * 50);
        const chemBRate = Math.floor(2500 + nextRand() * 3500);

        const l1Total = new Decimal(rockQty).times(rockRate);
        const l2Total = new Decimal(chemAQty).times(chemARate);
        const l3Total = new Decimal(chemBQty).times(chemBRate);
        const total = l1Total.plus(l2Total).plus(l3Total);

        const dayStr = `2026-06-${String(1 + i).padStart(2, '0')}`;
        purchases.push({
          id: `pur_${run}_${i}`,
          companyId: 'test_co',
          docNumber: `PUR-${i}`,
          date: dayStr,
          supplierId: 'sup_1',
          supplierName: 'Supplier',
          lines: [
            {
              id: `l1_${i}`,
              itemId: 'item_rock',
              itemName: 'White Rock',
              kind: 'rock',
              quantity: String(rockQty),
              rate: String(rockRate),
              amount: l1Total.toFixed(2),
            },
            {
              id: `l2_${i}`,
              itemId: 'item_chem_a',
              itemName: 'Borax',
              kind: 'chemical',
              quantity: String(chemAQty),
              rate: String(chemARate),
              amount: l2Total.toFixed(2),
            },
            {
              id: `l3_${i}`,
              itemId: 'item_chem_b',
              itemName: 'Soda Ash',
              kind: 'chemical',
              quantity: String(chemBQty),
              rate: String(chemBRate),
              amount: l3Total.toFixed(2),
            },
          ],
          chemicalLines: [],
          subtotal: total.toFixed(2),
          otherCharges: '0',
          totalAmount: total.toFixed(2),
          paidNow: '0',
          paymentMethod: 'cash',
          status: 'active',
          createdAt: `${dayStr}T08:00:00Z`,
          updatedAt: `${dayStr}T08:00:00Z`,
        });
      }

      // Create 2 to 3 batches using a fraction of available stock
      const numBatches = 2 + Math.floor(nextRand() * 2);
      for (let b = 0; b < numBatches; b++) {
        const snapBefore = getInventorySnapshot({
          catalogItems,
          purchases,
          batches,
          dispatches,
        });
        const rockItem = snapBefore.rockItems.find((r) => r.itemId === 'item_rock')!;
        const chemA = snapBefore.chemicalItems.find((c) => c.itemId === 'item_chem_a')!;
        const chemB = snapBefore.chemicalItems.find((c) => c.itemId === 'item_chem_b')!;

        const useRock = Math.max(1, Math.floor(rockItem.stock.toNumber() * (0.2 + nextRand() * 0.25)));
        const useChemA = Math.max(1, Math.floor(chemA.stock.toNumber() * (0.2 + nextRand() * 0.25)));
        const useChemB = Math.max(1, Math.floor(chemB.stock.toNumber() * (0.2 + nextRand() * 0.25)));
        const outTons = Number((useRock * (0.92 + nextRand() * 0.15)).toFixed(2));

        const batchCost = calculateProductionBatchCost({
          rockTons: useRock,
          rockAvgCost: rockItem.rawAvgCost,
          chemicals: [
            {
              itemId: 'item_chem_a',
              itemName: 'Borax',
              bags: useChemA,
              avgCostPerBag: chemA.rawAvgCost,
            },
            {
              itemId: 'item_chem_b',
              itemName: 'Soda Ash',
              bags: useChemB,
              avgCostPerBag: chemB.rawAvgCost,
            },
          ],
          finalProductTons: outTons,
        });

        const dayStr = `2026-06-${String(10 + b).padStart(2, '0')}`;
        batches.push({
          id: `bat_${run}_${b}`,
          companyId: 'test_co',
          docNumber: `BAT-${b}`,
          date: dayStr,
          rockItemId: 'item_rock',
          rockItemName: 'White Rock',
          rockTons: String(useRock),
          rockAvgCostSnapshot: rockItem.avgCost.toFixed(2),
          rockCostSnapshot: batchCost.rockCost.toFixed(2),
          chemicalUsages: [
            {
              itemId: 'item_chem_a',
              itemName: 'Borax',
              bags: String(useChemA),
              avgCostPerBagSnapshot: chemA.avgCost.toFixed(2),
              lineCostSnapshot: batchCost.chemicalCosts[0].lineCost.toFixed(2),
            },
            {
              itemId: 'item_chem_b',
              itemName: 'Soda Ash',
              bags: String(useChemB),
              avgCostPerBagSnapshot: chemB.avgCost.toFixed(2),
              lineCostSnapshot: batchCost.chemicalCosts[1].lineCost.toFixed(2),
            },
          ],
          finalProductTons: String(outTons),
          totalCostSnapshot: batchCost.totalCost.toFixed(2),
          costPerTonSnapshot: batchCost.costPerTon.toFixed(2),
          rawCostPerTonSnapshot: batchCost.rawCostPerTon.toString(),
          status: 'active',
          createdAt: `${dayStr}T10:00:00Z`,
          updatedAt: `${dayStr}T10:00:00Z`,
        });
      }

      // Create 2 to 3 sales (and optionally cancel one)
      const numSales = 2 + Math.floor(nextRand() * 2);
      for (let s = 0; s < numSales; s++) {
        const snapBeforeSale = getInventorySnapshot({
          catalogItems,
          purchases,
          batches,
          dispatches,
        });
        const availPowder = snapBeforeSale.powder.stock.toNumber();
        if (availPowder < 2) continue;

        const soldTons = Number((availPowder * (0.2 + nextRand() * 0.3)).toFixed(2));
        const saleRate = Math.floor(25000 + nextRand() * 15000);
        const saleCalc = calculateDispatchAndBill({
          receivedWeightTons: soldTons,
          ratePerTon: saleRate,
          avgCostPerTon: snapBeforeSale.powder.rawAvgCost,
        });

        const isCancelled = s === numSales - 1 && nextRand() > 0.5;
        const status = isCancelled ? ('cancelled' as const) : ('active' as const);
        const dayStr = `2026-06-${String(20 + s).padStart(2, '0')}`;
        const dspId = `dsp_${run}_${s}`;
        const billId = `bill_${run}_${s}`;

        dispatches.push({
          id: dspId,
          companyId: 'test_co',
          docNumber: `DSP-${s}`,
          dateTime: `${dayStr}T09:00:00Z`,
          customerId: 'cust_1',
          customerName: 'Customer',
          vehicleNumber: `VEH-${s}`,
          bagsCount: 100,
          receivedWeightTons: isCancelled ? undefined : String(soldTons),
          ratePerTon: isCancelled ? undefined : String(saleRate),
          saleDate: isCancelled ? undefined : dayStr,
          billId: isCancelled ? undefined : billId,
          billDocNumber: isCancelled ? undefined : `INV-${s}`,
          cogsSnapshot: isCancelled ? undefined : saleCalc.cogs.toFixed(2),
          costOfPowderSoldSnapshot: isCancelled ? undefined : saleCalc.cogs.toFixed(2),
          avgCostPerTonSnapshot: isCancelled ? undefined : snapBeforeSale.powder.avgCost.toFixed(2),
          rawAvgCostPerTonSnapshot: isCancelled ? undefined : snapBeforeSale.powder.rawAvgCost.toString(),
          status: 'active', // If bill was cancelled, dispatch reverts to Sent!
          createdAt: `${dayStr}T09:00:00Z`,
          updatedAt: `${dayStr}T12:00:00Z`,
        });

        bills.push({
          id: billId,
          companyId: 'test_co',
          docNumber: `INV-${s}`,
          date: dayStr,
          customerId: 'cust_1',
          customerName: 'Customer',
          dispatchId: dspId,
          dispatchDocNumber: `DSP-${s}`,
          dispatchDateTime: `${dayStr}T09:00:00Z`,
          vehicleNumber: `VEH-${s}`,
          bagsCount: 100,
          receivedWeightTons: String(soldTons),
          ratePerTon: String(saleRate),
          subtotal: saleCalc.subtotal.toFixed(2),
          discount: '0',
          totalAmount: saleCalc.billAmount.toFixed(2),
          costOfPowderSoldSnapshot: saleCalc.cogs.toFixed(2),
          status,
          createdAt: `${dayStr}T12:00:00Z`,
          updatedAt: `${dayStr}T12:00:00Z`,
        });
      }

      const check = calculateAccountingInventoryInvariant({
        purchases,
        items: catalogItems,
        batches,
        dispatches,
        bills,
      });

      expect(check.isConsistent).toBe(true);
      expect(Math.abs(check.difference.toNumber())).toBeLessThanOrEqual(1.0);
    }
  });

  it('21. Phase 4 Reports Overhaul: A4 dataset reconciles Overview, Profit and loss (-175,000 net profit), Sales report cost/profit, Stock report, and Dashboard identically', async () => {
    const {
      calculateOverviewReport,
      calculateProfitAndLossReport,
      calculateSalesReport,
      calculateStockSummaryReport,
      calculateDashboardAnalytics,
      calculateProductionBatchCost,
      roundMoney,
    } = await import('./engine');

    const catalogItems: Item[] = [
      {
        id: 'item_rock',
        companyId: 'test_co',
        name: 'White Rock',
        kind: 'rock',
        status: 'active',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
      {
        id: 'item_chem_a',
        companyId: 'test_co',
        name: 'Borax',
        kind: 'chemical',
        status: 'active',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ];

    const purchases: Purchase[] = [
      {
        id: 'p_a4_1',
        companyId: 'test_co',
        docNumber: 'PUR-2026-0001',
        date: '2026-05-01',
        supplierId: 'sup_1',
        supplierName: 'Khewra Rock Suppliers',
        lines: [
          {
            id: 'l_1',
            itemId: 'item_rock',
            itemName: 'White Rock',
            kind: 'rock',
            quantity: '100',
            rate: '15000',
            amount: '1500000',
          },
          {
            id: 'l_2',
            itemId: 'item_chem_a',
            itemName: 'Borax',
            kind: 'chemical',
            quantity: '50',
            rate: '5000',
            amount: '250000',
          },
        ],
        chemicalLines: [],
        subtotal: '1750000',
        otherCharges: '0',
        totalAmount: '1750000',
        paidNow: '750000',
        paymentMethod: 'bank',
        status: 'active',
        createdAt: '2026-05-01T08:00:00Z',
        updatedAt: '2026-05-01T08:00:00Z',
      },
    ];

    const batchCalc = calculateProductionBatchCost({
      rockTons: '40',
      rockAvgCost: '15000',
      chemicals: [
        {
          itemId: 'item_chem_a',
          itemName: 'Borax',
          bags: '15',
          avgCostPerBag: '5000',
        },
      ],
      finalProductTons: '43.5',
    });

    const batches: ProductionBatch[] = [
      {
        id: 'b_a4_1',
        companyId: 'test_co',
        docNumber: 'BATCH-2026-0001',
        date: '2026-05-02',
        rockItemId: 'item_rock',
        rockItemName: 'White Rock',
        rockTons: '40',
        rockAvgCostSnapshot: '15000',
        rockCostSnapshot: '600000',
        chemicalUsages: [
          {
            itemId: 'item_chem_a',
            itemName: 'Borax',
            bags: '15',
            avgCostPerBagSnapshot: '5000',
            lineCostSnapshot: '75000',
          },
        ],
        finalProductTons: '43.5',
        totalCostSnapshot: '675000',
        costPerTonSnapshot: batchCalc.costPerTon.toFixed(2),
        rawCostPerTonSnapshot: batchCalc.rawCostPerTon.toString(),
        status: 'active',
        createdAt: '2026-05-02T09:00:00Z',
        updatedAt: '2026-05-02T09:00:00Z',
      },
    ];

    const dispatches: Dispatch[] = [
      {
        id: 'd_a4_sold',
        companyId: 'test_co',
        docNumber: 'DSP-2026-0001',
        dateTime: '2026-05-03T10:00:00Z',
        customerId: 'c_1',
        customerName: 'Alpha Ceramics',
        vehicleNumber: 'LES-1001',
        bagsCount: 580,
        receivedWeightTons: '29',
        ratePerTon: '25000',
        saleDate: '2026-05-04',
        billId: 'bill_a4_1',
        billDocNumber: 'INV-2026-0001',
        cogsSnapshot: '450000.00',
        costOfPowderSoldSnapshot: '450000.00',
        avgCostPerTonSnapshot: '15517.24',
        rawAvgCostPerTonSnapshot: batchCalc.rawCostPerTon.toString(),
        status: 'active',
        createdAt: '2026-05-03T10:00:00Z',
        updatedAt: '2026-05-04T10:00:00Z',
      },
    ];

    const bills: Bill[] = [
      {
        id: 'bill_a4_1',
        companyId: 'test_co',
        docNumber: 'INV-2026-0001',
        date: '2026-05-04',
        customerId: 'c_1',
        customerName: 'Alpha Ceramics',
        dispatchId: 'd_a4_sold',
        dispatchDocNumber: 'DSP-2026-0001',
        dispatchDateTime: '2026-05-03T10:00:00Z',
        vehicleNumber: 'LES-1001',
        bagsCount: 580,
        receivedWeightTons: '29',
        ratePerTon: '25000',
        subtotal: '725000.00',
        discount: '0',
        totalAmount: '725000.00',
        costOfPowderSoldSnapshot: '450000.00',
        status: 'active',
        createdAt: '2026-05-04T10:00:00Z',
        updatedAt: '2026-05-04T10:00:00Z',
      },
    ];

    const records = {
      items: catalogItems,
      suppliers: [
        {
          id: 'sup_1',
          companyId: 'test_co',
          name: 'Khewra Rock Suppliers',
          openingBalance: '0',
          status: 'active' as const,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      ],
      purchases,
      supplierPayments: [],
      batches,
      dispatches,
      customers: [
        {
          id: 'c_1',
          companyId: 'test_co',
          name: 'Alpha Ceramics',
          openingBalance: '0',
          status: 'active' as const,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      ],
      bills,
      customerPayments: [],
      expenses: [
        {
          id: 'exp_1',
          companyId: 'test_co',
          docNumber: 'EXP-2026-0001',
          date: '2026-05-10',
          category: 'electricity' as const,
          description: 'Power bill',
          amount: '150000',
          method: 'bank' as const,
          status: 'active' as const,
          createdAt: '2026-05-10T00:00:00Z',
          updatedAt: '2026-05-10T00:00:00Z',
        },
      ],
      employees: [
        {
          id: 'emp_1',
          companyId: 'test_co',
          name: 'Staff Pool',
          role: 'Supervisor',
          joiningDate: '2026-01-01',
          basicSalary: '300000',
          active: true,
          status: 'active' as const,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      ],
      advances: [],
      salaries: [
        {
          id: 'sal_1',
          companyId: 'test_co',
          docNumber: 'SAL-2026-0001',
          month: '2026-05',
          date: '2026-05-28',
          employeeId: 'emp_1',
          employeeName: 'Staff Pool',
          employeeRole: 'Supervisor',
          basicSalary: '300000',
          bonus: '0',
          advanceDeduction: '0',
          netPayable: '300000',
          paidAmount: '300000',
          paymentStatus: 'paid' as const,
          status: 'active' as const,
          createdAt: '2026-05-28T00:00:00Z',
          updatedAt: '2026-05-28T00:00:00Z',
        },
      ],
    };

    const pnl = calculateProfitAndLossReport(records, '2026-05');
    const overview = calculateOverviewReport(records, {
      fromDate: '2026-05-01',
      toDate: '2026-05-31',
    });
    const salesReport = calculateSalesReport(records, {
      fromDate: '2026-05-01',
      toDate: '2026-05-31',
    });
    const stockReport = calculateStockSummaryReport(records, {
      asOfDate: '2026-05-31',
    });
    const dashboard = calculateDashboardAnalytics(records, '2026-05', '2026-05-31');

    // 1. A4 data gives Sales 725,000, Cost of powder sold 450,000, Profit on sales 275,000,
    // powder closing value 225,000; with expenses 150,000 and salaries 300,000 -> net profit -175,000
    expect(pnl.sales.toNumber()).toBe(725000);
    expect(pnl.cogs.toNumber()).toBe(450000);
    expect(pnl.grossProfit.toNumber()).toBe(275000);
    expect(pnl.expenses.toNumber()).toBe(150000);
    expect(pnl.salaries.toNumber()).toBe(300000);
    expect(pnl.netProfit.toNumber()).toBe(-175000);

    // 2. Dashboard equals the report for the same month
    expect(dashboard.sales.equals(pnl.sales)).toBe(true);
    expect(dashboard.cogs.equals(pnl.cogs)).toBe(true);
    expect(dashboard.grossProfit.equals(pnl.grossProfit)).toBe(true);
    expect(dashboard.expenses.equals(pnl.expenses)).toBe(true);
    expect(dashboard.salaries.equals(pnl.salaries)).toBe(true);
    expect(dashboard.netProfit.equals(pnl.netProfit)).toBe(true);

    // 3. Sum of the Sales rows equals the Sales total
    const sumSalesAmount = salesReport.billRows.reduce(
      (acc, r) => acc.plus(r.amount),
      roundMoney(0)
    );
    const sumSalesCost = salesReport.billRows.reduce(
      (acc, r) => acc.plus(r.cost),
      roundMoney(0)
    );
    const sumSalesProfit = salesReport.billRows.reduce(
      (acc, r) => acc.plus(r.profit),
      roundMoney(0)
    );
    expect(salesReport.totals.amount.equals(sumSalesAmount)).toBe(true);
    expect(salesReport.totals.cost.equals(sumSalesCost)).toBe(true);
    expect(salesReport.totals.profit.equals(sumSalesProfit)).toBe(true);
    expect(salesReport.totals.amount.toNumber()).toBe(725000);
    expect(salesReport.totals.cost.toNumber()).toBe(450000);
    expect(salesReport.totals.profit.toNumber()).toBe(275000);

    // 4. Overview reconciles: raw materials closing 1,075,000, powder closing 225,000,
    // cost of powder sold 450,000, purchases 1,750,000, and matches Stock report & P&L
    expect(overview.rawMaterials.purchasesValue.toNumber()).toBe(1750000);
    expect(overview.rawMaterials.usedInProductionValue.toNumber()).toBe(675000);
    expect(overview.rawMaterials.closingValue.toNumber()).toBe(1075000);
    expect(overview.powder.costOfPowderMade.toNumber()).toBe(675000);
    expect(overview.powder.costOfPowderSold.toNumber()).toBe(450000);
    expect(overview.powder.closingValue.toNumber()).toBe(225000);
    expect(overview.profit.netProfit.toNumber()).toBe(-175000);

    expect(overview.rawMaterials.closingValue.equals(stockReport.rawMaterialsValue)).toBe(
      true
    );
    expect(overview.powder.closingValue.equals(stockReport.powderValue)).toBe(true);
    expect(overview.consistencyCheck.isConsistent).toBe(true);
    expect(overview.consistencyCheck.message).toBe('All numbers match');
  });

  it('22. Phase 5 (5.7 #1): Salary 50,000 and an advance of 20,000 on 15 November -> payable 30,000', () => {
    const novRow = calculateEmployeeMonthlySalaryRow({
      employeeId: 'emp_nov_1',
      month: '2026-11',
      basicSalary: 50000,
      bonus: 0,
      advances: [
        {
          id: 'adv_nov_1',
          companyId: 'co_1',
          docNumber: 'ADV-2026-0001',
          date: '2026-11-15',
          employeeId: 'emp_nov_1',
          employeeName: 'Tariq Mahmood',
          amount: '20000',
          status: 'active',
          createdAt: '2026-11-15T10:00:00Z',
          updatedAt: '2026-11-15T10:00:00Z',
        },
      ],
      salaries: [],
    });

    expect(novRow.basicSalary.toNumber()).toBe(50000);
    expect(novRow.advancesThisMonth.toNumber()).toBe(20000);
    expect(novRow.earlierBalance.toNumber()).toBe(0);
    expect(novRow.netPayable.toNumber()).toBe(30000);
  });

  it('23. Phase 5 (5.7 #2): Two advances of 20,000 and 40,000 in November (total 60,000 > 50,000) -> payable 0, balance -10,000; December salary 50,000 -> payable 40,000', () => {
    const advances = [
      {
        id: 'adv_nov_a',
        companyId: 'co_1',
        docNumber: 'ADV-2026-0001',
        date: '2026-11-05',
        employeeId: 'emp_carry',
        employeeName: 'Kamran Ali',
        amount: '20000',
        status: 'active' as const,
        createdAt: '2026-11-05T10:00:00Z',
        updatedAt: '2026-11-05T10:00:00Z',
      },
      {
        id: 'adv_nov_b',
        companyId: 'co_1',
        docNumber: 'ADV-2026-0002',
        date: '2026-11-18',
        employeeId: 'emp_carry',
        employeeName: 'Kamran Ali',
        amount: '40000',
        status: 'active' as const,
        createdAt: '2026-11-18T10:00:00Z',
        updatedAt: '2026-11-18T10:00:00Z',
      },
    ];

    const novRow = calculateEmployeeMonthlySalaryRow({
      employeeId: 'emp_carry',
      month: '2026-11',
      basicSalary: 50000,
      bonus: 0,
      advances,
      salaries: [],
    });

    expect(novRow.advancesThisMonth.toNumber()).toBe(60000);
    expect(novRow.netPayable.toNumber()).toBe(0);
    expect(novRow.balanceAfterSalary.toNumber()).toBe(-10000);

    const novSalaryRecord = {
      id: 'sal_nov',
      companyId: 'co_1',
      docNumber: 'SAL-2026-0001',
      month: '2026-11',
      date: '2026-11-28',
      employeeId: 'emp_carry',
      employeeName: 'Kamran Ali',
      employeeRole: 'Operator',
      basicSalary: '50000',
      bonus: '0',
      earlierBalance: '0',
      advanceDeduction: '60000',
      netPayable: '0',
      paidAmount: '0',
      paymentStatus: 'paid' as const,
      status: 'active' as const,
      createdAt: '2026-11-28T10:00:00Z',
      updatedAt: '2026-11-28T10:00:00Z',
    };

    const novBalance = calculateEmployeeRunningBalance({
      employeeId: 'emp_carry',
      advances,
      salaries: [novSalaryRecord],
      upToMonth: '2026-11',
    });
    expect(novBalance.balance.toNumber()).toBe(-10000);

    // December salary 50,000: earlierBalance is -10,000 -> payable 40,000
    const decRow = calculateEmployeeMonthlySalaryRow({
      employeeId: 'emp_carry',
      month: '2026-12',
      basicSalary: 50000,
      bonus: 0,
      advances,
      salaries: [novSalaryRecord],
    });
    expect(decRow.earlierBalance.toNumber()).toBe(-10000);
    expect(decRow.advancesThisMonth.toNumber()).toBe(0);
    expect(decRow.netPayable.toNumber()).toBe(40000);
  });

  it('24. Phase 5 (5.7 #3): Delete an employee -> they disappear from active lists, and their November salary stays in the November report', async () => {
    const {
      calculateProfitAndLossReport,
      calculateSalariesAndAdvancesReport,
    } = await import('./reports');

    const employees = [
      {
        id: 'emp_active',
        companyId: 'co_1',
        name: 'Active Worker',
        role: 'Supervisor',
        joiningDate: '2026-01-01',
        basicSalary: '60000',
        active: true,
        status: 'active' as const,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'emp_deleted',
        companyId: 'co_1',
        name: 'Deleted Worker',
        role: 'Helper',
        joiningDate: '2026-01-01',
        basicSalary: '50000',
        active: false,
        status: 'cancelled' as const, // Soft deleted
        cancelledAt: '2026-12-02T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-12-02T00:00:00Z',
      },
    ];

    // Active employee list excludes the deleted employee
    const visibleEmployeesList = employees.filter((e) => e.status === 'active');
    expect(visibleEmployeesList.map((e) => e.id)).toEqual(['emp_active']);

    const records = {
      items: [],
      suppliers: [],
      purchases: [],
      supplierPayments: [],
      batches: [],
      dispatches: [],
      customers: [],
      bills: [],
      customerPayments: [],
      expenses: [],
      employees,
      advances: [],
      salaries: [
        {
          id: 'sal_nov_1',
          companyId: 'co_1',
          docNumber: 'SAL-2026-0001',
          month: '2026-11',
          date: '2026-11-28',
          employeeId: 'emp_active',
          employeeName: 'Active Worker',
          employeeRole: 'Supervisor',
          basicSalary: '60000',
          bonus: '0',
          advanceDeduction: '0',
          netPayable: '60000',
          paidAmount: '60000',
          paymentStatus: 'paid' as const,
          status: 'active' as const,
          createdAt: '2026-11-28T10:00:00Z',
          updatedAt: '2026-11-28T10:00:00Z',
        },
        {
          id: 'sal_nov_2',
          companyId: 'co_1',
          docNumber: 'SAL-2026-0002',
          month: '2026-11',
          date: '2026-11-28',
          employeeId: 'emp_deleted',
          employeeName: 'Deleted Worker',
          employeeRole: 'Helper',
          basicSalary: '50000',
          bonus: '0',
          advanceDeduction: '0',
          netPayable: '50000',
          paidAmount: '50000',
          paymentStatus: 'paid' as const,
          status: 'active' as const,
          createdAt: '2026-11-28T10:00:00Z',
          updatedAt: '2026-11-28T10:00:00Z',
        },
      ],
    };

    // November Profit & Loss and Salaries report keep the deleted employee's November salary (60,000 + 50,000 = 110,000)
    const novPnl = calculateProfitAndLossReport(records, '2026-11');
    expect(novPnl.salaries.toNumber()).toBe(110000);

    const novSalariesReport = calculateSalariesAndAdvancesReport(records, {
      month: '2026-11',
    });
    expect(novSalariesReport.rows.length).toBe(2);
    expect(novSalariesReport.totals.grossSalary.toNumber()).toBe(110000);
  });

  it('25. Phase 5 (5.7 #4): Employee ledger balance always equals salaries earned − advances − salary paid', () => {
    const employee = {
      id: 'emp_ledger_1',
      name: 'Waqas Ahmed',
      role: 'Technician',
      basicSalary: '50000',
    };

    const advances = [
      {
        id: 'adv_1',
        companyId: 'co_1',
        docNumber: 'ADV-2026-0001',
        date: '2026-10-10',
        employeeId: 'emp_ledger_1',
        employeeName: 'Waqas Ahmed',
        amount: '15000',
        status: 'active' as const,
        createdAt: '2026-10-10T10:00:00Z',
        updatedAt: '2026-10-10T10:00:00Z',
      },
      {
        id: 'adv_2',
        companyId: 'co_1',
        docNumber: 'ADV-2026-0002',
        date: '2026-11-12',
        employeeId: 'emp_ledger_1',
        employeeName: 'Waqas Ahmed',
        amount: '60000',
        status: 'active' as const,
        createdAt: '2026-11-12T10:00:00Z',
        updatedAt: '2026-11-12T10:00:00Z',
      },
    ];

    const salaries = [
      {
        id: 'sal_oct',
        companyId: 'co_1',
        docNumber: 'SAL-2026-0001',
        month: '2026-10',
        date: '2026-10-28',
        employeeId: 'emp_ledger_1',
        employeeName: 'Waqas Ahmed',
        employeeRole: 'Technician',
        basicSalary: '50000',
        bonus: '5000',
        earlierBalance: '0',
        advanceDeduction: '15000',
        netPayable: '40000',
        paidAmount: '40000',
        paymentStatus: 'paid' as const,
        paidDate: '2026-10-30',
        status: 'active' as const,
        createdAt: '2026-10-28T10:00:00Z',
        updatedAt: '2026-10-30T10:00:00Z',
      },
      {
        id: 'sal_nov',
        companyId: 'co_1',
        docNumber: 'SAL-2026-0002',
        month: '2026-11',
        date: '2026-11-28',
        employeeId: 'emp_ledger_1',
        employeeName: 'Waqas Ahmed',
        employeeRole: 'Technician',
        basicSalary: '50000',
        bonus: '0',
        earlierBalance: '0',
        advanceDeduction: '60000',
        netPayable: '0',
        paidAmount: '0',
        paymentStatus: 'paid' as const,
        paidDate: '2026-11-28',
        status: 'active' as const,
        createdAt: '2026-11-28T10:00:00Z',
        updatedAt: '2026-11-28T10:00:00Z',
      },
      {
        id: 'sal_dec',
        companyId: 'co_1',
        docNumber: 'SAL-2026-0003',
        month: '2026-12',
        date: '2026-12-28',
        employeeId: 'emp_ledger_1',
        employeeName: 'Waqas Ahmed',
        employeeRole: 'Technician',
        basicSalary: '50000',
        bonus: '0',
        earlierBalance: '-10000',
        advanceDeduction: '0',
        netPayable: '40000',
        paidAmount: '0',
        paymentStatus: 'unpaid' as const,
        status: 'active' as const,
        createdAt: '2026-12-28T10:00:00Z',
        updatedAt: '2026-12-28T10:00:00Z',
      },
    ];

    const ledger = calculateEmployeeLedger({
      employee,
      advances,
      salaries,
      currentMonth: '2026-12',
      currentYear: '2026',
    });

    // Salaries earned = 55,000 + 50,000 + 50,000 = 155,000
    // Advances = 15,000 + 60,000 = 75,000
    // Salary paid = 40,000
    // Current balance = 155,000 - 75,000 - 40,000 = 40,000
    expect(ledger.totalSalariesEarned.toNumber()).toBe(155000);
    expect(ledger.totalAdvances.toNumber()).toBe(75000);
    expect(ledger.totalSalaryPaid.toNumber()).toBe(40000);
    expect(
      ledger.currentBalance.equals(
        ledger.totalSalariesEarned.minus(ledger.totalAdvances).minus(ledger.totalSalaryPaid)
      )
    ).toBe(true);
    expect(ledger.currentBalance.toNumber()).toBe(40000);

    // Also verify after every single row in the ledger, runningBalance == cumulativeIn - cumulativeOut
    let cumIn = new Decimal(0);
    let cumOut = new Decimal(0);
    for (const entry of ledger.entries) {
      cumIn = cumIn.plus(entry.amountIn);
      cumOut = cumOut.plus(entry.amountOut);
      expect(entry.runningBalance.equals(cumIn.minus(cumOut))).toBe(true);
    }
  });

  it('26. Phase 6 (6.1 & 6.3): Full flow on a fresh account (A4 data + payment + expense + employee/advance/salary + Dashboard/Overview/P&L/Check my numbers + all print/PDF documents)', async () => {
    const {
      calculateOverviewReport,
      calculateProfitAndLossReport,
      calculateSalesReport,
      calculatePurchasesReport,
      calculateStockSummaryReport,
      calculateProductionSummaryReport,
      calculateReceivablesReport,
      calculatePayablesReport,
      calculateExpensesReport,
      calculateSalariesAndAdvancesReport,
      calculateDashboardAnalytics,
    } = await import('./reports');
    const { calculateSupplierLedger } = await import('./engine');
    const {
      buildDispatchPrintMeta,
      buildBillPrintMeta,
      getDispatchDisplayStatus,
    } = await import('../features/dispatch/dispatchHelpers');
    const {
      buildCustomerStatementPrintMeta,
      buildPaymentReceiptPrintMeta,
    } = await import('../features/customers/customerHelpers');
    const {
      buildPurchaseVoucherPrintMeta,
      buildSupplierLedgerPrintMeta,
    } = await import('../features/purchases/purchaseHelpers');
    const {
      buildAdvancePrintMeta,
      buildSalarySlipPrintMeta,
      buildSalarySheetPrintMeta,
      buildEmployeeLedgerPrintMeta,
    } = await import('../features/employees/employeeHelpers');

    // Fresh account starting from empty state:
    const companyId = 'co_fresh_phase6';
    const settings: CompanySettings = {
      id: 'set_phase6',
      companyId,
      companyName: 'MK Melting Solutions',
      address: 'Industrial Estate',
      city: 'Lahore',
      phone: '0300-1234567',
      email: 'info@mksolutions.pk',
      prefixes: {
        purchase: 'PUR',
        batch: 'BAT',
        dispatch: 'DSP',
        receipt: 'RCV',
        expense: 'EXP',
        advance: 'ADV',
        salary: 'SAL',
      },
      updatedAt: '2026-11-01T00:00:00Z',
    };

    const items: Item[] = [
      {
        id: 'item_rock',
        companyId,
        name: 'Phosphate Rock',
        kind: 'rock',
        status: 'active',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'item_chem_a',
        companyId,
        name: 'Chemical A',
        kind: 'chemical',
        status: 'active',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ];

    const supplier = {
      id: 'sup_1',
      companyId,
      name: 'Northern Rock & Chem Suppliers',
      phone: '0300-1112223',
      city: 'Abbottabad',
      address: 'Quarry Road',
      openingBalance: '0',
      status: 'active' as const,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };

    const customer = {
      id: 'cust_1',
      companyId,
      name: 'Punjab Glass Industries',
      phone: '0321-9998887',
      city: 'Sheikhupura',
      address: 'GT Road',
      openingBalance: '0',
      status: 'active' as const,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };

    // STEP 1: Purchase 100 ton rock at 15,000 (1,500,000) and 50 bags chemical at 5,000 (250,000) -> Total = 1,750,000
    const purchase1: Purchase = {
      id: 'pur_1',
      companyId,
      docNumber: 'PUR-2026-0001',
      date: '2026-11-02',
      supplierId: supplier.id,
      supplierName: supplier.name,
      lines: [
        {
          id: 'pl_1',
          itemId: 'item_rock',
          itemName: 'Phosphate Rock',
          kind: 'rock',
          quantity: '100',
          rate: '15000',
          amount: '1500000',
        },
        {
          id: 'pl_2',
          itemId: 'item_chem_a',
          itemName: 'Chemical A',
          kind: 'chemical',
          quantity: '50',
          rate: '5000',
          amount: '250000',
        },
      ],
      rockLine: {
        itemId: 'item_rock',
        itemName: 'Phosphate Rock',
        tons: '100',
        ratePerTon: '15000',
        amount: '1500000',
      },
      chemicalLines: [
        {
          id: 'pl_chem_1',
          itemId: 'item_chem_a',
          itemName: 'Chemical A',
          bags: '50',
          ratePerBag: '5000',
          amount: '250000',
        },
      ],
      subtotal: '1750000',
      otherCharges: '0',
      totalAmount: '1750000',
      paidNow: '750000',
      paymentMethod: 'bank',
      status: 'active',
      createdAt: '2026-11-02T09:00:00Z',
      updatedAt: '2026-11-02T09:00:00Z',
    };

    const snapStep1 = getInventorySnapshot({
      catalogItems: items,
      purchases: [purchase1],
      batches: [],
      dispatches: [],
    });
    expect(snapStep1.rockItems[0].stock.toNumber()).toBe(100);
    expect(snapStep1.rockItems[0].avgCost.toNumber()).toBe(15000);
    expect(snapStep1.rockItems[0].totalValue.toNumber()).toBe(1500000);
    expect(snapStep1.chemicalItems[0].stock.toNumber()).toBe(50);
    expect(snapStep1.chemicalItems[0].avgCost.toNumber()).toBe(5000);
    expect(snapStep1.chemicalItems[0].totalValue.toNumber()).toBe(250000);
    expect(snapStep1.powder.stock.toNumber()).toBe(0);
    expect(snapStep1.totalInventoryValue.toNumber()).toBe(1750000);

    const invStep1 = calculateAccountingInventoryInvariant({
      items,
      purchases: [purchase1],
      batches: [],
      dispatches: [],
      bills: [],
    });
    expect(invStep1.difference.toNumber()).toBe(0);
    expect(invStep1.isConsistent).toBe(true);

    // STEP 2: Production: 40 ton rock (600,000) and 15 bags chemical (75,000), 43.5 ton made (total cost 675,000, avg 15,517.24/ton)
    const batchCalc = calculateProductionBatchCost({
      rockTons: 40,
      rockAvgCost: snapStep1.rockItems[0].rawAvgCost,
      chemicals: [
        {
          itemId: 'item_chem_a',
          itemName: 'Chemical A',
          bags: 15,
          avgCostPerBag: snapStep1.chemicalItems[0].rawAvgCost,
        },
      ],
      finalProductTons: 43.5,
    });
    expect(batchCalc.rockCost.toNumber()).toBe(600000);
    expect(batchCalc.totalChemicalCost.toNumber()).toBe(75000);
    expect(batchCalc.totalCost.toNumber()).toBe(675000);
    expect(batchCalc.costPerTon.toFixed(2)).toBe('15517.24');

    const batch1: ProductionBatch = {
      id: 'bat_1',
      companyId,
      docNumber: 'BAT-2026-0001',
      date: '2026-11-05',
      rockItemId: 'item_rock',
      rockItemName: 'Phosphate Rock',
      rockTons: '40',
      rockAvgCostSnapshot: '15000',
      rockCostSnapshot: batchCalc.rockCost.toFixed(2),
      chemicalUsages: [
        {
          itemId: 'item_chem_a',
          itemName: 'Chemical A',
          bags: '15',
          avgCostPerBagSnapshot: '5000',
          lineCostSnapshot: '75000',
        },
      ],
      finalProductTons: '43.5',
      totalCostSnapshot: batchCalc.totalCost.toFixed(2),
      costPerTonSnapshot: batchCalc.costPerTon.toFixed(2),
      rawCostPerTonSnapshot: batchCalc.rawCostPerTon.toString(),
      status: 'active',
      createdAt: '2026-11-05T10:00:00Z',
      updatedAt: '2026-11-05T10:00:00Z',
    };

    const snapStep2 = getInventorySnapshot({
      catalogItems: items,
      purchases: [purchase1],
      batches: [batch1],
      dispatches: [],
    });
    expect(snapStep2.rockItems[0].stock.toNumber()).toBe(60);
    expect(snapStep2.rockItems[0].totalValue.toNumber()).toBe(900000);
    expect(snapStep2.chemicalItems[0].stock.toNumber()).toBe(35);
    expect(snapStep2.chemicalItems[0].totalValue.toNumber()).toBe(175000);
    expect(snapStep2.powder.stock.toNumber()).toBe(43.5);
    expect(snapStep2.powder.avgCost.toFixed(2)).toBe('15517.24');
    expect(snapStep2.powder.totalValue.toNumber()).toBe(675000);
    expect(snapStep2.totalInventoryValue.toNumber()).toBe(1750000);

    const invStep2 = calculateAccountingInventoryInvariant({
      items,
      purchases: [purchase1],
      batches: [batch1],
      dispatches: [],
      bills: [],
    });
    expect(invStep2.difference.toNumber()).toBe(0);

    // STEP 3: Dispatch a vehicle (Sent). Check stock did not change.
    const dispatchSent: Dispatch = {
      id: 'dsp_1',
      companyId,
      docNumber: 'DSP-2026-0001',
      dateTime: '2026-11-08T11:30',
      customerId: customer.id,
      customerName: customer.name,
      vehicleNumber: 'LES-9988',
      driverName: 'Tariq Mehmood',
      bagsCount: 580,
      status: 'active',
      createdAt: '2026-11-08T11:30:00Z',
      updatedAt: '2026-11-08T11:30:00Z',
    };

    const snapStep3 = getInventorySnapshot({
      catalogItems: items,
      purchases: [purchase1],
      batches: [batch1],
      dispatches: [dispatchSent],
    });
    expect(snapStep3.powder.stock.toNumber()).toBe(43.5);
    expect(snapStep3.powder.totalValue.toNumber()).toBe(675000);
    expect(snapStep3.vehiclesOnTheWayCount).toBe(1);
    expect(getDispatchDisplayStatus(dispatchSent, new Map())).toBe('sent');

    const invStep3 = calculateAccountingInventoryInvariant({
      items,
      purchases: [purchase1],
      batches: [batch1],
      dispatches: [dispatchSent],
      bills: [],
    });
    expect(invStep3.difference.toNumber()).toBe(0);

    // STEP 4: Add weight and rate: 29 ton at 25,000. Check the bill (725,000), COGS (450,000), and stock (14.5 ton = 225,000).
    const saleCalc = calculateDispatchAndBill({
      receivedWeightTons: 29,
      ratePerTon: 25000,
      discount: 0,
      avgCostPerTon: snapStep3.powder.rawAvgCost,
    });
    expect(saleCalc.billAmount.toNumber()).toBe(725000);
    expect(saleCalc.cogs.toNumber()).toBe(450000);
    expect(saleCalc.billAmount.minus(saleCalc.cogs).toNumber()).toBe(275000);

    const bill1: Bill = {
      id: 'bill_1',
      companyId,
      docNumber: 'INV-2026-0001',
      date: '2026-11-09',
      customerId: customer.id,
      customerName: customer.name,
      customerAddress: `${customer.address}, ${customer.city}`,
      dispatchId: dispatchSent.id,
      dispatchDocNumber: dispatchSent.docNumber,
      dispatchDateTime: dispatchSent.dateTime,
      vehicleNumber: dispatchSent.vehicleNumber,
      driverName: dispatchSent.driverName,
      bagsCount: dispatchSent.bagsCount,
      receivedWeightTons: '29',
      ratePerTon: '25000',
      subtotal: '725000',
      discount: '0',
      totalAmount: '725000',
      costOfPowderSoldSnapshot: saleCalc.cogs.toFixed(2),
      status: 'active',
      createdAt: '2026-11-09T14:00:00Z',
      updatedAt: '2026-11-09T14:00:00Z',
    };

    const dispatchSold: Dispatch = {
      ...dispatchSent,
      saleDate: '2026-11-09',
      receivedWeightTons: '29',
      ratePerTon: '25000',
      avgCostPerTonSnapshot: batchCalc.costPerTon.toFixed(2),
      rawAvgCostPerTonSnapshot: batchCalc.rawCostPerTon.toString(),
      cogsSnapshot: saleCalc.cogs.toFixed(2),
      costOfPowderSoldSnapshot: saleCalc.cogs.toFixed(2),
      billId: bill1.id,
      billDocNumber: bill1.docNumber,
    };

    const billsMap = new Map([[bill1.id, bill1]]);
    expect(getDispatchDisplayStatus(dispatchSold, billsMap)).toBe('sold');

    const snapStep4 = getInventorySnapshot({
      catalogItems: items,
      purchases: [purchase1],
      batches: [batch1],
      dispatches: [dispatchSold],
    });
    expect(snapStep4.powder.stock.toNumber()).toBe(14.5);
    expect(snapStep4.powder.totalValue.toNumber()).toBe(225000);
    expect(snapStep4.rawMaterialsValue.toNumber()).toBe(1075000);
    expect(snapStep4.totalInventoryValue.toNumber()).toBe(1300000); // 900k rock + 175k chem + 225k powder
    expect(snapStep4.vehiclesOnTheWayCount).toBe(0);

    const invStep4 = calculateAccountingInventoryInvariant({
      items,
      purchases: [purchase1],
      batches: [batch1],
      dispatches: [dispatchSold],
      bills: [bill1],
    });
    expect(invStep4.purchasedTotal.toNumber()).toBe(1750000);
    expect(invStep4.rawMaterialsInStockValue.toNumber()).toBe(1075000);
    expect(invStep4.powderInStockValue.toNumber()).toBe(225000);
    expect(invStep4.costOfPowderSoldTotal.toNumber()).toBe(450000);
    expect(invStep4.accountedTotal.toNumber()).toBe(1750000);
    expect(invStep4.difference.toNumber()).toBe(0);
    expect(invStep4.isConsistent).toBe(true);

    // STEP 5: Receive a customer payment (500,000) and check the ledger and the bill status.
    const payment1 = {
      id: 'pay_1',
      companyId,
      docNumber: 'RCV-2026-0001',
      date: '2026-11-12',
      customerId: customer.id,
      customerName: customer.name,
      amount: '500000',
      method: 'bank' as const,
      notes: 'Partial payment via bank transfer',
      status: 'active' as const,
      createdAt: '2026-11-12T10:00:00Z',
      updatedAt: '2026-11-12T10:00:00Z',
    };

    const custLedgerAfterPartial = calculateCustomerLedgerAndAllocations({
      openingBalance: customer.openingBalance,
      bills: [bill1],
      payments: [payment1],
    });
    expect(custLedgerAfterPartial.totalSold.toNumber()).toBe(725000);
    expect(custLedgerAfterPartial.totalPaid.toNumber()).toBe(500000);
    expect(custLedgerAfterPartial.balance.toNumber()).toBe(225000);
    expect(custLedgerAfterPartial.billAllocations[0].paymentStatus).toBe('partial');
    expect(custLedgerAfterPartial.billAllocations[0].paidAmount.toNumber()).toBe(500000);
    expect(custLedgerAfterPartial.billAllocations[0].remainingAmount.toNumber()).toBe(225000);

    // STEP 6: Add an expense (400,000) and an employee with a salary (50,000), give an advance (20,000), generate and pay the salary (net 30,000).
    const expense1 = {
      id: 'exp_1',
      companyId,
      docNumber: 'EXP-2026-0001',
      date: '2026-11-15',
      category: 'electricity' as const,
      description: 'Factory electricity bill for November',
      amount: '400000',
      method: 'bank' as const,
      paidTo: 'LESCO',
      status: 'active' as const,
      createdAt: '2026-11-15T10:00:00Z',
      updatedAt: '2026-11-15T10:00:00Z',
    };

    const employee1 = {
      id: 'emp_1',
      companyId,
      name: 'Muhammad Aslam',
      role: 'Plant Operator',
      phone: '0301-7776665',
      joiningDate: '2026-11-01',
      basicSalary: '50000',
      active: true,
      status: 'active' as const,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };

    const advance1 = {
      id: 'adv_1',
      companyId,
      docNumber: 'ADV-2026-0001',
      date: '2026-11-15',
      employeeId: employee1.id,
      employeeName: employee1.name,
      amount: '20000',
      notes: 'Mid-month advance',
      status: 'active' as const,
      createdAt: '2026-11-15T12:00:00Z',
      updatedAt: '2026-11-15T12:00:00Z',
    };

    const salaryRowCalc = calculateEmployeeMonthlySalaryRow({
      advances: [advance1],
      salaries: [],
      employeeId: employee1.id,
      month: '2026-11',
      basicSalary: employee1.basicSalary,
      bonus: '0',
    });
    expect(salaryRowCalc.basicSalary.toNumber()).toBe(50000);
    expect(salaryRowCalc.advancesThisMonth.toNumber()).toBe(20000);
    expect(salaryRowCalc.earlierBalance.toNumber()).toBe(0);
    expect(salaryRowCalc.netPayable.toNumber()).toBe(30000);

    const salary1 = {
      id: 'sal_1',
      companyId,
      docNumber: 'SAL-2026-0001',
      month: '2026-11',
      date: '2026-11-30',
      employeeId: employee1.id,
      employeeName: employee1.name,
      employeeRole: employee1.role,
      basicSalary: '50000',
      bonus: '0',
      earlierBalance: '0',
      advanceDeduction: '20000',
      netPayable: '30000',
      paidAmount: '30000',
      paymentStatus: 'paid' as const,
      paidDate: '2026-11-30',
      paymentMethod: 'cash' as const,
      status: 'active' as const,
      createdAt: '2026-11-30T16:00:00Z',
      updatedAt: '2026-11-30T16:00:00Z',
    };

    const empLedger = calculateEmployeeLedger({
      employee: employee1,
      advances: [advance1],
      salaries: [salary1],
      currentMonth: '2026-11',
      currentYear: '2026',
    });
    expect(empLedger.totalSalariesEarned.toNumber()).toBe(50000);
    expect(empLedger.totalAdvances.toNumber()).toBe(20000);
    expect(empLedger.totalSalaryPaid.toNumber()).toBe(30000);
    expect(empLedger.currentBalance.toNumber()).toBe(0);

    // STEP 7: Verify Dashboard, Overview report, Profit and loss report, Sales report, Stock report, and "Check my numbers"
    const allRecords = {
      items,
      suppliers: [supplier],
      purchases: [purchase1],
      supplierPayments: [],
      batches: [batch1],
      dispatches: [dispatchSold],
      customers: [customer],
      bills: [bill1],
      customerPayments: [payment1],
      expenses: [expense1],
      employees: [employee1],
      advances: [advance1],
      salaries: [salary1],
    };

    const overview = calculateOverviewReport(allRecords, {
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
    });
    const pnl = calculateProfitAndLossReport(allRecords, '2026-11');
    const dashboard = calculateDashboardAnalytics(allRecords, '2026-11', '2026-11-30');
    const salesRep = calculateSalesReport(allRecords, {
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
    });
    const stockRep = calculateStockSummaryReport(allRecords, { asOfDate: '2026-11-30' });
    const purchasesRep = calculatePurchasesReport(allRecords, {
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
    });
    const prodRep = calculateProductionSummaryReport(allRecords, {
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
    });
    const recRep = calculateReceivablesReport(allRecords, { onlyPositive: false });
    const payRep = calculatePayablesReport(allRecords, { onlyPositive: false });
    const expRep = calculateExpensesReport(allRecords, {
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
    });
    const salRep = calculateSalariesAndAdvancesReport(allRecords, { month: '2026-11' });

    // Sales = 725,000, COGS = 450,000, Gross Profit = 275,000, Expenses = 400,000, Salaries = 50,000 -> Net Profit = -175,000
    expect(overview.profit.sales.toNumber()).toBe(725000);
    expect(overview.profit.costOfPowderSold.toNumber()).toBe(450000);
    expect(overview.profit.profitOnSales.toNumber()).toBe(275000);
    expect(overview.profit.expenses.toNumber()).toBe(400000);
    expect(overview.profit.salaries.toNumber()).toBe(50000);
    expect(overview.profit.netProfit.toNumber()).toBe(-175000);
    expect(overview.consistencyCheck.difference.toNumber()).toBe(0);
    expect(overview.consistencyCheck.isConsistent).toBe(true);

    expect(pnl.sales.toNumber()).toBe(725000);
    expect(pnl.cogs.toNumber()).toBe(450000);
    expect(pnl.grossProfit.toNumber()).toBe(275000);
    expect(pnl.expenses.toNumber()).toBe(400000);
    expect(pnl.salaries.toNumber()).toBe(50000);
    expect(pnl.netProfit.toNumber()).toBe(-175000);

    expect(dashboard.sales.toNumber()).toBe(725000);
    expect(dashboard.cogs.toNumber()).toBe(450000);
    expect(dashboard.expenses.toNumber()).toBe(400000);
    expect(dashboard.salaries.toNumber()).toBe(50000);
    expect(dashboard.netProfit.toNumber()).toBe(-175000);
    expect(dashboard.receivables.toNumber()).toBe(225000);
    expect(dashboard.payables.toNumber()).toBe(1000000); // 1,750,000 purchased - 750,000 paidNow
    expect(dashboard.finalPowderTons.toNumber()).toBe(14.5);

    expect(salesRep.totals.amount.toNumber()).toBe(725000);
    expect(salesRep.totals.cost.toNumber()).toBe(450000);
    expect(salesRep.totals.profit.toNumber()).toBe(275000);
    expect(stockRep.totalValue.toNumber()).toBe(1300000);
    expect(purchasesRep.totals.amount.toNumber()).toBe(1750000);
    expect(prodRep.totals.finalProductTons.toNumber()).toBe(43.5);
    expect(recRep.totals.balance.toNumber()).toBe(225000);
    expect(payRep.totals.balance.toNumber()).toBe(1000000);
    expect(expRep.totals.amount.toNumber()).toBe(400000);
    expect(salRep.totals.grossSalary.toNumber()).toBe(50000);
    expect(salRep.totals.netPayable.toNumber()).toBe(30000);

    // STEP 6.3: Printing Audit of all documents
    const billDoc = buildBillPrintMeta(bill1, settings, {
      paidAmount: '500000',
      remainingAmount: '225000',
      paymentStatus: 'partial',
    });
    expect(billDoc.title).toBe('Customer Bill');
    expect(billDoc.amountInWordsText).toBe('Rupees Seven Lakh Twenty Five Thousand Only');
    expect(billDoc.columns.length).toBeGreaterThan(0);
    expect(billDoc.rows.length).toBe(1);

    const receiptDoc = buildPaymentReceiptPrintMeta(payment1, customer, settings, {
      balanceBefore: new Decimal(725000),
      balanceAfter: new Decimal(225000),
    });
    expect(receiptDoc.title).toBe('Payment Receipt');
    expect(receiptDoc.amountInWordsText).toBe('Rupees Five Lakh Only');

    const custStmtDoc = buildCustomerStatementPrintMeta(
      customer,
      custLedgerAfterPartial,
      custLedgerAfterPartial.entries,
      settings
    );
    expect(custStmtDoc.title).toBe('Customer Statement of Account');
    expect(custStmtDoc.rows.length).toBe(2);

    const purchaseDoc = buildPurchaseVoucherPrintMeta(purchase1, settings);
    expect(purchaseDoc.title).toBe('Purchase voucher');
    expect(purchaseDoc.amountInWordsText).toBe(
      'Rupees Seventeen Lakh Fifty Thousand Only'
    );

    const supLedger = calculateSupplierLedger({
      openingBalance: supplier.openingBalance,
      purchases: [purchase1],
      payments: [],
    });
    const supStmtDoc = buildSupplierLedgerPrintMeta(supplier, supLedger, settings);
    expect(supStmtDoc.title).toBe('Supplier statement');

    const gatePassDoc = buildDispatchPrintMeta(dispatchSold, settings, 'Sold');
    expect(gatePassDoc.title).toBe('Dispatch Gate Pass');

    const advDoc = buildAdvancePrintMeta({
      advance: advance1,
      employee: employee1,
      settings,
    });
    expect(advDoc.title.toLowerCase()).toContain('advance');
    expect(advDoc.amountInWordsText).toBe('Rupees Twenty Thousand Only');

    const slipDoc = buildSalarySlipPrintMeta({
      salary: salary1,
      employee: employee1,
      settings,
    });
    expect(slipDoc.title).toContain('Salary slip');
    expect(slipDoc.amountInWordsText).toBe('Rupees Thirty Thousand Only');

    const sheetDoc = buildSalarySheetPrintMeta({
      month: '2026-11',
      rows: [salary1],
      settings,
    });
    expect(sheetDoc.title).toContain('Monthly salary sheet');
    expect(sheetDoc.amountInWordsText).toBe('Rupees Thirty Thousand Only');

    const empStmtDoc = buildEmployeeLedgerPrintMeta({
      employee: employee1,
      ledger: empLedger,
      settings,
    });
    expect(empStmtDoc.title).toBe('Employee Statement');
    expect(empStmtDoc.rows.length).toBe(3); // Salary earned, Advance taken, Salary paid
  });

  it('26. D5.2 Edit replay recalculates batch and bill COGS snapshots, preserves accounting-inventory invariant, and blocks negative stock edits', async () => {
    const {
      recomputeInventoryAndSnapshots,
      calculateAccountingInventoryInvariant,
    } = await import('./engine');

    const catalogItems: Item[] = [
      {
        id: 'rock_1',
        companyId: 'c1',
        name: 'Phosphate Rock',
        kind: 'rock',
        status: 'active',
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
      },
      {
        id: 'chem_1',
        companyId: 'c1',
        name: 'Sulfuric Acid',
        kind: 'chemical',
        status: 'active',
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
      },
    ];

    // Edited purchase: 100 ton rock @ 16,000 (was 15,000) + 50 bags chem @ 5,000 = 1,850,000 total
    const editedPurchase: Purchase = {
      id: 'p1',
      companyId: 'c1',
      docNumber: 'PUR-2026-0001',
      date: '2026-03-01',
      supplierId: 'sup_1',
      supplierName: 'Khewra Mines',
      rockLine: {
        itemId: 'rock_1',
        itemName: 'Phosphate Rock',
        tons: '100',
        ratePerTon: '16000',
        amount: '1600000',
      },
      chemicalLines: [
        {
          id: 'cl1',
          itemId: 'chem_1',
          itemName: 'Sulfuric Acid',
          bags: '50',
          ratePerBag: '5000',
          amount: '250000',
        },
      ],
      subtotal: '1850000',
      otherCharges: '0',
      totalAmount: '1850000',
      paidNow: '500000',
      status: 'active',
      editedAt: '2026-03-10T00:00:00Z',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-10T00:00:00Z',
    };

    const batchBeforeReplay: ProductionBatch = {
      id: 'b1',
      companyId: 'c1',
      docNumber: 'BATCH-2026-0001',
      date: '2026-03-02',
      rockItemId: 'rock_1',
      rockItemName: 'Phosphate Rock',
      rockTons: '40',
      rockAvgCostSnapshot: '15000',
      rockCostSnapshot: '600000',
      chemicalUsages: [
        {
          itemId: 'chem_1',
          itemName: 'Sulfuric Acid',
          bags: '15',
          avgCostPerBagSnapshot: '5000',
          lineCostSnapshot: '75000',
        },
      ],
      chemicalLines: [
        {
          itemId: 'chem_1',
          itemName: 'Sulfuric Acid',
          bagsUsed: '15',
          avgCostSnapshot: '5000',
          lineCost: '75000',
        },
      ],
      chemicalsCostSnapshot: '75000',
      finalProductTons: '43.5',
      totalCostSnapshot: '675000',
      totalBatchCostSnapshot: '675000',
      costPerTonSnapshot: '15517.24',
      rawCostPerTonSnapshot: '15517.2413793103448275862069',
      status: 'active',
      createdAt: '2026-03-02T00:00:00Z',
      updatedAt: '2026-03-02T00:00:00Z',
    };

    const dispatchBeforeReplay: Dispatch = {
      id: 'd1',
      companyId: 'c1',
      docNumber: 'DSP-2026-0001',
      dateTime: '2026-03-03T10:00:00Z',
      customerId: 'cust_1',
      customerName: 'Allied Steel',
      vehicleNumber: 'TLA-842',
      bagsCount: 580,
      receivedWeightTons: '29',
      ratePerTon: '25000',
      saleDate: '2026-03-03',
      billId: 'bill_1',
      billDocNumber: 'INV-2026-0001',
      avgCostPerTonSnapshot: '15517.24',
      rawAvgCostPerTonSnapshot: '15517.2413793103448275862069',
      cogsSnapshot: '450000',
      costOfPowderSoldSnapshot: '450000',
      status: 'active',
      createdAt: '2026-03-03T10:00:00Z',
      updatedAt: '2026-03-03T10:00:00Z',
    };

    const billBeforeReplay: Bill = {
      id: 'bill_1',
      companyId: 'c1',
      docNumber: 'INV-2026-0001',
      date: '2026-03-03',
      customerId: 'cust_1',
      customerName: 'Allied Steel',
      dispatchId: 'd1',
      dispatchDocNumber: 'DSP-2026-0001',
      dispatchDateTime: '2026-03-03T10:00:00Z',
      vehicleNumber: 'TLA-842',
      bagsCount: 580,
      receivedWeightTons: '29',
      ratePerTon: '25000',
      subtotal: '725000',
      discount: '0',
      totalAmount: '725000',
      costOfPowderSoldSnapshot: '450000',
      status: 'active',
      createdAt: '2026-03-03T10:00:00Z',
      updatedAt: '2026-03-03T10:00:00Z',
    };

    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems,
      purchases: [editedPurchase],
      batches: [batchBeforeReplay],
      dispatches: [dispatchBeforeReplay],
      bills: [billBeforeReplay],
    });

    expect(recomputed.valid).toBe(true);
    // Batch rock cost is now 40 * 16,000 = 640,000; chemicals = 75,000; total = 715,000
    expect(recomputed.batches[0].rockCostSnapshot).toBe('640000.00');
    expect(recomputed.batches[0].totalBatchCostSnapshot).toBe('715000.00');
    // 29 tons sold out of 43.5 tons = 2/3 of 715,000 = 476,666.67
    expect(recomputed.bills[0].costOfPowderSoldSnapshot).toBe('476666.67');

    // Verify consistency invariant: rawMaterialsValue + powderValue + costOfPowderSold = totalPurchases (1,850,000)
    const invariant = calculateAccountingInventoryInvariant({
      items: catalogItems,
      purchases: [editedPurchase],
      batches: recomputed.batches,
      dispatches: recomputed.dispatches,
      bills: recomputed.bills,
    });
    expect(invariant.isConsistent).toBe(true);
    expect(invariant.difference.toNumber()).toBe(0);

    // Editing purchase rock down to 30 ton (when batch on 2026-03-02 uses 40 ton) is blocked
    const invalidPurchase: Purchase = {
      ...editedPurchase,
      rockLine: {
        itemId: 'rock_1',
        itemName: 'Phosphate Rock',
        tons: '30',
        ratePerTon: '16000',
        amount: '480000',
      },
    };
    const blocked = recomputeInventoryAndSnapshots({
      catalogItems,
      purchases: [invalidPurchase],
      batches: [batchBeforeReplay],
      dispatches: [dispatchBeforeReplay],
      bills: [billBeforeReplay],
    });
    expect(blocked.valid).toBe(false);
    expect(blocked.errorMessage).toContain('Phosphate Rock');
  });

  describe('D8: Receive payment (customer) and Pay supplier FIFO allocation, advances, and cancellation', () => {
    it('Customer payment: bills 597,000 and 200,000 with payment 700,000 -> first bill paid (597,000), second partial (103,000 paid, 97,000 left), balance 97,000; payment 900,000 -> advance 103,000', () => {
      const bills = [
        {
          id: 'bill_1',
          docNumber: 'INV-2026-0001',
          date: '2026-03-01',
          totalAmount: 597000,
          status: 'active' as const,
        },
        {
          id: 'bill_2',
          docNumber: 'INV-2026-0002',
          date: '2026-03-05',
          totalAmount: 200000,
          status: 'active' as const,
        },
      ];

      // 1) Payment of 700,000
      const after700k = calculateCustomerLedgerAndAllocations({
        openingBalance: 0,
        bills,
        payments: [
          {
            id: 'pay_700k',
            docNumber: 'RCV-2026-0001',
            date: '2026-03-10',
            amount: 700000,
            method: 'bank',
            status: 'active',
          },
        ],
      });

      expect(after700k.billAllocations[0].paymentStatus).toBe('paid');
      expect(after700k.billAllocations[0].paidAmount.toNumber()).toBe(597000);
      expect(after700k.billAllocations[0].remainingAmount.toNumber()).toBe(0);

      expect(after700k.billAllocations[1].paymentStatus).toBe('partial');
      expect(after700k.billAllocations[1].paidAmount.toNumber()).toBe(103000);
      expect(after700k.billAllocations[1].remainingAmount.toNumber()).toBe(97000);

      expect(after700k.balance.toNumber()).toBe(97000);
      expect(after700k.advanceAvailable.toNumber()).toBe(0);

      // 2) Payment of 900,000 -> both bills paid, advance of 103,000 (balance -103,000)
      const after900k = calculateCustomerLedgerAndAllocations({
        openingBalance: 0,
        bills,
        payments: [
          {
            id: 'pay_900k',
            docNumber: 'RCV-2026-0001',
            date: '2026-03-10',
            amount: 900000,
            method: 'online',
            status: 'active',
          },
        ],
      });

      expect(after900k.billAllocations[0].paymentStatus).toBe('paid');
      expect(after900k.billAllocations[0].paidAmount.toNumber()).toBe(597000);
      expect(after900k.billAllocations[1].paymentStatus).toBe('paid');
      expect(after900k.billAllocations[1].paidAmount.toNumber()).toBe(200000);
      expect(after900k.balance.toNumber()).toBe(-103000);
      expect(after900k.advanceAvailable.toNumber()).toBe(103000);

      // 3) Cancelling the payment restores bill statuses to unpaid and balance to 797,000
      const afterCancelled = calculateCustomerLedgerAndAllocations({
        openingBalance: 0,
        bills,
        payments: [
          {
            id: 'pay_900k',
            docNumber: 'RCV-2026-0001',
            date: '2026-03-10',
            amount: 900000,
            method: 'online',
            status: 'cancelled',
          },
        ],
      });

      expect(afterCancelled.billAllocations[0].paymentStatus).toBe('unpaid');
      expect(afterCancelled.billAllocations[0].remainingAmount.toNumber()).toBe(597000);
      expect(afterCancelled.billAllocations[1].paymentStatus).toBe('unpaid');
      expect(afterCancelled.billAllocations[1].remainingAmount.toNumber()).toBe(200000);
      expect(afterCancelled.balance.toNumber()).toBe(797000);
    });

    it('Supplier payment: purchases of 1,000,000 (200,000 paidNow) and 500,000, then payment of 900,000 -> first purchase paid (200,000 + 800,000), second partial (100,000 paid, 400,000 left), balance owed 400,000; cancelling restores statuses and balances', async () => {
      const { calculateSupplierLedger } = await import('./engine');

      const purchases = [
        {
          id: 'pur_1',
          docNumber: 'PUR-2026-0001',
          date: '2026-03-01',
          totalAmount: 1000000,
          paidNow: 200000,
          status: 'active' as const,
        },
        {
          id: 'pur_2',
          docNumber: 'PUR-2026-0002',
          date: '2026-03-05',
          totalAmount: 500000,
          paidNow: 0,
          status: 'active' as const,
        },
      ];

      // Before standalone payment: pur_1 is partial (200,000 paid, 800,000 left), pur_2 is unpaid (500,000 left), balance owed is 1,300,000
      const beforeLedger = calculateSupplierLedger({
        openingBalance: 0,
        purchases,
        payments: [],
      });

      expect(beforeLedger.balance.toNumber()).toBe(1300000);
      expect(beforeLedger.purchaseAllocations[0].paymentStatus).toBe('partial');
      expect(beforeLedger.purchaseAllocations[0].paidAmount.toNumber()).toBe(200000);
      expect(beforeLedger.purchaseAllocations[0].remainingAmount.toNumber()).toBe(800000);
      expect(beforeLedger.purchaseAllocations[1].paymentStatus).toBe('unpaid');
      expect(beforeLedger.purchaseAllocations[1].paidAmount.toNumber()).toBe(0);
      expect(beforeLedger.purchaseAllocations[1].remainingAmount.toNumber()).toBe(500000);

      // After payment of 900,000:
      // pur_1: 200,000 paidNow + 800,000 allocated = 1,000,000 paid, 0 left ('paid')
      // pur_2: 0 paidNow + 100,000 allocated = 100,000 paid, 400,000 left ('partial')
      // balance owed: 400,000
      const afterLedger = calculateSupplierLedger({
        openingBalance: 0,
        purchases,
        payments: [
          {
            id: 'sp_900k',
            docNumber: 'PAY-2026-0001',
            date: '2026-03-10',
            amount: 900000,
            method: 'bank',
            status: 'active',
          },
        ],
      });

      expect(afterLedger.purchaseAllocations[0].paymentStatus).toBe('paid');
      expect(afterLedger.purchaseAllocations[0].paidNowAmount.toNumber()).toBe(200000);
      expect(afterLedger.purchaseAllocations[0].allocatedFromPayments.toNumber()).toBe(800000);
      expect(afterLedger.purchaseAllocations[0].paidAmount.toNumber()).toBe(1000000);
      expect(afterLedger.purchaseAllocations[0].remainingAmount.toNumber()).toBe(0);

      expect(afterLedger.purchaseAllocations[1].paymentStatus).toBe('partial');
      expect(afterLedger.purchaseAllocations[1].paidNowAmount.toNumber()).toBe(0);
      expect(afterLedger.purchaseAllocations[1].allocatedFromPayments.toNumber()).toBe(100000);
      expect(afterLedger.purchaseAllocations[1].paidAmount.toNumber()).toBe(100000);
      expect(afterLedger.purchaseAllocations[1].remainingAmount.toNumber()).toBe(400000);

      expect(afterLedger.balance.toNumber()).toBe(400000);
      expect(afterLedger.advanceAvailable.toNumber()).toBe(0);

      // Overpayment test: if payment is 1,450,000 -> both purchases paid, advance to supplier = 150,000 (balance -150,000)
      const overpaidLedger = calculateSupplierLedger({
        openingBalance: 0,
        purchases,
        payments: [
          {
            id: 'sp_1450k',
            docNumber: 'PAY-2026-0001',
            date: '2026-03-10',
            amount: 1450000,
            method: 'online',
            status: 'active',
          },
        ],
      });

      expect(overpaidLedger.purchaseAllocations[0].paymentStatus).toBe('paid');
      expect(overpaidLedger.purchaseAllocations[1].paymentStatus).toBe('paid');
      expect(overpaidLedger.balance.toNumber()).toBe(-150000);
      expect(overpaidLedger.advanceAvailable.toNumber()).toBe(150000);

      // Cancelling the 900,000 payment restores statuses and balances to beforeLedger
      const afterCancelledLedger = calculateSupplierLedger({
        openingBalance: 0,
        purchases,
        payments: [
          {
            id: 'sp_900k',
            docNumber: 'PAY-2026-0001',
            date: '2026-03-10',
            amount: 900000,
            method: 'bank',
            status: 'cancelled',
          },
        ],
      });

      expect(afterCancelledLedger.balance.toNumber()).toBe(1300000);
      expect(afterCancelledLedger.purchaseAllocations[0].paymentStatus).toBe('partial');
      expect(afterCancelledLedger.purchaseAllocations[0].paidAmount.toNumber()).toBe(200000);
      expect(afterCancelledLedger.purchaseAllocations[0].remainingAmount.toNumber()).toBe(800000);
      expect(afterCancelledLedger.purchaseAllocations[1].paymentStatus).toBe('unpaid');
      expect(afterCancelledLedger.purchaseAllocations[1].remainingAmount.toNumber()).toBe(500000);
    });
  });

  it('30. Offline write guard blocks saving with "You are offline. Reconnect to save" when offline', async () => {
    const { assertOnlineForSave, OFFLINE_SAVE_MESSAGE } = await import('../lib/supabase');
    expect(OFFLINE_SAVE_MESSAGE).toBe('You are offline. Reconnect to save');

    const origNavigator = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        configurable: true,
      });
      expect(() => assertOnlineForSave()).toThrow('You are offline. Reconnect to save');

      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: true },
        configurable: true,
      });
      expect(() => assertOnlineForSave()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: origNavigator,
        configurable: true,
      });
    }
  });
});
