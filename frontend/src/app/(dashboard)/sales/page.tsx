'use client';

import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  Calendar,
  User,
  RefreshCw,
  RotateCcw,
  Eye,
  CheckCircle,
  AlertCircle,
  X,
  Clock,
  CreditCard,
  DollarSign,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { api, formatETB } from '@/lib/api';
import { AccessDenied } from '@/components/common/AccessDenied';

export default function SalesHistoryPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [userRole, setUserRole] = useState('cashier');
  const [currentUserId, setCurrentUserId] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCashier, setSelectedCashier] = useState('all');
  const [cashierList, setCashierList] = useState<any[]>([]);

  // Selected Sale Details Modal
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Return Dialog State
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [returnSale, setReturnSale] = useState<any>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('Customer return');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [restockInventory, setRestockInventory] = useState(true);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState('');

  const loadSales = async () => {
    setLoading(true);
    setForbidden(false);

    const role = (localStorage.getItem('gatiiflow_user_role') || localStorage.getItem('dukaflow_user_role') || 'cashier').toLowerCase();
    setUserRole(role);

    if (role === 'inventory_staff' || role === 'inventory') {
      setForbidden(true);
      setLoading(false);
      return;
    }

    try {
      const params: any = {};
      if (search.trim()) params.search = search.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (selectedCashier !== 'all') params.cashierId = selectedCashier;

      const res = await api.get('/api/v1/sales', { params });
      setSales(res.data);

      // Extract unique cashiers for filter dropdown (if owner or manager)
      if (role === 'owner' || role === 'manager') {
        const uniqueCashiers: Record<string, any> = {};
        res.data.forEach((s: any) => {
          if (s.cashier) {
            uniqueCashiers[s.cashier.id] = s.cashier;
          }
        });
        setCashierList(Object.values(uniqueCashiers));
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else {
        console.error('Failed to load sales:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, [startDate, endDate, selectedCashier]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadSales();
  };

  const openDetails = async (sale: any) => {
    setDetailsLoading(true);
    try {
      const res = await api.get(`/api/v1/sales/${sale.id}`);
      setSelectedSale(res.data);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load sale details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const openReturnModal = (sale: any) => {
    setReturnSale(sale);
    setReturnError('');
    setReturnSuccess('');
    const initialQtys: Record<string, number> = {};
    sale.items?.forEach((item: any) => {
      // Calculate remaining returnable
      const priorReturned = (item.returnItems || []).reduce(
        (sum: number, r: any) => sum + Number(r.quantity),
        0,
      );
      const remaining = Number(item.quantity) - priorReturned;
      initialQtys[item.id] = remaining > 0 ? 0 : 0;
    });
    setReturnQuantities(initialQtys);
    setIsReturnOpen(true);
  };

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnSale) return;

    // Filter items with quantity > 0
    const itemsToReturn = Object.entries(returnQuantities)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([saleItemId, qty]) => ({
        saleItemId,
        quantity: Number(qty),
      }));

    if (itemsToReturn.length === 0) {
      setReturnError('Please specify a return quantity greater than 0 for at least one item');
      return;
    }

    setReturnSubmitting(true);
    setReturnError('');

    try {
      await api.post(`/api/v1/sales/${returnSale.id}/return`, {
        items: itemsToReturn,
        reason: returnReason,
        refundMethod,
        restockInventory,
      });

      setReturnSuccess('Return and refund processed successfully!');
      setTimeout(() => {
        setIsReturnOpen(false);
        setReturnSale(null);
        loadSales();
      }, 1500);
    } catch (err: any) {
      setReturnError(err.response?.data?.message || 'Failed to process return');
    } finally {
      setReturnSubmitting(false);
    }
  };

  if (forbidden) {
    return (
      <AccessDenied
        role={userRole}
        resourceName="Sales History & Receipts"
        requiredRole="Owner, Manager, or Cashier"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" />
            <span>Sales History &amp; Returns</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {userRole === 'cashier'
              ? 'View your recent shift sales, receipts, and process customer returns.'
              : 'Audit store sales, filter transactions by cashier or date, and review refunds.'}
          </p>
        </div>

        <button
          onClick={loadSales}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter Controls */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search by Receipt */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Receipt # (e.g. REC-2026-00001)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </form>

          {/* Date Range Start */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Date Range End */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Cashier Filter (Only for Owners/Managers) */}
          {userRole !== 'cashier' ? (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={selectedCashier}
                onChange={(e) => setSelectedCashier(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="all">All Cashiers</option>
                {cashierList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center text-xs text-slate-500 px-3 py-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <span>Showing: <strong>My Sales Only</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Sales Transactions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Cashier</th>
                <th className="py-3 px-4 text-center">Items</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading sales records...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No sales records found matching your filters.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => {
                  const itemsCount = sale.items?.reduce(
                    (sum: number, i: any) => sum + Number(i.quantity),
                    0,
                  ) || 0;

                  const hasReturns = (sale.returns?.length || 0) > 0;

                  return (
                    <tr
                      key={sale.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {sale.receiptNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(sale.createdAt).toLocaleDateString()}{' '}
                        <span className="text-[11px] text-slate-400">
                          {new Date(sale.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {sale.cashier?.name || 'Cashier'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono">
                        {itemsCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {formatETB(Number(sale.totalAmount))}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            sale.status === 'COMPLETED'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : sale.status === 'REFUNDED'
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {sale.status}
                          {hasReturns && sale.status !== 'REFUNDED' ? ' (Partial Return)' : ''}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openDetails(sale)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="View Receipt"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {sale.status !== 'REFUNDED' && (
                            <button
                              onClick={() => openReturnModal(sale)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
                              title="Process Return"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Return
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sale Details Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
              <div>
                <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                  Receipt Details
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {selectedSale.receiptNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 block">Date &amp; Time:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {new Date(selectedSale.createdAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Served By:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedSale.cashier?.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Status:</span>
                  <span className="font-bold uppercase text-emerald-600 dark:text-emerald-400">
                    {selectedSale.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Payment Method:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedSale.payments?.[0]?.method || 'CASH'}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Line Items
                </h4>
                <div className="space-y-2">
                  {selectedSale.items?.map((item: any) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.product?.name || 'Product'}
                        </p>
                        <p className="text-slate-400 font-mono">
                          {Number(item.quantity)} × {formatETB(Number(item.unitPriceSnapshot))}
                          {Number(item.discountAmount) > 0 && (
                            <span className="text-rose-500 ml-1">
                              (-{formatETB(Number(item.discountAmount))} disc)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {formatETB(Number(item.lineTotal))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Returns Section (if any) */}
              {selectedSale.returns && selectedSale.returns.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60">
                  <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Refund &amp; Return History
                  </h4>
                  <div className="space-y-2">
                    {selectedSale.returns.map((ret: any) => (
                      <div
                        key={ret.id}
                        className="text-xs p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-200/60"
                      >
                        <div className="flex justify-between font-semibold">
                          <span className="font-mono">{ret.returnNumber}</span>
                          <span className="text-rose-600 font-mono font-bold">
                            -{formatETB(Number(ret.refundAmount))}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Reason: {ret.reason || 'Customer return'} • Refund via {ret.refundMethod}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Totals Summary */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatETB(Number(selectedSale.subtotal))}</span>
                </div>
                {Number(selectedSale.discountAmount) > 0 && (
                  <div className="flex justify-between text-rose-500">
                    <span>Discount</span>
                    <span className="font-mono">-{formatETB(Number(selectedSale.discountAmount))}</span>
                  </div>
                )}
                {Number(selectedSale.taxAmount) > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Tax (VAT)</span>
                    <span className="font-mono">{formatETB(Number(selectedSale.taxAmount))}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-slate-100 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>Total Amount</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    {formatETB(Number(selectedSale.totalAmount))}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end">
              <button
                onClick={() => setSelectedSale(null)}
                className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return & Refund Dialog */}
      {isReturnOpen && returnSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">
                    Process Return &amp; Refund
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Receipt: {returnSale.receiptNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReturnOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="p-5 space-y-4 overflow-y-auto flex-1">
              {returnError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 font-medium">
                  {returnError}
                </div>
              )}

              {returnSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-600 font-medium">
                  {returnSuccess}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                  Select Return Quantities
                </label>
                <div className="space-y-2.5">
                  {returnSale.items?.map((item: any) => {
                    const priorReturned = (item.returnItems || []).reduce(
                      (sum: number, r: any) => sum + Number(r.quantity),
                      0,
                    );
                    const remaining = Number(item.quantity) - priorReturned;
                    const isFullyReturned = remaining <= 0;

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border ${
                          isFullyReturned
                            ? 'bg-slate-50 dark:bg-slate-800/20 border-slate-200/50 opacity-60'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        } flex items-center justify-between gap-3 text-xs`}
                      >
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.product?.name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Purchased: {Number(item.quantity)} | Remaining returnable:{' '}
                            <strong className="text-slate-700 dark:text-slate-300">
                              {remaining}
                            </strong>
                          </p>
                        </div>

                        <div className="w-24">
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            disabled={isFullyReturned}
                            placeholder="0"
                            value={returnQuantities[item.id] ?? 0}
                            onChange={(e) => {
                              const val = Math.max(
                                0,
                                Math.min(remaining, Number(e.target.value)),
                              );
                              setReturnQuantities({
                                ...returnQuantities,
                                [item.id]: val,
                              });
                            }}
                            className="w-full text-center py-1.5 px-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold font-mono focus:ring-2 focus:ring-rose-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Return Reason
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Expired product, damaged packaging, wrong item"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              {/* Refund Method & Restock */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Refund Method
                  </label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  >
                    <option value="CASH">Cash Refund</option>
                    <option value="TELEBIRR">Telebirr Refund</option>
                    <option value="CBE_BIRR">CBE Birr Refund</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="restockCheck"
                    checked={restockInventory}
                    onChange={(e) => setRestockInventory(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                  />
                  <label htmlFor="restockCheck" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Restock items to inventory
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReturnOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={returnSubmitting}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all"
                >
                  {returnSubmitting ? 'Processing...' : 'Confirm Return & Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
