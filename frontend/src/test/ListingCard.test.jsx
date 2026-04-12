import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ListingCard, { getMinutesLeft, formatMinutesLeft } from '../components/ListingCard'

// ── Pure utility tests ────────────────────────────────────────────────────────

describe('getMinutesLeft', () => {
  it('returns 0 for null input', () => {
    expect(getMinutesLeft(null)).toBe(0)
  })

  it('returns a positive number for a future date', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(getMinutesLeft(future)).toBeGreaterThan(0)
  })

  it('returns a negative number for a past date', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    expect(getMinutesLeft(past)).toBeLessThan(0)
  })
})

describe('formatMinutesLeft', () => {
  it('returns "Closing" for 0 or negative', () => {
    expect(formatMinutesLeft(0)).toBe('Closing')
    expect(formatMinutesLeft(-5)).toBe('Closing')
  })

  it('returns minutes for < 60', () => {
    expect(formatMinutesLeft(30)).toBe('30 min')
  })

  it('formats hours and minutes', () => {
    expect(formatMinutesLeft(90)).toBe('1h 30m')
    expect(formatMinutesLeft(60)).toBe('1h 0m')
  })
})

// ── Component render tests ────────────────────────────────────────────────────

function makeListing(overrides = {}) {
  return {
    id: 'test-1',
    title: 'Test Pasta',
    description: 'Fresh pasta from lunch service',
    quantity: 5,
    dietary_tags: ['vegetarian'],
    pickup_start: new Date(Date.now() + 30 * 60000).toISOString(),
    pickup_end:   new Date(Date.now() + 90 * 60000).toISOString(),
    location_name: 'Test Kitchen',
    address: '123 Main St',
    ...overrides,
  }
}

function defaultProps(overrides = {}) {
  return {
    listing: makeListing(),
    isClaiming: false,
    justClaimed: false,
    claimCount: 1,
    slotSelection: '',
    onClaim: vi.fn(),
    onCountChange: vi.fn(),
    onSlotChange: vi.fn(),
    onShowMap: vi.fn(),
    ...overrides,
  }
}

describe('ListingCard', () => {
  it('renders the listing title', () => {
    render(<ListingCard {...defaultProps()} />)
    expect(screen.getByText('Test Pasta')).toBeInTheDocument()
  })

  it('shows the Available badge when not claimed', () => {
    render(<ListingCard {...defaultProps()} />)
    expect(screen.getByText('Available')).toBeInTheDocument()
  })

  it('shows Claimed badge when justClaimed is true', () => {
    render(<ListingCard {...defaultProps({ justClaimed: true })} />)
    // Both the status badge and the button show "Claimed"
    expect(screen.getAllByText('Claimed').length).toBeGreaterThanOrEqual(1)
  })

  it('disables the claim button when justClaimed', () => {
    render(<ListingCard {...defaultProps({ justClaimed: true })} />)
    expect(screen.getByRole('button', { name: /Claimed/i })).toBeDisabled()
  })

  it('calls onClaim when Reserve pickup is clicked', () => {
    const onClaim = vi.fn()
    render(<ListingCard {...defaultProps({ onClaim })} />)
    fireEvent.click(screen.getByText('Reserve pickup'))
    expect(onClaim).toHaveBeenCalledOnce()
  })

  it('shows Show on map button when address is present', () => {
    render(<ListingCard {...defaultProps()} />)
    expect(screen.getByText('Show on map')).toBeInTheDocument()
  })

  it('renders dietary tags', () => {
    render(<ListingCard {...defaultProps()} />)
    expect(screen.getByText(/vegetarian/i)).toBeInTheDocument()
  })

  it('renders slot picker when listing has pickup_slots', () => {
    const listing = makeListing({
      pickup_slots: [{ id: 'slot-1', label: '12pm – 1pm' }],
    })
    render(<ListingCard {...defaultProps({ listing })} />)
    expect(screen.getByText('12pm – 1pm')).toBeInTheDocument()
  })
})
