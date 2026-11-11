import type {
  Bill,
  CompanySettings,
  Customer,
  CustomerPayment,
  Dispatch,
  DocumentNumberType,
  Employee,
  EmployeeAdvance,
  Expense,
  InventoryItem,
  ProductionBatch,
  Purchase,
  SalaryRecord,
  Supplier,
  SupplierPayment,
} from '../domain/types';
import type {
  AllCompanyRecords,
  CustomerLedgerResult,
  InventorySnapshot,
  InvariantCheckResult,
  ItemStockState,
  SupplierLedgerDetailResult,
} from '../domain/engine';

export interface AuthSession {
  userId: string;
  companyId: string;
  fullName: string;
  email: string;
  companyName: string;
  needsCompanySetup: boolean;
}

export interface IAuthService {
  getCurrentSession(): Promise<AuthSession | null>;
  onAuthStateChange(
    listener: (session: AuthSession | null, event?: string) => void
  ): () => void;
  signUp(input: {
    fullName: string;
    email: string;
    password: string;
  }): Promise<AuthSession>;
  completeCompanySetup(companyName: string): Promise<AuthSession>;
  login(input: { email: string; password: string }): Promise<AuthSession>;
  requestPasswordReset(input: { email: string; newPassword?: string }): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  logout(): Promise<void>;
}

export interface IPurchaseService {
  listPurchases(companyId: string): Promise<Purchase[]>;
  listSuppliers(companyId: string): Promise<Supplier[]>;
  listItems(companyId: string): Promise<InventoryItem[]>;
  createSupplierInline(companyId: string, name: string, phone?: string): Promise<Supplier>;
  createSupplier(
    companyId: string,
    data: Omit<Supplier, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<Supplier>;
  updateSupplier(
    companyId: string,
    id: string,
    patch: Partial<Omit<Supplier, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'status'>>
  ): Promise<Supplier>;
  deleteSupplier(companyId: string, id: string): Promise<void>;
  createItemInline(
    companyId: string,
    name: string,
    kind: 'rock' | 'chemical',
    extra?: { notes?: string; lowStockAlert?: string }
  ): Promise<InventoryItem>;
  createItem(
    companyId: string,
    data: Omit<InventoryItem, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<InventoryItem>;
  updateItem(
    companyId: string,
    id: string,
    patch: Partial<Omit<InventoryItem, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'status'>>
  ): Promise<InventoryItem>;
  renameItem(companyId: string, itemId: string, newName: string): Promise<void>;
  createPurchase(
    companyId: string,
    data: Omit<Purchase, 'id' | 'companyId' | 'docNumber' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<Purchase>;
  updatePurchase(
    companyId: string,
    id: string,
    data: Omit<Purchase, 'id' | 'companyId' | 'docNumber' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<Purchase>;
  cancelPurchase(companyId: string, id: string, reason: string): Promise<void>;
  deletePurchase(companyId: string, id: string): Promise<void>;
  listSupplierPayments(companyId: string, supplierId?: string): Promise<SupplierPayment[]>;
  paySupplier(
    companyId: string,
    data: Omit<SupplierPayment, 'id' | 'companyId' | 'docNumber' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<SupplierPayment>;
  cancelSupplierPayment(companyId: string, id: string, reason: string): Promise<void>;
  deleteSupplierPayment(companyId: string, id: string): Promise<void>;
  getSupplierLedger(companyId: string, supplierId: string): Promise<SupplierLedgerDetailResult>;
}

export interface IProductionService {
  listBatches(companyId: string): Promise<ProductionBatch[]>;
  createBatch(
    companyId: string,
    data: Omit<
      ProductionBatch,
      | 'id'
      | 'companyId'
      | 'docNumber'
      | 'createdAt'
      | 'updatedAt'
      | 'status'
      | 'rockAvgCostSnapshot'
      | 'rockCostSnapshot'
      | 'totalCostSnapshot'
      | 'costPerTonSnapshot'
      | 'rawCostPerTonSnapshot'
    >
  ): Promise<ProductionBatch>;
  updateBatch(
    companyId: string,
    id: string,
    data: Omit<
      ProductionBatch,
      | 'id'
      | 'companyId'
      | 'docNumber'
      | 'createdAt'
      | 'updatedAt'
      | 'status'
      | 'rockAvgCostSnapshot'
      | 'rockCostSnapshot'
      | 'totalCostSnapshot'
      | 'costPerTonSnapshot'
      | 'rawCostPerTonSnapshot'
    >
  ): Promise<ProductionBatch>;
  cancelBatch(companyId: string, id: string, reason: string): Promise<void>;
  deleteBatch(companyId: string, id: string): Promise<void>;
}

export interface IDispatchService {
  listDispatches(companyId: string): Promise<Dispatch[]>;
  createDispatch(
    companyId: string,
    data: Omit<
      Dispatch,
      | 'id'
      | 'companyId'
      | 'docNumber'
      | 'createdAt'
      | 'updatedAt'
      | 'status'
      | 'receivedWeightTons'
      | 'ratePerTon'
      | 'saleDate'
      | 'avgCostPerTonSnapshot'
      | 'rawAvgCostPerTonSnapshot'
      | 'cogsSnapshot'
      | 'billId'
      | 'billDocNumber'
    >
  ): Promise<Dispatch>;
  editDispatch(
    companyId: string,
    id: string,
    data: Partial<Pick<Dispatch, 'customerId' | 'customerName' | 'vehicleNumber' | 'driverName' | 'driverPhone' | 'destinationCity' | 'bagsCount' | 'notes' | 'dateTime'>>
  ): Promise<Dispatch>;
  cancelDispatch(companyId: string, id: string, reason: string): Promise<void>;
  deleteDispatch(companyId: string, id: string): Promise<void>;
}

export interface IInvoiceService {
  listBills(companyId: string): Promise<Bill[]>;
  createBill(
    companyId: string,
    data: Omit<
      Bill,
      | 'id'
      | 'companyId'
      | 'docNumber'
      | 'createdAt'
      | 'updatedAt'
      | 'status'
      | 'subtotal'
      | 'totalAmount'
      | 'costOfPowderSoldSnapshot'
    >
  ): Promise<Bill>;
  updateBill(
    companyId: string,
    id: string,
    patch: {
      date: string;
      receivedWeightTons: string;
      ratePerTon: string;
      discount: string;
      weightSlipNumber?: string;
      remarks?: string;
      notes?: string;
    }
  ): Promise<Bill>;
  cancelBill(companyId: string, id: string, reason: string): Promise<void>;
  deleteBill(companyId: string, id: string): Promise<void>;
}

export interface ICustomerService {
  listCustomers(companyId: string): Promise<Customer[]>;
  createCustomer(
    companyId: string,
    data: Omit<Customer, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<Customer>;
  updateCustomer(
    companyId: string,
    id: string,
    patch: Partial<Omit<Customer, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'status'>>
  ): Promise<Customer>;
  deleteCustomer(companyId: string, id: string): Promise<void>;
  listPayments(companyId: string, customerId?: string): Promise<CustomerPayment[]>;
  receivePayment(
    companyId: string,
    data: Omit<CustomerPayment, 'id' | 'companyId' | 'docNumber' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<CustomerPayment>;
  updatePayment(
    companyId: string,
    id: string,
    patch: Partial<Pick<CustomerPayment, 'date' | 'amount' | 'method' | 'reference' | 'bankName' | 'notes'>>
  ): Promise<CustomerPayment>;
  cancelPayment(companyId: string, id: string, reason: string): Promise<void>;
  deletePayment(companyId: string, id: string): Promise<void>;
  getCustomerLedger(companyId: string, customerId: string): Promise<CustomerLedgerResult>;
}

export interface ExpenseCategoryOption {
  value: string;
  label: string;
}

export interface IExpenseService {
  listExpenses(companyId: string): Promise<Expense[]>;
  listCategories(companyId: string): Promise<ExpenseCategoryOption[]>;
  createCategoryInline(companyId: string, label: string): Promise<ExpenseCategoryOption>;
  deleteCategory(companyId: string, value: string): Promise<void>;
  createExpense(
    companyId: string,
    data: Omit<Expense, 'id' | 'companyId' | 'docNumber' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<Expense>;
  updateExpense(
    companyId: string,
    id: string,
    patch: Partial<Omit<Expense, 'id' | 'companyId' | 'docNumber' | 'createdAt' | 'updatedAt' | 'status'>>
  ): Promise<Expense>;
  cancelExpense(companyId: string, id: string, reason: string): Promise<void>;
  deleteExpense(companyId: string, id: string): Promise<void>;
}

export interface IEmployeeService {
  listEmployees(companyId: string): Promise<Employee[]>;
  createEmployee(
    companyId: string,
    data: Omit<Employee, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<Employee>;
  updateEmployee(
    companyId: string,
    id: string,
    patch: Partial<Omit<Employee, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'status'>>
  ): Promise<Employee>;
  deleteEmployee(companyId: string, id: string): Promise<void>;
  listAdvances(companyId: string, employeeId?: string): Promise<EmployeeAdvance[]>;
  createAdvance(
    companyId: string,
    data: Omit<EmployeeAdvance, 'id' | 'companyId' | 'docNumber' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<EmployeeAdvance>;
  updateAdvance(
    companyId: string,
    id: string,
    patch: Partial<Pick<EmployeeAdvance, 'date' | 'amount' | 'notes'>>
  ): Promise<EmployeeAdvance>;
  cancelAdvance(companyId: string, id: string, reason: string): Promise<void>;
  deleteAdvance(companyId: string, id: string): Promise<void>;
  listSalaries(companyId: string, month?: string): Promise<SalaryRecord[]>;
  createSalary(
    companyId: string,
    data: Omit<SalaryRecord, 'id' | 'companyId' | 'docNumber' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<SalaryRecord>;
  generateSalarySheet(companyId: string, month: string): Promise<SalaryRecord[]>;
  updateSalaryRow(
    companyId: string,
    id: string,
    patch: {
      bonus?: string;
      notes?: string;
    }
  ): Promise<SalaryRecord>;
  markSalaryPaid(
    companyId: string,
    id: string,
    input: {
      paidDate: string;
      paymentMethod: 'cash' | 'bank' | 'cheque' | 'online';
    }
  ): Promise<SalaryRecord>;
  markAllSalariesPaid(
    companyId: string,
    month: string,
    input: {
      paidDate: string;
      paymentMethod: 'cash' | 'bank' | 'cheque' | 'online';
    }
  ): Promise<SalaryRecord[]>;
  cancelSalary(companyId: string, id: string, reason: string): Promise<void>;
  deleteSalary(companyId: string, id: string): Promise<void>;
}

export interface DashboardSummary {
  month: string;
  sales: string;
  cogs: string;
  grossProfit: string;
  expenses: string;
  salaries: string;
  netProfit: string;
  rockStockTons: string;
  finalProductStockTons: string;
  totalReceivables: string;
  totalPayables: string;
  activePurchasesCount: number;
  activeBatchesCount: number;
  activeDispatchesCount: number;
  activeBillsCount: number;
}

export interface IReportService {
  getStockSnapshot(companyId: string): Promise<{
    items: ItemStockState[];
    finalProduct: ItemStockState;
  }>;
  getInventorySnapshot(companyId: string, asOfDate?: string): Promise<InventorySnapshot>;
  checkNumbersConsistency(companyId: string): Promise<InvariantCheckResult>;
  getDashboardSummary(companyId: string, month: string): Promise<DashboardSummary>;
  getAllCompanyRecords(companyId: string): Promise<AllCompanyRecords>;
}

export interface ISettingsService {
  getSettings(companyId: string): Promise<CompanySettings>;
  updateSettings(companyId: string, patch: Partial<CompanySettings>): Promise<CompanySettings>;
  nextDocumentNumber(
    companyId: string,
    docType: DocumentNumberType,
    year?: number
  ): Promise<string>;
}
