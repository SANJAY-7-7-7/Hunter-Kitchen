import {
  User,
  MenuItem,
  Category,
  Order,
  Address,
  DeliveryBatch,
  Review,
  AppNotification,
  RestaurantSettings,
  AnalyticsSummary
} from '../types';

const API_BASE = '/api';

// Clean up any legacy tokens stored in browser storage from previous versions
if (typeof window !== 'undefined') {
  try {
    sessionStorage.removeItem('hk_auth_token');
    localStorage.removeItem('hk_auth_token');
  } catch {
    // Ignore storage restrictions (e.g. private browsing mode)
  }
}

// In-Memory Token Reference (Kept strictly in JS runtime memory, never written to disk/localStorage)
let inMemoryAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryAuthToken;
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // Use in-memory token if active in the current tab session
  const token = inMemoryAuthToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // Anti-CSRF verification header
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {})
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      credentials: 'include', // Automatically attaches HttpOnly cookies (hk_session)
      ...options,
      headers
    });
  } catch (err: any) {
    throw new Error(err.message || 'Network request failed');
  }

  let json: any = {};
  try {
    json = await response.json();
  } catch (err) {
    if (!response.ok) {
      const isAuthEndpoint = endpoint.startsWith('/auth/');
      if (response.status === 401 && !isAuthEndpoint && typeof window !== 'undefined') {
        inMemoryAuthToken = null;
        try {
          sessionStorage.removeItem('hk_auth_token');
          localStorage.removeItem('hk_auth_token');
        } catch {}
        window.dispatchEvent(new CustomEvent('hk:unauthorized'));
      }
      throw new Error(`API Request failed with status ${response.status}`);
    }
  }

  if (!response.ok || json.success === false) {
    const isAuthEndpoint = endpoint.startsWith('/auth/');
    if (response.status === 401 && !isAuthEndpoint && typeof window !== 'undefined') {
      inMemoryAuthToken = null;
      try {
        sessionStorage.removeItem('hk_auth_token');
        localStorage.removeItem('hk_auth_token');
      } catch {}
      window.dispatchEvent(new CustomEvent('hk:unauthorized'));
    }
    throw new Error(json.message || json.error?.message || `Request to ${endpoint} failed (${response.status})`);
  }

  return (json.data !== undefined ? json.data : json) as T;
}

export const apiService = {
  // Settings
  getSettings: () => fetchApi<RestaurantSettings>('/settings'),
  updateSettings: (settings: Partial<RestaurantSettings>) =>
    fetchApi<RestaurantSettings>('/owner/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings)
    }),

  // Auth
  register: async (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    address?: Partial<Address>;
  }) => {
    const res = await fetchApi<{ user: User; token?: string; expiresAt: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res?.token) {
      inMemoryAuthToken = res.token;
    }
    return res;
  },
  login: async (email: string, password: string) => {
    const res = await fetchApi<{ user: User; token?: string; expiresAt: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res?.token) {
      inMemoryAuthToken = res.token;
    }
    return res;
  },
  getCurrentUser: () => fetchApi<User | null>('/auth/me'),
  logout: async () => {
    try {
      return await fetchApi<{ message: string }>('/auth/logout', {
        method: 'POST'
      });
    } catch {
      return { message: 'Logged out successfully' };
    } finally {
      inMemoryAuthToken = null;
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('hk_auth_token');
          localStorage.removeItem('hk_auth_token');
        } catch {}
      }
    }
  },
  forgotPassword: (email: string) =>
    fetchApi<{ message: string; resetToken?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),
  resetPassword: (token: string, password: string) =>
    fetchApi<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    }),
  acceptInvite: async (token: string, password: string) => {
    const res = await fetchApi<{ user: User; token?: string; message: string }>('/auth/invite/accept', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    });
    if (res?.token) {
      inMemoryAuthToken = res.token;
    }
    return res;
  },

  // Real-Time Gmail OTP System (Login, Password Reset & Email Change)
  sendOtp: (email: string, purpose: 'LOGIN' | 'FORGOT_PASSWORD' | 'EMAIL_CHANGE' = 'FORGOT_PASSWORD') =>
    fetchApi<{
      success: boolean;
      message: string;
      email: string;
      channel: string;
      expiresInSeconds: number;
    }>('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ email, purpose })
    }),
  loginWithOtp: async (email: string, otp: string) => {
    const res = await fetchApi<{ user: User; token?: string; expiresAt: string }>('/auth/otp/login', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    });
    if (res?.token) {
      inMemoryAuthToken = res.token;
    }
    return res;
  },
  verifyOtp: (email: string, otp: string) =>
    fetchApi<{ success: boolean; message: string; resetToken: string }>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    }),
  resetPasswordWithOtp: (token: string, password: string) =>
    fetchApi<{ message: string }>('/auth/otp/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    }),

  // Google Single Sign-On (OAuth 2.0 / OIDC)
  getGoogleAuthUrl: () => fetchApi<{ success: boolean; url: string; configured?: boolean; redirectUri?: string }>('/auth/google/url'),

  // Architecture & Security Status
  getInfraStatus: () => fetchApi<any>('/infra/status'),

  // Users & Staff
  getUsers: (role?: string) => fetchApi<User[]>(`/users${role ? `?role=${role}` : ''}`),
  updateUserProfile: async (
    userId: string, 
    data: { name?: string; phone?: string; email?: string; password?: string; otp?: string }
  ) => {
    const res = await fetchApi<{ user: User; token?: string; message?: string }>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    if (res?.token) {
      inMemoryAuthToken = res.token;
    }
    return res;
  },
  addStaff: (staffData: { name: string; email: string; phone: string; role?: string; staffRole?: string }) =>
    fetchApi<User>('/owner/staff', {
      method: 'POST',
      body: JSON.stringify(staffData)
    }),
  updateStaff: (id: string, updates: Partial<User>) =>
    fetchApi<User>(`/owner/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    }),
  addDeliveryPartner: (partnerData: { name: string; email: string; phone: string; vehicleNumber?: string; vehicleType?: string }) =>
    fetchApi<User>('/owner/delivery-partners', {
      method: 'POST',
      body: JSON.stringify(partnerData)
    }),
  updateDeliveryPartner: (id: string, updates: Partial<User>) =>
    fetchApi<User>(`/owner/delivery-partners/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    }),
  updateDeliveryPartnerStatus: (id: string, status: string) =>
    fetchApi<User>(`/delivery-partners/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
  deleteUser: (id: string) =>
    fetchApi<void>(`/owner/users/${id}`, {
      method: 'DELETE'
    }),
  deleteStaff: (id: string) =>
    fetchApi<void>(`/owner/staff/${id}`, {
      method: 'DELETE'
    }),
  deleteDeliveryPartner: (id: string) =>
    fetchApi<void>(`/owner/delivery-partners/${id}`, {
      method: 'DELETE'
    }),

  // Menu
  getCategories: async () => {
    try {
      const data = await fetchApi<Category[]>('/categories');
      try {
        localStorage.setItem('cached_categories', JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to save categories to localStorage:', e);
      }
      return data;
    } catch (err) {
      console.warn('Network error, fetching categories from cache:', err);
      const cached = localStorage.getItem('cached_categories');
      if (cached) {
        try {
          return JSON.parse(cached) as Category[];
        } catch (e) {
          // ignore
        }
      }
      throw err;
    }
  },
  getMenu: async () => {
    try {
      const data = await fetchApi<MenuItem[]>('/menu');
      try {
        localStorage.setItem('cached_menu', JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to save menu to localStorage:', e);
      }
      return data;
    } catch (err) {
      console.warn('Network error, fetching menu from cache:', err);
      const cached = localStorage.getItem('cached_menu');
      if (cached) {
        try {
          return JSON.parse(cached) as MenuItem[];
        } catch (e) {
          // ignore
        }
      }
      throw err;
    }
  },
  createMenuItem: (item: Partial<MenuItem>) =>
    fetchApi<MenuItem>('/owner/menu-items', {
      method: 'POST',
      body: JSON.stringify(item)
    }),
  updateMenuItem: (id: string, item: Partial<MenuItem>) =>
    fetchApi<MenuItem>(`/owner/menu-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item)
    }),
  updateItemAvailability: (id: string, isAvailable: boolean) =>
    fetchApi<MenuItem>(`/owner/menu-items/${id}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ isAvailable })
    }),
  deleteMenuItem: (id: string) =>
    fetchApi<void>(`/owner/menu-items/${id}`, {
      method: 'DELETE'
    }),

  // Addresses
  getAddresses: (customerId: string) => fetchApi<Address[]>(`/addresses/${customerId}`),
  saveAddress: (customerId: string, address: Partial<Address>) =>
    fetchApi<Address>(`/addresses/${customerId}`, {
      method: 'POST',
      body: JSON.stringify(address)
    }),
  updateAddress: (customerId: string, addressId: string, address: Partial<Address>) =>
    fetchApi<Address>(`/addresses/${customerId}/${addressId}`, {
      method: 'PATCH',
      body: JSON.stringify(address)
    }),
  deleteAddress: (customerId: string, addressId: string) =>
    fetchApi<void>(`/addresses/${customerId}/${addressId}`, {
      method: 'DELETE'
    }),

  // Cart Validation
  validateCart: (items: any[]) =>
    fetchApi<{ subtotal: number; deliveryFee: number; tax: number; grandTotal: number; items: any[] }>(
      '/cart/validate',
      {
        method: 'POST',
        body: JSON.stringify({ items })
      }
    ),

  // Orders
  getOrders: (params?: { role?: string; userId?: string; status?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      if (params.role) cleanParams.role = params.role;
      if (params.userId) cleanParams.userId = params.userId;
      if (params.status) cleanParams.status = params.status;
    }
    const query = new URLSearchParams(cleanParams).toString();
    return fetchApi<Order[]>(`/orders${query ? `?${query}` : ''}`);
  },
  getOrderById: (id: string) => fetchApi<Order>(`/orders/${id}`),
  createOrder: (orderPayload: any) =>
    fetchApi<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload)
    }),

  // Order status actions
  acceptOrder: (id: string, userId?: string) =>
    fetchApi<Order>(`/orders/${id}/accept`, {
      method: 'POST',
      headers: userId ? { 'x-user-id': userId } : {}
    }),
  rejectOrder: (id: string, reason: string, userId?: string) =>
    fetchApi<Order>(`/orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      headers: userId ? { 'x-user-id': userId } : {}
    }),
  markPreparing: (id: string, userId?: string) =>
    fetchApi<Order>(`/orders/${id}/prepare`, {
      method: 'POST',
      headers: userId ? { 'x-user-id': userId } : {}
    }),
  markReady: (id: string, userId?: string) =>
    fetchApi<Order>(`/orders/${id}/ready`, {
      method: 'POST',
      headers: userId ? { 'x-user-id': userId } : {}
    }),
  assignDelivery: (id: string, deliveryPartnerId: string, userId?: string) =>
    fetchApi<Order>(`/orders/${id}/assign-delivery`, {
      method: 'POST',
      body: JSON.stringify({ deliveryPartnerId }),
      headers: userId ? { 'x-user-id': userId } : {}
    }),
  markPickup: (id: string, userId?: string) =>
    fetchApi<Order>(`/orders/${id}/pickup`, {
      method: 'POST',
      headers: userId ? { 'x-user-id': userId } : {}
    }),
  markOutForDelivery: (id: string, userId?: string) =>
    fetchApi<Order>(`/orders/${id}/out-for-delivery`, {
      method: 'POST',
      headers: userId ? { 'x-user-id': userId } : {}
    }),
  markDelivered: (id: string, userId?: string) =>
    fetchApi<Order>(`/orders/${id}/deliver`, {
      method: 'POST',
      headers: userId ? { 'x-user-id': userId } : {}
    }),
  cancelOrder: (id: string, reason: string, userId?: string) =>
    fetchApi<Order>(`/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      headers: userId ? { 'x-user-id': userId } : {}
    }),

  // Delivery Batches
  createDeliveryBatch: (deliveryPartnerId: string, orderIds: string[]) =>
    fetchApi<DeliveryBatch>('/delivery/batches', {
      method: 'POST',
      body: JSON.stringify({ deliveryPartnerId, orderIds })
    }),
  getDeliveryBatches: () => fetchApi<DeliveryBatch[]>('/delivery/batches'),

  // Reviews
  getReviews: () => fetchApi<Review[]>('/reviews'),
  getMenuItemReviews: (menuItemId: string) =>
    fetchApi<{
      avgRating: number;
      totalRatings: number;
      reviews: {
        id: string;
        customerName: string;
        rating: number;
        comment?: string;
        createdAt: string;
        orderNumber: string;
      }[];
    }>(`/menu-items/${menuItemId}/reviews`),
  submitReview: (reviewData: Partial<Review>) =>
    fetchApi<Review>('/reviews', {
      method: 'POST',
      body: JSON.stringify(reviewData)
    }),

  // Notifications
  getNotifications: (userId: string) => fetchApi<AppNotification[]>(`/notifications/${userId}`),
  markNotificationRead: (id: string) =>
    fetchApi<void>(`/notifications/${id}/read`, {
      method: 'PATCH'
    }),

  // Analytics
  getAnalytics: () => fetchApi<AnalyticsSummary>('/owner/analytics'),

  // Production Architecture & Hardening Observability
  getAuditLogs: (limit: number = 50) => fetchApi<any[]>(`/owner/audit-logs?limit=${limit}`),
  getStaffActions: (params?: { date?: string; role?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set('date', params.date);
    if (params?.role) q.set('role', params.role);
    if (params?.limit) q.set('limit', String(params.limit));
    return fetchApi<any>(`/owner/staff-actions${q.toString() ? `?${q.toString()}` : ''}`);
  },
  verifyAuditIntegrity: () => fetchApi<{ isValid: boolean; checkedCount: number; genesisHash: string; latestHash: string; brokenAt?: number; error?: string }>('/owner/audit-logs/verify'),
  getOutboxEvents: (limit: number = 30) => fetchApi<any[]>(`/owner/outbox?limit=${limit}`),
  runReconciliation: () => fetchApi<{ timestamp: string; totalOrdersAudited: number; anomaliesDetected: number; issues: any[] }>('/owner/reconciliation'),

  // Online Payment Gateway Integration (Razorpay)
  createGatewayOrder: (orderId: string) =>
    fetchApi<{
      keyId: string;
      gatewayOrderId: string;
      amountPaise: number;
      currency: string;
      orderNumber: string;
    }>('/payments/create-order', {
      method: 'POST',
      body: JSON.stringify({ orderId })
    }),
  verifyPayment: (payload: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) =>
    fetchApi<{ success: boolean; message: string }>('/payments/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};
