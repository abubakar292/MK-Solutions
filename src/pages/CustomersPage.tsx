import { zodResolver } from '@hookform/resolvers/zod';
import Decimal from 'decimal.js';
import { Banknote, Plus, Users } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { SectionLoader } from '../components/loader/SectionLoader';
import {
  downloadDocumentPdf,
  usePrintDocument,
} from '../components/print/PrintLayout';
import { DataTable } from '../components/shared/DataTable';
import { DeleteConfirmDialog } from '../components/shared/DeleteConfirmDialog';
import { DetailDrawer } from '../components/shared/DetailDrawer';
import { ConfirmDialog, Dialog } from '../components/shared/Dialog';
import { EmptyState } from '../components/shared/EmptyState';
import {
  FilterBar,
  FilterSelectPill,
  type FilterChip,
} from '../components/shared/FilterBar';
import { MoneyInput, TextArea, TextInput } from '../components/shared/Inputs';
import { MoreDetailsSection } from '../components/shared/MoreDetailsSection';
import { PageHeader } from '../components/shared/PageHeader';
import { RowActions } from '../components/shared/RowActions';
import { StatCard, StatCardGrid } from '../components/shared/StatCard';
import { Button } from '../components/ui/Button';
import {
  calculateCustomerLedgerAndAllocations,
  roundMoney,
  type CustomerLedgerResult,
} from '../domain/engine';
import type {
  Bill,
  CompanySettings,
  Customer,
  CustomerPayment,
  Dispatch,
} from '../domain/types';
import { useAuth } from '../features/auth/AuthContext';
import { BillDetailDialog } from '../features/bills/BillDetailDialog';
import { CustomerDetailDialog } from '../features/customers/CustomerDetailDialog';
import { CustomerLedgerView } from '../features/customers/CustomerLedgerView';
import { PaymentReceiptDialog } from '../features/customers/PaymentReceiptDialog';
import { ReceivePaymentDialog } from '../features/customers/ReceivePaymentDialog';
import {
  buildCustomerStatementPrintMeta,
  buildPaymentReceiptPrintMeta,
} from '../features/customers/customerHelpers';
import { NewDispatchDialog } from '../features/dispatch/NewDispatchDialog';
import { formatDate, formatMoney } from '../lib/format';
import { notify } from '../lib/notify';
import { cn } from '../lib/utils';
import {
  CustomerService,
  DispatchService,
  InvoiceService,
  ReportService,
  SettingsService,
} from '../services';

const customerSchema = z.object({
  name: z.string().trim().min(2, 'Enter customer name'),
  phone: z.string().trim().optional(),
  openingBalance: z.string().optional(),
  contactPerson: z.string().trim().optional(),
  alternatePhone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  city: z.string().trim().optional(),
  address: z.string().trim().optional(),
  unloadingAddress: z.string().trim().optional(),
  ntn: z.string().trim().optional(),
  paymentTermsDays: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

interface CustomerRowViewModel {
  customer: Customer;
  ledger: CustomerLedgerResult;
  billsCount: number;
  lastDispatchDate?: string;
  lastPaymentDate?: string;
  hasRecords: boolean;
}

export const CustomersPage: React.FC = () => {
  const { session } = useAuth();
  const companyId = session?.companyId || '';
  const { printDocument } = usePrintDocument();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [finalStockTons, setFinalStockTons] = useState<Decimal>(new Decimal(0));
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters: search, city
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');

  // Active Ledger View + Dialogs & Drawer
  const [selectedLedgerCustomerId, setSelectedLedgerCustomerId] = useState<
    string | null
  >(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [savedCustomerSuccess, setSavedCustomerSuccess] = useState(false);
  const [receivePaymentCustomer, setReceivePaymentCustomer] = useState<
    Customer | undefined
  >(undefined);
  const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);
  const [newDispatchCustomer, setNewDispatchCustomer] = useState<
    Customer | undefined
  >(undefined);
  const [newDispatchOpen, setNewDispatchOpen] = useState(false);
  const [drawerCustomerId, setDrawerCustomerId] = useState<string | null>(null);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(
    null
  );
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Receipt & Bill previews
  const [receiptPreview, setReceiptPreview] = useState<{
    payment: CustomerPayment;
    balanceBefore?: Decimal;
    balanceAfter?: Decimal;
  } | null>(null);
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);
  const [cancellingPayment, setCancellingPayment] =
    useState<CustomerPayment | null>(null);
  const [cancelPaymentLoading, setCancelPaymentLoading] = useState(false);
  const [highlightedCustomerId, setHighlightedCustomerId] = useState<
    string | null
  >(null);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [
        custList,
        billList,
        dispatchList,
        paymentList,
        stockSnapshot,
        companySettings,
      ] = await Promise.all([
        CustomerService.listCustomers(companyId),
        InvoiceService.listBills(companyId),
        DispatchService.listDispatches(companyId),
        CustomerService.listPayments(companyId),
        ReportService.getStockSnapshot(companyId),
        SettingsService.getSettings(companyId),
      ]);
      setCustomers(custList);
      setBills(billList);
      setDispatches(dispatchList);
      setPayments(paymentList);
      setFinalStockTons(stockSnapshot.finalProduct.quantity);
      setSettings(companySettings);
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Failed to load customers.'
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Customer Form (New & Edit)
  const {
    register: regCust,
    handleSubmit: handleCustSubmit,
    reset: resetCustForm,
    formState: { errors: custErrors, isSubmitting: isSavingCust },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      phone: '',
      openingBalance: '0',
      contactPerson: '',
      alternatePhone: '',
      email: '',
      city: '',
      address: '',
      unloadingAddress: '',
      ntn: '',
      paymentTermsDays: '',
      notes: '',
    },
  });

  const openNewCustomerModal = () => {
    setEditingCustomer(null);
    setSavedCustomerSuccess(false);
    resetCustForm({
      name: '',
      phone: '',
      openingBalance: '0',
      contactPerson: '',
      alternatePhone: '',
      email: '',
      city: '',
      address: '',
      unloadingAddress: '',
      ntn: '',
      paymentTermsDays: '',
      notes: '',
    });
    setCustomerModalOpen(true);
  };

  const openEditCustomerModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setSavedCustomerSuccess(false);
    resetCustForm({
      name: cust.name,
      phone: cust.phone || '',
      openingBalance: cust.openingBalance || '0',
      contactPerson: cust.contactPerson || '',
      alternatePhone: cust.alternatePhone || '',
      email: cust.email || '',
      city: cust.city || '',
      address: cust.address || '',
      unloadingAddress: cust.unloadingAddress || '',
      ntn: cust.ntn || '',
      paymentTermsDays: cust.paymentTermsDays || '',
      notes: cust.notes || '',
    });
    setCustomerModalOpen(true);
  };

  const handleSaveCustomer = async (values: CustomerFormValues) => {
    if (!companyId) return;
    try {
      const payload = {
        name: values.name.trim(),
        phone: values.phone?.trim() || undefined,
        contactPerson: values.contactPerson?.trim() || undefined,
        alternatePhone: values.alternatePhone?.trim() || undefined,
        email: values.email?.trim() || undefined,
        city: values.city?.trim() || undefined,
        address: values.address?.trim() || undefined,
        unloadingAddress: values.unloadingAddress?.trim() || undefined,
        ntn: values.ntn?.trim() || undefined,
        paymentTermsDays: values.paymentTermsDays?.trim() || undefined,
        openingBalance: roundMoney(values.openingBalance || 0).toString(),
        notes: values.notes?.trim() || undefined,
      };

      if (editingCustomer) {
        const updated = await CustomerService.updateCustomer(
          companyId,
          editingCustomer.id,
          payload
        );
        setSavedCustomerSuccess(true);
        notify.success(`Updated customer "${updated.name}".`);
        await loadData();
        setHighlightedCustomerId(updated.id);
      } else {
        const created = await CustomerService.createCustomer(companyId, payload);
        setSavedCustomerSuccess(true);
        notify.success(`Added customer "${created.name}".`);
        await loadData();
        setHighlightedCustomerId(created.id);
      }
      window.setTimeout(() => setHighlightedCustomerId(null), 2200);
      setTimeout(() => {
        setCustomerModalOpen(false);
        setEditingCustomer(null);
        setSavedCustomerSuccess(false);
        resetCustForm();
      }, 220);
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not save customer.'
      );
    }
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!deletingCustomer) return;
    setDeleteLoading(true);
    try {
      await CustomerService.deleteCustomer(companyId, deletingCustomer.id);
      notify.success(`Deleted customer "${deletingCustomer.name}".`);
      const deletedId = deletingCustomer.id;
      setDeletingCustomer(null);
      await loadData();
      if (drawerCustomerId === deletedId) {
        setDrawerCustomerId(null);
      }
      if (detailCustomerId === deletedId) {
        setDetailCustomerId(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not delete customer.'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  // Compute each customer's ledger, bills count, last dispatch date, and last payment date
  const customerRows = useMemo<CustomerRowViewModel[]>(() => {
    return customers.map((c) => {
      const custBills = bills.filter((b) => b.customerId === c.id);
      const activeBills = custBills.filter((b) => b.status === 'active');
      const custPayments = payments.filter((p) => p.customerId === c.id);
      const activePayments = custPayments.filter((p) => p.status === 'active');
      const allCustDispatches = dispatches.filter((d) => d.customerId === c.id);
      const activeDispatches = allCustDispatches.filter(
        (d) => d.status === 'active'
      );

      const ledger = calculateCustomerLedgerAndAllocations({
        openingBalance: c.openingBalance,
        bills: custBills.map((b) => ({
          id: b.id,
          docNumber: b.docNumber,
          date: b.date,
          totalAmount: b.totalAmount,
          vehicleNumber: b.vehicleNumber,
          receivedWeightTons: b.receivedWeightTons,
          status: b.status,
          createdAt: b.createdAt,
        })),
        payments: custPayments.map((p) => ({
          id: p.id,
          docNumber: p.docNumber,
          date: p.date,
          amount: p.amount,
          method: p.method,
          notes: p.notes,
          status: p.status,
          createdAt: p.createdAt,
        })),
      });

      const lastDispatchDate =
        activeDispatches.length > 0 ? activeDispatches[0].dateTime : undefined;
      const lastPaymentDate =
        activePayments.length > 0 ? activePayments[0].date : undefined;

      const hasRecords =
        allCustDispatches.length > 0 ||
        custBills.length > 0 ||
        custPayments.length > 0;

      return {
        customer: c,
        ledger,
        billsCount: activeBills.length,
        lastDispatchDate,
        lastPaymentDate,
        hasRecords,
      };
    });
  }, [customers, bills, payments, dispatches]);

  // Overview strip metrics: Total receivable & number of customers with a balance
  const overviewStats = useMemo(() => {
    let totalReceivable = new Decimal(0);
    let customersWithBalance = 0;

    for (const row of customerRows) {
      if (row.ledger.balance.gt(0)) {
        totalReceivable = totalReceivable.plus(row.ledger.balance);
        customersWithBalance += 1;
      }
    }

    return {
      totalReceivable: roundMoney(totalReceivable),
      customersWithBalance,
    };
  }, [customerRows]);

  const distinctCities = useMemo(() => {
    const set = new Set<string>();
    for (const c of customers) {
      if (c.city && c.city.trim()) {
        set.add(c.city.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const filteredRows = useMemo(() => {
    return customerRows.filter(({ customer }) => {
      if (cityFilter && (customer.city || '').trim() !== cityFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          customer.name.toLowerCase().includes(q) ||
          (customer.phone && customer.phone.toLowerCase().includes(q)) ||
          (customer.city && customer.city.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [customerRows, cityFilter, search]);

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (cityFilter) {
      chips.push({
        key: 'city',
        label: `City: ${cityFilter}`,
        onRemove: () => setCityFilter(''),
      });
    }
    return chips;
  }, [cityFilter]);

  const allBillsMap = useMemo(() => {
    const map = new Map<string, Bill>();
    for (const b of bills) {
      map.set(b.id, b);
    }
    return map;
  }, [bills]);

  const selectedDrawerRow = useMemo(
    () =>
      customerRows.find((r) => r.customer.id === drawerCustomerId) || null,
    [customerRows, drawerCustomerId]
  );

  const selectedLedgerRow = useMemo(
    () =>
      customerRows.find((r) => r.customer.id === selectedLedgerCustomerId) ||
      null,
    [customerRows, selectedLedgerCustomerId]
  );

  const selectedDetailRow = useMemo(
    () =>
      customerRows.find((r) => r.customer.id === detailCustomerId) || null,
    [customerRows, detailCustomerId]
  );

  const vehiclesOnTheWayCount = useMemo(
    () =>
      dispatches.filter(
        (d) => d.status === 'active' && (!d.billId || !d.receivedWeightTons)
      ).length,
    [dispatches]
  );

  const handleConfirmCancelPayment = async (reason: string) => {
    if (!cancellingPayment || !reason) return;
    setCancelPaymentLoading(true);
    try {
      await CustomerService.cancelPayment(
        companyId,
        cancellingPayment.id,
        reason
      );
      notify.success(
        `Cancelled receipt ${cancellingPayment.docNumber}. Customer balance and bill allocations updated.`
      );
      const cancelledId = cancellingPayment.id;
      setCancellingPayment(null);
      await loadData();
      if (receiptPreview?.payment.id === cancelledId) {
        setReceiptPreview(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not cancel payment.'
      );
    } finally {
      setCancelPaymentLoading(false);
    }
  };

  const handlePrintCustomerStatement = (customerId: string) => {
    const row = customerRows.find((r) => r.customer.id === customerId);
    if (!row) return;
    void printDocument(
      buildCustomerStatementPrintMeta(
        row.customer,
        row.ledger,
        row.ledger.entries,
        settings
      ),
      companyId
    );
  };

  const handleDownloadCustomerStatement = (customerId: string) => {
    const row = customerRows.find((r) => r.customer.id === customerId);
    if (!row) return;
    void downloadDocumentPdf(
      buildCustomerStatementPrintMeta(
        row.customer,
        row.ledger,
        row.ledger.entries,
        settings
      ),
      companyId
    );
  };

  const renderCustomerActions = (r: CustomerRowViewModel) => (
    <RowActions
      rowLabel={r.customer.name}
      primaryAction={{
        label: 'Receive payment',
        onClick: () => {
          setReceivePaymentCustomer(r.customer);
          setReceivePaymentOpen(true);
        },
      }}
      onView={() => setSelectedLedgerCustomerId(r.customer.id)}
      onEdit={() => openEditCustomerModal(r.customer)}
      onPrint={() => handlePrintCustomerStatement(r.customer.id)}
      onDownloadPdf={() => handleDownloadCustomerStatement(r.customer.id)}
      onDelete={() => setDeletingCustomer(r.customer)}
      deleteDisabled={r.hasRecords ? 'Has records' : false}
    />
  );

  return (
    <div className="space-y-5 min-w-0">
      {selectedLedgerRow ? (
        <CustomerLedgerView
          customer={selectedLedgerRow.customer}
          ledger={selectedLedgerRow.ledger}
          bills={bills.filter(
            (b) => b.customerId === selectedLedgerRow.customer.id
          )}
          dispatches={dispatches.filter(
            (d) => d.customerId === selectedLedgerRow.customer.id
          )}
          payments={payments.filter(
            (p) => p.customerId === selectedLedgerRow.customer.id
          )}
          allBillsMap={allBillsMap}
          settings={settings}
          companyId={companyId}
          onBack={() => setSelectedLedgerCustomerId(null)}
          onReceivePayment={(c) => {
            setReceivePaymentCustomer(c);
            setReceivePaymentOpen(true);
          }}
          onNewDispatch={(c) => {
            setNewDispatchCustomer(c);
            setNewDispatchOpen(true);
          }}
          onPrintStatement={(c) => handlePrintCustomerStatement(c.id)}
          onViewBill={(b) => setViewingBill(b)}
          onViewReceipt={(p) => setReceiptPreview({ payment: p })}
          onCancelPayment={(p) => setCancellingPayment(p)}
        />
      ) : (
        <>
          <PageHeader
            title="Customers"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setReceivePaymentCustomer(undefined);
                    setReceivePaymentOpen(true);
                  }}
                >
                  <Banknote className="h-4 w-4" />
                  <span>Receive payment</span>
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={openNewCustomerModal}
                >
                  <Plus className="h-4 w-4" />
                  <span>New customer</span>
                </Button>
              </div>
            }
          />

          {/* Overview strip at the top of the page: total receivable and number of customers with a balance */}
          <StatCardGrid>
            <StatCard
              label="Total receivable"
              value={formatMoney(overviewStats.totalReceivable)}
              numericValue={overviewStats.totalReceivable.toNumber()}
              formatter={(v) => formatMoney(v)}
            />
            <StatCard
              label="Customers with a balance"
              value={String(overviewStats.customersWithBalance)}
              numericValue={overviewStats.customersWithBalance}
              formatter={(v) => String(Math.round(v))}
            />
          </StatCardGrid>

          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search customer name, phone or city..."
            activeChips={activeFilterChips}
            onClearAll={() => {
              setSearch('');
              setCityFilter('');
            }}
            controls={[
              {
                key: 'city',
                label: 'City',
                node: (
                  <FilterSelectPill
                    label="City"
                    value={cityFilter}
                    onChange={setCityFilter}
                    placeholder="All cities"
                    options={[
                      { value: '', label: 'All cities' },
                      ...distinctCities.map((city) => ({
                        value: city,
                        label: city,
                      })),
                    ]}
                  />
                ),
              },
            ]}
          />

          {loading ? (
            <SectionLoader cards={0} rows={5} />
          ) : (
            <DataTable<CustomerRowViewModel>
              tableId="customers"
              data={filteredRows}
              keyExtractor={(r) => r.customer.id}
              highlightedRowId={highlightedCustomerId}
              onRowClick={(r) => setSelectedLedgerCustomerId(r.customer.id)}
              mobileCardTitle={(r) => r.customer.name}
              mobileCardRight={(r) =>
                r.ledger.balance.lt(0)
                  ? `${formatMoney(r.ledger.balance.abs())} (Advance)`
                  : formatMoney(r.ledger.balance)
              }
              renderExpanded={(r) => (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                    <div>
                      <div className="text-[var(--text-muted)]">Address</div>
                      <div className="font-semibold text-[var(--text)] mt-0.5">
                        {r.customer.address || r.customer.city || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">
                        Opening balance
                      </div>
                      <div className="font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                        {formatMoney(r.customer.openingBalance || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Total billed</div>
                      <div className="font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                        {formatMoney(r.ledger.totalSales)} ({r.billsCount} bills)
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Received</div>
                      <div className="font-semibold text-[var(--success)] mt-0.5 tabular-nums">
                        {formatMoney(r.ledger.totalReceived)}
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLedgerCustomerId(r.customer.id);
                        }}
                      >
                        Open full ledger
                      </Button>
                    </div>
                  </div>
                </div>
              )}
          mobileCardActions={(r) => renderCustomerActions(r)}
          columns={[
            {
              key: 'name',
              header: 'Name',
              hideable: false,
              render: (r) => (
                <span className="font-semibold text-[var(--text)]">
                  {r.customer.name}
                </span>
              ),
            },
            {
              key: 'contact',
              header: 'Contact',
              render: (r) => (
                <span className="text-[var(--text-muted)] tabular-nums text-xs">
                  {r.customer.phone || '—'}
                </span>
              ),
            },
            {
              key: 'city',
              header: 'City',
              render: (r) => (
                <span className="text-[var(--text)]">
                  {r.customer.city || '—'}
                </span>
              ),
            },
            {
              key: 'billsCount',
              header: 'Bills count',
              align: 'right',
              render: (r) => (
                <span className="text-[var(--text)] tabular-nums">
                  {r.billsCount}
                </span>
              ),
            },
            {
              key: 'totalBilled',
              header: 'Total billed',
              align: 'right',
              render: (r) => (
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatMoney(r.ledger.totalSales)}
                </span>
              ),
            },
            {
              key: 'received',
              header: 'Received',
              align: 'right',
              render: (r) => (
                <span className="text-[var(--success)] font-medium tabular-nums">
                  {formatMoney(r.ledger.totalReceived)}
                </span>
              ),
            },
            {
              key: 'balance',
              header: 'Balance or advance',
              align: 'right',
              render: (r) => {
                const bal = r.ledger.balance;
                const isAdvance = bal.lt(0);
                const owesUs = bal.gt(0);

                return (
                  <div className="inline-flex items-center justify-end gap-2">
                    {isAdvance && (
                      <span className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--success-bg)] border border-[var(--success-border)] px-2 py-0.5 text-xs font-semibold text-[var(--success)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        Advance
                      </span>
                    )}
                    <span
                      className={cn(
                        'font-heading font-semibold tabular-nums',
                        owesUs
                          ? 'text-[var(--danger)]'
                          : isAdvance
                            ? 'text-[var(--success)]'
                            : 'text-[var(--text)]'
                      )}
                    >
                      {formatMoney(bal.abs())}
                    </span>
                  </div>
                );
              },
            },
            {
              key: 'lastDispatch',
              header: 'Last dispatch',
              render: (r) => (
                <span className="text-[var(--text)] tabular-nums text-xs">
                  {r.lastDispatchDate ? formatDate(r.lastDispatchDate) : '—'}
                </span>
              ),
            },
            {
              key: 'lastPayment',
              header: 'Last payment',
              render: (r) => (
                <span className="text-[var(--text)] tabular-nums text-xs">
                  {r.lastPaymentDate ? formatDate(r.lastPaymentDate) : '—'}
                </span>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              hideable: false,
              hideOnMobileCard: true,
              render: (r) => renderCustomerActions(r),
            },
          ]}
          emptyState={
            <EmptyState
              message={
                search.trim() || activeFilterChips.length > 0
                  ? 'No customers match your search.'
                  : 'No customers added yet.'
              }
              actionLabel={
                search.trim() || activeFilterChips.length > 0
                  ? undefined
                  : 'New customer'
              }
              onAction={
                search.trim() || activeFilterChips.length > 0
                  ? undefined
                  : openNewCustomerModal
              }
            />
          }
        />
      )}
        </>
      )}

      {/* Detail Drawer (D5.3) */}
      <DetailDrawer
        open={Boolean(selectedDrawerRow)}
        onClose={() => setDrawerCustomerId(null)}
        docNumber={selectedDrawerRow?.customer.name || ''}
        subtitle={
          selectedDrawerRow?.customer.city
            ? `Customer · ${selectedDrawerRow.customer.city}`
            : 'Customer account'
        }
        sections={
          selectedDrawerRow
            ? [
                {
                  title: 'Contact details',
                  fields: [
                    { label: 'Name', value: selectedDrawerRow.customer.name },
                    {
                      label: 'Phone',
                      value: selectedDrawerRow.customer.phone || '—',
                    },
                    ...(selectedDrawerRow.customer.contactPerson ? [{ label: 'Contact person', value: selectedDrawerRow.customer.contactPerson }] : []),
                    ...(selectedDrawerRow.customer.alternatePhone ? [{ label: 'Alternate phone', value: selectedDrawerRow.customer.alternatePhone }] : []),
                    ...(selectedDrawerRow.customer.email ? [{ label: 'Email', value: selectedDrawerRow.customer.email }] : []),
                    ...(selectedDrawerRow.customer.city ? [{ label: 'City', value: selectedDrawerRow.customer.city }] : []),
                    ...(selectedDrawerRow.customer.address ? [{ label: 'Address', value: selectedDrawerRow.customer.address }] : []),
                    ...(selectedDrawerRow.customer.unloadingAddress ? [{ label: 'Unloading address', value: selectedDrawerRow.customer.unloadingAddress }] : []),
                    ...(selectedDrawerRow.customer.ntn ? [{ label: 'NTN', value: selectedDrawerRow.customer.ntn }] : []),
                    ...(selectedDrawerRow.customer.paymentTermsDays ? [{ label: 'Payment terms', value: `${selectedDrawerRow.customer.paymentTermsDays} days` }] : []),
                    ...(selectedDrawerRow.customer.notes ? [{ label: 'Notes', value: selectedDrawerRow.customer.notes }] : []),
                  ],
                },
                {
                  title: 'Account summary',
                  fields: [
                    {
                      label: 'Opening balance',
                      value: formatMoney(
                        selectedDrawerRow.customer.openingBalance || 0
                      ),
                    },
                    {
                      label: 'Bills count',
                      value: String(selectedDrawerRow.billsCount),
                    },
                    {
                      label: 'Total billed',
                      value: formatMoney(selectedDrawerRow.ledger.totalSales),
                    },
                    {
                      label: 'Total received',
                      value: formatMoney(
                        selectedDrawerRow.ledger.totalReceived
                      ),
                    },
                    {
                      label: selectedDrawerRow.ledger.balance.lt(0)
                        ? 'Advance credit'
                        : 'Current balance',
                      value: formatMoney(
                        selectedDrawerRow.ledger.balance.abs()
                      ),
                      highlight: true,
                    },
                    {
                      label: 'Last dispatch',
                      value: selectedDrawerRow.lastDispatchDate
                        ? formatDate(selectedDrawerRow.lastDispatchDate)
                        : '—',
                    },
                    {
                      label: 'Last payment',
                      value: selectedDrawerRow.lastPaymentDate
                        ? formatDate(selectedDrawerRow.lastPaymentDate)
                        : '—',
                    },
                  ],
                },
              ]
            : []
        }
        relatedLinks={
          selectedDrawerRow
            ? [
                {
                  label: 'Open full customer ledger & statement',
                  sublabel: `${selectedDrawerRow.ledger.entries.length} ledger entries`,
                  onClick: () => {
                    const id = selectedDrawerRow.customer.id;
                    setDrawerCustomerId(null);
                    setDetailCustomerId(id);
                  },
                },
              ]
            : undefined
        }
        primaryAction={
          selectedDrawerRow
            ? {
                label: 'Receive payment',
                onClick: () => {
                  const cust = selectedDrawerRow.customer;
                  setDrawerCustomerId(null);
                  setReceivePaymentCustomer(cust);
                  setReceivePaymentOpen(true);
                },
              }
            : undefined
        }
        onEdit={
          selectedDrawerRow
            ? () => {
                const cust = selectedDrawerRow.customer;
                setDrawerCustomerId(null);
                openEditCustomerModal(cust);
              }
            : undefined
        }
        onPrint={
          selectedDrawerRow
            ? () => {
                const id = selectedDrawerRow.customer.id;
                setDrawerCustomerId(null);
                handlePrintCustomerStatement(id);
              }
            : undefined
        }
        onDownloadPdf={
          selectedDrawerRow
            ? () => {
                const id = selectedDrawerRow.customer.id;
                setDrawerCustomerId(null);
                handleDownloadCustomerStatement(id);
              }
            : undefined
        }
        onDelete={
          selectedDrawerRow
            ? () => setDeletingCustomer(selectedDrawerRow.customer)
            : undefined
        }
        deleteDisabled={
          selectedDrawerRow?.hasRecords ? 'Has records' : false
        }
      />

      {/* New / Edit Customer Dialog */}
      <Dialog
        open={customerModalOpen}
        onClose={() => {
          setCustomerModalOpen(false);
          setEditingCustomer(null);
        }}
        title={
          editingCustomer
            ? `Edit ${editingCustomer.name}`
            : 'New customer'
        }
        icon={<Users className="h-4 w-4" />}
        maxWidth="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCustomerModalOpen(false);
                setEditingCustomer(null);
              }}
              disabled={isSavingCust}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="customer-form"
              variant="primary"
              loading={isSavingCust}
              saved={savedCustomerSuccess}
            >
              {editingCustomer ? 'Save changes' : 'Save customer'}
            </Button>
          </>
        }
      >
        <form
          id="customer-form"
          onSubmit={handleCustSubmit(handleSaveCustomer)}
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Name"
              placeholder="e.g. Allied Steel Mills"
              error={custErrors.name?.message}
              autoFocus
              {...regCust('name')}
            />
            <TextInput
              label="Phone"
              placeholder="0300-0000000"
              error={custErrors.phone?.message}
              {...regCust('phone')}
            />
            <MoneyInput
              label="Opening balance"
              placeholder="0"
              error={custErrors.openingBalance?.message}
              {...regCust('openingBalance')}
            />
          </div>

          <MoreDetailsSection title="More details">
            <TextInput
              label="Contact person"
              placeholder="Purchasing manager or contact"
              error={custErrors.contactPerson?.message}
              {...regCust('contactPerson')}
            />
            <TextInput
              label="Alternate phone"
              placeholder="Secondary contact number"
              error={custErrors.alternatePhone?.message}
              {...regCust('alternatePhone')}
            />
            <TextInput
              label="Email"
              type="email"
              placeholder="buyer@example.com"
              error={custErrors.email?.message}
              {...regCust('email')}
            />
            <TextInput
              label="City"
              placeholder="e.g. Lahore, Gujranwala"
              error={custErrors.city?.message}
              {...regCust('city')}
            />
            <div className="sm:col-span-2">
              <TextInput
                label="Billing address"
                placeholder="Head office or registered address"
                error={custErrors.address?.message}
                {...regCust('address')}
              />
            </div>
            <div className="sm:col-span-2">
              <TextInput
                label="Unloading address"
                placeholder="Mill or plant gate address"
                error={custErrors.unloadingAddress?.message}
                {...regCust('unloadingAddress')}
              />
            </div>
            <TextInput
              label="NTN"
              placeholder="e.g. 7192834-1"
              error={custErrors.ntn?.message}
              {...regCust('ntn')}
            />
            <TextInput
              label="Payment terms (days)"
              placeholder="e.g. 15 or 30"
              error={custErrors.paymentTermsDays?.message}
              {...regCust('paymentTermsDays')}
            />
            <div className="sm:col-span-2">
              <TextArea
                label="Notes"
                placeholder="Special notes or dispatch instructions"
                error={custErrors.notes?.message}
                rows={2}
                {...regCust('notes')}
              />
            </div>
          </MoreDetailsSection>
        </form>
      </Dialog>

      {/* Delete Customer Confirm Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingCustomer)}
        onClose={() => setDeletingCustomer(null)}
        onConfirm={handleConfirmDeleteCustomer}
        recordLabel={
          deletingCustomer
            ? `customer "${deletingCustomer.name}"`
            : 'customer'
        }
        loading={deleteLoading}
      />

      {/* Receive Payment Dialog */}
      <ReceivePaymentDialog
        open={receivePaymentOpen}
        onClose={() => setReceivePaymentOpen(false)}
        companyId={companyId}
        customers={customers}
        defaultCustomerId={receivePaymentCustomer?.id}
        bills={bills}
        payments={payments}
        onSaved={async (createdPayment, context) => {
          await loadData();
          if (context.openReceipt) {
            setReceiptPreview({
              payment: createdPayment,
              balanceBefore: context.balanceBefore,
              balanceAfter: context.balanceAfter,
            });
            const cust = customers.find(
              (c) => c.id === createdPayment.customerId
            );
            void printDocument(
              buildPaymentReceiptPrintMeta(createdPayment, cust, settings, {
                balanceBefore: context.balanceBefore,
                balanceAfter: context.balanceAfter,
              }),
              companyId
            );
          }
        }}
      />

      {/* New Dispatch Dialog (for quick action from Customer Ledger) */}
      <NewDispatchDialog
        open={newDispatchOpen}
        onClose={() => setNewDispatchOpen(false)}
        companyId={companyId}
        customers={customers}
        defaultCustomerId={newDispatchCustomer?.id}
        currentFinalStockTons={finalStockTons}
        vehiclesOnTheWayCount={vehiclesOnTheWayCount}
        onSaved={async () => {
          await loadData();
        }}
        onCustomersChanged={loadData}
      />

      {/* Customer Detail & Ledger Dialog */}
      <CustomerDetailDialog
        customer={selectedDetailRow?.customer || null}
        ledger={selectedDetailRow?.ledger || null}
        bills={
          selectedDetailRow
            ? bills.filter((b) => b.customerId === selectedDetailRow.customer.id)
            : []
        }
        dispatches={
          selectedDetailRow
            ? dispatches.filter(
                (d) => d.customerId === selectedDetailRow.customer.id
              )
            : []
        }
        payments={
          selectedDetailRow
            ? payments.filter(
                (p) => p.customerId === selectedDetailRow.customer.id
              )
            : []
        }
        allBillsMap={allBillsMap}
        settings={settings}
        companyId={companyId}
        open={Boolean(selectedDetailRow)}
        onClose={() => setDetailCustomerId(null)}
        onOpenReceivePayment={(c) => {
          setReceivePaymentCustomer(c);
          setReceivePaymentOpen(true);
        }}
        onViewBill={(b) => setViewingBill(b)}
        onViewReceipt={(p) => setReceiptPreview({ payment: p })}
        onCancelPayment={(p) => setCancellingPayment(p)}
      />

      {/* Payment Receipt Print / PDF Dialog */}
      <PaymentReceiptDialog
        payment={receiptPreview?.payment || null}
        customer={
          receiptPreview
            ? customers.find((c) => c.id === receiptPreview.payment.customerId)
            : null
        }
        settings={settings}
        companyId={companyId}
        balanceBefore={receiptPreview?.balanceBefore}
        balanceAfter={receiptPreview?.balanceAfter}
        open={Boolean(receiptPreview)}
        onClose={() => setReceiptPreview(null)}
        onRequestCancel={(p) => setCancellingPayment(p)}
      />

      {/* View Bill from inside Customer Detail */}
      <BillDetailDialog
        bill={viewingBill}
        settings={settings}
        companyId={companyId}
        open={Boolean(viewingBill)}
        onClose={() => setViewingBill(null)}
      />

      {/* Cancel Payment Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(cancellingPayment)}
        onClose={() => setCancellingPayment(null)}
        onConfirm={handleConfirmCancelPayment}
        title={
          cancellingPayment
            ? `Cancel receipt ${cancellingPayment.docNumber}?`
            : 'Cancel payment?'
        }
        description="Cancelling this payment reverses its allocation against the customer's bills and updates the customer balance."
        confirmLabel="Cancel payment"
        requireReason={true}
        reasonLabel="Reason for cancellation"
        loading={cancelPaymentLoading}
      />
    </div>
  );
};
