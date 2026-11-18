'use client';

import React from 'react';
import Link from 'next/link';
import { Store, ShieldCheck, Zap, TrendingUp } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Left side: Ethiopian Retail Branding Showcase (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white p-12 flex-col justify-between overflow-hidden border-r border-emerald-900/40">
        {/* Subtle decorative circles */}
        <div className="absolute top-0 -left-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -right-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
                GatiiFlow
              </span>
              <span className="block text-[11px] font-semibold text-emerald-300/80 uppercase tracking-widest">
                Smart Business Platform
              </span>
            </div>
          </Link>
          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
            ETB Currency Native
          </span>
        </div>

        {/* Middle Value Proposition */}
        <div className="relative z-10 max-w-lg space-y-6 my-auto py-12">
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
            Smart, Modern Business Management for Ethiopian SMEs.
          </h1>
          <p className="text-slate-300 text-base leading-relaxed">
            Manage point-of-sale checkout, inventory levels, purchases, and cash flows with instant stock deduction and comprehensive multi-branch tracking.
          </p>

          <div className="space-y-4 pt-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-slate-100">Blazing Fast POS & Barcode Scanner</h4>
                <p className="text-xs text-slate-400">Atomic inventory deduction, Telebirr & CBE Birr support, and receipt printing.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-slate-100">Enterprise Multi-Tenant Security</h4>
                <p className="text-xs text-slate-400">Tenant isolation, role-based controls, and complete operational audit trails.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-slate-100">Automated Accounting & Real-time Metrics</h4>
                <p className="text-xs text-slate-400">Gross profit calculations, operating expense tracking, and low-stock alerts.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-slate-400 flex items-center justify-between">
          <span>&copy; {new Date().getFullYear()} GatiiFlow Technologies. Addis Ababa, Ethiopia.</span>
          <span>Made for modern retail</span>
        </div>
      </div>

      {/* Right side: Auth Form Viewport */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-12">
        <div className="flex items-center justify-between w-full max-w-md mx-auto">
          {/* Mobile Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <Store className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-emerald-600 dark:text-emerald-400">
              GatiiFlow
            </span>
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-8">
          {children}
        </div>

        <div className="w-full max-w-md mx-auto text-center text-xs text-slate-400 dark:text-slate-500">
          Need assistance? Contact support at{' '}
          <a href="mailto:support@gatiiflow.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">
            support@gatiiflow.com
          </a>
        </div>
      </div>
    </div>
  );
}
