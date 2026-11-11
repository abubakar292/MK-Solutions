export type RecordStatus = 'active' | 'cancelled';

export interface BaseRecord {
  id: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  editedAt?: string;
  status: RecordStatus;
  cancelReason?: string;
  cancelledAt?: string;
}

export type ItemKind = 'rock' | 'chemical';

export interface InventoryItem extends BaseRecord {
  name: string;
  kind: ItemKind; // 'rock' (tons) | 'chemical' (bags)
  notes?: string;
  lowStockAlert?: string;
}

export type Item = InventoryItem;

export interface Supplier extends BaseRecord {
  name: string;
  phone?: string;
  city?: string;
  address?: string;
  openingBalance: string; // PKR Decimal string
  contactPerson?: string;
  alternatePhone?: string;
  email?: string;
  ntnOrCnic?: string;
  paymentTermsDays?: string;
  notes?: string;
}

export interface PurchaseItemLine {
  id: string;
  itemId: string;
  itemName: string;
  kind: ItemKind; // 'rock' | 'chemical'
  quantity: string; // tons for rock, bags for chemical
  rate: string; // Rs per ton or Rs per bag
  amount: string; // PKR Decimal (rounded 2 places)
}

export interface PurchaseRockLine {
  itemId: string;
  itemName: string;
  tons: string; // Decimal up to 3 places
  ratePerTon: string; // PKR Decimal
  amount: string; // PKR Decimal (rounded 2 places)
}

export interface PurchaseChemicalLine {
  id: string;
  itemId: string;
  itemName: string;
  bags: string; // Decimal / integer bags
  ratePerBag: string; // PKR Decimal
  amount: string; // PKR Decimal (rounded 2 places)
}

export interface Purchase extends BaseRecord {
  docNumber: string; // PUR-YYYY-NNNN
  date: string; // ISO date or datetime
  supplierId: string;
  supplierName: string;
  vehicleNumber?: string;
  supplierBillNumber?: string;
  driverName?: string;
  lines?: PurchaseItemLine[];
  rockLine?: PurchaseRockLine | null;
  chemicalLines: PurchaseChemicalLine[];
  subtotal: string;
  otherCharges: string;
  totalAmount: string;
  paidNow: string;
  paymentMethod?: 'cash' | 'bank' | 'cheque';
  reference?: string;
  notes?: string;
}

export interface BatchChemicalUsage {
  itemId: string;
  itemName: string;
  bags: string;
  avgCostPerBagSnapshot: string;
  lineCostSnapshot: string;
}

export interface ProductionBatch extends BaseRecord {
  docNumber: string; // BATCH-YYYY-NNNN
  date: string;
  rockItemId: string;
  rockItemName: string;
  rockTons: string;
  rockAvgCostSnapshot: string;
  rockCostSnapshot: string;
  chemicalUsages: BatchChemicalUsage[];
  chemicalLines?: Array<{
    itemId: string;
    itemName: string;
    bagsUsed: string;
    avgCostSnapshot: string;
    lineCost: string;
  }>;
  chemicalsCostSnapshot?: string;
  finalProductTons: string;
  totalCostSnapshot: string;
  totalBatchCostSnapshot?: string;
  costPerTonSnapshot: string; // Rounded 2 decimals
  rawCostPerTonSnapshot: string; // High precision Decimal string for exact COGS replay
  shift?: string;
  machine?: string;
  notes?: string;
}

export interface Dispatch extends BaseRecord {
  docNumber: string; // DSP-YYYY-NNNN
  dateTime: string;
  customerId: string;
  customerName: string;
  vehicleNumber: string;
  driverName?: string;
  driverPhone?: string;
  destinationCity?: string;
  bagsCount: number; // Information only
  receivedWeightTons?: string; // Customer received weight in tons
  ratePerTon?: string;
  saleDate?: string;
  avgCostPerTonSnapshot?: string;
  rawAvgCostPerTonSnapshot?: string;
  cogsSnapshot?: string; // received tons * avg cost per ton on sale date
  costOfPowderSoldSnapshot?: string; // COGS snapshot alias
  billId?: string;
  billDocNumber?: string;
  notes?: string;
}

export type BillPaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface Bill extends BaseRecord {
  docNumber: string; // INV-YYYY-NNNN
  date: string; // Sale / Bill date
  customerId: string;
  customerName: string;
  customerAddress?: string;
  unloadingAddress?: string;
  dispatchId: string;
  dispatchDocNumber: string;
  dispatchDateTime: string;
  vehicleNumber: string;
  driverName?: string;
  driverPhone?: string;
  bagsCount: number;
  receivedWeightTons: string;
  ratePerTon: string;
  subtotal: string; // receivedWeight * ratePerTon
  discount: string;
  totalAmount: string; // subtotal - discount
  costOfPowderSoldSnapshot?: string; // COGS snapshot
  weightSlipNumber?: string;
  remarks?: string;
  notes?: string;
}

export interface Customer extends BaseRecord {
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  openingBalance: string; // PKR Decimal
  contactPerson?: string;
  alternatePhone?: string;
  email?: string;
  unloadingAddress?: string;
  ntn?: string;
  paymentTermsDays?: string;
  notes?: string;
}

export interface CustomerPayment extends BaseRecord {
  docNumber: string; // RCV-YYYY-NNNN
  date: string;
  customerId: string;
  customerName: string;
  amount: string;
  method: 'cash' | 'bank' | 'cheque' | 'online';
  reference?: string;
  bankName?: string;
  notes?: string;
}

export interface SupplierPayment extends BaseRecord {
  docNumber: string; // PAY-YYYY-NNNN
  date: string;
  supplierId: string;
  supplierName: string;
  amount: string;
  method: 'cash' | 'bank' | 'cheque' | 'online';
  reference?: string;
  bankName?: string;
  notes?: string;
}

export type ExpenseCategory =
  | 'machine_maintenance'
  | 'factory_maintenance'
  | 'electricity'
  | 'transport'
  | 'other'
  | (string & {});

export interface Expense extends BaseRecord {
  docNumber: string; // EXP-YYYY-NNNN
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  paidTo?: string;
  method: PaymentMethod;
  invoiceNumber?: string;
  reference?: string;
  notes?: string;
}

export interface Employee extends BaseRecord {
  name: string;
  role: string;
  phone?: string;
  joiningDate: string;
  basicSalary: string;
  cnic?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  active: boolean;
  notes?: string;
}

export interface EmployeeAdvance extends BaseRecord {
  docNumber: string; // ADV-YYYY-NNNN
  date: string;
  employeeId: string;
  employeeName: string;
  amount: string;
  notes?: string;
}

export type PaymentMethod = 'cash' | 'bank' | 'cheque' | 'online';

export interface SalaryRecord extends BaseRecord {
  docNumber: string; // SAL-YYYY-NNNN
  month: string; // YYYY-MM
  date: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  basicSalary: string;
  bonus: string;
  earlierBalance?: string;
  advanceDeduction: string;
  otherDeduction?: string;
  netPayable: string;
  paidAmount: string;
  paymentStatus?: 'unpaid' | 'paid';
  paidDate?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export interface DocumentPrefixes {
  purchase: string;
  batch: string;
  dispatch: string;
  receipt: string;
  expense: string;
  advance: string;
  salary: string;
}

export type DocumentNumberType = keyof DocumentPrefixes | 'bill';

export interface CompanySettings {
  id: string;
  companyId: string;
  companyName: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  logoDataUrl?: string;
  prefixes: DocumentPrefixes;
  updatedAt: string;
}

export interface UserAccount {
  id: string;
  companyId: string;
  fullName: string;
  email: string;
  passwordHash: string;
  companyName: string;
  needsCompanySetup: boolean;
  createdAt: string;
}
