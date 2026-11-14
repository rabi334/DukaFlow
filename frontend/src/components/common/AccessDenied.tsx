'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft, CreditCard, LayoutDashboard } from 'lucide-react';

interface AccessDeniedProps {
  role?: string;
  resourceName?: string;
  requiredRole?: string;
}

export function AccessDenied({
  role = 'Staff',
  resourceName = 'this section',
  requiredRole = 'Owner or Manager',
}: AccessDeniedProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 flex items-center justify-center mx-auto mb-5 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 mb-3">
          403 Forbidden
        </span>

        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Access Restricted
        </h2>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
          Your current active role (<span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">{role}</span>) does not have authorization to view or manage <span className="font-medium text-slate-800 dark:text-slate-200">{resourceName}</span>. This feature is restricted to <span className="font-medium text-slate-800 dark:text-slate-200">{requiredRole}</span>.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <Link
            href="/pos"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/30 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Point of Sale
          </Link>
        </div>
      </div>
    </div>
  );
}
