const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

// ─── Core helpers ────────────────────────────────────────────────────────────

async function handleResponse(res) {
  if (res.ok) return res.json()
  let message = `Request failed: ${res.status}`
  try {
    const body = await res.json()
    if (body?.detail) message = body.detail
  } catch {
    // ignore parse errors — keep the status-based message
  }
  throw new Error(message)
}

function request(path) {
  return fetch(`${API_BASE_URL}${path}`).then(handleResponse)
}

function post(path, body) {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handleResponse)
}

function patch(path, body) {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handleResponse)
}

function del(path) {
  return fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' }).then(handleResponse)
}

// ─── Exports ─────────────────────────────────────────────────────────────────

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
