'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Store,
  Users,
  Receipt,
  Shield,
  Check,
  RefreshCw,
  UserPlus,
  X,
  Mail,
  UserCheck,
  UserX,
  Clock,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { AccessDenied } from '@/components/common/AccessDenied';

export default function SettingsPage() {
  const [business, setBusiness] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [userRole, setUserRole] = useState('Staff');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Invite Member Modal State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('cashier');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

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
    setForbidden(false);
    const role = (localStorage.getItem('gatiiflow_user_role') || localStorage.getItem('dukaflow_user_role') || 'Staff').toLowerCase();
    setUserRole(role);

    if (role !== 'owner') {
      setForbidden(true);
      setLoading(false);
      return;
    }

    try {
      const [bizRes, memRes, invRes] = await Promise.all([
        api.get('/api/v1/business/current'),
        api.get('/api/v1/business/members'),
        api.get('/api/v1/business/invitations'),
      ]);
      setBusiness(bizRes.data);
      setMembers(memRes.data);
      setInvitations(invRes.data);
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
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else {
        console.error('Failed to load settings:', err);
      }
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

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setInviteError('');
    try {
      await api.post('/api/v1/business/members/invite', {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setIsInviteOpen(false);
      setInviteEmail('');
      setInviteRole('cashier');
      await loadData();
    } catch (err: any) {
      setInviteError(err.response?.data?.message || 'Failed to send staff invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      await api.patch(`/api/v1/business/members/${memberId}/role`, { role: newRole });
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update member role');
    }
  };

  const handleToggleStatus = async (memberId: string, currentStatus: string, role: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    const action = nextStatus === 'DEACTIVATED' ? 'deactivate' : 'reactivate';

    if (!confirm(`Are you sure you want to ${action} this staff member?`)) return;

    try {
      await api.patch(`/api/v1/business/members/${memberId}/status`, { status: nextStatus });
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || `Failed to ${action} member`);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to cancel this pending invitation?')) return;

    try {
      await api.delete(`/api/v1/business/invitations/${invitationId}`);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to cancel invitation');
    }
  };

  if (forbidden) {
    return (
      <AccessDenied
        role={userRole}
        resourceName="Business & Financial Settings"
        requiredRole="Business Owner"
      />
    );
  }

  // Count active owners to prevent deactivating the last one
  const activeOwnersCount = members.filter((m) => m.role === 'owner' && m.status === 'ACTIVE').length;

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
                placeholder="e.g. Bole Sub-City, Mega Building"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                City / Region
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Support Phone Number
              </label>
              <input
                type="tel"
                placeholder="+251 911 000000"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Receipt & Financials */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Receipt className="w-5 h-5 text-emerald-600" />
            <span>Receipt Customization &amp; VAT</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Receipt Header Message
              </label>
              <input
                type="text"
                placeholder="e.g. Welcome to Addis Supermarket!"
                value={form.receiptHeader}
                onChange={(e) => setForm({ ...form, receiptHeader: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Receipt Footer Message
              </label>
              <input
                type="text"
                placeholder="e.g. Goods sold cannot be returned after 7 days"
                value={form.receiptFooter}
                onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                VAT / Tax Rate (Decimal, e.g. 0.15 for 15%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2 pt-5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="taxInclusive"
                  checked={form.taxInclusive}
                  onChange={(e) => setForm({ ...form, taxInclusive: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="taxInclusive" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Prices are Tax Inclusive (VAT included in selling price)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allowNegative"
                  checked={form.allowNegative}
                  onChange={(e) => setForm({ ...form, allowNegative: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="allowNegative" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Allow Negative Inventory (Overselling at POS without stock)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between">
          {savedSuccess && (
            <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
              <Check className="w-5 h-5" /> Settings updated successfully!
            </div>
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

      {/* Staff Management Section */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
            <Users className="w-5 h-5 text-emerald-600" />
            <span>Staff Management &amp; Role Permissions</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsInviteOpen(true);
              setInviteError('');
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite Staff
          </button>
        </div>

        {/* Active Members Table */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((m) => {
            const isSoleOwner = m.role === 'owner' && activeOwnersCount <= 1 && m.status === 'ACTIVE';

            return (
              <div key={m.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    {m.user?.name}
                    {m.status === 'DEACTIVATED' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                        Deactivated
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">{m.user?.email}</p>
                </div>

                <div className="flex items-center gap-2.5">
                  {/* Role Selector */}
                  <select
                    value={m.role}
                    disabled={isSoleOwner}
                    onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    title={isSoleOwner ? 'Sole active owner cannot be demoted' : 'Change staff role'}
                  >
                    <option value="owner">Owner</option>
                    <option value="manager">Manager</option>
                    <option value="cashier">Cashier</option>
                    <option value="inventory_staff">Inventory Staff</option>
                  </select>

                  {/* Status Toggle Button */}
                  <button
                    onClick={() => handleToggleStatus(m.id, m.status, m.role)}
                    disabled={isSoleOwner && m.status === 'ACTIVE'}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1 ${
                      m.status === 'ACTIVE'
                        ? 'border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40'
                        : 'border-emerald-200 dark:border-emerald-900/60 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                    }`}
                    title={
                      isSoleOwner && m.status === 'ACTIVE'
                        ? 'Cannot deactivate the sole active owner'
                        : m.status === 'ACTIVE'
                        ? 'Deactivate Staff Member'
                        : 'Reactivate Staff Member'
                    }
                  >
                    {m.status === 'ACTIVE' ? (
                      <>
                        <UserX className="w-3.5 h-3.5" /> Deactivate
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5" /> Reactivate
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Pending Invitations ({invitations.length})
            </h4>

            <div className="space-y-2">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-800/30"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                      {inv.email}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Invited as <strong className="uppercase">{inv.role}</strong> • Expires{' '}
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>

                  <button
                    onClick={() => handleCancelInvitation(inv.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Cancel Invitation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Invite Staff Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">
                    Invite Team Member
                  </h3>
                  <p className="text-xs text-slate-500">
                    Add staff to your business workspace
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsInviteOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInviteMember} className="space-y-4">
              {inviteError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {inviteError}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Staff Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="cashier@gatiiflow.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Assigned Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="cashier">Cashier (POS & Sales only)</option>
                  <option value="manager">Store Manager (Operational control)</option>
                  <option value="inventory_staff">Inventory Staff (Stock & Receiving)</option>
                  <option value="owner">Business Co-Owner (Full access)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20"
                >
                  {inviting ? 'Sending Invite...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
