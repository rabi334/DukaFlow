'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  AlertTriangle,
  Package,
  Boxes,
  Truck,
  Users,
  Calendar,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  PieChart as PieIcon,
  BarChart3,
  FileText,
  Clock,
  ShieldAlert,
  Search,
  Filter,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api, formatETB } from '@/lib/api';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string>('owner');

  // Filters
  const [preset, setPreset] = useState<string>('this_month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Report Data States
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [salesSummary, setSalesSummary] = useState<any>(null);
  const [salesDetails, setSalesDetails] = useState<any>(null);
  const [profitLoss, setProfitLoss] = useState<any>(null);
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [receivables, setReceivables] = useState<any>(null);
  const [taxSummary, setTaxSummary] = useState<any>(null);
  const [inventoryValuation, setInventoryValuation] = useState<any>(null);
  const [inventoryMovements, setInventoryMovements] = useState<any>(null);
  const [productPerformance, setProductPerformance] = useState<any>(null);
  const [purchasesSummary, setPurchasesSummary] = useState<any>(null);
  const [purchasesSuppliers, setPurchasesSuppliers] = useState<any>(null);
  const [purchasesHistory, setPurchasesHistory] = useState<any>(null);
  const [expensesSummary, setExpensesSummary] = useState<any>(null);
  const [staffPerformance, setStaffPerformance] = useState<any>(null);

  // Load user role
  useEffect(() => {
    let role = (localStorage.getItem('dukaflow_user_role') || 'owner').toLowerCase().trim();
    api.get('/api/v1/auth/me')
      .then((res) => {
        const activeOrgId = localStorage.getItem('dukaflow_active_org_id');
        const activeWs = res.data.workspaces?.find((w: any) => w.id === activeOrgId) || res.data.workspaces?.[0];
        if (activeWs?.role) {
          role = activeWs.role.toLowerCase().trim();
          setUserRole(role);
          localStorage.setItem('dukaflow_user_role', role);
        }
      })
      .catch(() => setUserRole(role));
  }, []);

  // Fetch report data according to active tab
  const fetchReportData = async () => {
    setLoading(true);
    const queryParams = new URLSearchParams({ preset });
    if (preset === 'custom') {
      if (startDate) queryParams.set('startDate', startDate);
      if (endDate) queryParams.set('endDate', endDate);
    }
    const qStr = queryParams.toString();

    try {
      if (activeTab === 'overview') {
        const res = await api.get(`/api/v1/reports/dashboard?${qStr}`);
        setDashboardData(res.data);
      } else if (activeTab === 'sales') {
        const [sumRes, detRes] = await Promise.all([
          api.get(`/api/v1/reports/sales/summary?${qStr}`),
          api.get(`/api/v1/reports/sales/details?${qStr}&limit=50`),
        ]);
        setSalesSummary(sumRes.data);
        setSalesDetails(detRes.data);
      } else if (activeTab === 'profit_loss') {
        if (userRole === 'owner') {
          const res = await api.get(`/api/v1/reports/financial/profit-loss?${qStr}`);
          setProfitLoss(res.data);
        }
      } else if (activeTab === 'cash_flow') {
        if (userRole === 'owner') {
          const res = await api.get(`/api/v1/reports/financial/cash-flow?${qStr}`);
          setCashFlow(res.data);
        }
      } else if (activeTab === 'receivables') {
        if (userRole === 'owner') {
          const res = await api.get(`/api/v1/reports/financial/receivables?${qStr}`);
          setReceivables(res.data);
        }
      } else if (activeTab === 'tax') {
        if (userRole === 'owner') {
          const res = await api.get(`/api/v1/reports/financial/tax-summary?${qStr}`);
          setTaxSummary(res.data);
        }
      } else if (activeTab === 'inventory') {
        const [valRes, movRes, perfRes] = await Promise.all([
          api.get(`/api/v1/reports/inventory/valuation?${qStr}`),
          api.get(`/api/v1/reports/inventory/movements?${qStr}&limit=50`),
          api.get(`/api/v1/reports/inventory/product-performance?${qStr}`),
        ]);
        setInventoryValuation(valRes.data);
        setInventoryMovements(movRes.data);
        setProductPerformance(perfRes.data);
      } else if (activeTab === 'purchases') {
        const [sumRes, supRes, histRes] = await Promise.all([
          api.get(`/api/v1/reports/purchases/summary?${qStr}`),
          api.get(`/api/v1/reports/purchases/suppliers?${qStr}`),
          api.get(`/api/v1/reports/purchases/history?${qStr}&limit=50`),
        ]);
        setPurchasesSummary(sumRes.data);
        setPurchasesSuppliers(supRes.data);
        setPurchasesHistory(histRes.data);
      } else if (activeTab === 'expenses') {
        const res = await api.get(`/api/v1/reports/expenses/summary?${qStr}`);
        setExpensesSummary(res.data);
      } else if (activeTab === 'staff') {
        const res = await api.get(`/api/v1/reports/staff/performance?${qStr}`);
        setStaffPerformance(res.data);
      }
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [activeTab, preset, startDate, endDate]);

  // CSV Export handler
  const handleExportCsv = async () => {
    setExporting(true);
    let reportType = 'sales_summary';
    if (activeTab === 'sales') reportType = 'sales_details';
    if (activeTab === 'profit_loss') reportType = 'profit_loss';
    if (activeTab === 'cash_flow') reportType = 'cash_flow';
    if (activeTab === 'receivables') reportType = 'receivables';
    if (activeTab === 'tax') reportType = 'tax_summary';
    if (activeTab === 'inventory') reportType = 'inventory_valuation';
    if (activeTab === 'purchases') reportType = 'purchases';
    if (activeTab === 'expenses') reportType = 'expenses';
    if (activeTab === 'staff') reportType = 'staff';

    const queryParams = new URLSearchParams({ reportType, preset });
    if (preset === 'custom') {
      if (startDate) queryParams.set('startDate', startDate);
      if (endDate) queryParams.set('endDate', endDate);
    }

    try {
      const res = await api.get(`/api/v1/reports/export/csv?${queryParams.toString()}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportType}_report.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      console.error('CSV Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const isOwner = userRole === 'owner';

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Global Date Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Reports & Business Analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time financial performance, cash flow, inventory valuation, and sales metrics in Ethiopian Birr (ETB).
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Preset Selector */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm">
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="last_week">Last Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
              />
            </div>
          )}

          <button
            onClick={fetchReportData}
            disabled={loading}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 shadow-sm transition-all"
            title="Refresh Report"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-emerald-500/20 transition-all"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'overview', label: 'Overview Dashboard' },
          { id: 'sales', label: 'Sales Reports' },
          { id: 'profit_loss', label: 'Profit & Loss', ownerOnly: true },
          { id: 'cash_flow', label: 'Cash Flow', ownerOnly: true },
          { id: 'receivables', label: 'Receivables', ownerOnly: true },
          { id: 'tax', label: 'Tax Summary', ownerOnly: true },
          { id: 'inventory', label: 'Inventory & Valuation' },
          { id: 'purchases', label: 'Purchasing & Suppliers' },
          { id: 'expenses', label: 'Operating Expenses' },
          { id: 'staff', label: 'Staff Performance' },
        ]
          .filter((tab) => !tab.ownerOnly || isOwner)
          .map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
      </div>

      {/* TAB 1: OVERVIEW DASHBOARD */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 8 KPI Cards */}
          {dashboardData?.comparison && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Gross Sales', key: 'grossSales', icon: DollarSign, color: 'emerald' },
                { label: 'Net Sales', key: 'netSales', icon: TrendingUp, color: 'teal' },
                { label: 'Payments Received', key: 'totalPaymentsReceived', icon: Receipt, color: 'blue' },
                { label: 'Receivables', key: 'outstandingReceivables', icon: AlertTriangle, color: 'amber' },
                { label: 'Cost of Goods (COGS)', key: 'costOfGoodsSold', icon: Package, color: 'indigo', ownerOnly: true },
                { label: 'Gross Profit', key: 'grossProfit', icon: ArrowUpRight, color: 'emerald', ownerOnly: true },
                { label: 'Total Expenses', key: 'totalExpenses', icon: Receipt, color: 'rose' },
                { label: 'Net Operating Profit', key: 'netOperatingProfit', icon: DollarSign, color: 'emerald', ownerOnly: true },
              ]
                .filter((kpi) => !kpi.ownerOnly || isOwner)
                .map((kpi) => {
                  const card = dashboardData.comparison[kpi.key];
                  if (!card) return null;
                  const Icon = kpi.icon;
                  const isPositive = card.diff >= 0;

                  return (
                    <div
                      key={kpi.key}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</span>
                        <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          <Icon className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                          {formatETB(card.current)}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span
                            className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded ${
                              isPositive
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {isPositive ? '+' : ''}
                            {card.percent}%
                          </span>
                          <span className="text-slate-400">vs previous period</span>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 line-clamp-1">{card.explanation}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Visualizations Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales Trend Chart */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Sales Trend (ETB)
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboardData?.visualizations?.salesTrend || []}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `ETB ${v}`} />
                    <Tooltip formatter={(v: any) => formatETB(v)} />
                    <Area type="monotone" dataKey="current" stroke="#10b981" strokeWidth={2} fill="url(#salesGrad)" name="Sales" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Revenue vs Expenses Chart */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                Revenue vs Operating Expenses
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardData?.visualizations?.revenueVsExpenses || []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `ETB ${v}`} />
                    <Tooltip formatter={(v: any) => formatETB(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" fill="#f43f5e" name="Expenses" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Payment Method Distribution */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                Payment Method Breakdown
              </h3>
              <div className="h-64 flex flex-col md:flex-row items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dashboardData?.visualizations?.paymentMethods || []}
                      dataKey="totalAmount"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ method, percentage }) => `${method} (${percentage}%)`}
                    >
                      {(dashboardData?.visualizations?.paymentMethods || []).map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatETB(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Sales by Category */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-purple-600" />
                Sales by Category
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={dashboardData?.visualizations?.salesByCategory || []}
                    margin={{ left: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis type="number" tickFormatter={(v) => `ETB ${v}`} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatETB(v)} />
                    <Bar dataKey="revenue" fill="#8b5cf6" name="Revenue" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Operational Alerts Section */}
          {dashboardData?.alerts && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                Operational Alerts & Action Items
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Low Stock Alert Card */}
                <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-amber-800 dark:text-amber-400">Low Stock Products</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                      {dashboardData.alerts.lowStockCount}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                    {dashboardData.alerts.lowStockProducts?.map((item: any) => (
                      <div key={item.id} className="text-xs flex justify-between text-slate-700 dark:text-slate-300">
                        <span className="truncate pr-2">{item.name}</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          {item.stockOnHand} left (min: {item.minStockThreshold})
                        </span>
                      </div>
                    ))}
                    {dashboardData.alerts.lowStockCount === 0 && (
                      <p className="text-xs text-slate-400">No low stock items.</p>
                    )}
                  </div>
                </div>

                {/* Pending POs Card */}
                <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-blue-800 dark:text-blue-400">Pending Purchase Orders</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-200">
                      {dashboardData.alerts.pendingPurchaseOrdersCount}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                    {dashboardData.alerts.pendingPurchaseOrders?.map((po: any) => (
                      <div key={po.id} className="text-xs flex justify-between text-slate-700 dark:text-slate-300">
                        <span className="font-mono">{po.orderNumber}</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{formatETB(po.totalAmount)}</span>
                      </div>
                    ))}
                    {dashboardData.alerts.pendingPurchaseOrdersCount === 0 && (
                      <p className="text-xs text-slate-400">All purchase orders fulfilled.</p>
                    )}
                  </div>
                </div>

                {/* Outstanding Receivables Card */}
                <div className="p-4 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/60">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-purple-800 dark:text-purple-400">Uncollected Receivables</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-200 dark:bg-purple-900 text-purple-900 dark:text-purple-200">
                      {dashboardData.alerts.outstandingReceivablesCount}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-xl font-bold text-purple-700 dark:text-purple-300">
                      {formatETB(dashboardData.alerts.outstandingReceivablesAmount)}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Pending customer settlement</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SALES REPORTS */}
      {activeTab === 'sales' && salesSummary && (
        <div className="space-y-6">
          {/* Sales Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Gross Sales</span>
              <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{formatETB(salesSummary.grossSales)}</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Return Credits</span>
              <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">-{formatETB(salesSummary.returnCredits)}</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Net Sales</span>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{formatETB(salesSummary.netSales)}</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Avg Transaction (ATV)</span>
              <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{formatETB(salesSummary.averageTransactionValue)}</p>
            </div>
          </div>

          {/* Detailed Sales Ledger Table */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Detailed Transactions Ledger</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                    <th className="pb-3">Receipt #</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Cashier</th>
                    <th className="pb-3 text-right">Items</th>
                    <th className="pb-3 text-right">Gross Total</th>
                    <th className="pb-3 text-right">Return Credit</th>
                    <th className="pb-3 text-right">Net Amount</th>
                    <th className="pb-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {salesDetails?.items?.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">{item.receiptNumber}</td>
                      <td className="py-3 text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 text-slate-800 dark:text-slate-200 font-medium">{item.cashierName}</td>
                      <td className="py-3 text-right">{item.itemsCount}</td>
                      <td className="py-3 text-right font-medium">{formatETB(item.totalAmount)}</td>
                      <td className="py-3 text-right text-rose-500">{item.returnCredit > 0 ? `-${formatETB(item.returnCredit)}` : '—'}</td>
                      <td className="py-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatETB(item.netAmount)}</td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROFIT & LOSS STATEMENT */}
      {activeTab === 'profit_loss' && profitLoss && (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm max-w-4xl mx-auto space-y-6">
          <div className="text-center pb-6 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Statement of Profit and Loss</h2>
            <p className="text-xs text-slate-500 mt-1">Period: {profitLoss.periodLabel} | Currency: ETB</p>
          </div>

          {/* Revenue */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trading Revenue</h4>
            <div className="flex justify-between text-sm py-1">
              <span>Gross Invoiced Sales</span>
              <span className="font-semibold">{formatETB(profitLoss.revenue.grossSales)}</span>
            </div>
            {profitLoss.revenue.discounts > 0 && (
              <div className="flex justify-between text-xs py-0.5 text-slate-500 italic">
                <span>(Memorandum: In-line discounts applied: {formatETB(profitLoss.revenue.discounts)})</span>
              </div>
            )}
            <div className="flex justify-between text-sm py-1 text-slate-500">
              <span>Less: Sales Returns & Allowances</span>
              <span>({formatETB(profitLoss.revenue.returnCredits)})</span>
            </div>
            <div className="flex justify-between text-sm py-2 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
              <span>Net Sales Revenue</span>
              <span className="text-emerald-600 dark:text-emerald-400">{formatETB(profitLoss.revenue.netSales)}</span>
            </div>
          </div>

          {/* Cost of Goods Sold */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cost of Goods Sold (COGS)</h4>
            <div className="flex justify-between text-sm py-1">
              <span>Cost of Merchandise Sold</span>
              <span className="font-semibold">{formatETB(profitLoss.costOfGoodsSold.grossCost)}</span>
            </div>
            <div className="flex justify-between text-sm py-1 text-slate-500">
              <span>Less: Restocked Returns Reversal</span>
              <span>({formatETB(profitLoss.costOfGoodsSold.restockedReturnCostReversal)})</span>
            </div>
            <div className="flex justify-between text-sm py-2 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
              <span>Net Cost of Goods Sold</span>
              <span>{formatETB(profitLoss.costOfGoodsSold.netCostOfGoodsSold)}</span>
            </div>
          </div>

          {/* Gross Profit Banner */}
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex justify-between items-center">
            <div>
              <span className="font-bold text-emerald-800 dark:text-emerald-300">Gross Trading Profit</span>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Margin: {profitLoss.grossMarginPercentage}%</p>
            </div>
            <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">{formatETB(profitLoss.grossProfit)}</span>
          </div>

          {/* Operating Expenses */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Operating Expenses</h4>
            {profitLoss.operatingExpenses.items.map((exp: any) => (
              <div key={exp.category} className="flex justify-between text-sm py-1 text-slate-600 dark:text-slate-400">
                <span>{exp.category}</span>
                <span>{formatETB(exp.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm py-2 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
              <span>Total Operating Expenses</span>
              <span>{formatETB(profitLoss.operatingExpenses.totalExpenses)}</span>
            </div>
          </div>

          {/* Net Operating Profit Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex justify-between items-center shadow-lg">
            <div>
              <span className="text-sm font-bold uppercase tracking-wider text-emerald-100">Net Operating Profit</span>
              <p className="text-xs text-emerald-200">Net Commercial Margin: {profitLoss.netMarginPercentage}%</p>
            </div>
            <span className="text-2xl font-black">{formatETB(profitLoss.netOperatingProfit)}</span>
          </div>
        </div>
      )}

      {/* TAB 4: CASH FLOW STATEMENT */}
      {activeTab === 'cash_flow' && cashFlow && (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm max-w-4xl mx-auto space-y-6">
          <div className="text-center pb-6 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Statement of Cash Flows</h2>
            <p className="text-xs text-slate-500 mt-1">Period: {cashFlow.periodLabel} | Currency: ETB</p>
          </div>

          {/* Inflows */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Cash & Electronic Inflows</h4>
            <div className="flex justify-between text-sm py-1">
              <span>Physical Cash Collected</span>
              <span className="font-semibold">{formatETB(cashFlow.inflows.byMethod.cash)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span>Telebirr Collected</span>
              <span className="font-semibold">{formatETB(cashFlow.inflows.byMethod.telebirr)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span>CBE Birr Collected</span>
              <span className="font-semibold">{formatETB(cashFlow.inflows.byMethod.cbeBirr)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span>Bank Transfers</span>
              <span className="font-semibold">{formatETB(cashFlow.inflows.byMethod.bankTransfer)}</span>
            </div>
            <div className="flex justify-between text-sm py-2 border-t border-slate-200 dark:border-slate-800 font-bold text-emerald-600 dark:text-emerald-400">
              <span>Total Cash Inflows</span>
              <span>{formatETB(cashFlow.inflows.totalInflows)}</span>
            </div>
          </div>

          {/* Outflows */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-rose-500 uppercase tracking-wider">Cash & Electronic Outflows</h4>
            <div className="flex justify-between text-sm py-1">
              <span>Customer Refunds Disbursed</span>
              <span className="font-semibold">{formatETB(cashFlow.outflows.refundsDisbursed)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span>Customer Credit Settlements</span>
              <span className="font-semibold">{formatETB(cashFlow.outflows.customerCreditDisbursed)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span>Operating Expenses Paid</span>
              <span className="font-semibold">{formatETB(cashFlow.outflows.operatingExpenses)}</span>
            </div>
            <div className="flex justify-between text-sm py-2 border-t border-slate-200 dark:border-slate-800 font-bold text-rose-600 dark:text-rose-400">
              <span>Total Cash Outflows</span>
              <span>{formatETB(cashFlow.outflows.totalOutflows)}</span>
            </div>
          </div>

          {/* Net Movement Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-400 uppercase font-semibold">Physical Cash Net Movement</span>
              <div className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                {formatETB(cashFlow.netPhysicalCashMovement)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 uppercase font-semibold">Overall Net Cash Flow</span>
              <div className="text-xl font-black text-emerald-800 dark:text-emerald-300 mt-1">
                {formatETB(cashFlow.netCashFlow)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: RECEIVABLES */}
      {activeTab === 'receivables' && receivables && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Receivables</span>
              <p className="text-2xl font-black text-amber-600 mt-1">{formatETB(receivables.totalReceivables)}</p>
            </div>
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Overpayments / Credit Liability</span>
              <p className="text-2xl font-black text-blue-600 mt-1">{formatETB(receivables.totalCustomerCreditLiabilities)}</p>
            </div>
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Open Invoices</span>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{receivables.receivableCount}</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Unpaid & Partially Paid Invoices</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                    <th className="pb-3">Receipt #</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3 text-right">Invoiced</th>
                    <th className="pb-3 text-right">Paid</th>
                    <th className="pb-3 text-right">Credit / Refund</th>
                    <th className="pb-3 text-right">Balance Due</th>
                    <th className="pb-3 text-center">Days Owed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {receivables.receivables?.map((r: any) => (
                    <tr key={r.id}>
                      <td className="py-3 font-mono font-bold text-emerald-600">{r.receiptNumber}</td>
                      <td className="py-3 text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 text-right">{formatETB(r.totalAmount)}</td>
                      <td className="py-3 text-right text-emerald-600">{formatETB(r.paidAmount)}</td>
                      <td className="py-3 text-right text-slate-400">{formatETB(r.returnCredit)}</td>
                      <td className="py-3 text-right font-black text-amber-600">{formatETB(r.balanceDue)}</td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                          {r.daysOutstanding}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: TAX SUMMARY */}
      {activeTab === 'tax' && taxSummary && (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm max-w-3xl mx-auto space-y-6">
          <div className="text-center pb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">Net Output VAT Reconciliation</h2>
            <p className="text-xs text-slate-500 mt-1">Configured VAT Rate: {(taxSummary.taxRate * 100).toFixed(0)}% | {taxSummary.taxInclusive ? 'Tax Inclusive' : 'Tax Exclusive'}</p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between py-2 text-sm border-b border-slate-100 dark:border-slate-800">
              <span>Total Gross Sales</span>
              <span className="font-semibold">{formatETB(taxSummary.totalGrossSales)}</span>
            </div>
            <div className="flex justify-between py-2 text-sm border-b border-slate-100 dark:border-slate-800">
              <span>Gross Output VAT Invoiced</span>
              <span className="font-semibold">{formatETB(taxSummary.grossOutputVat)}</span>
            </div>
            <div className="flex justify-between py-2 text-sm border-b border-slate-100 dark:border-slate-800 text-rose-500">
              <span>Output VAT Refunded on Returns</span>
              <span>-{formatETB(taxSummary.refundedOutputVat)}</span>
            </div>
            <div className="flex justify-between py-3 text-base font-bold border-b-2 border-slate-200 dark:border-slate-700">
              <span>Net Output VAT After Returns</span>
              <span className="text-emerald-600 dark:text-emerald-400">{formatETB(taxSummary.netOutputVatAfterRefunds)}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 leading-relaxed">
            {taxSummary.disclaimer}
          </div>
        </div>
      )}

      {/* TAB 7: INVENTORY & VALUATION */}
      {activeTab === 'inventory' && inventoryValuation && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Catalog Items</span>
              <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{inventoryValuation.totalProducts}</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Units in Stock</span>
              <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{inventoryValuation.totalStockUnits}</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Valuation at Cost</span>
              <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {inventoryValuation.totalCostValuation !== null ? formatETB(inventoryValuation.totalCostValuation) : 'RESTRICTED'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Potential Retail Value</span>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{formatETB(inventoryValuation.totalRetailValuation)}</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Stock Valuation Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                    <th className="pb-3">Product Name</th>
                    <th className="pb-3">SKU</th>
                    <th className="pb-3">Category</th>
                    <th className="pb-3 text-right">Units on Hand</th>
                    {isOwner && <th className="pb-3 text-right">Cost Price</th>}
                    <th className="pb-3 text-right">Selling Price</th>
                    {isOwner && <th className="pb-3 text-right">Total Cost Val</th>}
                    <th className="pb-3 text-right">Total Retail Val</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inventoryValuation.items?.map((item: any) => (
                    <tr key={item.id}>
                      <td className="py-3 font-medium text-slate-900 dark:text-slate-100">{item.name}</td>
                      <td className="py-3 font-mono text-slate-500">{item.sku}</td>
                      <td className="py-3 text-slate-400">{item.category}</td>
                      <td className="py-3 text-right font-bold">{item.quantityOnHand} {item.unit}</td>
                      {isOwner && <td className="py-3 text-right text-slate-500">{formatETB(item.costPrice)}</td>}
                      <td className="py-3 text-right text-slate-800 dark:text-slate-200">{formatETB(item.sellingPrice)}</td>
                      {isOwner && <td className="py-3 text-right font-semibold text-indigo-600">{formatETB(item.totalCostValuation)}</td>}
                      <td className="py-3 text-right font-bold text-emerald-600">{formatETB(item.totalRetailValuation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: PURCHASING & SUPPLIERS */}
      {activeTab === 'purchases' && purchasesSummary && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Purchase Orders</span>
              <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{purchasesSummary.totalPurchases}</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Ordered Value</span>
              <p className="text-xl font-black text-blue-600 mt-1">{formatETB(purchasesSummary.totalOrderedValue)}</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Received / Fulfillment Rate</span>
              <p className="text-xl font-black text-emerald-600 mt-1">{purchasesSummary.fulfillmentRate}%</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Supplier Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                    <th className="pb-3">Supplier Name</th>
                    <th className="pb-3">Contact</th>
                    <th className="pb-3 text-right">Orders Placed</th>
                    <th className="pb-3 text-right">Total Ordered</th>
                    <th className="pb-3 text-right">Total Received</th>
                    <th className="pb-3 text-center">Fulfillment Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {purchasesSuppliers?.items?.map((sup: any) => (
                    <tr key={sup.id}>
                      <td className="py-3 font-semibold text-slate-900 dark:text-slate-100">{sup.name}</td>
                      <td className="py-3 text-slate-500">{sup.phoneNumber || sup.email || '—'}</td>
                      <td className="py-3 text-right">{sup.orderCount}</td>
                      <td className="py-3 text-right font-medium">{formatETB(sup.totalOrderedValue)}</td>
                      <td className="py-3 text-right font-medium">{formatETB(sup.totalReceivedValue)}</td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          {sup.fulfillmentRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: EXPENSES */}
      {activeTab === 'expenses' && expensesSummary && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Expenses</span>
              <p className="text-2xl font-black text-rose-600 mt-1">{formatETB(expensesSummary.totalAmount)}</p>
            </div>
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase">Expense Count</span>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{expensesSummary.expenseCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">Breakdown by Category</h3>
              <div className="space-y-3">
                {expensesSummary.byCategory?.map((cat: any) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span>{cat.category}</span>
                      <span>{formatETB(cat.amount)} ({cat.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className="bg-rose-500 h-full rounded-full" style={{ width: `${cat.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">Recent Operating Expenses</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {expensesSummary.items?.map((item: any) => (
                  <div key={item.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{item.category}</p>
                      <p className="text-slate-400 text-[11px]">{item.description || new Date(item.date).toLocaleDateString()}</p>
                    </div>
                    <span className="font-bold text-rose-600">{formatETB(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 10: STAFF PERFORMANCE */}
      {activeTab === 'staff' && staffPerformance && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Staff Performance Leaderboard
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                  <th className="pb-3">Staff Member</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3 text-right">Transactions</th>
                  <th className="pb-3 text-right">Gross Sales</th>
                  <th className="pb-3 text-right">Returns</th>
                  <th className="pb-3 text-right">Net Sales</th>
                  <th className="pb-3 text-right">Avg Ticket (ATV)</th>
                  <th className="pb-3 text-right">Items Sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {staffPerformance.items?.map((s: any) => (
                  <tr key={s.userId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 font-semibold text-slate-900 dark:text-slate-100">
                      <div>{s.name}</div>
                      <div className="text-[11px] text-slate-400 font-normal">{s.email}</div>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {s.role}
                      </span>
                    </td>
                    <td className="py-3 text-right font-medium">{s.salesCount}</td>
                    <td className="py-3 text-right">{formatETB(s.grossSales)}</td>
                    <td className="py-3 text-right text-rose-500">{s.returnCount > 0 ? `${s.returnCount} (${formatETB(s.returnCredits)})` : '0'}</td>
                    <td className="py-3 text-right font-bold text-emerald-600">{formatETB(s.netSales)}</td>
                    <td className="py-3 text-right font-medium">{formatETB(s.averageTransactionValue)}</td>
                    <td className="py-3 text-right">{s.itemsSold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
