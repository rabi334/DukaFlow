import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject active organization header and dev auth fallback
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const orgId = localStorage.getItem('dukaflow_active_org_id') || '739ff1d9-7b8c-4abf-a88c-f56fc0db3ea5'; // seeded default
    const userEmail = localStorage.getItem('dukaflow_user_email') || 'owner@dukaflow.et';
    
    if (orgId) {
      config.headers['x-organization-id'] = orgId;
    }
    if (userEmail) {
      config.headers['x-user-email'] = userEmail;
    }
  }
  return config;
});

// Ethiopian Birr Currency Formatter
export function formatETB(amount: number | string | undefined | null): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount || 0;
  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num).replace('ETB', 'ETB ');
}
