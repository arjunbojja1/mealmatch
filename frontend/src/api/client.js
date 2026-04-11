const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

async function request(path) {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json()
}

async function post(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.json()
}

export function getApiBaseUrl() {
  return API_BASE_URL
}

export function getHealth() {
  return request('/health')
}

export function getHello() {
  return request('/api/v1/hello')
}

export function postEcho(text) {
  return post('/api/v1/echo', { text })
}

// Listings
export function getListings() {
  return request('/api/v1/listings')
}

export function createListing(listing) {
  return post('/api/v1/listings', listing)
}

export function claimListing(listingId, userId, claimedQuantity) {
  return post(`/api/v1/listings/${listingId}/claim`, { user_id: userId, claimed_quantity: claimedQuantity })
}

export function updateListingStatus(listingId, status) {
  return fetch(`${API_BASE_URL}/api/v1/listings/${listingId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`)
    return r.json()
  })
}
