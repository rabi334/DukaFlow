import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Automatically sends Better Auth HTTP-only session cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Attach verified session token & selected active workspace
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // If client is using bearer tokens (e.g. mobile/webview or token storage)
    const token = sessionStorage.getItem('dukaflow_session_token') || localStorage.getItem('dukaflow_session_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Attach active organization only if explicitly selected by the authenticated user
    const activeOrgId = localStorage.getItem('dukaflow_active_org_id');
    if (activeOrgId) {
      config.headers['x-organization-id'] = activeOrgId;
    }
  }
  return config;
});

// Response interceptor: Handle 401 unauthenticated globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      // Clear invalid session tokens
      sessionStorage.removeItem('dukaflow_session_token');
      localStorage.removeItem('dukaflow_session_token');

      // If user is on a protected route, redirect to login
      const pathname = window.location.pathname;
      if (pathname !== '/login' && pathname !== '/register' && pathname !== '/') {
        window.location.href = `/login?redirect=${encodeURIComponent(pathname)}`;
      }
    }
    return Promise.reject(error);
  },
);

// Ethiopian Birr Currency Formatter
export function formatETB(amount: number | string | undefined | null): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount || 0;
  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(num)
    .replace('ETB', 'ETB ');
}
