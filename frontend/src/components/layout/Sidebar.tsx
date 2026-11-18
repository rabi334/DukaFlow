'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Store,
  LayoutDashboard,
  Package,
  Boxes,
  Truck,
  Receipt,
  Settings,
  X,
  CreditCard,
  LogOut,
  Building,
  BarChart3,
} from 'lucide-react';
import { api } from '@/lib/api';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const navItems = [
  { href: '/pos', label: 'Point of Sale (POS)', icon: CreditCard, highlight: true },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/reports', label: 'Reports & Analytics', icon: BarChart3 },
  { href: '/sales', label: 'Sales & Returns', icon: Receipt },
  { href: '/products', label: 'Products & Catalog', icon: Package },
  { href: '/inventory', label: 'Inventory & Stock', icon: Boxes },
  { href: '/purchases', label: 'Purchases & Suppliers', icon: Truck },
  { href: '/expenses', label: 'Operating Expenses', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ mobileOpen, setMobileOpen }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [userName, setUserName] = useState('User');
  const [userRole, setUserRole] = useState('Staff');
  const [shopName, setShopName] = useState('My Shop');
  const [shopCity, setShopCity] = useState('Addis Ababa');

  useEffect(() => {
    // 1. Initial state from local storage
    if (typeof window !== 'undefined') {
      const storedName = localStorage.getItem('dukaflow_user_name');
      const storedRole = localStorage.getItem('dukaflow_user_role');
      const storedShop = localStorage.getItem('dukaflow_active_org_name');
      if (storedName) setUserName(storedName);
      if (storedRole) setUserRole(storedRole);
      if (storedShop) setShopName(storedShop);
    }

    // 2. Fetch authenticated profile
    api
      .get('/api/v1/auth/me')
      .then((res) => {
        const { user, workspaces } = res.data;
        if (user?.name) {
          setUserName(user.name);
          localStorage.setItem('dukaflow_user_name', user.name);
        }

        const activeOrgId = localStorage.getItem('dukaflow_active_org_id');
        const activeWs =
          workspaces?.find((w: any) => w.id === activeOrgId) || workspaces?.[0];

        if (activeWs) {
          setShopName(activeWs.name);
          setShopCity(activeWs.city || 'Addis Ababa');
          const cleanRole = (activeWs.role || 'Member').toLowerCase();
          setUserRole(cleanRole);
          localStorage.setItem('dukaflow_user_role', cleanRole);
          localStorage.setItem('dukaflow_active_org_id', activeWs.id);
          localStorage.setItem('dukaflow_active_org_name', activeWs.name);
        }
      })
      .catch(() => {
        // Interceptor handles 401 redirect
      });
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Proceed even if network logout fails
    } finally {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('dukaflow_session_token');
        localStorage.removeItem('dukaflow_session_token');
        localStorage.removeItem('dukaflow_user_email');
        localStorage.removeItem('dukaflow_user_name');
        localStorage.removeItem('dukaflow_user_role');
        localStorage.removeItem('dukaflow_active_org_id');
        localStorage.removeItem('dukaflow_active_org_name');
      }
      router.push('/login');
    }
  };

  const userInitials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('') || 'DF';

  // Role-based navigation filtering
  const roleNorm = (userRole || '').toLowerCase().trim();
  const visibleNavItems = navItems.filter((item) => {
    if (roleNorm === 'owner') return true;
    if (roleNorm === 'manager') {
      // Manager has access to all operational modules, settings is owner-only
      return item.href !== '/settings';
    }
    if (roleNorm === 'cashier') {
      // Cashier sees POS, Dashboard (Shift register), Sales & Returns, and Products (read-only catalog)
      return item.href === '/pos' || item.href === '/dashboard' || item.href === '/sales' || item.href === '/products';
    }
    if (roleNorm === 'inventory_staff' || roleNorm === 'inventory') {
      // Inventory staff sees Dashboard, Products, Inventory, Purchases (goods receiving)
      return item.href === '/dashboard' || item.href === '/products' || item.href === '/inventory' || item.href === '/purchases';
    }
    if (roleNorm === 'platform_admin' || roleNorm === 'admin') {
      return item.href === '/dashboard';
    }
    return item.href === '/pos' || item.href === '/dashboard';
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent">
                DukaFlow
              </span>
              <span className="block text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Ethiopian Retail OS
              </span>
            </div>
          </Link>

          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Workspace Pill */}
        <div className="p-4 mx-4 my-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
            <span className="flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>ACTIVE SHOP</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px]">
              ETB
            </span>
          </div>
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
            {shopName}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
            {shopCity}
          </p>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            if (item.highlight) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all shadow-sm ${
                    active
                      ? 'bg-emerald-600 text-white shadow-emerald-500/25 ring-2 ring-emerald-500/50'
                      : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/50'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-700/30 text-emerald-100">
                    POS
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon
                  className={`w-5 h-5 flex-shrink-0 ${
                    active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Card, Role & Logout Button */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-sm flex-shrink-0">
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                {userName}
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium capitalize truncate">
                {userRole}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex-shrink-0"
            aria-label="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
