'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  AlertTriangle,
  Package,
  ArrowUpRight,
  RefreshCw,
  ShoppingBag,
  CreditCard,
  Boxes,
  Clock,
  ArrowDownRight,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api, formatETB } from '@/lib/api';

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.4,
      ease: 'easeOut',
    },
  }),
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('owner');
  const [data, setData] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  const loadRoleAndData = async () => {
    setLoading(true);
    let role = (localStorage.getItem('gatiiflow_user_role') || localStorage.getItem('dukaflow_user_role') || '').toLowerCase().trim();

    try {
      // 1. Refresh active role from /api/v1/auth/me
      const meRes = await api.get('/api/v1/auth/me');
      const activeOrgId = localStorage.getItem('gatiiflow_active_org_id') || localStorage.getItem('dukaflow_active_org_id');
      const activeWs =
        meRes.data.workspaces?.find((w: any) => w.id === activeOrgId) ||
        meRes.data.workspaces?.[0];

      if (activeWs?.role) {
        role = activeWs.role.toLowerCase().trim();
        setUserRole(role);
        localStorage.setItem('gatiiflow_user_role', role);
        localStorage.setItem('dukaflow_user_role', role);
      }
    } catch {
      // Keep existing role if /me fails
    }

    if (!role) {
      role = 'owner';
      setUserRole(role);
    }

    // 2. Fetch role-specific endpoint
    try {
      if (role === 'cashier') {
        const res = await api.get('/api/v1/reports/cashier-summary');
        setData(res.data);
      } else if (role === 'inventory_staff' || role === 'inventory') {
        const res = await api.get('/api/v1/reports/inventory-summary');
        setData(res.data);
      } else {
        // Owner or Manager
        const [summaryRes, chartRes] = await Promise.all([
          api.get('/api/v1/reports/dashboard'),
          api.get('/api/v1/reports/charts/daily-sales').catch(() => ({ data: [] })),
        ]);
        setData(summaryRes.data);
        setChartData(chartRes.data || []);
      }
    } catch (err) {
      console.error('Failed to load role dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoleAndData();
  }, []);

  // ==========================================
  // VIEW 1: CASHIER SHIFT DASHBOARD
  // ==========================================
  if (userRole === 'cashier') {
    const cashierSummary = data || {
      date: new Date().toISOString(),
      salesCount: 0,
      totalSales: 0,
      recentSales: [],
    };

    return (
      <div className="space-y-6">
        {/* Cashier Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800"
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Cashier Shift Register
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60">
                Cashier
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your active shift overview, today&apos;s transaction totals, and fast POS access.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadRoleAndData}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-sm transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              href="/pos"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              Open POS Terminal
            </Link>
          </div>
        </motion.div>

        {/* Cashier KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                My Shift Revenue
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
              {formatETB(cashierSummary.totalSales || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Total collected by your register today
            </p>
          </motion.div>

          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Transactions Completed
              </span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {cashierSummary.salesCount || 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Sales receipts generated today
            </p>
          </motion.div>

          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="p-5 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="w-5 h-5 text-emerald-100" />
                <span className="font-bold text-sm">Fast Retail Checkout</span>
              </div>
              <p className="text-xs text-emerald-100">
                Scan barcodes or tap products to process cash, Telebirr, and CBE Birr payments.
              </p>
            </div>
            <Link
              href="/pos"
              className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white text-emerald-800 font-bold text-xs hover:bg-emerald-50 transition-colors shadow-sm"
            >
              Start New Sale <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        </div>

        {/* Cashier Recent Receipts Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                Recent Shift Receipts
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Transactions processed during your active session
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {(!cashierSummary.recentSales || cashierSummary.recentSales.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No sales recorded in this shift yet. Open POS to start checking out customers.
                    </td>
                  </tr>
                ) : (
                  cashierSummary.recentSales.map((sale: any) => (
                    <tr key={sale.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {sale.receiptNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {sale.paymentMethod || 'CASH'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatETB(Number(sale.total))}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {sale.status || 'COMPLETED'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: INVENTORY STAFF DASHBOARD
  // ==========================================
  if (userRole === 'inventory_staff' || userRole === 'inventory') {
    const invSummary = data || {
      totalProducts: 0,
      lowStockProducts: [],
      outOfStockCount: 0,
      recentMovements: [],
    };

    return (
      <div className="space-y-6">
        {/* Inventory Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800"
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Inventory &amp; Stock Operations
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-900/60">
                Inventory Staff
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Warehouse stock balances, low-stock reorder alerts, and audit movements.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadRoleAndData}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-sm transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              href="/inventory"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 transition-all"
            >
              <Boxes className="w-4 h-4" />
              Stock Ledger &amp; Adjustments
            </Link>
          </div>
        </motion.div>

        {/* Inventory KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active Catalog SKUs
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {invSummary.totalProducts || 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Products tracked in store
            </p>
          </motion.div>

          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Low Stock Warnings
              </span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                (invSummary.lowStockProducts?.length || 0) > 0
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {invSummary.lowStockProducts?.length || 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Items at or below reorder threshold
            </p>
          </motion.div>

          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Out of Stock
              </span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                (invSummary.outOfStockCount || 0) > 0
                  ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {invSummary.outOfStockCount || 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Items with 0 physical inventory
            </p>
          </motion.div>
        </div>

        {/* Low Stock Reorder Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                Reorder Priority List
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Products requiring replenishment from suppliers
              </p>
            </div>
            <Link
              href="/purchases"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              Go to Receiving <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4 text-center">Current Stock</th>
                  <th className="py-3 px-4 text-center">Min Threshold</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {(!invSummary.lowStockProducts || invSummary.lowStockProducts.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      All inventory stock levels are healthy! No reorder needed.
                    </td>
                  </tr>
                ) : (
                  invSummary.lowStockProducts.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {p.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">
                        {p.sku}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-rose-600 dark:text-rose-400">
                        {p.stockOnHand}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">
                        {p.minStockThreshold}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          p.stockOnHand === 0
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        }`}>
                          {p.stockOnHand === 0 ? 'Out of Stock' : 'Low Stock'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Movements Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">
              Recent Inventory Audit Movements
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit log of sales deductions, supplier receipts, and manual adjustments
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4 text-center">Movement Type</th>
                  <th className="py-3 px-4 text-center">Quantity</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {(!invSummary.recentMovements || invSummary.recentMovements.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  invSummary.recentMovements.map((m: any) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 text-slate-500 font-mono text-xs">
                        {new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {m.product?.name || 'Product'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {m.type}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-center font-mono font-bold ${
                        Number(m.quantity) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-xs">
                        {m.reason || 'Normal operation'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: OWNER & MANAGER DASHBOARD
  // ==========================================
  const isOwner = userRole === 'owner';
  const kpi = data?.kpi || {
    salesToday: 0,
    salesTodayCount: 0,
    salesMonth: 0,
    salesMonthCount: 0,
    grossProfitMonth: 0,
    expensesMonth: 0,
    netEstimateMonth: 0,
    lowStockCount: 0,
    totalProducts: 0,
    inventoryValuation: 0,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Refresh */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800"
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {isOwner ? 'Executive Business Overview' : 'Store Operations Dashboard'}
            </h2>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
              isOwner
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900/60'
                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60'
            }`}>
              {isOwner ? 'Owner' : 'Manager'}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isOwner
              ? 'Real-time sales, inventory valuation, operational overhead, and indicative profit.'
              : 'Store sales volume, customer transaction count, cashier activity, and inventory health.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={loadRoleAndData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-sm transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="/pos"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              Open Cashier POS
            </Link>
          </motion.div>
        </div>
      </motion.div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Sales */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Today&apos;s Sales
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {formatETB(kpi.salesToday)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {kpi.salesTodayCount} transaction{kpi.salesTodayCount === 1 ? '' : 's'} recorded today
          </p>
        </motion.div>

        {/* Card 2: Indicative Profit (Owner) OR Monthly Sales (Manager) */}
        {isOwner ? (
          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Monthly Est. Profit
              </span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-teal-600 dark:text-teal-400 font-mono">
              {formatETB(kpi.grossProfitMonth || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Revenue minus cost of goods sold
            </p>
          </motion.div>
        ) : (
          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Month&apos;s Revenue
              </span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-teal-600 dark:text-teal-400 font-mono">
              {formatETB(kpi.salesMonth || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {kpi.salesMonthCount || 0} total sales this month
            </p>
          </motion.div>
        )}

        {/* Card 3: Monthly Expenses (Owner) OR Active SKUs (Manager) */}
        {isOwner ? (
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Operating Expenses
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
              {formatETB(kpi.expensesMonth || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Rent, utilities &amp; operating costs
            </p>
          </motion.div>
        ) : (
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Products
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {kpi.totalProducts || 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Active inventory catalog items
            </p>
          </motion.div>
        )}

        {/* Card 4: Low Stock Alert */}
        <motion.div
          custom={3}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
        >
          <Link
            href="/inventory"
            className="block p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-amber-400 dark:hover:border-amber-600 transition-all group h-full"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Low Stock Alerts
              </span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                kpi.lowStockCount > 0
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${kpi.lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
                {kpi.lowStockCount || 0}
              </span>
              <span className="text-xs text-slate-400">items need restock</span>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 group-hover:underline">
              View low stock products <ArrowUpRight className="w-3 h-3" />
            </p>
          </Link>
        </motion.div>
      </div>

      {/* Sales Trend Chart & Shop Status */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* 7-Day Revenue Trend Chart */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                7-Day Sales Trend
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daily completed revenue in Ethiopian Birr (ETB)
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(val) => `${val}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => [formatETB(Number(value)), 'Sales']}
                />
                <Area type="monotone" dataKey="sales" stroke="#059669" strokeWidth={2.5} fillOpacity={1} fill="url(#salesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Operational / Executive Highlights */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-1">
              Shop Status
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Addis Supermarket configuration
            </p>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Catalog SKUs</span>
                </div>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{kpi.totalProducts}</span>
              </div>

              {isOwner && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <DollarSign className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Stock Valuation</span>
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{formatETB(kpi.inventoryValuation || 0)}</span>
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Default Currency</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  ETB (Birr)
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Link
              href={isOwner ? '/settings' : '/inventory'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors"
            >
              {isOwner ? 'Manage Business Settings' : 'Open Inventory Ledger'}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
