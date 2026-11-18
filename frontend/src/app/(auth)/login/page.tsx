'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

function getSafeRedirect(redirectParam: string | null): string {
  if (!redirectParam) return '/dashboard';
  // Disallow protocol relative URLs (e.g. //evil.com) and full external URLs (http/https)
  if (!redirectParam.startsWith('/') || redirectParam.startsWith('//')) return '/dashboard';
  // Avoid loop redirects back to auth pages
  if (redirectParam.startsWith('/login') || redirectParam.startsWith('/register')) return '/dashboard';
  return redirectParam;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect');
  const targetRedirect = getSafeRedirect(rawRedirect);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setLoading(true);

    try {
      // 1. Authenticate credentials via Better Auth backend endpoint
      const response = await api.post('/api/v1/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });

      const data = response.data;
      if (data.token) {
        // Store session token for optional bearer header support (with backwards compatibility)
        sessionStorage.setItem('gatiiflow_session_token', data.token);
        localStorage.setItem('gatiiflow_session_token', data.token);
        sessionStorage.setItem('dukaflow_session_token', data.token);
        localStorage.setItem('dukaflow_session_token', data.token);
      }

      if (data.user?.email) {
        localStorage.setItem('gatiiflow_user_email', data.user.email);
        localStorage.setItem('gatiiflow_user_name', data.user.name || '');
        localStorage.setItem('dukaflow_user_email', data.user.email);
        localStorage.setItem('dukaflow_user_name', data.user.name || '');
      }

      // 2. Fetch authenticated profile to check available business workspaces
      try {
        const profileRes = await api.get('/api/v1/auth/me');
        const profile = profileRes.data;

        if (!profile.workspaces || profile.workspaces.length === 0) {
          // New user without any business workspace -> forward to onboarding
          router.push('/onboarding?welcome=true');
          return;
        }

        // Set the active organization if not set or invalid
        const activeWorkspaces = profile.workspaces.filter(
          (w: any) => w.status === 'ACTIVE' || !w.status,
        );

        if (activeWorkspaces.length > 0) {
          localStorage.setItem('gatiiflow_active_org_id', activeWorkspaces[0].id);
          localStorage.setItem('gatiiflow_active_org_name', activeWorkspaces[0].name);
          localStorage.setItem('dukaflow_active_org_id', activeWorkspaces[0].id);
          localStorage.setItem('dukaflow_active_org_name', activeWorkspaces[0].name);
        }
      } catch {
        // Fallback: Proceed to target redirect if profile lookup fails
      }

      router.push(targetRedirect);
    } catch (err: any) {
      const serverMsg =
        err.response?.data?.message ||
        (Array.isArray(err.response?.data?.message)
          ? err.response?.data?.message.join(', ')
          : null) ||
        'Invalid email or password. Please verify your credentials.';
      setErrorMessage(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Sign In to GatiiFlow
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Enter your registered email and password to access your store.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-3 text-rose-800 dark:text-rose-200 text-sm animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. abebe@supermarket.et"
              required
              disabled={loading}
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 text-sm transition-all shadow-sm disabled:opacity-60"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Password
            </label>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer">
              Forgot password?
            </span>
          </div>
          <div className="relative">
            <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={loading}
              className="w-full pl-11 pr-11 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 text-sm transition-all shadow-sm disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
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
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <span>Sign In to Shop</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="pt-2 text-center text-sm text-slate-500 dark:text-slate-400">
        Don&apos;t have an account yet?{' '}
        <Link
          href={`/register${rawRedirect ? `?redirect=${encodeURIComponent(rawRedirect)}` : ''}`}
          className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          Register your business
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
