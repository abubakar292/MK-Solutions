import { zodResolver } from '@hookform/resolvers/zod';
import Decimal from 'decimal.js';
import { Banknote, Building2, Plus } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  PrintLayout,
  downloadDocumentPdf,
  usePrintDocument,
} from '../../components/print/PrintLayout';
import { DataTable } from '../../components/shared/DataTable';
import { DeleteConfirmDialog } from '../../components/shared/DeleteConfirmDialog';
import { DetailDrawer } from '../../components/shared/DetailDrawer';
import { ConfirmDialog, Dialog } from '../../components/shared/Dialog';
import { EmptyState } from '../../components/shared/EmptyState';
import { FilterBar } from '../../components/shared/FilterBar';
import { MoneyInput, TextArea, TextInput } from '../../components/shared/Inputs';
import { MoreDetailsSection } from '../../components/shared/MoreDetailsSection';
import { RowActions } from '../../components/shared/RowActions';
import { StatCard, StatCardGrid } from '../../components/shared/StatCard';
import { EditedChip } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import {
  calculateSupplierLedger,
  roundMoney,
  toDecimal,
  type SupplierLedgerDetailResult,
} from '../../domain/engine';
import type {
  CompanySettings,
  Purchase,
  Supplier,
  SupplierPayment,
} from '../../domain/types';
import { formatDate, formatMoney } from '../../lib/format';
import { notify } from '../../lib/notify';
import { PurchaseService } from '../../services';
import { PaySupplierDialog } from './PaySupplierDialog';
import { SupplierLedgerView } from './SupplierLedgerView';
import { SupplierPaymentReceiptDialog } from './SupplierPaymentReceiptDialog';
import {
  buildSupplierLedgerPrintMeta,
  buildSupplierPaymentReceiptPrintMeta,
  formatSupplierRunningBalanceLabel,
} from './purchaseHelpers';

const newSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Enter supplier name'),
  phone: z.string().trim().optional(),
  openingBalance: z.string().optional(),
  contactPerson: z.string().trim().optional(),
  alternatePhone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  city: z.string().trim().optional(),
  address: z.string().trim().optional(),
  ntnOrCnic: z.string().trim().optional(),
  paymentTermsDays: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type NewSupplierFormValues = z.infer<typeof newSupplierSchema>;

interface SuppliersTabProps {
  companyId: string;
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  settings?: CompanySettings | null;
  newSupplierDialogOpen: boolean;
  setNewSupplierDialogOpen: (open: boolean) => void;
  paySupplierDialogOpen: boolean;
  setPaySupplierDialogOpen: (open: boolean) => void;
  onRefresh: () => Promise<void> | void;
  onOpenNewPurchase?: (supplierId: string) => void;
  onViewPurchaseVoucher?: (purchase: Purchase) => void;
  selectedSupplierIdForLedger?: string | null;
  onSelectSupplierIdForLedger?: (supplierId: string | null) => void;
}

export const SuppliersTab: React.FC<SuppliersTabProps> = ({
  companyId,
  suppliers,
  purchases,
  supplierPayments,
  settings,
  newSupplierDialogOpen,
  setNewSupplierDialogOpen,
  paySupplierDialogOpen,
  setPaySupplierDialogOpen,
  onRefresh,
  onOpenNewPurchase,
  onViewPurchaseVoucher,
  selectedSupplierIdForLedger,
  onSelectSupplierIdForLedger,
}) => {
  const [search, setSearch] = useState('');
  const [internalLedgerSupplierId, setInternalLedgerSupplierId] = useState<
    string | null
  >(null);
  const activeLedgerSupplierId =
    selectedSupplierIdForLedger !== undefined
      ? selectedSupplierIdForLedger
      : internalLedgerSupplierId;
  const setActiveLedgerSupplierId = (id: string | null) => {
    setInternalLedgerSupplierId(id);
    onSelectSupplierIdForLedger?.(id);
  };
  const [highlightedSupplierId, setHighlightedSupplierId] = useState<string | null>(null);
  const [drawerSupplier, setDrawerSupplier] = useState<Supplier | null>(null);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [savedSupplierSuccess, setSavedSupplierSuccess] = useState(false);
  const { printDocument } = usePrintDocument();

  // Pay supplier dialog & receipt / cancel states (D8)
  const [payDefaultSupplierId, setPayDefaultSupplierId] = useState<string | undefined>(
    undefined
  );
  const [receiptPayment, setReceiptPayment] = useState<SupplierPayment | null>(null);
  const [cancelTargetPayment, setCancelTargetPayment] =
    useState<SupplierPayment | null>(null);
  const [cancellingPaymentLoading, setCancellingPaymentLoading] = useState(false);

  // Compute each supplier's ledger, last purchase, last payment, and record count
  const supplierRows = useMemo(() => {
    return suppliers.map((s) => {
      const supPurchases = purchases.filter((p) => p.supplierId === s.id);
      const supPayments = supplierPayments.filter((pay) => pay.supplierId === s.id);
      const activePurchases = supPurchases
        .filter((p) => p.status === 'active')
        .sort((a, b) => b.date.localeCompare(a.date));
      const activePayments = supPayments
        .filter((p) => p.status === 'active')
        .sort((a, b) => b.date.localeCompare(a.date));

      const ledger = calculateSupplierLedger({
        openingBalance: s.openingBalance,
        purchases: supPurchases,
        payments: supPayments,
      });

      const lastPurchaseDate = activePurchases[0]?.date.slice(0, 10) || null;
      const lastPaymentDate = activePayments[0]?.date.slice(0, 10) || null;
      const hasRecords = supPurchases.length > 0 || supPayments.length > 0;

      return {
        supplier: s,
        ledger,
        lastPurchaseDate,
        lastPaymentDate,
        hasRecords,
      };
    });
  }, [suppliers, purchases, supplierPayments]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return supplierRows;
    return supplierRows.filter(
      ({ supplier }) =>
        supplier.name.toLowerCase().includes(q) ||
        (supplier.phone && supplier.phone.toLowerCase().includes(q)) ||
        (supplier.city && supplier.city.toLowerCase().includes(q))
    );
  }, [supplierRows, search]);

  // New / Edit Supplier Form
  const {
    register: regSup,
    handleSubmit: handleSupSubmit,
    reset: resetSupForm,
    formState: { errors: supErrors, isSubmitting: isSavingSup },
  } = useForm<NewSupplierFormValues>({
    resolver: zodResolver(newSupplierSchema),
    defaultValues: {
      name: '',
      phone: '',
      city: '',
      address: '',
      openingBalance: '0',
      notes: '',
    },
  });

  useEffect(() => {
    if (newSupplierDialogOpen) {
      if (editingSupplier) {
        resetSupForm({
          name: editingSupplier.name,
          phone: editingSupplier.phone || '',
          openingBalance: editingSupplier.openingBalance || '0',
          contactPerson: editingSupplier.contactPerson || '',
          alternatePhone: editingSupplier.alternatePhone || '',
          email: editingSupplier.email || '',
          city: editingSupplier.city || '',
          address: editingSupplier.address || '',
          ntnOrCnic: editingSupplier.ntnOrCnic || '',
          paymentTermsDays: editingSupplier.paymentTermsDays || '',
          notes: editingSupplier.notes || '',
        });
      } else {
        resetSupForm({
          name: '',
          phone: '',
          openingBalance: '0',
          contactPerson: '',
          alternatePhone: '',
          email: '',
          city: '',
          address: '',
          ntnOrCnic: '',
          paymentTermsDays: '',
          notes: '',
        });
      }
      setSavedSupplierSuccess(false);
    }
  }, [newSupplierDialogOpen, editingSupplier, resetSupForm]);

  const openPayDialogForSupplier = (supplierId?: string) => {
    setPayDefaultSupplierId(supplierId || suppliers[0]?.id);
    setPaySupplierDialogOpen(true);
  };

  const openEditSupplier = (sup: Supplier) => {
    setEditingSupplier(sup);
    setNewSupplierDialogOpen(true);
  };

  const onSaveSupplier = async (values: NewSupplierFormValues) => {
    try {
      const payload = {
        name: values.name,
        phone: values.phone || undefined,
        contactPerson: values.contactPerson || undefined,
        alternatePhone: values.alternatePhone || undefined,
        email: values.email || undefined,
        city: values.city || undefined,
        address: values.address || undefined,
        ntnOrCnic: values.ntnOrCnic || undefined,
        paymentTermsDays: values.paymentTermsDays || undefined,
        openingBalance: roundMoney(toDecimal(values.openingBalance || 0)).toString(),
        notes: values.notes || undefined,
      };
      const saved = editingSupplier
        ? await PurchaseService.updateSupplier(companyId, editingSupplier.id, payload)
        : await PurchaseService.createSupplier(companyId, payload);

      setSavedSupplierSuccess(true);
      notify.success(`Supplier "${saved.name}" ${editingSupplier ? 'updated' : 'created'}`);
      await onRefresh();
      setHighlightedSupplierId(saved.id);
      window.setTimeout(() => setHighlightedSupplierId(null), 2200);
      window.setTimeout(() => {
        setNewSupplierDialogOpen(false);
        setEditingSupplier(null);
        resetSupForm();
        setSavedSupplierSuccess(false);
      }, 380);
    } catch (err) {
      notify.error(
        'Could not save supplier.',
        err instanceof Error ? err.message : 'Try again.'
      );
    }
  };

  const [receiptBalances, setReceiptBalances] = useState<{
    balanceBefore: Decimal;
    balanceAfter: Decimal;
  } | null>(null);

  const handleConfirmCancelPayment = async (reason: string) => {
    if (!cancelTargetPayment) return;
    setCancellingPaymentLoading(true);
    try {
      await PurchaseService.cancelSupplierPayment(
        companyId,
        cancelTargetPayment.id,
        reason
      );
      notify.success(
        `${cancelTargetPayment.docNumber} cancelled`,
        'Supplier balance and purchase statuses have been restored.'
      );
      if (receiptPayment?.id === cancelTargetPayment.id) {
        setReceiptPayment({
          ...cancelTargetPayment,
          status: 'cancelled',
          cancelReason: reason,
        });
      }
      setCancelTargetPayment(null);
      await onRefresh();
    } catch (err) {
      notify.error(
        'Could not cancel supplier payment.',
        err instanceof Error ? err.message : 'Try again.'
      );
    } finally {
      setCancellingPaymentLoading(false);
    }
  };

  const selectedDrawerRow = useMemo(() => {
    if (!drawerSupplier) return null;
    return supplierRows.find((r) => r.supplier.id === drawerSupplier.id) || null;
  }, [drawerSupplier, supplierRows]);

  const selectedLedgerRow = useMemo(() => {
    if (!activeLedgerSupplierId) return null;
    return supplierRows.find((r) => r.supplier.id === activeLedgerSupplierId) || null;
  }, [activeLedgerSupplierId, supplierRows]);

  const selectedStatementRow = useMemo(() => {
    if (!statementSupplier) return null;
    return supplierRows.find((r) => r.supplier.id === statementSupplier.id) || null;
  }, [statementSupplier, supplierRows]);

  const receiptPaymentSupplier = useMemo(() => {
    if (!receiptPayment) return null;
    return suppliers.find((s) => s.id === receiptPayment.supplierId) || null;
  }, [receiptPayment, suppliers]);

  const handlePrintSupplierStatement = (sup: Supplier) => {
    const row = supplierRows.find((r) => r.supplier.id === sup.id);
    if (!row) return;
    void printDocument(
      buildSupplierLedgerPrintMeta(row.supplier, row.ledger, settings),
      companyId
    );
  };

  const handleDownloadSupplierStatement = (sup: Supplier) => {
    const row = supplierRows.find((r) => r.supplier.id === sup.id);
    if (!row) return;
    void downloadDocumentPdf(
      buildSupplierLedgerPrintMeta(row.supplier, row.ledger, settings),
      companyId
    );
  };

  return (
    <div className="space-y-4 min-w-0">
      {selectedLedgerRow ? (
        <SupplierLedgerView
          supplier={selectedLedgerRow.supplier}
          ledger={selectedLedgerRow.ledger}
          purchases={purchases.filter(
            (p) => p.supplierId === selectedLedgerRow.supplier.id
          )}
          supplierPayments={supplierPayments.filter(
            (sp) => sp.supplierId === selectedLedgerRow.supplier.id
          )}
          settings={settings}
          companyId={companyId}
          onBack={() => setActiveLedgerSupplierId(null)}
          onPaySupplier={(supId) => openPayDialogForSupplier(supId)}
          onNewPurchase={(supId) => onOpenNewPurchase?.(supId)}
          onPrintStatement={(sup) => handlePrintSupplierStatement(sup)}
          onViewPurchase={onViewPurchaseVoucher}
          onViewPaymentReceipt={(pay) => setReceiptPayment(pay)}
          onCancelPayment={(pay) => setCancelTargetPayment(pay)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <FilterBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search suppliers by name, phone or city..."
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() => openPayDialogForSupplier()}
                disabled={suppliers.length === 0}
              >
                <Banknote className="h-4 w-4" />
                <span>Pay supplier</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setEditingSupplier(null);
                  resetSupForm();
                  setSavedSupplierSuccess(false);
                  setNewSupplierDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                <span>New supplier</span>
              </Button>
            </div>
          </div>

          <DataTable
            tableId="suppliers"
            data={filteredRows}
            keyExtractor={(r) => r.supplier.id}
            highlightedRowId={highlightedSupplierId}
            onRowClick={(r) => setActiveLedgerSupplierId(r.supplier.id)}
            mobileCardTitle={(r) => r.supplier.name}
            mobileCardRight={(r) => formatMoney(r.ledger.balance)}
            mobileCardActions={(r) => (
              <RowActions
                primaryAction={{
                  label: 'Pay',
                  onClick: () => openPayDialogForSupplier(r.supplier.id),
                }}
                onView={() => setActiveLedgerSupplierId(r.supplier.id)}
                onEdit={() => openEditSupplier(r.supplier)}
                onPrint={() => handlePrintSupplierStatement(r.supplier)}
                onDownloadPdf={() => handleDownloadSupplierStatement(r.supplier)}
                onDelete={() => setDeletingSupplier(r.supplier)}
                deleteDisabled={r.hasRecords}
                deleteDisabledReason={r.hasRecords ? 'Has records' : undefined}
              />
            )}
            columns={[
              {
                key: 'name',
                header: 'Name',
                noTruncate: true,
                render: (r) => (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="font-semibold text-[var(--text)]">{r.supplier.name}</span>
                    {r.supplier.editedAt && <EditedChip />}
                  </div>
                ),
              },
              {
                key: 'phone',
                header: 'Phone',
                render: (r) => r.supplier.phone || '—',
              },
              {
                key: 'city',
                header: 'City',
                render: (r) => r.supplier.city || '—',
              },
              {
                key: 'totalPurchased',
                header: 'Total purchased',
                align: 'right',
                render: (r) => formatMoney(r.ledger.totalPurchased),
              },
              {
                key: 'paid',
                header: 'Paid',
                align: 'right',
                render: (r) => formatMoney(r.ledger.totalPaid),
              },
              {
                key: 'balance',
                header: 'Balance',
                align: 'right',
                render: (r) => (
                  <span className="font-heading font-semibold text-[var(--text)] tabular-nums">
                    {formatSupplierRunningBalanceLabel(r.ledger.balance)}
                  </span>
                ),
              },
              {
                key: 'lastPurchase',
                header: 'Last purchase',
                render: (r) => (r.lastPurchaseDate ? formatDate(r.lastPurchaseDate) : '—'),
              },
              {
                key: 'lastPayment',
                header: 'Last payment',
                render: (r) => (r.lastPaymentDate ? formatDate(r.lastPaymentDate) : '—'),
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                hideOnMobileCard: true,
                render: (r) => (
                  <RowActions
                    primaryAction={{
                      label: 'Pay',
                      onClick: () => openPayDialogForSupplier(r.supplier.id),
                    }}
                    onView={() => setActiveLedgerSupplierId(r.supplier.id)}
                    onEdit={() => openEditSupplier(r.supplier)}
                    onPrint={() => handlePrintSupplierStatement(r.supplier)}
                    onDownloadPdf={() => handleDownloadSupplierStatement(r.supplier)}
                    onDelete={() => setDeletingSupplier(r.supplier)}
                    deleteDisabled={r.hasRecords}
                    deleteDisabledReason={r.hasRecords ? 'Has records' : undefined}
                  />
                ),
              },
            ]}
            emptyState={
              <EmptyState
                message="No suppliers added yet."
                actionLabel="New supplier"
                onAction={() => {
                  setEditingSupplier(null);
                  setNewSupplierDialogOpen(true);
                }}
              />
            }
          />
        </>
      )}

      {/* Supplier Detail Drawer (D5.3) */}
      <DetailDrawer
        open={Boolean(selectedDrawerRow)}
        onClose={() => setDrawerSupplier(null)}
        title={selectedDrawerRow?.supplier.name || ''}
        subtitle={
          [selectedDrawerRow?.supplier.phone, selectedDrawerRow?.supplier.city]
            .filter(Boolean)
            .join(' · ') || 'Supplier account'
        }
        editedAt={selectedDrawerRow?.supplier.editedAt}
        createdAt={selectedDrawerRow?.supplier.createdAt}
        sections={
          selectedDrawerRow
            ? [
                {
                  title: 'Contact & account',
                  fields: [
                    { label: 'Name', value: selectedDrawerRow.supplier.name },
                    { label: 'Phone', value: selectedDrawerRow.supplier.phone || '—' },
                    ...(selectedDrawerRow.supplier.contactPerson ? [{ label: 'Contact person', value: selectedDrawerRow.supplier.contactPerson }] : []),
                    ...(selectedDrawerRow.supplier.alternatePhone ? [{ label: 'Alternate phone', value: selectedDrawerRow.supplier.alternatePhone }] : []),
                    ...(selectedDrawerRow.supplier.email ? [{ label: 'Email', value: selectedDrawerRow.supplier.email }] : []),
                    ...(selectedDrawerRow.supplier.city ? [{ label: 'City', value: selectedDrawerRow.supplier.city }] : []),
                    ...(selectedDrawerRow.supplier.address ? [{ label: 'Address', value: selectedDrawerRow.supplier.address }] : []),
                    ...(selectedDrawerRow.supplier.ntnOrCnic ? [{ label: 'NTN / CNIC', value: selectedDrawerRow.supplier.ntnOrCnic }] : []),
                    ...(selectedDrawerRow.supplier.paymentTermsDays ? [{ label: 'Payment terms', value: `${selectedDrawerRow.supplier.paymentTermsDays} days` }] : []),
                    {
                      label: 'Opening balance',
                      value: formatMoney(selectedDrawerRow.supplier.openingBalance),
                      mono: true,
                    },
                    ...(selectedDrawerRow.supplier.notes ? [{ label: 'Notes', value: selectedDrawerRow.supplier.notes }] : []),
                    {
                      label: 'Last purchase',
                      value: selectedDrawerRow.lastPurchaseDate
                        ? formatDate(selectedDrawerRow.lastPurchaseDate)
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
                {
                  title: 'Financial summary',
                  fields: [
                    {
                      label: 'Total purchased',
                      value: formatMoney(selectedDrawerRow.ledger.totalPurchased),
                      mono: true,
                    },
                    {
                      label: 'Total paid',
                      value: formatMoney(selectedDrawerRow.ledger.totalPaid),
                      mono: true,
                    },
                    {
                      label: 'Balance we owe',
                      value: formatMoney(selectedDrawerRow.ledger.balance),
                      mono: true,
                    },
                  ],
                },
              ]
            : []
        }
        primaryAction={
          selectedDrawerRow
            ? {
                label: 'Pay supplier',
                onClick: () => {
                  const id = selectedDrawerRow.supplier.id;
                  setDrawerSupplier(null);
                  openPayDialogForSupplier(id);
                },
              }
            : undefined
        }
        onEdit={
          selectedDrawerRow
            ? () => {
                const sup = selectedDrawerRow.supplier;
                setDrawerSupplier(null);
                openEditSupplier(sup);
              }
            : undefined
        }
        onPrint={
          selectedDrawerRow
            ? () => {
                const sup = selectedDrawerRow.supplier;
                setDrawerSupplier(null);
                handlePrintSupplierStatement(sup);
              }
            : undefined
        }
        onDownloadPdf={
          selectedDrawerRow
            ? () => {
                const sup = selectedDrawerRow.supplier;
                setDrawerSupplier(null);
                handleDownloadSupplierStatement(sup);
              }
            : undefined
        }
        onDelete={
          selectedDrawerRow
            ? () => {
                const sup = selectedDrawerRow.supplier;
                setDrawerSupplier(null);
                setDeletingSupplier(sup);
              }
            : undefined
        }
        deleteDisabled={selectedDrawerRow?.hasRecords}
        deleteDisabledReason={selectedDrawerRow?.hasRecords ? 'Has records' : undefined}
      >
        {selectedDrawerRow && (
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Recent ledger entries ({selectedDrawerRow.ledger.entries.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  const sup = selectedDrawerRow.supplier;
                  setDrawerSupplier(null);
                  setStatementSupplier(sup);
                }}
                className="text-xs font-semibold text-[var(--brand)] hover:underline cursor-pointer"
              >
                Full statement & print
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-[var(--border)]">
              {selectedDrawerRow.ledger.entries.length > 0 ? (
                selectedDrawerRow.ledger.entries
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--text-primary)] truncate">
                          {entry.detail}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {entry.date === '—' ? 'Opening' : formatDate(entry.date)}
                        </div>
                      </div>
                      <div className="text-right tabular-nums shrink-0">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {entry.debit.gt(0)
                            ? `+${formatMoney(entry.debit)}`
                            : `-${formatMoney(entry.credit)}`}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Bal: {formatMoney(entry.balance)}
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="px-4 py-5 text-center text-xs text-[var(--text-muted)]">
                  No ledger entries yet.
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* New / Edit Supplier Dialog */}
      <Dialog
        open={newSupplierDialogOpen}
        onClose={() => {
          setNewSupplierDialogOpen(false);
          setEditingSupplier(null);
        }}
        title={editingSupplier ? `Edit ${editingSupplier.name}` : 'New supplier'}
        icon={<Building2 className="h-4 w-4" />}
        maxWidth="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setNewSupplierDialogOpen(false);
                setEditingSupplier(null);
              }}
              disabled={isSavingSup}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-supplier-form"
              variant="primary"
              loading={isSavingSup}
              saved={savedSupplierSuccess}
            >
              {editingSupplier ? 'Save changes' : 'Save supplier'}
            </Button>
          </>
        }
      >
        <form
          id="new-supplier-form"
          onSubmit={handleSupSubmit(onSaveSupplier)}
          noValidate
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Name"
              placeholder="Supplier name"
              error={supErrors.name?.message}
              autoFocus
              {...regSup('name')}
            />
            <TextInput
              label="Phone"
              placeholder="0300-0000000"
              error={supErrors.phone?.message}
              {...regSup('phone')}
            />
            <MoneyInput
              label="Opening balance"
              placeholder="0"
              error={supErrors.openingBalance?.message}
              {...regSup('openingBalance')}
            />
          </div>

          <MoreDetailsSection title="More details">
            <TextInput
              label="Contact person"
              placeholder="Manager or representative name"
              error={supErrors.contactPerson?.message}
              {...regSup('contactPerson')}
            />
            <TextInput
              label="Alternate phone"
              placeholder="Secondary contact number"
              error={supErrors.alternatePhone?.message}
              {...regSup('alternatePhone')}
            />
            <TextInput
              label="Email"
              type="email"
              placeholder="supplier@example.com"
              error={supErrors.email?.message}
              {...regSup('email')}
            />
            <TextInput
              label="City"
              placeholder="Lahore"
              error={supErrors.city?.message}
              {...regSup('city')}
            />
            <div className="sm:col-span-2">
              <TextInput
                label="Address"
                placeholder="Physical address or quarry location"
                error={supErrors.address?.message}
                {...regSup('address')}
              />
            </div>
            <TextInput
              label="NTN or CNIC"
              placeholder="e.g. 1234567-8"
              error={supErrors.ntnOrCnic?.message}
              {...regSup('ntnOrCnic')}
            />
            <TextInput
              label="Payment terms (days)"
              placeholder="e.g. 15 or 30"
              error={supErrors.paymentTermsDays?.message}
              {...regSup('paymentTermsDays')}
            />
            <div className="sm:col-span-2">
              <TextArea
                label="Notes"
                placeholder="Special instructions or commercial terms"
                error={supErrors.notes?.message}
                rows={2}
                {...regSup('notes')}
              />
            </div>
          </MoreDetailsSection>
        </form>
      </Dialog>

      {/* Redesigned D8 Pay Supplier Dialog (wide 2-column with live preview) */}
      <PaySupplierDialog
        open={paySupplierDialogOpen}
        onClose={() => setPaySupplierDialogOpen(false)}
        companyId={companyId}
        suppliers={suppliers}
        purchases={purchases}
        supplierPayments={supplierPayments}
        defaultSupplierId={payDefaultSupplierId}
        onSaved={async (savedPayment, context) => {
          await onRefresh();
          setHighlightedSupplierId(savedPayment.supplierId);
          window.setTimeout(() => setHighlightedSupplierId(null), 2200);
          if (context?.openReceipt) {
            setReceiptBalances({
              balanceBefore: context.balanceBefore,
              balanceAfter: context.balanceAfter,
            });
            setReceiptPayment(savedPayment);
            const sup = suppliers.find(
              (s) => s.id === savedPayment.supplierId
            );
            void printDocument(
              buildSupplierPaymentReceiptPrintMeta(savedPayment, sup, settings, {
                balanceBefore: context.balanceBefore,
                balanceAfter: context.balanceAfter,
              }),
              companyId
            );
          }
        }}
      />

      {/* Supplier Payment Receipt / Print Dialog */}
      <SupplierPaymentReceiptDialog
        open={Boolean(receiptPayment)}
        onClose={() => {
          setReceiptPayment(null);
          setReceiptBalances(null);
        }}
        payment={receiptPayment}
        supplier={receiptPaymentSupplier}
        balanceBefore={receiptBalances?.balanceBefore}
        balanceAfter={receiptBalances?.balanceAfter}
        settings={settings}
        companyId={companyId}
        onRequestCancel={(pay: SupplierPayment) => setCancelTargetPayment(pay)}
      />

      {/* Cancel Supplier Payment Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(cancelTargetPayment)}
        onClose={() => setCancelTargetPayment(null)}
        onConfirm={handleConfirmCancelPayment}
        title={
          cancelTargetPayment
            ? `Cancel payment ${cancelTargetPayment.docNumber}`
            : 'Cancel payment'
        }
        description="Cancelling this payment keeps the voucher on record as cancelled, reverses the ledger entry, and restores the supplier balance and purchase payment statuses."
        confirmLabel="Cancel payment"
        requireReason={true}
        loading={cancellingPaymentLoading}
      />

      {/* Supplier Printable Statement Dialog */}
      <SupplierDetailDialog
        open={Boolean(selectedStatementRow)}
        onClose={() => setStatementSupplier(null)}
        supplier={selectedStatementRow?.supplier || null}
        ledger={selectedStatementRow?.ledger || null}
        settings={settings}
        companyId={companyId}
        onPaySupplier={(supId) => {
          setStatementSupplier(null);
          openPayDialogForSupplier(supId);
        }}
      />

      {/* Delete Supplier Confirmation */}
      <DeleteConfirmDialog
        open={Boolean(deletingSupplier)}
        onOpenChange={(open) => !open && setDeletingSupplier(null)}
        title="Delete supplier"
        recordLabel={deletingSupplier?.name}
        description="Are you sure you want to delete this supplier?"
        onConfirm={async () => {
          if (!deletingSupplier) return;
          await PurchaseService.deleteSupplier(companyId, deletingSupplier.id);
          notify.success(`Supplier "${deletingSupplier.name}" deleted`);
          await onRefresh();
        }}
      />
    </div>
  );
};

interface SupplierDetailDialogProps {
  open: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  ledger: SupplierLedgerDetailResult | null;
  settings?: CompanySettings | null;
  companyId: string;
  onPaySupplier: (supplierId: string) => void;
}

const SupplierDetailDialog: React.FC<SupplierDetailDialogProps> = ({
  open,
  onClose,
  supplier,
  ledger,
  settings,
  companyId,
  onPaySupplier,
}) => {
  if (!supplier || !ledger) return null;

  const docMeta = buildSupplierLedgerPrintMeta(supplier, ledger, settings);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={supplier.name}
      maxWidth="xl"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onPaySupplier(supplier.id)}
          >
            Pay supplier
          </Button>
          <Button type="button" variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <StatCardGrid>
          <StatCard
            label="Total purchased"
            value={formatMoney(ledger.totalPurchased)}
          />
          <StatCard
            label="Total paid"
            value={formatMoney(ledger.totalPaid)}
          />
          <StatCard
            label="Balance we owe"
            value={formatMoney(ledger.balance)}
            isKeyNumber={new Decimal(ledger.balance).gt(0)}
          />
        </StatCardGrid>

        <PrintLayout doc={docMeta} companyId={companyId}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
              <span>
                {[supplier.phone, supplier.city, supplier.address]
                  .filter(Boolean)
                  .join(' · ') || 'Supplier statement'}
              </span>
              <span className="font-semibold text-[var(--text)] tabular-nums">
                Closing balance: {formatMoney(ledger.balance)}
              </span>
            </div>

            <div className="overflow-x-auto rounded-[6px] border border-[var(--border)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--surface-subtle)] border-b border-[var(--brand)]">
                    <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--brand)]">
                      Date
                    </th>
                    <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--brand)]">
                      Detail
                    </th>
                    <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                      Debit
                    </th>
                    <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                      Credit
                    </th>
                    <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {ledger.entries.length > 0 ? (
                    ledger.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-3.5 py-2.5 text-xs text-[var(--text)] tabular-nums whitespace-nowrap">
                          {entry.date === '—' ? '—' : formatDate(entry.date)}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs text-[var(--text)]">
                          {entry.detail}
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-xs text-[var(--text)] tabular-nums">
                          {entry.debit.gt(0) ? formatMoney(entry.debit) : '—'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-xs text-[var(--text)] tabular-nums">
                          {entry.credit.gt(0) ? formatMoney(entry.credit) : '—'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--text)] tabular-nums">
                          {formatMoney(entry.balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-xs text-[var(--text-muted)]"
                      >
                        No ledger transactions recorded for this supplier.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </PrintLayout>
      </div>
    </Dialog>
  );
};
