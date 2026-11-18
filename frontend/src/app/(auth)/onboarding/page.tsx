'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Store, MapPin, Phone, Building2, CheckCircle2, ArrowRight, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';

const ETHIOPIAN_CITIES = [
  'Addis Ababa',
  'Hawassa',
  'Adama (Nazret)',
  'Bahir Dar',
  'Dire Dawa',
  'Gondar',
  'Mekelle',
  'Bishoftu (Debre Zeyit)',
  'Jimma',
  'Dessie',
  'Other',
];

const BUSINESS_TYPES = [
  'Supermarket / Mini-Market',
  'Boutique & Clothing Store',
  'Electronics & Mobile Shop',
  'Pharmacy & Cosmetics',
  'Cafe, Bakery & Pastry',
  'Hardware & Construction Materials',
  'General Wholesale & Retail',
];

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get('welcome') === 'true';

  const [name, setName] = useState('');
  const [city, setCity] = useState('Addis Ababa');
  const [businessType, setBusinessType] = useState('Supermarket / Mini-Market');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Please enter your business or store name.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/api/v1/business/onboard', {
        name: name.trim(),
        city: city.trim(),
        businessType: businessType.trim(),
        address: address.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        tinNumber: tinNumber.trim() || undefined,
        currency: 'ETB',
      });

      const data = response.data;
      if (data.business?.id) {
        localStorage.setItem('gatiiflow_active_org_id', data.business.id);
        localStorage.setItem('gatiiflow_active_org_name', data.business.name);
        localStorage.setItem('dukaflow_active_org_id', data.business.id);
        localStorage.setItem('dukaflow_active_org_name', data.business.name);
      }

      // Route directly to dashboard now that workspace exists
      router.push('/dashboard');
    } catch (err: any) {
      const serverMsg =
        err.response?.data?.message ||
        (Array.isArray(err.response?.data?.message)
          ? err.response?.data?.message.join(', ')
          : null) ||
        'Failed to create business workspace. Please verify your details.';
      setErrorMessage(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {isWelcome && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800/80 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Account created successfully!</span>
          </div>
        )}
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Set Up Your Business Workspace
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Enter your shop details to initialize your inventory, point-of-sale register, and tax defaults.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-3 text-rose-800 dark:text-rose-200 text-sm animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Business Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Store / Business Name *
          </label>
          <div className="relative">
            <Store className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bole Fresh Supermarket"
              required
              disabled={loading}
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 text-sm transition-all shadow-sm disabled:opacity-60"
            />
          </div>
        </div>

        {/* Business Type & City */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Business Category
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 transition-all shadow-sm disabled:opacity-60"
              >
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              City
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 transition-all shadow-sm disabled:opacity-60"
              >
                {ETHIOPIAN_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Address & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Location / Area
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Bole Road, Mega Building"
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 text-sm transition-all shadow-sm disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+251 911 234 567"
                disabled={loading}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 text-sm transition-all shadow-sm disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* TIN Number */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Tax Identification Number (TIN) <span className="text-slate-400 font-normal lowercase">(optional)</span>
          </label>
          <input
            type="text"
            value={tinNumber}
            onChange={(e) => setTinNumber(e.target.value)}
            placeholder="e.g. 0012345678"
            disabled={loading}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 text-sm transition-all shadow-sm disabled:opacity-60"
          />
        </div>

        {/* Automatic Provisioning Notice */}
        <div className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Automatic Defaults Included:</span>
          </div>
          <p className="pl-5">
            Default Ethiopian retail categories, 15% VAT calculation, and Ethiopian Birr (ETB) will be configured immediately.
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Configuring Workspace...</span>
            </>
          ) : (
            <>
              <span>Launch Business Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <OnboardingForm />
    </Suspense>
  );
}
