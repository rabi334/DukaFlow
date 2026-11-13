'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Store, Users, Receipt, Shield, Check, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [business, setBusiness] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [form, setForm] = useState({
    name: '',
    address: '',
    city: 'Addis Ababa',
    phoneNumber: '',
    tinNumber: '',
    receiptHeader: '',
    receiptFooter: '',
    taxRate: 0.15,
    taxInclusive: true,
    allowNegative: false,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [bizRes, memRes] = await Promise.all([
        api.get('/api/v1/business/current'),
        api.get('/api/v1/business/members'),
      ]);
      setBusiness(bizRes.data);
      setMembers(memRes.data);
      setForm({
        name: bizRes.data.name || '',
        address: bizRes.data.address || '',
        city: bizRes.data.city || 'Addis Ababa',
        phoneNumber: bizRes.data.phoneNumber || '',
        tinNumber: bizRes.data.tinNumber || '',
        receiptHeader: bizRes.data.receiptHeader || '',
        receiptFooter: bizRes.data.receiptFooter || '',
        taxRate: Number(bizRes.data.taxRate || 0.15),
        taxInclusive: bizRes.data.taxInclusive !== false,
        allowNegative: bizRes.data.allowNegative === true,
      });
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/api/v1/business/settings', form);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Shop &amp; Workspace Settings
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure business details, receipt printing formats, tax policies, and staff roles.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Business Profile */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Store className="w-5 h-5 text-emerald-600" />
            <span>Store Profile &amp; Location</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Business Name *
              </label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tax Identification Number (TIN)
              </label>
              <input
                type="text"
                value={form.tinNumber}
                onChange={(e) => setForm({ ...form, tinNumber: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Shop Address
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Contact Phone
              </label>
              <input
                type="text"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* POS & Receipt Settings */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Receipt className="w-5 h-5 text-emerald-600" />
            <span>POS &amp; Receipt Configuration</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Receipt Header Note
              </label>
              <textarea
                rows={2}
                value={form.receiptHeader}
                onChange={(e) => setForm({ ...form, receiptHeader: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Receipt Footer Note
              </label>
              <textarea
                rows={2}
                value={form.receiptFooter}
                onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div>
                <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 block">
                  Allow Negative Stock Sales
                </span>
                <span className="text-xs text-slate-500">
                  When enabled, cashiers can sell items even if recorded stock is zero. (Default: Disabled)
                </span>
              </div>
              <input
                type="checkbox"
                checked={form.allowNegative}
                onChange={(e) => setForm({ ...form, allowNegative: e.target.checked })}
                className="w-5 h-5 accent-emerald-600 rounded"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-2">
          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
              <Check className="w-4 h-4" /> Settings updated successfully
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="ml-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-500/20 transition-all"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Staff Members List */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-100 dark:border-slate-800">
          <Users className="w-5 h-5 text-emerald-600" />
          <span>Active Team &amp; Cashiers</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((m) => (
            <div key={m.id} className="py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  {m.user?.name}
                </p>
                <p className="text-xs text-slate-400">{m.user?.email}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
