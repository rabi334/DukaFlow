'use client';

import React, { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  CheckCircle,
  PackageCheck,
  Building,
  Phone,
  Mail,
  FileText,
  X,
  RefreshCw,
  Search,
  Edit2,
  Archive,
  History,
  AlertCircle,
  Layers,
  ChevronRight,
  Boxes,
} from 'lucide-react';
import { api, formatETB } from '@/lib/api';
import { AccessDenied } from '@/components/common/AccessDenied';

export default function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<'orders' | 'suppliers'>('orders');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [userRole, setUserRole] = useState('Staff');

  // Filters
  const [poSearch, setPoSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

  // New PO Modal State
  const [isNewPoOpen, setIsNewPoOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poLines, setPoLines] = useState<Array<{ productId: string; orderedQty: number; unitCost: number }>>([
    { productId: '', orderedQty: 1, unitCost: 0 },
  ]);
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [poError, setPoError] = useState('');

  // Receive Dialog State
  const [receivingPo, setReceivingPo] = useState<any>(null);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, number>>({});
  const [submittingReceive, setSubmittingReceive] = useState(false);
  const [receiveError, setReceiveError] = useState('');

  // Supplier Modals
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [isEditSupplierOpen, setIsEditSupplierOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contactName: '',
    phoneNumber: '',
    email: '',
    address: '',
    tinNumber: '',
    notes: '',
  });
  const [supplierSubmitting, setSupplierSubmitting] = useState(false);
  const [supplierError, setSupplierError] = useState('');

  // Supplier History Modal
  const [historySupplier, setHistorySupplier] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setForbidden(false);
    const role = (localStorage.getItem('dukaflow_user_role') || 'Staff').toLowerCase();
    setUserRole(role);

    if (role === 'cashier') {
      setForbidden(true);
      setLoading(false);
      return;
    }

    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        api.get('/api/v1/purchases'),
        api.get('/api/v1/purchases/suppliers'),
        api.get('/api/v1/products'),
      ]);
      setPurchases(poRes.data);
      setSuppliers(supRes.data);
      setProducts(prodRes.data);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else {
        console.error('Failed to load purchases:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // PO Line Handlers
  const addPoLine = () => {
    setPoLines([...poLines, { productId: '', orderedQty: 1, unitCost: 0 }]);
  };

  const removePoLine = (index: number) => {
    if (poLines.length <= 1) return;
    setPoLines(poLines.filter((_, i) => i !== index));
  };

  const updatePoLine = (index: number, field: string, value: any) => {
    const updated = [...poLines];
    (updated[index] as any)[field] = value;

    // Auto-fill unitCost with product.costPrice if product selected
    if (field === 'productId') {
      const prod = products.find((p) => p.id === value);
      if (prod && prod.costPrice) {
        updated[index].unitCost = Number(prod.costPrice);
      }
    }

    setPoLines(updated);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poSupplierId) {
      setPoError('Please select a supplier');
      return;
    }

    const validLines = poLines.filter((l) => l.productId && l.orderedQty > 0);
    if (validLines.length === 0) {
      setPoError('Please add at least one valid product line with quantity > 0');
      return;
    }

    setPoSubmitting(true);
    setPoError('');

    try {
      await api.post('/api/v1/purchases', {
        supplierId: poSupplierId,
        notes: poNotes.trim() || undefined,
        items: validLines.map((l) => ({
          productId: l.productId,
          orderedQty: Number(l.orderedQty),
          unitCost: Number(l.unitCost),
        })),
      });

      setIsNewPoOpen(false);
      setPoSupplierId('');
      setPoNotes('');
      setPoLines([{ productId: '', orderedQty: 1, unitCost: 0 }]);
      await loadData();
    } catch (err: any) {
      setPoError(err.response?.data?.message || 'Failed to create purchase order');
    } finally {
      setPoSubmitting(false);
    }
  };

  // Receive Stock Handlers
  const handleOpenReceive = (po: any) => {
    setReceivingPo(po);
    setReceiveError('');
    const initialInputs: Record<string, number> = {};
    po.items?.forEach((item: any) => {
      const remaining = Number(item.orderedQty) - Number(item.receivedQty);
      initialInputs[item.id] = remaining > 0 ? remaining : 0;
    });
    setReceiveInputs(initialInputs);
  };

  const handleConfirmReceive = async () => {
    if (!receivingPo) return;

    const itemsToReceive = Object.entries(receiveInputs)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([purchaseItemId, qty]) => ({
        purchaseItemId,
        receivedQty: Number(qty),
      }));

    if (itemsToReceive.length === 0) {
      setReceiveError('Please enter a received quantity greater than 0 for at least one item');
      return;
    }

    setSubmittingReceive(true);
    setReceiveError('');

    try {
      await api.post(`/api/v1/purchases/${receivingPo.id}/receive`, {
        receivedItems: itemsToReceive,
      });
      setReceivingPo(null);
      await loadData();
    } catch (err: any) {
      setReceiveError(err.response?.data?.message || 'Failed to record stock receiving');
    } finally {
      setSubmittingReceive(false);
    }
  };

  // Supplier CRUD Handlers
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) return;

    setSupplierSubmitting(true);
    setSupplierError('');

    try {
      await api.post('/api/v1/purchases/suppliers', supplierForm);
      setIsAddSupplierOpen(false);
      setSupplierForm({
        name: '',
        contactName: '',
        phoneNumber: '',
        email: '',
        address: '',
        tinNumber: '',
        notes: '',
      });
      await loadData();
    } catch (err: any) {
      setSupplierError(err.response?.data?.message || 'Failed to create supplier');
    } finally {
      setSupplierSubmitting(false);
    }
  };

  const openEditSupplier = (sup: any) => {
    setEditingSupplierId(sup.id);
    setSupplierForm({
      name: sup.name || '',
      contactName: sup.contactName || '',
      phoneNumber: sup.phoneNumber || '',
      email: sup.email || '',
      address: sup.address || '',
      tinNumber: sup.tinNumber || '',
      notes: sup.notes || '',
    });
    setSupplierError('');
    setIsEditSupplierOpen(true);
  };

  const handleUpdateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplierId) return;

    setSupplierSubmitting(true);
    setSupplierError('');

    try {
      await api.patch(`/api/v1/purchases/suppliers/${editingSupplierId}`, supplierForm);
      setIsEditSupplierOpen(false);
      setEditingSupplierId(null);
      await loadData();
    } catch (err: any) {
      setSupplierError(err.response?.data?.message || 'Failed to update supplier');
    } finally {
      setSupplierSubmitting(false);
    }
  };

  const handleArchiveSupplier = async (sup: any) => {
    if (!confirm(`Are you sure you want to archive supplier "${sup.name}"?`)) return;

    try {
      await api.delete(`/api/v1/purchases/suppliers/${sup.id}`);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to archive supplier');
    }
  };

  const openSupplierHistory = async (sup: any) => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/api/v1/purchases/suppliers/${sup.id}`);
      setHistorySupplier(res.data);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load supplier history');
    } finally {
      setHistoryLoading(false);
    }
  };

  if (forbidden) {
    return (
      <AccessDenied
        role={userRole}
        resourceName="Purchases & Suppliers"
        requiredRole="Owner, Manager, or Inventory Staff"
      />
    );
  }

  const filteredPurchases = purchases.filter((po) => {
    const q = poSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      po.orderNumber.toLowerCase().includes(q) ||
      po.supplier?.name.toLowerCase().includes(q)
    );
  });

  const filteredSuppliers = suppliers.filter((sup) => {
    const q = supplierSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      sup.name.toLowerCase().includes(q) ||
      (sup.contactName && sup.contactName.toLowerCase().includes(q)) ||
      (sup.phoneNumber && sup.phoneNumber.includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Truck className="w-6 h-6 text-emerald-600" />
            <span>Purchases &amp; Suppliers</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create purchase orders, receive inventory stock atomically, and manage vendor relationships.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {userRole !== 'inventory_staff' && (
            <>
              {activeTab === 'orders' ? (
                <button
                  onClick={() => {
                    setPoError('');
                    setIsNewPoOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-sm transition-all"
                >
                  <Plus className="w-4 h-4" />
                  New Purchase Order
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSupplierError('');
                    setIsAddSupplierOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-sm transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add Supplier
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 text-xs font-semibold self-start">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'orders'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            Purchase Orders ({purchases.length})
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'suppliers'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building className="w-4 h-4" />
            Suppliers ({suppliers.length})
          </button>
        </div>

        {/* Tab Search */}
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={activeTab === 'orders' ? 'Search PO # or supplier...' : 'Search supplier name, phone...'}
            value={activeTab === 'orders' ? poSearch : supplierSearch}
            onChange={(e) =>
              activeTab === 'orders' ? setPoSearch(e.target.value) : setSupplierSearch(e.target.value)
            }
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Tab 1: Purchase Orders Table */}
      {activeTab === 'orders' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">PO Number</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Items / Qty</th>
                  <th className="py-3 px-4 text-right">Total Cost</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Order Date</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading purchase orders...
                    </td>
                  </tr>
                ) : filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No purchase orders found.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((po) => {
                    const totalOrdered = po.items?.reduce(
                      (acc: number, item: any) => acc + Number(item.orderedQty),
                      0,
                    ) || 0;
                    const totalReceived = po.items?.reduce(
                      (acc: number, item: any) => acc + Number(item.receivedQty),
                      0,
                    ) || 0;

                    const isFullyReceived = po.status === 'RECEIVED';
                    const isCancelled = po.status === 'CANCELLED';

                    return (
                      <tr
                        key={po.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {po.orderNumber}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                          {po.supplier?.name}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs">
                            {totalReceived} / {totalOrdered} received
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatETB(Number(po.totalAmount))}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              po.status === 'RECEIVED'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : po.status === 'PARTIALLY_RECEIVED'
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                : po.status === 'ORDERED'
                                ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(po.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {!isFullyReceived && !isCancelled ? (
                            <button
                              onClick={() => handleOpenReceive(po)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              Receive Goods
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Complete
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Suppliers Table */}
      {activeTab === 'suppliers' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4">Contact Person</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">TIN Number</th>
                  <th className="py-3 px-4 text-center">Orders Count</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading suppliers...
                    </td>
                  </tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Building className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No suppliers registered.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((sup) => (
                    <tr
                      key={sup.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-slate-100">
                        {sup.name}
                        {sup.isArchived && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        {sup.contactName || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {sup.phoneNumber || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {sup.tinNumber || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold font-mono">
                        {sup._count?.purchases || 0}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openSupplierHistory(sup)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Purchase History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          {userRole !== 'inventory_staff' && (
                            <>
                              <button
                                onClick={() => openEditSupplier(sup)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Edit Supplier"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {!sup.isArchived && (
                                <button
                                  onClick={() => handleArchiveSupplier(sup)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  title="Archive Supplier"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Purchase Order Modal */}
      {isNewPoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[88vh]">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">
                    Create Purchase Order
                  </h3>
                  <p className="text-xs text-slate-500">
                    Order stock from verified suppliers. Stock updates only upon physical receiving.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNewPoOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePo} className="p-5 space-y-4 overflow-y-auto flex-1">
              {poError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 font-medium">
                  {poError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Select Supplier *
                  </label>
                  <select
                    required
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers
                      .filter((s) => !s.isArchived)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Order Notes (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Expected delivery Friday morning"
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Order Line Items *
                  </label>
                  <button
                    type="button"
                    onClick={addPoLine}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                <div className="space-y-2">
                  {poLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center gap-2.5 text-xs"
                    >
                      <div className="flex-1">
                        <select
                          required
                          value={line.productId}
                          onChange={(e) => updatePoLine(idx, 'productId', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium"
                        >
                          <option value="">Select Product...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={line.orderedQty}
                          onChange={(e) => updatePoLine(idx, 'orderedQty', Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-center"
                        />
                      </div>

                      <div className="w-28">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          placeholder="Unit Cost"
                          value={line.unitCost}
                          onChange={(e) => updatePoLine(idx, 'unitCost', Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono text-right"
                        />
                      </div>

                      <div className="w-24 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatETB(line.orderedQty * line.unitCost)}
                      </div>

                      {poLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePoLine(idx)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewPoOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={poSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20"
                >
                  {poSubmitting ? 'Creating PO...' : 'Create Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Partial / Full Stock Receiving Modal */}
      {receivingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">
                    Receive Goods
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    PO: {receivingPo.orderNumber} • {receivingPo.supplier?.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReceivingPo(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {receiveError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 font-medium">
                  {receiveError}
                </div>
              )}

              <p className="text-xs text-slate-500">
                Enter the physical quantities received in this shipment. Only received quantities will be incremented in your inventory stock ledger.
              </p>

              <div className="space-y-2.5">
                {receivingPo.items?.map((item: any) => {
                  const remaining = Number(item.orderedQty) - Number(item.receivedQty);
                  const isComplete = remaining <= 0;

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-2xl border ${
                        isComplete
                          ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200/50 opacity-60'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      } flex items-center justify-between gap-3 text-xs`}
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.product?.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Ordered: <strong>{Number(item.orderedQty)}</strong> | Received so far:{' '}
                          <strong>{Number(item.receivedQty)}</strong> | Remaining:{' '}
                          <span className="text-emerald-600 font-bold">{remaining}</span>
                        </p>
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          min="0"
                          max={remaining}
                          disabled={isComplete}
                          value={receiveInputs[item.id] ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(remaining, Number(e.target.value)));
                            setReceiveInputs({
                              ...receiveInputs,
                              [item.id]: val,
                            });
                          }}
                          className="w-full text-center py-1.5 px-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setReceivingPo(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReceive}
                disabled={submittingReceive}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20"
              >
                {submittingReceive ? 'Receiving...' : 'Confirm Stock Receiving'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      {(isAddSupplierOpen || isEditSupplierOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                {isEditSupplierOpen ? 'Edit Supplier' : 'Add New Supplier'}
              </h3>
              <button
                onClick={() => {
                  setIsAddSupplierOpen(false);
                  setIsEditSupplierOpen(false);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={isEditSupplierOpen ? handleUpdateSupplier : handleCreateSupplier}
              className="p-5 space-y-3.5 max-h-[80vh] overflow-y-auto"
            >
              {supplierError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 font-medium">
                  {supplierError}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Supplier Name *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Ethiopian Beverages PLC"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ato Girma"
                    value={supplierForm.contactName}
                    onChange={(e) => setSupplierForm({ ...supplierForm, contactName: e.target.value })}
                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+251 911 234567"
                    value={supplierForm.phoneNumber}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phoneNumber: e.target.value })}
                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="supplier@mail.com"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    TIN Number
                  </label>
                  <input
                    type="text"
                    placeholder="0012345678"
                    value={supplierForm.tinNumber}
                    onChange={(e) => setSupplierForm({ ...supplierForm, tinNumber: e.target.value })}
                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. Addis Ababa, Bole Sub-City"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddSupplierOpen(false);
                    setIsEditSupplierOpen(false);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={supplierSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20"
                >
                  {supplierSubmitting ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Purchase History Modal */}
      {historySupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  {historySupplier.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Purchase Order History &amp; Vendor Profile
                </p>
              </div>
              <button
                onClick={() => setHistorySupplier(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Profile Details */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 block">Contact:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {historySupplier.contactName || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Phone:</span>
                  <span className="font-semibold font-mono text-slate-800 dark:text-slate-200">
                    {historySupplier.phoneNumber || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">TIN:</span>
                  <span className="font-semibold font-mono text-slate-800 dark:text-slate-200">
                    {historySupplier.tinNumber || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Address:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {historySupplier.address || '—'}
                  </span>
                </div>
              </div>

              {/* Purchase History */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Orders Placed ({historySupplier.purchases?.length || 0})
                </h4>

                <div className="space-y-2">
                  {historySupplier.purchases?.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      No purchase orders recorded for this supplier.
                    </p>
                  ) : (
                    historySupplier.purchases?.map((po: any) => (
                      <div
                        key={po.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-mono font-bold text-slate-900 dark:text-slate-100">
                            {po.orderNumber}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {new Date(po.createdAt).toLocaleDateString()} • {po.items?.length || 0} line items
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-slate-900 dark:text-slate-100">
                            {formatETB(Number(po.totalAmount))}
                          </p>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              po.status === 'RECEIVED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : po.status === 'PARTIALLY_RECEIVED'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {po.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end">
              <button
                onClick={() => setHistorySupplier(null)}
                className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
