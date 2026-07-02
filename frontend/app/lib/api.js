// Thin client for the HybridAgent backend.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function request(path, { method = 'GET', body, auth = true, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) {
    const t = getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('Cannot reach the server. Is the backend running?');
    err.offline = true;
    throw err;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok) {
    const detail = Array.isArray(data?.details) ? data.details.join(', ') : null;
    const err = new Error(data?.error || detail || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  url: API_URL,
  // auth
  register: (body) => request('/auth/register', { method: 'POST', body, auth: false }),
  login: (body) => request('/auth/login', { method: 'POST', body, auth: false }),
  me: () => request('/auth/me'),
  updateAvatar: (formData) => request('/auth/avatar', { method: 'PATCH', body: formData, isForm: true }),
  verifyKyc: () => request('/auth/kyc/verify', { method: 'POST' }),
  // public reads
  config: () => request('/config', { auth: false }),
  listings: (qs = '') => request(`/listings${qs}`, { auth: false }),
  listing: (id) => request(`/listings/${id}`, { auth: false }),
  deals: (qs = '') => request(`/deals${qs}`, { auth: false }),
  mandates: (qs = '') => request(`/mandates${qs}`, { auth: false }),
  quote: (qs = '') => request(`/deals/quote${qs}`, { auth: false }),
  // agent
  myListings: () => request('/listings/mine'),
  claim: (listingId) => request(`/claim/${listingId}`, { auth: false }),
  wallet: () => request('/wallet'),
  withdraw: (to) => request('/wallet/withdraw', { method: 'POST', body: { to } }),
  createListing: (formData) => request('/listings', { method: 'POST', body: formData, isForm: true }),
  attachOwner: (id, ownerAddress) => request(`/listings/${id}/owner`, { method: 'PATCH', body: { ownerAddress } }),
  resendOwnerNotice: (id) => request(`/listings/${id}/resend-notice`, { method: 'POST' }),
  // purchase request lifecycle
  requestPurchase: (listingId) => request(`/listings/${listingId}/purchase`, { method: 'POST' }),
  getPurchaseRequest: (listingId) => request(`/listings/${listingId}/purchase`),
  recordDeal: (listingId, buyerId, dealId) =>
    request(`/listings/${listingId}/purchase`, { method: 'PATCH', body: { buyerId, dealId } }),
  myPurchaseRequests: () => request('/listings/purchase-requests'),
  incomingPurchaseRequests: () => request('/listings/purchase-requests/incoming'),
  // chat
  openConversation: (listingId) => request('/chat/conversations', { method: 'POST', body: { listingId } }),
  conversations: () => request('/chat/conversations'),
  messages: (id) => request(`/chat/conversations/${id}/messages`),
  // agents + reviews
  agents: () => request('/agents', { auth: false }),
  agent: (id) => request(`/agents/${id}`, { auth: false }),
  recentReviews: () => request('/reviews/recent', { auth: false }),
  agentReviews: (agentId) => request(`/reviews?agentId=${agentId}`, { auth: false }),
  reviewEligibility: (agentId) => request(`/reviews/eligibility?agentId=${agentId}`),
  createReview: (body) => request('/reviews', { method: 'POST', body }),
};
