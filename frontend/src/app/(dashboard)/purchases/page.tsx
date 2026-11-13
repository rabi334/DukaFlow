'use client';

import React, { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  CheckCircle,
  PackageCheck,
  Building,
  Phone,
  X,
  RefreshCw,
} from 'lucide-react';
import { api, formatETB } from '@/lib/api';

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Receive Dialog
  const [receivingPo, setReceivingPo] = useState<any>(null);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [poRes, supRes] = await Promise.all([
        api.get('/api/v1/purchases'),
        api.get('/api/v1/purchases/suppliers'),
      ]);
      setPurchases(poRes.data);
      setSuppliers(supRes.data);
    } catch (err) {
      console.error('Failed to load purchases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenReceive = (po: any) => {
    setReceivingPo(po);
    const initialInputs: Record<string, number> = {};
    po.items?.forEach((item: any) => {
      const remaining = Number(item.orderedQty) - Number(item.receivedQty);
      initialInputs[item.id] = remaining > 0 ? remaining : 0;
    });
    setReceiveInputs(initialInputs);
  };

  const handleConfirmReceive = async () => {
    if (!receivingPo) return;

    const payload = {
      receivedItems: Object.entries(receiveInputs).map(([purchaseItemId, qty]) => ({
        purchaseItemId,
        receivedQty: Number(qty),
      })),
    };

    setSubmitting(true);
    try {
      await api.post(`/api/v1/purchases/${receivingPo.id}/receive`, payload);
      setReceivingPo(null);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to record stock receiving');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Purchases &amp; Suppliers
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create purchase orders, track suppliers, and verify incoming inventory receiving.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 self-start sm:self-auto rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Suppliers Highlight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map((s) => (
          <div
            key={s.id}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2 mb-2 text-emerald-600 dark:text-emerald-400">
                <Building className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">SUPPLIER</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug">
                {s.name}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Contact: {s.contactName || 'N/A'}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> {s.phoneNumber || 'N/A'}
              </span>
              <span className="font-mono text-[10px]">TIN: {s.tinNumber || '—'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Purchase Orders Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Truck className="w-4 h-4 text-emerald-600" />
            <span>Purchase Orders</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">PO Number</th>
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4 text-right">Total (ETB)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Loading orders...
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No purchase orders recorded yet.
                  </td>
                </tr>
              ) : (
                purchases.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                      {po.orderNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {po.supplier?.name}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      {formatETB(po.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          po.status === 'RECEIVED'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                            : po.status === 'PARTIALLY_RECEIVED'
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                            : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {po.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {po.status !== 'RECEIVED' && (
                        <button
                          onClick={() => handleOpenReceive(po)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 ml-auto transition-colors"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Receive Goods
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receive Goods Checklist Dialog */}
      {receivingPo && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                  Receive Stock for {receivingPo.orderNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Only entered quantities will be added to your live inventory ledger.
                </p>
              </div>
              <button
                onClick={() => setReceivingPo(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {receivingPo.items?.map((item: any) => {
                const ordered = Number(item.orderedQty);
                const prevReceived = Number(item.receivedQty);
                const remaining = ordered - prevReceived;

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {item.product?.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Ordered: {ordered} • Previously Received: {prevReceived}
                      </p>
                    </div>

                    <div className="w-28">
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Receive Now
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        value={receiveInputs[item.id] || 0}
                        onChange={(e) =>
                          setReceiveInputs({
                            ...receiveInputs,
                            [item.id]: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-slate-100 text-center focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setReceivingPo(null)}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReceive}
                disabled={submitting}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20"
              >
                {submitting ? 'Recording...' : 'Confirm Stock Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
