import Decimal from 'decimal.js';
import {
  calculateCustomerLedgerAndAllocations,
  calculateDispatchAndBill,
  calculateProductionBatchCost,
  calculateSupplierLedger,
  recomputeInventoryAndSnapshots,
  replayInventoryState,
  roundMoney,
  roundWeight,
} from '../../domain/engine';
import type {
  Bill,
  Customer,
  CustomerPayment,
  Dispatch,
  InventoryItem,
  ProductionBatch,
  Purchase,
  Supplier,
  SupplierPayment,
} from '../../domain/types';
import { requireSupabaseClient } from '../../lib/supabase';
import type {
  ICustomerService,
  IDispatchService,
  IInvoiceService,
  IProductionService,
  IPurchaseService,
} from '../interfaces';
import {
  type DbBatchRow,
  mapDbBatchToDomain,
  mapDomainBatchSnapshotPayload,
  mapDomainBatchToRpcPayload,
} from './mappers/batchMapper';
import {
  type DbCustomerRow,
  mapDbCustomerToDomain,
  mapDomainCustomerPatchToRpcPayload,
  mapDomainCustomerToDbInsert,
} from './mappers/customerMapper';
import {
  type DbDispatchRow,
  mapDbDispatchToDomain,
  mapDomainDispatchSnapshotPayload,
  mapDomainDispatchToDbInsert,
} from './mappers/dispatchMapper';
import {
  type DbItemRow,
  mapDbItemToDomain,
  mapDomainItemToDbInsert,
} from './mappers/itemMapper';
import {
  type DbPaymentRow,
  mapDbPaymentToCustomerPayment,
  mapDbPaymentToSupplierPayment,
  mapDomainCustomerPaymentToDbInsert,
  mapDomainSupplierPaymentToDbInsert,
} from './mappers/paymentMapper';
import {
  type DbPurchaseRow,
  mapDbPurchaseToDomain,
  mapDomainPurchaseToRpcPayload,
} from './mappers/purchaseMapper';
import {
  type DbSaleRow,
  mapDbSaleToDomain,
  mapDomainSaleSnapshotPayload,
  mapDomainSaleToRpcPayload,
} from './mappers/saleMapper';
import {
  type DbSupplierRow,
  mapDbSupplierToDomain,
  mapDomainSupplierPatchToRpcPayload,
  mapDomainSupplierToDbInsert,
} from './mappers/supplierMapper';
import {
  assertOnlineForSave,
  canCancel,
  canDelete,
  canEdit,
  fetchAllCompanyRows,
  formatSupabaseServiceError,
  generateUuid,
  groupAQueryKeys,
  invalidateGroupAQueries,
  queryClient,
  toOptionalDecimalString,
} from './queryClient';

// ----------------------------------------------------------------------------
// Paged & Cached Entity Loaders (1,000 rows per request via TanStack Query)
// ----------------------------------------------------------------------------

export async function fetchAllItemsCached(companyId: string): Promise<InventoryItem[]> {
  if (!companyId) return [];
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.items(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<DbItemRow>({
        table: 'items',
        companyId,
        actionDescription: 'load inventory items',
      });
      return rows.map(mapDbItemToDomain);
    },
  });
}

export async function fetchAllSuppliersCached(companyId: string): Promise<Supplier[]> {
  if (!companyId) return [];
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.suppliers(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<DbSupplierRow>({
        table: 'suppliers',
        companyId,
        actionDescription: 'load suppliers',
      });
      return rows.map(mapDbSupplierToDomain);
    },
  });
}

export async function fetchAllCustomersCached(companyId: string): Promise<Customer[]> {
  if (!companyId) return [];
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.customers(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<DbCustomerRow>({
        table: 'customers',
        companyId,
        actionDescription: 'load customers',
      });
      return rows.map(mapDbCustomerToDomain);
    },
  });
}

export async function fetchAllPurchasesCached(companyId: string): Promise<Purchase[]> {
  if (!companyId) return [];
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.purchases(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<DbPurchaseRow>({
        table: 'purchases',
        companyId,
        actionDescription: 'load purchases',
      });
      return rows.map(mapDbPurchaseToDomain);
    },
  });
}

export async function fetchAllBatchesCached(companyId: string): Promise<ProductionBatch[]> {
  if (!companyId) return [];
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.batches(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<DbBatchRow>({
        table: 'batches',
        companyId,
        actionDescription: 'load production batches',
      });
      return rows.map(mapDbBatchToDomain);
    },
  });
}

export async function fetchAllDispatchesCached(companyId: string): Promise<Dispatch[]> {
  if (!companyId) return [];
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.dispatches(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<DbDispatchRow>({
        table: 'dispatches',
        companyId,
        actionDescription: 'load dispatches',
      });
      return rows.map(mapDbDispatchToDomain);
    },
  });
}

export async function fetchAllSalesCached(companyId: string): Promise<Bill[]> {
  if (!companyId) return [];
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.sales(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<DbSaleRow>({
        table: 'sales',
        companyId,
        actionDescription: 'load bills and sales',
      });
      return rows.map(mapDbSaleToDomain);
    },
  });
}

export async function fetchAllSupplierPaymentsCached(
  companyId: string
): Promise<SupplierPayment[]> {
  if (!companyId) return [];
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.supplierPayments(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<DbPaymentRow>({
        table: 'payments',
        companyId,
        extraFilters: [{ column: 'party_type', value: 'supplier' }],
        actionDescription: 'load supplier payments',
      });
      return rows.map(mapDbPaymentToSupplierPayment);
    },
  });
}

export async function fetchAllCustomerPaymentsCached(
  companyId: string
): Promise<CustomerPayment[]> {
  if (!companyId) return [];
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.customerPayments(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<DbPaymentRow>({
        table: 'payments',
        companyId,
        extraFilters: [{ column: 'party_type', value: 'customer' }],
        actionDescription: 'load customer payments',
      });
      return rows.map(mapDbPaymentToCustomerPayment);
    },
  });
}

export async function fetchCustomFinalProductNameCached(
  companyId: string
): Promise<string | undefined> {
  if (!companyId) return undefined;
  return queryClient.fetchQuery({
    queryKey: groupAQueryKeys.finalProductName(companyId),
    queryFn: async () => {
      const client = requireSupabaseClient();
      const { data, error } = await client
        .from('companies')
        .select('final_product_name')
        .eq('id', companyId)
        .maybeSingle();

      if (!error && data && typeof data.final_product_name === 'string') {
        const trimmed = data.final_product_name.trim();
        if (trimmed) {
          return trimmed;
        }
      }
      return undefined;
    },
  });
}

export async function fetchAllGroupACompanyRecords(companyId: string): Promise<{
  items: InventoryItem[];
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  batches: ProductionBatch[];
  dispatches: Dispatch[];
  customers: Customer[];
  bills: Bill[];
  customerPayments: CustomerPayment[];
  customFinalProductName?: string;
}> {
  const [
    items,
    suppliers,
    purchases,
    supplierPayments,
    batches,
    dispatches,
    customers,
    bills,
    customerPayments,
    customFinalProductName,
  ] = await Promise.all([
    fetchAllItemsCached(companyId),
    fetchAllSuppliersCached(companyId),
    fetchAllPurchasesCached(companyId),
    fetchAllSupplierPaymentsCached(companyId),
    fetchAllBatchesCached(companyId),
    fetchAllDispatchesCached(companyId),
    fetchAllCustomersCached(companyId),
    fetchAllSalesCached(companyId),
    fetchAllCustomerPaymentsCached(companyId),
    fetchCustomFinalProductNameCached(companyId),
  ]);

  return {
    items,
    suppliers,
    purchases,
    supplierPayments,
    batches,
    dispatches,
    customers,
    bills,
    customerPayments,
    customFinalProductName,
  };
}

// ----------------------------------------------------------------------------
// 1. PurchaseService (Items, Suppliers, Purchases, Supplier Payments & Ledger)
// ----------------------------------------------------------------------------

export const SupabasePurchaseService: IPurchaseService = {
  async listPurchases(companyId: string) {
    const list = await fetchAllPurchasesCached(companyId);
    return [...list].sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    );
  },

  async listSuppliers(companyId: string) {
    const list = await fetchAllSuppliersCached(companyId);
    return list
      .filter((s) => s.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async listItems(companyId: string) {
    const list = await fetchAllItemsCached(companyId);
    return list
      .filter((i) => i.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async createSupplierInline(companyId: string, name: string, phone?: string) {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    const payload = mapDomainSupplierToDbInsert(companyId, {
      name: name.trim(),
      phone: phone?.trim() || undefined,
      openingBalance: '0',
    });

    const { data, error } = await client
      .from('suppliers')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw formatSupabaseServiceError(error, 'create supplier');
    }

    await invalidateGroupAQueries(companyId, ['suppliers']);
    return mapDbSupplierToDomain(data as DbSupplierRow);
  },

  async createSupplier(companyId, data) {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    const payload = mapDomainSupplierToDbInsert(companyId, {
      ...data,
      name: data.name.trim(),
      phone: data.phone?.trim() || undefined,
      city: data.city?.trim() || undefined,
      address: data.address?.trim() || undefined,
      openingBalance: roundMoney(data.openingBalance || 0).toFixed(),
      notes: data.notes?.trim() || undefined,
    });

    const { data: row, error } = await client
      .from('suppliers')
      .insert(payload)
      .select('*')
      .single();

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'create supplier');
    }

    await invalidateGroupAQueries(companyId, ['suppliers']);
    return mapDbSupplierToDomain(row as DbSupplierRow);
  },

  async updateSupplier(companyId, id, patch) {
    assertOnlineForSave();
    const suppliers = await fetchAllSuppliersCached(companyId);
    const existing = suppliers.find(
      (s) => s.id === id && s.companyId === companyId
    );
    canEdit(existing, 'Supplier', 'Supplier not found.');

    const client = requireSupabaseClient();
    const rpcPatch = mapDomainSupplierPatchToRpcPayload({
      ...patch,
      openingBalance:
        patch.openingBalance !== undefined
          ? roundMoney(patch.openingBalance || 0).toFixed()
          : undefined,
    });

    const { data: row, error } = await client.rpc('rpc_update_supplier', {
      p_company: companyId,
      p_supplier_id: id,
      p_patch: rpcPatch,
    });

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'update supplier');
    }

    await invalidateGroupAQueries(companyId, [
      'suppliers',
      'purchases',
      'supplierPayments',
    ]);
    return mapDbSupplierToDomain(row as DbSupplierRow);
  },

  async deleteSupplier(companyId, id) {
    assertOnlineForSave();
    const [suppliers, purchases, payments] = await Promise.all([
      fetchAllSuppliersCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllSupplierPaymentsCached(companyId),
    ]);

    const existing = suppliers.find(
      (s) => s.id === id && s.companyId === companyId
    );
    canDelete(existing, 'Supplier', { notFoundMessage: 'Supplier not found.' });

    const hasRecords =
      purchases.some((p) => p.supplierId === id) ||
      payments.some((pay) => pay.supplierId === id);
    if (hasRecords) {
      throw new Error(
        'Cannot delete supplier because it has purchase or payment records.'
      );
    }

    const client = requireSupabaseClient();
    const { error } = await client
      .from('suppliers')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete supplier');
    }

    await invalidateGroupAQueries(companyId, ['suppliers']);
  },

  async createItemInline(
    companyId: string,
    name: string,
    kind: 'rock' | 'chemical',
    extra?: { notes?: string; lowStockAlert?: string }
  ) {
    assertOnlineForSave();
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Enter a valid item name.');
    }

    const allItems = await fetchAllItemsCached(companyId);
    const duplicate = allItems.find(
      (i) =>
        i.status === 'active' &&
        i.kind === kind &&
        i.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      return duplicate;
    }

    const client = requireSupabaseClient();
    const payload = mapDomainItemToDbInsert({
      companyId,
      name: trimmed,
      kind,
      notes: extra?.notes?.trim() || undefined,
      lowStockAlert: extra?.lowStockAlert?.trim() || undefined,
    });

    const { data: row, error } = await client
      .from('items')
      .insert(payload)
      .select('*')
      .single();

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'create item');
    }

    await invalidateGroupAQueries(companyId, ['items']);
    return mapDbItemToDomain(row as DbItemRow);
  },

  async createItem(companyId, data) {
    return this.createItemInline(companyId, data.name, data.kind, {
      notes: data.notes,
      lowStockAlert: data.lowStockAlert,
    });
  },

  async updateItem(companyId, id, patch) {
    assertOnlineForSave();
    const items = await fetchAllItemsCached(companyId);
    const existing = items.find((i) => i.id === id && i.companyId === companyId);
    canEdit(existing, 'Item', 'Item not found.');

    const nextName =
      patch.name !== undefined ? patch.name.trim() : existing!.name;
    const nextNotes =
      patch.notes !== undefined
        ? patch.notes.trim() || undefined
        : existing!.notes;
    const nextAlert =
      patch.lowStockAlert !== undefined
        ? toOptionalDecimalString(patch.lowStockAlert)
        : existing!.lowStockAlert;

    const client = requireSupabaseClient();
    if (nextName !== existing!.name) {
      const { error: renameErr } = await client.rpc('rpc_rename_item', {
        p_company: companyId,
        p_item_id: id,
        p_new_name: nextName,
      });
      if (renameErr) {
        throw formatSupabaseServiceError(renameErr, 'rename item');
      }
    }

    const { data: row, error } = await client
      .from('items')
      .update({
        name: nextName,
        notes: nextNotes ?? null,
        low_stock_alert: nextAlert ?? null,
        details: nextAlert ? { lowStockAlert: nextAlert } : {},
        edited_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single();

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'update item');
    }

    await invalidateGroupAQueries(companyId, ['items', 'purchases', 'batches']);
    return mapDbItemToDomain(row as DbItemRow);
  },

  async renameItem(companyId: string, itemId: string, newName: string) {
    assertOnlineForSave();
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('Enter a valid item name.');
    }

    if (itemId === '__FINAL_PRODUCT__') {
      const client = requireSupabaseClient();
      const { error } = await client
        .from('companies')
        .update({ final_product_name: trimmed })
        .eq('id', companyId);

      if (error) {
        throw formatSupabaseServiceError(error, 'rename final product');
      }

      await invalidateGroupAQueries(companyId, ['finalProductName']);
      return;
    }

    const items = await fetchAllItemsCached(companyId);
    const existing = items.find(
      (i) => i.id === itemId && i.companyId === companyId
    );
    canEdit(existing, 'Item', 'Item not found.');

    const client = requireSupabaseClient();
    const { error } = await client.rpc('rpc_rename_item', {
      p_company: companyId,
      p_item_id: itemId,
      p_new_name: trimmed,
    });

    if (error) {
      throw formatSupabaseServiceError(error, 'rename item');
    }

    await invalidateGroupAQueries(companyId, ['items', 'purchases', 'batches']);
  },

  async createPurchase(companyId, data) {
    assertOnlineForSave();
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    const now = new Date().toISOString();
    const newId = generateUuid();
    const purchaseCandidate: Purchase = {
      ...data,
      id: newId,
      companyId,
      docNumber: '',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems: items,
      purchases: [...purchases, purchaseCandidate],
      batches,
      dispatches,
      bills,
    });

    if (!recomputed.valid) {
      throw new Error(recomputed.errorMessage || 'Invalid purchase state.');
    }

    const client = requireSupabaseClient();
    const { data: savedRow, error } = await client.rpc('rpc_save_purchase', {
      p_company: companyId,
      p_purchase: mapDomainPurchaseToRpcPayload(purchaseCandidate),
      p_batches: recomputed.batches.map(mapDomainBatchSnapshotPayload),
      p_dispatches: recomputed.dispatches.map(mapDomainDispatchSnapshotPayload),
      p_sales: recomputed.bills.map(mapDomainSaleSnapshotPayload),
    });

    if (error || !savedRow) {
      throw formatSupabaseServiceError(error, 'save purchase');
    }

    await invalidateGroupAQueries(companyId, [
      'purchases',
      'batches',
      'dispatches',
      'sales',
    ]);
    return mapDbPurchaseToDomain(savedRow as DbPurchaseRow);
  },

  async updatePurchase(companyId, id, data) {
    assertOnlineForSave();
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    const existing = purchases.find(
      (p) => p.id === id && p.companyId === companyId
    );
    canEdit(existing, 'Purchase', 'Purchase not found.');

    const now = new Date().toISOString();
    const updatedPurchase: Purchase = {
      ...existing!,
      ...data,
      id: existing!.id,
      companyId,
      docNumber: existing!.docNumber,
      status: existing!.status,
      createdAt: existing!.createdAt,
      editedAt: now,
      updatedAt: now,
    };

    const simulatedPurchases = purchases.map((p) =>
      p.id === id ? updatedPurchase : p
    );
    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems: items,
      purchases: simulatedPurchases,
      batches,
      dispatches,
      bills,
    });

    if (!recomputed.valid) {
      throw new Error(
        `Cannot save changes to ${existing!.docNumber}: ${recomputed.errorMessage}`
      );
    }

    const client = requireSupabaseClient();
    const { data: savedRow, error } = await client.rpc('rpc_save_purchase', {
      p_company: companyId,
      p_purchase: mapDomainPurchaseToRpcPayload(updatedPurchase),
      p_batches: recomputed.batches.map(mapDomainBatchSnapshotPayload),
      p_dispatches: recomputed.dispatches.map(mapDomainDispatchSnapshotPayload),
      p_sales: recomputed.bills.map(mapDomainSaleSnapshotPayload),
    });

    if (error || !savedRow) {
      throw formatSupabaseServiceError(error, 'update purchase');
    }

    await invalidateGroupAQueries(companyId, [
      'purchases',
      'batches',
      'dispatches',
      'sales',
    ]);
    return mapDbPurchaseToDomain(savedRow as DbPurchaseRow);
  },

  async cancelPurchase(companyId, id, reason) {
    assertOnlineForSave();
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    const existing = purchases.find(
      (p) => p.id === id && p.companyId === companyId
    );
    canCancel(existing, 'Purchase', 'Purchase not found.');

    const simulatedPurchases = purchases.map((p) =>
      p.id === id ? { ...p, status: 'cancelled' as const } : p
    );

    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems: items,
      purchases: simulatedPurchases,
      batches,
      dispatches,
      bills,
    });

    if (!recomputed.valid) {
      throw new Error(
        `Cannot cancel ${existing!.docNumber}: ${recomputed.errorMessage}`
      );
    }

    const client = requireSupabaseClient();
    const { error } = await client.rpc('rpc_cancel_purchase', {
      p_company: companyId,
      p_purchase_id: id,
      p_reason: reason.trim(),
      p_batches: recomputed.batches.map(mapDomainBatchSnapshotPayload),
      p_dispatches: recomputed.dispatches.map(mapDomainDispatchSnapshotPayload),
      p_sales: recomputed.bills.map(mapDomainSaleSnapshotPayload),
    });

    if (error) {
      throw formatSupabaseServiceError(error, 'cancel purchase');
    }

    await invalidateGroupAQueries(companyId, [
      'purchases',
      'batches',
      'dispatches',
      'sales',
    ]);
  },

  async deletePurchase(companyId, id) {
    assertOnlineForSave();
    const purchases = await fetchAllPurchasesCached(companyId);
    const existing = purchases.find(
      (p) => p.id === id && p.companyId === companyId
    );
    canDelete(existing, 'Purchase', {
      requireCancelledFirst: true,
      notCancelledMessage: 'Cancel this purchase first before deleting it.',
      notFoundMessage: 'Purchase not found.',
    });

    const client = requireSupabaseClient();
    const { error } = await client
      .from('purchases')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete purchase');
    }

    await invalidateGroupAQueries(companyId, ['purchases']);
  },

  async listSupplierPayments(companyId: string, supplierId?: string) {
    let list = await fetchAllSupplierPaymentsCached(companyId);
    if (supplierId) {
      list = list.filter((p) => p.supplierId === supplierId);
    }
    return [...list].sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    );
  },

  async paySupplier(companyId, data) {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    const payload = mapDomainSupplierPaymentToDbInsert({
      companyId,
      date: data.date,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      amount: roundMoney(data.amount).toFixed(),
      method: data.method,
      reference: data.reference,
      bankName: data.bankName,
      notes: data.notes,
    });

    const { data: row, error } = await client
      .from('payments')
      .insert(payload)
      .select('*')
      .single();

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'record supplier payment');
    }

    await invalidateGroupAQueries(companyId, ['supplierPayments']);
    return mapDbPaymentToSupplierPayment(row as DbPaymentRow);
  },

  async cancelSupplierPayment(companyId: string, id: string, reason: string) {
    assertOnlineForSave();
    if (!reason || !reason.trim()) {
      throw new Error('Cancellation reason is required.');
    }

    const payments = await fetchAllSupplierPaymentsCached(companyId);
    const existing = payments.find(
      (p) => p.id === id && p.companyId === companyId
    );
    canCancel(existing, 'Supplier payment', 'Supplier payment not found.');

    if (existing!.status === 'cancelled') {
      throw new Error('Payment is already cancelled.');
    }

    const client = requireSupabaseClient();
    const { error } = await client
      .from('payments')
      .update({
        status: 'cancelled',
        cancel_reason: reason.trim(),
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('party_type', 'supplier');

    if (error) {
      throw formatSupabaseServiceError(error, 'cancel supplier payment');
    }

    await invalidateGroupAQueries(companyId, ['supplierPayments']);
  },

  async deleteSupplierPayment(companyId: string, id: string) {
    assertOnlineForSave();
    const payments = await fetchAllSupplierPaymentsCached(companyId);
    const existing = payments.find(
      (p) => p.id === id && p.companyId === companyId
    );
    canDelete(existing, 'Supplier payment', {
      requireCancelledFirst: true,
      notCancelledMessage: 'Cancel this payment first before deleting it.',
      notFoundMessage: 'Supplier payment not found.',
    });

    const client = requireSupabaseClient();
    const { error } = await client
      .from('payments')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('party_type', 'supplier');

    if (error) {
      throw formatSupabaseServiceError(error, 'delete supplier payment');
    }

    await invalidateGroupAQueries(companyId, ['supplierPayments']);
  },

  async getSupplierLedger(companyId: string, supplierId: string) {
    const [suppliers, purchases, payments] = await Promise.all([
      fetchAllSuppliersCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllSupplierPaymentsCached(companyId),
    ]);

    const supplier = suppliers.find(
      (s) => s.id === supplierId && s.companyId === companyId
    );
    if (!supplier) {
      throw new Error('Supplier not found.');
    }

    return calculateSupplierLedger({
      openingBalance: supplier.openingBalance,
      purchases: purchases.filter((p) => p.supplierId === supplierId),
      payments: payments.filter((p) => p.supplierId === supplierId),
    });
  },
};

// ----------------------------------------------------------------------------
// 2. ProductionService (Batches)
// ----------------------------------------------------------------------------

export const SupabaseProductionService: IProductionService = {
  async listBatches(companyId: string) {
    const list = await fetchAllBatchesCached(companyId);
    return [...list].sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    );
  },

  async createBatch(companyId, data) {
    assertOnlineForSave();
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    const beforeReplay = replayInventoryState({
      catalogItems: items,
      purchases: purchases.filter(
        (p) => p.date.slice(0, 10) <= data.date.slice(0, 10)
      ),
      batches: batches.filter(
        (b) => b.date.slice(0, 10) <= data.date.slice(0, 10)
      ),
      dispatches: dispatches.filter(
        (d) => d.dateTime.slice(0, 10) < data.date.slice(0, 10)
      ),
    });

    const rockState = beforeReplay.items.get(data.rockItemId);
    const rockAvg = rockState?.rawAvgCost ?? new Decimal(0);

    const calc = calculateProductionBatchCost({
      rockTons: data.rockTons,
      rockAvgCost: rockAvg,
      chemicals: data.chemicalUsages.map((u) => ({
        itemId: u.itemId,
        itemName: u.itemName,
        bags: u.bags,
        avgCostPerBag:
          beforeReplay.items.get(u.itemId)?.rawAvgCost ?? new Decimal(0),
      })),
      finalProductTons: data.finalProductTons,
    });

    const now = new Date().toISOString();
    const newId = generateUuid();
    const candidateBatch: ProductionBatch = {
      ...data,
      id: newId,
      companyId,
      docNumber: '',
      rockAvgCostSnapshot: roundMoney(rockAvg).toString(),
      rockCostSnapshot: calc.rockCost.toString(),
      chemicalUsages: calc.chemicalCosts.map((c) => ({
        itemId: c.itemId || '',
        itemName: c.itemName || '',
        bags: c.bags.toString(),
        avgCostPerBagSnapshot: c.avgCostPerBag.toString(),
        lineCostSnapshot: c.lineCost.toString(),
      })),
      totalCostSnapshot: calc.totalCost.toString(),
      costPerTonSnapshot: calc.costPerTon.toString(),
      rawCostPerTonSnapshot: calc.rawCostPerTon.toString(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const fullCheck = replayInventoryState({
      catalogItems: items,
      purchases,
      batches: [...batches, candidateBatch],
      dispatches,
    });

    if (!fullCheck.valid) {
      throw new Error(
        fullCheck.errorMessage || 'Insufficient stock for this batch.'
      );
    }

    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems: items,
      purchases,
      batches: [...batches, candidateBatch],
      dispatches,
      bills,
    });

    if (!recomputed.valid) {
      throw new Error(
        recomputed.errorMessage || 'Insufficient stock for this batch.'
      );
    }

    const finalCandidate =
      recomputed.batches.find((b) => b.id === newId) || candidateBatch;

    const client = requireSupabaseClient();
    const { data: savedRow, error } = await client.rpc('rpc_save_batch', {
      p_company: companyId,
      p_batch: mapDomainBatchToRpcPayload(finalCandidate),
      p_batches: recomputed.batches.map(mapDomainBatchSnapshotPayload),
      p_dispatches: recomputed.dispatches.map(mapDomainDispatchSnapshotPayload),
      p_sales: recomputed.bills.map(mapDomainSaleSnapshotPayload),
    });

    if (error || !savedRow) {
      throw formatSupabaseServiceError(error, 'save production batch');
    }

    await invalidateGroupAQueries(companyId, ['batches', 'dispatches', 'sales']);
    return mapDbBatchToDomain(savedRow as DbBatchRow);
  },

  async updateBatch(companyId, id, data) {
    assertOnlineForSave();
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    const existing = batches.find(
      (b) => b.id === id && b.companyId === companyId
    );
    canEdit(existing, 'Production batch', 'Production batch not found.');

    const now = new Date().toISOString();
    const candidateBatch: ProductionBatch = {
      ...existing!,
      ...data,
      id: existing!.id,
      companyId,
      docNumber: existing!.docNumber,
      status: existing!.status,
      createdAt: existing!.createdAt,
      editedAt: now,
      updatedAt: now,
    };

    const simulatedBatches = batches.map((b) =>
      b.id === id ? candidateBatch : b
    );
    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems: items,
      purchases,
      batches: simulatedBatches,
      dispatches,
      bills,
    });

    if (!recomputed.valid) {
      throw new Error(
        `Cannot save changes to ${existing!.docNumber}: ${recomputed.errorMessage}`
      );
    }

    const refreshedBatch =
      recomputed.batches.find((b) => b.id === id) || candidateBatch;

    const client = requireSupabaseClient();
    const { data: savedRow, error } = await client.rpc('rpc_save_batch', {
      p_company: companyId,
      p_batch: mapDomainBatchToRpcPayload(refreshedBatch),
      p_batches: recomputed.batches.map(mapDomainBatchSnapshotPayload),
      p_dispatches: recomputed.dispatches.map(mapDomainDispatchSnapshotPayload),
      p_sales: recomputed.bills.map(mapDomainSaleSnapshotPayload),
    });

    if (error || !savedRow) {
      throw formatSupabaseServiceError(error, 'update production batch');
    }

    await invalidateGroupAQueries(companyId, ['batches', 'dispatches', 'sales']);
    return mapDbBatchToDomain(savedRow as DbBatchRow);
  },

  async cancelBatch(companyId, id, reason) {
    assertOnlineForSave();
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    const existing = batches.find(
      (b) => b.id === id && b.companyId === companyId
    );
    canCancel(existing, 'Production batch', 'Production batch not found.');

    const simulatedBatches = batches.map((b) =>
      b.id === id ? { ...b, status: 'cancelled' as const } : b
    );

    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems: items,
      purchases,
      batches: simulatedBatches,
      dispatches,
      bills,
    });

    if (!recomputed.valid) {
      throw new Error(
        `Cannot cancel ${existing!.docNumber}: ${recomputed.errorMessage}`
      );
    }

    const client = requireSupabaseClient();
    const { error } = await client.rpc('rpc_cancel_batch', {
      p_company: companyId,
      p_batch_id: id,
      p_reason: reason.trim(),
      p_batches: recomputed.batches.map(mapDomainBatchSnapshotPayload),
      p_dispatches: recomputed.dispatches.map(mapDomainDispatchSnapshotPayload),
      p_sales: recomputed.bills.map(mapDomainSaleSnapshotPayload),
    });

    if (error) {
      throw formatSupabaseServiceError(error, 'cancel production batch');
    }

    await invalidateGroupAQueries(companyId, ['batches', 'dispatches', 'sales']);
  },

  async deleteBatch(companyId, id) {
    assertOnlineForSave();
    const batches = await fetchAllBatchesCached(companyId);
    const existing = batches.find(
      (b) => b.id === id && b.companyId === companyId
    );
    canDelete(existing, 'Production batch', {
      requireCancelledFirst: true,
      notCancelledMessage: 'Cancel this batch first before deleting it.',
      notFoundMessage: 'Production batch not found.',
    });

    const client = requireSupabaseClient();
    const { error } = await client
      .from('batches')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete production batch');
    }

    await invalidateGroupAQueries(companyId, ['batches']);
  },
};

// ----------------------------------------------------------------------------
// 3. DispatchService (Dispatches)
// ----------------------------------------------------------------------------

export const SupabaseDispatchService: IDispatchService = {
  async listDispatches(companyId: string) {
    const list = await fetchAllDispatchesCached(companyId);
    return [...list].sort(
      (a, b) =>
        b.dateTime.localeCompare(a.dateTime) ||
        b.createdAt.localeCompare(a.createdAt)
    );
  },

  async createDispatch(companyId, data) {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    const payload = mapDomainDispatchToDbInsert({
      companyId,
      dateTime: data.dateTime,
      customerId: data.customerId,
      customerName: data.customerName,
      vehicleNumber: data.vehicleNumber,
      bagsCount: data.bagsCount,
      driverName: data.driverName,
      driverPhone: data.driverPhone,
      destinationCity: data.destinationCity,
      notes: data.notes,
    });

    const { data: row, error } = await client
      .from('dispatches')
      .insert(payload)
      .select('*')
      .single();

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'create dispatch');
    }

    await invalidateGroupAQueries(companyId, ['dispatches']);
    return mapDbDispatchToDomain(row as DbDispatchRow);
  },

  async editDispatch(companyId, id, data) {
    assertOnlineForSave();
    const dispatches = await fetchAllDispatchesCached(companyId);
    const existing = dispatches.find(
      (d) => d.id === id && d.companyId === companyId
    );
    canEdit(existing, 'Dispatch', 'Dispatch not found.');

    const rpcPatch: Record<string, unknown> = {};
    if (data.dateTime !== undefined) rpcPatch.dateTime = data.dateTime;
    if (data.customerId !== undefined) rpcPatch.customerId = data.customerId;
    if (data.customerName !== undefined) {
      rpcPatch.customerName = data.customerName.trim();
    }
    if (data.vehicleNumber !== undefined) {
      rpcPatch.vehicleNumber = data.vehicleNumber.trim().toUpperCase();
    }
    if (data.bagsCount !== undefined) {
      rpcPatch.bagsCount = Math.round(Number(data.bagsCount) || 0);
    }
    if (data.notes !== undefined) {
      rpcPatch.notes = data.notes?.trim() || '';
    }

    const detailsPatch: Record<string, unknown> = {};
    if (data.driverName !== undefined) {
      detailsPatch.driverName = data.driverName?.trim() || null;
    }
    if (data.driverPhone !== undefined) {
      detailsPatch.driverPhone = data.driverPhone?.trim() || null;
    }
    if (data.destinationCity !== undefined) {
      detailsPatch.destinationCity = data.destinationCity?.trim() || null;
    }
    if (Object.keys(detailsPatch).length > 0) {
      rpcPatch.details = detailsPatch;
    }

    const client = requireSupabaseClient();
    const { data: row, error } = await client.rpc('rpc_edit_dispatch', {
      p_company: companyId,
      p_dispatch_id: id,
      p_patch: rpcPatch,
    });

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'update dispatch');
    }

    await invalidateGroupAQueries(companyId, ['dispatches', 'sales']);
    return mapDbDispatchToDomain(row as DbDispatchRow);
  },

  async cancelDispatch(companyId, id, reason) {
    assertOnlineForSave();
    const [dispatches, bills] = await Promise.all([
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);
    const existing = dispatches.find(
      (d) => d.id === id && d.companyId === companyId
    );
    canCancel(existing, 'Dispatch', 'Dispatch not found.');

    if (existing!.billId) {
      const linkedBill = bills.find((b) => b.id === existing!.billId);
      if (linkedBill && linkedBill.status === 'active') {
        throw new Error(
          `Cannot cancel ${existing!.docNumber} because it is already sold (${linkedBill.docNumber}). Cancel the bill first.`
        );
      }
    }

    const client = requireSupabaseClient();
    const { error } = await client
      .from('dispatches')
      .update({
        status: 'cancelled',
        dispatch_state: 'cancelled',
        cancel_reason: reason.trim(),
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'cancel dispatch');
    }

    await invalidateGroupAQueries(companyId, ['dispatches']);
  },

  async deleteDispatch(companyId, id) {
    assertOnlineForSave();
    const [dispatches, bills] = await Promise.all([
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);
    const existing = dispatches.find(
      (d) => d.id === id && d.companyId === companyId
    );
    canDelete(existing, 'Dispatch', { notFoundMessage: 'Dispatch not found.' });

    if (existing!.billId) {
      const linkedBill = bills.find((b) => b.id === existing!.billId);
      if (linkedBill && linkedBill.status === 'active') {
        throw new Error(
          'Cannot delete a sold dispatch. Cancel the bill first.'
        );
      }
    }

    const client = requireSupabaseClient();
    const { error } = await client
      .from('dispatches')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete dispatch');
    }

    await invalidateGroupAQueries(companyId, ['dispatches']);
  },
};

// ----------------------------------------------------------------------------
// 4. InvoiceService (Bills / Sales)
// ----------------------------------------------------------------------------

export const SupabaseInvoiceService: IInvoiceService = {
  async listBills(companyId: string) {
    const list = await fetchAllSalesCached(companyId);
    return [...list].sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    );
  },

  async createBill(companyId, data) {
    assertOnlineForSave();
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    const linkedDispatch = dispatches.find((d) => d.id === data.dispatchId);
    if (!linkedDispatch) {
      throw new Error('Dispatch not found for bill.');
    }

    const saleDate = data.date.slice(0, 10);

    const beforeSaleReplay = replayInventoryState({
      catalogItems: items,
      purchases: purchases.filter((p) => p.date.slice(0, 10) <= saleDate),
      batches: batches.filter((b) => b.date.slice(0, 10) <= saleDate),
      dispatches: dispatches.filter((d) => {
        if (!d.billId || !d.receivedWeightTons || d.id === linkedDispatch.id) {
          return false;
        }
        const dSaleDate = (d.saleDate || d.dateTime).slice(0, 10);
        return dSaleDate <= saleDate;
      }),
    });

    const receivedTons = roundWeight(data.receivedWeightTons);
    if (beforeSaleReplay.finalProduct.quantity.lt(receivedTons)) {
      throw new Error(
        `Only ${beforeSaleReplay.finalProduct.quantity.toString()} ton available`
      );
    }

    const powderRawAvg = beforeSaleReplay.finalProduct.rawAvgCost;
    const calc = calculateDispatchAndBill({
      receivedWeightTons: data.receivedWeightTons,
      ratePerTon: data.ratePerTon,
      discount: data.discount,
      avgCostPerTon: powderRawAvg,
    });

    const now = new Date().toISOString();
    const billId = generateUuid();

    const candidateDispatch: Dispatch = {
      ...linkedDispatch,
      receivedWeightTons: receivedTons.toString(),
      ratePerTon: data.ratePerTon,
      saleDate,
      avgCostPerTonSnapshot: beforeSaleReplay.finalProduct.avgCost.toFixed(2),
      rawAvgCostPerTonSnapshot: powderRawAvg.toString(),
      cogsSnapshot: calc.cogs.toFixed(2),
      billId,
      billDocNumber: '',
      updatedAt: now,
    };

    const fullCheck = replayInventoryState({
      catalogItems: items,
      purchases,
      batches,
      dispatches: dispatches.map((d) =>
        d.id === linkedDispatch.id ? candidateDispatch : d
      ),
    });

    if (!fullCheck.valid) {
      throw new Error(
        fullCheck.errorMessage ||
          `Only ${beforeSaleReplay.finalProduct.quantity.toString()} ton available`
      );
    }

    const billCandidate: Bill = {
      ...data,
      id: billId,
      companyId,
      docNumber: '',
      subtotal: calc.subtotal.toString(),
      totalAmount: calc.billAmount.toString(),
      costOfPowderSoldSnapshot: calc.cogs.toFixed(2),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems: items,
      purchases,
      batches,
      dispatches: dispatches.map((d) =>
        d.id === linkedDispatch.id ? candidateDispatch : d
      ),
      bills: [...bills, billCandidate],
    });

    if (!recomputed.valid) {
      throw new Error(
        recomputed.errorMessage ||
          `Only ${beforeSaleReplay.finalProduct.quantity.toString()} ton available`
      );
    }

    const finalBillCandidate =
      recomputed.bills.find((b) => b.id === billId) || billCandidate;
    const finalDispatchCandidate =
      recomputed.dispatches.find((d) => d.id === linkedDispatch.id) ||
      candidateDispatch;

    const client = requireSupabaseClient();
    const { data: savedSaleRow, error } = await client.rpc('rpc_create_sale', {
      p_company: companyId,
      p_sale: mapDomainSaleToRpcPayload(finalBillCandidate),
      p_dispatch_patch: {
        avgCostPerTonSnapshot:
          toOptionalDecimalString(finalDispatchCandidate.avgCostPerTonSnapshot) ??
          beforeSaleReplay.finalProduct.avgCost.toFixed(2),
        rawAvgCostPerTonSnapshot:
          toOptionalDecimalString(
            finalDispatchCandidate.rawAvgCostPerTonSnapshot
          ) ?? powderRawAvg.toString(),
      },
      p_payment: null,
      p_dispatches: recomputed.dispatches.map(mapDomainDispatchSnapshotPayload),
      p_sales: recomputed.bills.map(mapDomainSaleSnapshotPayload),
    });

    if (error || !savedSaleRow) {
      throw formatSupabaseServiceError(error, 'create bill');
    }

    await invalidateGroupAQueries(companyId, ['sales', 'dispatches']);
    return mapDbSaleToDomain(savedSaleRow as DbSaleRow);
  },

  async updateBill(companyId, id, patch) {
    assertOnlineForSave();
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    const existing = bills.find(
      (b) => b.id === id && b.companyId === companyId
    );
    canEdit(existing, 'Bill', 'Bill not found.');

    const now = new Date().toISOString();
    const saleDate = patch.date.slice(0, 10);
    const receivedTons = roundWeight(patch.receivedWeightTons);

    const candidateBill: Bill = {
      ...existing!,
      date: saleDate,
      receivedWeightTons: receivedTons.toString(),
      ratePerTon: patch.ratePerTon,
      discount: patch.discount || '0',
      weightSlipNumber:
        patch.weightSlipNumber !== undefined
          ? patch.weightSlipNumber
          : existing!.weightSlipNumber,
      remarks: patch.remarks !== undefined ? patch.remarks : existing!.remarks,
      notes: patch.notes !== undefined ? patch.notes : existing!.notes,
      editedAt: now,
      updatedAt: now,
    };

    const simulatedDispatches = dispatches.map((d) =>
      d.id === existing!.dispatchId
        ? {
            ...d,
            receivedWeightTons: receivedTons.toString(),
            ratePerTon: patch.ratePerTon,
            saleDate,
            editedAt: now,
            updatedAt: now,
          }
        : d
    );
    const simulatedBills = bills.map((b) =>
      b.id === id ? candidateBill : b
    );

    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems: items,
      purchases,
      batches,
      dispatches: simulatedDispatches,
      bills: simulatedBills,
    });

    if (!recomputed.valid) {
      throw new Error(
        `Cannot save changes to ${existing!.docNumber}: ${recomputed.errorMessage}`
      );
    }

    const refreshedBill =
      recomputed.bills.find((b) => b.id === id) || candidateBill;

    const client = requireSupabaseClient();
    const { data: savedSaleRow, error } = await client.rpc('rpc_update_sale', {
      p_company: companyId,
      p_sale_id: id,
      p_sale: mapDomainSaleToRpcPayload(refreshedBill),
      p_dispatches: recomputed.dispatches.map(mapDomainDispatchSnapshotPayload),
      p_sales: recomputed.bills.map(mapDomainSaleSnapshotPayload),
    });

    if (error || !savedSaleRow) {
      throw formatSupabaseServiceError(error, 'update bill');
    }

    await invalidateGroupAQueries(companyId, ['sales', 'dispatches']);
    return mapDbSaleToDomain(savedSaleRow as DbSaleRow);
  },

  async cancelBill(companyId, id, reason) {
    assertOnlineForSave();
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    const existing = bills.find(
      (b) => b.id === id && b.companyId === companyId
    );
    canCancel(existing, 'Bill', 'Bill not found.');

    const now = new Date().toISOString();
    const nextBills = bills.map((b) =>
      b.id === id
        ? {
            ...b,
            status: 'cancelled' as const,
            cancelReason: reason.trim(),
            cancelledAt: now,
            updatedAt: now,
          }
        : b
    );

    const nextDispatches = dispatches.map((d) =>
      d.id === existing!.dispatchId
        ? {
            ...d,
            billId: undefined,
            billDocNumber: undefined,
            receivedWeightTons: undefined,
            ratePerTon: undefined,
            saleDate: undefined,
            avgCostPerTonSnapshot: undefined,
            rawAvgCostPerTonSnapshot: undefined,
            cogsSnapshot: undefined,
            costOfPowderSoldSnapshot: undefined,
            updatedAt: now,
          }
        : d
    );

    const recomputed = recomputeInventoryAndSnapshots({
      catalogItems: items,
      purchases,
      batches,
      dispatches: nextDispatches,
      bills: nextBills,
    });

    const client = requireSupabaseClient();
    const { error } = await client.rpc('rpc_cancel_sale', {
      p_company: companyId,
      p_sale_id: id,
      p_reason: reason.trim(),
      p_dispatches: recomputed.valid
        ? recomputed.dispatches.map(mapDomainDispatchSnapshotPayload)
        : [],
      p_sales: recomputed.valid
        ? recomputed.bills.map(mapDomainSaleSnapshotPayload)
        : [],
    });

    if (error) {
      throw formatSupabaseServiceError(error, 'cancel bill');
    }

    await invalidateGroupAQueries(companyId, ['sales', 'dispatches']);
  },

  async deleteBill(companyId, id) {
    assertOnlineForSave();
    const bills = await fetchAllSalesCached(companyId);
    const existing = bills.find(
      (b) => b.id === id && b.companyId === companyId
    );
    canDelete(existing, 'Bill', {
      requireCancelledFirst: true,
      notCancelledMessage: 'Cancel this bill first before deleting it.',
      notFoundMessage: 'Bill not found.',
    });

    const client = requireSupabaseClient();
    const { error } = await client
      .from('sales')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete bill');
    }

    await invalidateGroupAQueries(companyId, ['sales']);
  },
};

// ----------------------------------------------------------------------------
// 5. CustomerService (Customers, Customer Payments & Customer Ledger)
// ----------------------------------------------------------------------------

export const SupabaseCustomerService: ICustomerService = {
  async listCustomers(companyId: string) {
    const list = await fetchAllCustomersCached(companyId);
    return list
      .filter((c) => c.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async createCustomer(companyId, data) {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    const payload = mapDomainCustomerToDbInsert(companyId, {
      ...data,
      name: data.name.trim(),
      phone: data.phone?.trim() || undefined,
      city: data.city?.trim() || undefined,
      address: data.address?.trim() || undefined,
      openingBalance: roundMoney(data.openingBalance || 0).toFixed(),
      notes: data.notes?.trim() || undefined,
    });

    const { data: row, error } = await client
      .from('customers')
      .insert(payload)
      .select('*')
      .single();

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'create customer');
    }

    await invalidateGroupAQueries(companyId, ['customers']);
    return mapDbCustomerToDomain(row as DbCustomerRow);
  },

  async updateCustomer(companyId, id, patch) {
    assertOnlineForSave();
    const customers = await fetchAllCustomersCached(companyId);
    const existing = customers.find(
      (c) => c.id === id && c.companyId === companyId
    );
    canEdit(existing, 'Customer', 'Customer not found.');

    const client = requireSupabaseClient();
    const rpcPatch = mapDomainCustomerPatchToRpcPayload({
      ...patch,
      openingBalance:
        patch.openingBalance !== undefined
          ? roundMoney(patch.openingBalance || 0).toFixed()
          : undefined,
    });

    const { data: row, error } = await client.rpc('rpc_update_customer', {
      p_company: companyId,
      p_customer_id: id,
      p_patch: rpcPatch,
    });

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'update customer');
    }

    await invalidateGroupAQueries(companyId, [
      'customers',
      'dispatches',
      'sales',
      'customerPayments',
    ]);
    return mapDbCustomerToDomain(row as DbCustomerRow);
  },

  async deleteCustomer(companyId, id) {
    assertOnlineForSave();
    const [customers, dispatches, bills, payments] = await Promise.all([
      fetchAllCustomersCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
      fetchAllCustomerPaymentsCached(companyId),
    ]);

    const existing = customers.find(
      (c) => c.id === id && c.companyId === companyId
    );
    canDelete(existing, 'Customer', { notFoundMessage: 'Customer not found.' });

    const hasRecords =
      dispatches.some((d) => d.customerId === id) ||
      bills.some((b) => b.customerId === id) ||
      payments.some((p) => p.customerId === id);
    if (hasRecords) {
      throw new Error(
        'Cannot delete customer because it has dispatches, bills, or payments.'
      );
    }

    const client = requireSupabaseClient();
    const { error } = await client
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete customer');
    }

    await invalidateGroupAQueries(companyId, ['customers']);
  },

  async listPayments(companyId: string, customerId?: string) {
    let list = await fetchAllCustomerPaymentsCached(companyId);
    if (customerId) {
      list = list.filter((p) => p.customerId === customerId);
    }
    return [...list].sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    );
  },

  async receivePayment(companyId, data) {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    const payload = mapDomainCustomerPaymentToDbInsert({
      companyId,
      date: data.date,
      customerId: data.customerId,
      customerName: data.customerName,
      amount: roundMoney(data.amount).toFixed(),
      method: data.method,
      reference: data.reference,
      bankName: data.bankName,
      notes: data.notes,
    });

    const { data: row, error } = await client
      .from('payments')
      .insert(payload)
      .select('*')
      .single();

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'record customer payment');
    }

    await invalidateGroupAQueries(companyId, ['customerPayments']);
    return mapDbPaymentToCustomerPayment(row as DbPaymentRow);
  },

  async updatePayment(companyId, id, patch) {
    assertOnlineForSave();
    const payments = await fetchAllCustomerPaymentsCached(companyId);
    const existing = payments.find(
      (p) => p.id === id && p.companyId === companyId
    );
    canEdit(existing, 'Payment', 'Payment record not found.');

    const nextDetails = {
      reference:
        patch.reference !== undefined
          ? patch.reference?.trim() || null
          : existing!.reference ?? null,
      bankName:
        patch.bankName !== undefined
          ? patch.bankName?.trim() || null
          : existing!.bankName ?? null,
    };

    const updatePayload: Record<string, unknown> = {
      date: patch.date !== undefined ? patch.date : existing!.date,
      amount:
        patch.amount !== undefined
          ? roundMoney(patch.amount).toFixed()
          : existing!.amount,
      method: patch.method !== undefined ? patch.method : existing!.method,
      notes:
        patch.notes !== undefined
          ? patch.notes?.trim() || null
          : existing!.notes ?? null,
      details: nextDetails,
      edited_at: new Date().toISOString(),
    };

    const client = requireSupabaseClient();
    const { data: row, error } = await client
      .from('payments')
      .update(updatePayload)
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('party_type', 'customer')
      .select('*')
      .single();

    if (error || !row) {
      throw formatSupabaseServiceError(error, 'update customer payment');
    }

    await invalidateGroupAQueries(companyId, ['customerPayments']);
    return mapDbPaymentToCustomerPayment(row as DbPaymentRow);
  },

  async cancelPayment(companyId, id, reason) {
    assertOnlineForSave();
    const payments = await fetchAllCustomerPaymentsCached(companyId);
    const existing = payments.find(
      (p) => p.id === id && p.companyId === companyId
    );
    canCancel(existing, 'Payment', 'Payment record not found.');

    const client = requireSupabaseClient();
    const { error } = await client
      .from('payments')
      .update({
        status: 'cancelled',
        cancel_reason: reason.trim(),
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('party_type', 'customer');

    if (error) {
      throw formatSupabaseServiceError(error, 'cancel customer payment');
    }

    await invalidateGroupAQueries(companyId, ['customerPayments']);
  },

  async deletePayment(companyId, id) {
    assertOnlineForSave();
    const payments = await fetchAllCustomerPaymentsCached(companyId);
    const existing = payments.find(
      (p) => p.id === id && p.companyId === companyId
    );
    canDelete(existing, 'Payment', {
      requireCancelledFirst: true,
      notCancelledMessage: 'Cancel this payment first before deleting it.',
      notFoundMessage: 'Payment record not found.',
    });

    const client = requireSupabaseClient();
    const { error } = await client
      .from('payments')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('party_type', 'customer');

    if (error) {
      throw formatSupabaseServiceError(error, 'delete customer payment');
    }

    await invalidateGroupAQueries(companyId, ['customerPayments']);
  },

  async getCustomerLedger(companyId: string, customerId: string) {
    const [customers, bills, payments] = await Promise.all([
      fetchAllCustomersCached(companyId),
      fetchAllSalesCached(companyId),
      fetchAllCustomerPaymentsCached(companyId),
    ]);

    const customer = customers.find(
      (c) => c.id === customerId && c.companyId === companyId
    );
    if (!customer) {
      throw new Error('Customer not found.');
    }

    return calculateCustomerLedgerAndAllocations({
      openingBalance: customer.openingBalance,
      bills: bills.filter((b) => b.customerId === customerId),
      payments: payments.filter((p) => p.customerId === customerId),
    });
  },
};
