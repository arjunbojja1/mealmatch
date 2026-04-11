const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

// ─── Token access ─────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('mm_token')
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Parse the unified API envelope:
 *   success → { ok: true,  data: <payload> }
 *   error   → { ok: false, error: { code, message, details } }
 *
 * On 401, clears local credentials and fires mm:unauthorized so AuthContext
 * can react without a circular import.
 */
async function handleResponse(res) {
  // Global 401 handler — token expired or revoked
  if (res.status === 401) {
    localStorage.removeItem('mm_token')
    localStorage.removeItem('mm_user')
    window.dispatchEvent(new CustomEvent('mm:unauthorized'))
  }

  let body
  try {
    body = await res.json()
  } catch {
    const err = new Error(`Request failed: ${res.status}`)
    err.code = 'UNKNOWN'
    throw err
  }

  // Success path — unwrap data from envelope
  if (res.ok && body?.ok) {
    return body.data
  }

  // Error path — read structured error from envelope
  const errObj = body?.error || {}
  const message = errObj.message || `Request failed: ${res.status}`
  const code = errObj.code || _fallbackCode(res.status, message)

  const err = new Error(message)
  err.code = code
  err.details = errObj.details ?? null
  throw err
}

/** Fallback code when the server didn't send a machine code. */
function _fallbackCode(status, message = '') {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) {
    const lower = message.toLowerCase()
    if (lower.includes('already claimed')) return 'ALREADY_CLAIMED'
    if (lower.includes('cannot transition')) return 'INVALID_STATUS_TRANSITION'
    return 'UNAVAILABLE'
  }
  if (status === 422) return 'OVER_QUANTITY'
  return 'UNKNOWN'
}

function _authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function request(path) {
  return fetch(`${API_BASE_URL}${path}`, {
    headers: _authHeaders(),
  }).then(handleResponse)
}

function post(path, body) {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ..._authHeaders() },
    body: JSON.stringify(body),
  }).then(handleResponse)
}

function patch(path, body) {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ..._authHeaders() },
    body: JSON.stringify(body),
  }).then(handleResponse)
}

function del(path) {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: _authHeaders(),
  }).then(handleResponse)
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function loginUser(email, password) {
  // Auth endpoints don't need a token — use plain fetch
  return fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(handleResponse)
}

export function signupUser(name, email, password, role) {
  return fetch(`${API_BASE_URL}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role }),
  }).then(handleResponse)
}

export function getMe() {
  return request('/api/v1/auth/me')
}

// ─── App endpoints ────────────────────────────────────────────────────────────

export function getApiBaseUrl() {
  return API_BASE_URL
}

export function getHealth() {
  return request('/health')
}

// Listings (active only — public feed)
export function getListings() {
  return request('/api/v1/listings')
}

// Listings (all statuses — admin / restaurant management views)
export function getAdminListings() {
  return request('/api/v1/admin/listings')
}

export function getAdminStats() {
  return request('/api/v1/admin/stats')
}

export function createListing(listing) {
  return post('/api/v1/listings', listing)
}

export function claimListing(listingId, userId, claimedQuantity) {
  return post(`/api/v1/listings/${listingId}/claim`, {
    user_id: userId,
    claimed_quantity: claimedQuantity,
  })
}

export function updateListingStatus(listingId, status) {
  return patch(`/api/v1/listings/${listingId}/status`, { status })
}

export function deleteListing(listingId) {
  return del(`/api/v1/listings/${listingId}`)
}

// My claims (recipient — own claims with embedded listing snapshot)
export function getMyClaims() {
  return request('/api/v1/my-claims')
}

// Cancel a confirmed claim (recipient owner or admin)
export function cancelClaim(claimId) {
  return del(`/api/v1/claims/${claimId}`)
}
