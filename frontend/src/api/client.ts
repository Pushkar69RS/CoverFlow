export type RoleType = 'CUSTOMER' | 'ADVISOR' | 'TECHNICIAN' | 'STOREKEEPER' | 'MANAGER' | 'ADMIN' | 'FINANCE';

export interface UserInfo {
  id: string;
  email: string;
  full_name: string;
  role: RoleType;
  phone?: string;
  branch_id?: string;
}

const STORAGE_KEY = 'coverflow_auth_session';

// In-memory session state initialized from localStorage if available
let currentUser: UserInfo | null = null;
let currentToken: string | null = null;
let currentRole: RoleType = 'CUSTOMER';
let currentEmail = 'customer@coverflow.com';

function initFromStorage() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.user && data.token) {
        currentUser = data.user;
        currentToken = data.token;
        currentRole = data.user.role;
        currentEmail = data.user.email;
      }
    }
  } catch (err) {
    console.warn('Failed to parse auth session from localStorage', err);
  }
}

initFromStorage();

export function setAuthSession(user: UserInfo, token: string) {
  currentUser = user;
  currentToken = token;
  currentRole = user.role;
  currentEmail = user.email;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
  }
}

export function clearAuthSession() {
  currentUser = null;
  currentToken = null;
  currentRole = 'CUSTOMER';
  currentEmail = 'customer@coverflow.com';
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function getCurrentUser(): UserInfo | null {
  return currentUser;
}

export function getCurrentToken(): string | null {
  return currentToken;
}

export function setActiveRole(role: RoleType, email: string) {
  currentRole = role;
  currentEmail = email;
}

export function getActiveRole() {
  return { role: currentRole, email: currentEmail, user: currentUser };
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('x-user-role', currentRole);
  headers.set('x-user-email', currentEmail);
  if (currentToken) {
    headers.set('Authorization', `Bearer ${currentToken}`);
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  login: async (email: string, password?: string): Promise<{ token: string; user: UserInfo }> => {
    const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthSession(res.user, res.token);
    return res;
  },
  logout: () => {
    clearAuthSession();
  },
  getMe: () => apiFetch<{ user: UserInfo }>('/auth/me'),

  // System & Domain
  getHealth: () => apiFetch<any>('/health'),
  getUsers: (role?: string) => apiFetch<UserInfo[]>(role ? `/users?role=${role}` : '/users'),
  getModels: () => apiFetch<any[]>('/models'),
  getTerms: () => apiFetch<any[]>('/terms'),
  getUnits: () => apiFetch<any[]>('/units'),
  registerUnit: (data: { serial_number: string; model_id: string; purchase_date: string; purchase_proof_url?: string }) =>
    apiFetch<any>('/units', { method: 'POST', body: JSON.stringify(data) }),
  getComplaints: () => apiFetch<any[]>('/complaints'),
  submitComplaint: (data: {
    unit_id: string;
    customer_id?: string;
    fault_category: string;
    description: string;
    idempotency_key?: string;
    override?: { actor_id: string; reason: string; force_outcome?: string };
  }) => apiFetch<any>('/complaints', { method: 'POST', body: JSON.stringify(data) }),
  requestGoodwill: (complaintId: string, notes: string) =>
    apiFetch<any>(`/complaints/${complaintId}/request-goodwill`, { method: 'POST', body: JSON.stringify({ notes }) }),
  approveGoodwill: (complaintId: string, data?: { reason?: string; force_outcome?: string }) =>
    apiFetch<any>(`/complaints/${complaintId}/approve-goodwill`, { method: 'POST', body: JSON.stringify(data || {}) }),
  rejectGoodwill: (complaintId: string, reason?: string) =>
    apiFetch<any>(`/complaints/${complaintId}/reject-goodwill`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getJobs: (params?: { technician_id?: string; status?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiFetch<any[]>(`/jobs${query ? `?${query}` : ''}`);
  },
  pullNextJob: (technicianId: string) =>
    apiFetch<any>(`/technicians/${technicianId}/next-job`, { method: 'POST', body: JSON.stringify({}) }),
  recordDiagnosis: (jobId: string, data: { fault_code: string; diagnosis_notes: string; technician_id?: string }) =>
    apiFetch<any>(`/jobs/${jobId}/diagnosis`, { method: 'POST', body: JSON.stringify(data) }),
  getParts: () => apiFetch<any[]>('/parts'),
  restockPart: (partId: string, quantity: number) =>
    apiFetch<any>(`/parts/${partId}/restock`, { method: 'POST', body: JSON.stringify({ quantity }) }),
  getJobReservations: (jobId: string) => apiFetch<any[]>(`/jobs/${jobId}/parts`),
  reservePart: (jobId: string, data: { part_id: string; quantity: number }) =>
    apiFetch<any>(`/jobs/${jobId}/parts`, { method: 'POST', body: JSON.stringify(data) }),
  submitEstimate: (jobId: string, estimate_amount: number) =>
    apiFetch<any>(`/jobs/${jobId}/estimate`, { method: 'POST', body: JSON.stringify({ estimate_amount }) }),
  approveEstimate: (jobId: string) =>
    apiFetch<any>(`/jobs/${jobId}/estimate/approve`, { method: 'POST', body: JSON.stringify({}) }),
  completeJob: (jobId: string, data?: { labour_hours?: number }) =>
    apiFetch<any>(`/jobs/${jobId}/complete`, { method: 'POST', body: JSON.stringify(data || {}) }),
  getInvoices: () => apiFetch<any[]>('/invoices'),
  capturePayment: (invoiceId: string, data: { amount: number; method: string }) =>
    apiFetch<any>(`/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  resetDemoQueue: () => apiFetch<any>('/demo/reset-queue', { method: 'POST' }),
};
