import { storage } from './storage';

// Set EXPO_PUBLIC_API_URL in mobile/.env
// iOS simulator: http://localhost:4000
// Android emulator: http://10.0.2.2:4000
// Physical device: your LAN IP, e.g. http://192.168.1.x:4000
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

async function request<T = any>(
  path: string,
  {
    method = 'GET',
    body,
    auth = true,
    isForm = false,
  }: { method?: string; body?: object | FormData; auth?: boolean; isForm?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await storage.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: isForm ? (body as any) : body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  // Backend sends { error: "..." }; fall back to .message for any proxy errors
  if (!res.ok) throw new Error((json as any).error ?? (json as any).message ?? `HTTP ${res.status}`);
  return json as T;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export type UserType = 'agent' | 'owner';

export interface AuthUser {
  id: string;
  full_name: string;
  user_name: string;
  email: string;
  phone_number?: string;
  kyc_status: 'pending' | 'verified';
  user_type: UserType;
  wallet_address?: string;
  avatar?: string;
  bio?: string;
}

// ── Listing ──────────────────────────────────────────────────────────────────
export interface Listing {
  id: string;
  listing_ref?: string;
  asset_type: 'property' | 'vehicle';
  listing_type: 'owner_direct' | 'agent_brokered';
  title: string;
  description?: string;
  image?: string;
  price_usdc: string;
  owner_address?: string;
  owner_name?: string;
  owner_email?: string;
  owner_status?: string;
  agent_address?: string;
  commission_bps: number;
  status: 'open' | 'pending' | 'sold' | 'cancelled';
  created_by?: string;
  created_at?: string;
  // enriched
  agent_name?: string;
  agent_username?: string;
  agent_kyc?: string;
  agent_rating?: number;
}

// ── Wallet ───────────────────────────────────────────────────────────────────
export interface WalletData {
  address: string;
  balanceUsdc: string;
  balanceBase: string;
  breakdown: { commissionUsdc: string; proceedsUsdc: string };
  completedDeals: number;
}

// ── Agent (leaderboard) ──────────────────────────────────────────────────────
export interface Agent {
  id: string;
  full_name: string;
  user_name: string;
  avatar?: string;
  bio?: string;
  kyc_status: string;
  rating: number;
  review_count: number;
  listing_count: number;
  sales_count: number;
}

// ── API client ───────────────────────────────────────────────────────────────
export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST', body: { email, password }, auth: false,
    }),

    register: (body: {
      fullName: string; userName: string; email: string;
      phoneNumber: string; password: string; userType: UserType;
      gender?: string; bio?: string;
    }) => request<{ token: string; user: AuthUser }>('/auth/register', {
      method: 'POST', body, auth: false,
    }),

    me: () => request<{ user: AuthUser }>('/auth/me'),

    kycVerify: () => request<{ message: string }>('/auth/kyc/verify', { method: 'POST' }),

    updateAvatar: (form: FormData) => {
      return new Promise<{ user: AuthUser }>((resolve, reject) => {
        storage.getToken().then(token => {
          const xhr = new XMLHttpRequest();
          xhr.open('PATCH', `${API_URL}/auth/avatar`);
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              let err;
              try { err = JSON.parse(xhr.responseText); } catch(e) {}
              reject(new Error(err?.error || `Upload failed with status ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error('Network request failed'));
          xhr.send(form as any);
        }).catch(reject);
      });
    },

  // Listings
  listings: (params?: { assetType?: string; status?: string }) => {
    const qs = params
      ? '?' + Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&')
      : '';
    return request<Listing[]>(`/listings${qs}`, { auth: false });
  },

  listing: (id: string) => request<Listing>(`/listings/${id}`, { auth: false }),

  myListings: () => request<Listing[]>('/listings/mine'),

  createListing: (form: FormData) => {
    return new Promise<Listing>((resolve, reject) => {
      storage.getToken().then(token => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/listings`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            let err;
            try { err = JSON.parse(xhr.responseText); } catch(e) {}
            reject(new Error(err?.error || `Upload failed with status ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network request failed'));
        xhr.send(form as any);
      }).catch(reject);
    });
  },

  attachOwner: (id: string, ownerAddress: string) =>
    request<Listing>(`/listings/${id}/owner`, { method: 'PATCH', body: { ownerAddress } }),

  // Agents / leaderboard
  agents: () => request<Agent[]>('/agents', { auth: false }),
  agent: (id: string) => request<Agent>(`/agents/${id}`, { auth: false }),

  // Wallet
  wallet: () => request<WalletData>('/wallet'),
  withdraw: (to?: string) => request<{ message: string }>('/wallet/withdraw', {
    method: 'POST', body: to ? { to } : {},
  }),

  // Purchase requests
  requestPurchase: (listingId: string) =>
    request<any>(`/listings/${listingId}/purchase`, { method: 'POST' }),
  approvePurchaseRequest: (listingId: string, buyerId: string) =>
    request<any>(`/listings/${listingId}/purchase/approve`, { method: 'PATCH', body: { buyerId } }),
  recordDeal: (listingId: string, buyerId: string, dealId: string) =>
    request<any>(`/listings/${listingId}/purchase`, { method: 'PATCH', body: { buyerId, dealId } }),
  incomingRequests: () =>
    request<any[]>('/listings/purchase-requests/incoming'),

  // Chat
  openConversation: (listingId: string) =>
    request<{ id: string }>('/chat/conversations', { method: 'POST', body: { listingId } }),
  conversations: () =>
    request<any[]>('/chat/conversations'),
  messages: (conversationId: string) =>
    request<any[]>(`/chat/conversations/${conversationId}/messages`),

  // Wallet key (MVP custodial only — replaced by Privy in prod)
  walletKey: () => request<{ privateKey: string }>('/wallet/key'),

  // Chain config (deployed contract addresses)
  chainConfig: () =>
    request<{
      chainId: number;
      rpcUrl: string;
      contracts: { usdc: string; mandateRegistry: string; hybridEscrow: string };
      chainConfigured: boolean;
    }>('/config', { auth: false }),
};
