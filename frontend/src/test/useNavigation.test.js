import { describe, it, expect } from 'vitest'
import {
  validCoord,
  safeLocation,
  haversine,
  formatDist,
  formatDuration,
  stepIcon,
  minDistToPolyline,
} from '../hooks/useNavigation'

describe('validCoord', () => {
  it('accepts valid coordinates', () => {
    expect(validCoord(38.9897, -76.9378)).toBe(true)
  })

  it('rejects null', () => {
    expect(validCoord(null, null)).toBe(false)
  })

  it('rejects out-of-range latitude', () => {
    expect(validCoord(91, 0)).toBe(false)
  })

  it('rejects out-of-range longitude', () => {
    expect(validCoord(0, 181)).toBe(false)
  })

  it('accepts string coords (coercion)', () => {
    expect(validCoord('38.9897', '-76.9378')).toBe(true)
  })
})

describe('safeLocation', () => {
  it('returns null for missing location', () => {
    expect(safeLocation({})).toBe(null)
    expect(safeLocation(null)).toBe(null)
  })

  it('returns numeric lat/lng for valid location', () => {
    const result = safeLocation({ location: { lat: 38.9, lng: -77.0 } })
    expect(result).toEqual({ lat: 38.9, lng: -77.0 })
  })

  it('coerces string coords', () => {
    const result = safeLocation({ location: { lat: '38.9', lng: '-77.0' } })
    expect(result).toEqual({ lat: 38.9, lng: -77.0 })
  })

  it('returns null for empty string coords', () => {
    expect(safeLocation({ location: { lat: '', lng: '' } })).toBe(null)
  })
})

describe('haversine', () => {
  it('returns 0 for same point', () => {
    expect(haversine(0, 0, 0, 0)).toBe(0)
  })

  it('returns Infinity for non-finite input', () => {
    expect(haversine(NaN, 0, 0, 0)).toBe(Infinity)
  })

  it('computes reasonable distance between two DC-area points', () => {
    // College Park to downtown DC ≈ 11km
    const d = haversine(38.9897, -76.9378, 38.8977, -77.0365)
    expect(d).toBeGreaterThan(10000)
    expect(d).toBeLessThan(15000)
  })
})

describe('formatDist', () => {
  it('returns — for non-finite', () => {
    expect(formatDist(Infinity)).toBe('—')
    expect(formatDist(-1)).toBe('—')
  })

  it('formats feet for short distances', () => {
    const result = formatDist(50) // ~164 ft
    expect(result).toMatch(/ft$/)
  })

  it('formats miles for long distances', () => {
    const result = formatDist(5000) // ~3.1 mi
    expect(result).toMatch(/mi$/)
  })
})

describe('formatDuration', () => {
  it('returns — for non-finite', () => {
    expect(formatDuration(Infinity)).toBe('—')
  })

  it('formats minutes for < 1 hour', () => {
    expect(formatDuration(600)).toBe('10 min')
  })

  it('formats hours for >= 1 hour', () => {
    expect(formatDuration(3600)).toBe('1 hr')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(3900)).toBe('1 hr 5 min')
  })
})

describe('stepIcon', () => {
  it('returns ▶ for depart', () => {
    expect(stepIcon({ type: 'depart' })).toBe('▶')
  })

  it('returns ⚑ for arrive', () => {
    expect(stepIcon({ type: 'arrive' })).toBe('⚑')
  })

  it('returns → for right turn', () => {
    expect(stepIcon({ type: 'turn', modifier: 'right' })).toBe('→')
  })

  it('returns ← for left turn', () => {
    expect(stepIcon({ type: 'turn', modifier: 'left' })).toBe('←')
  })

  it('returns ↑ as default', () => {
    expect(stepIcon({ type: 'new name', modifier: 'straight' })).toBe('↑')
  })
})

describe('minDistToPolyline', () => {
  it('returns Infinity for empty coords', () => {
    expect(minDistToPolyline([], { lat: 0, lng: 0 })).toBe(Infinity)
  })

  it('returns 0 when point is exactly on the polyline', () => {
    const d = minDistToPolyline([[0, 0]], { lat: 0, lng: 0 })
    expect(d).toBe(0)
  })

  it('finds minimum distance to closest point', () => {
    const coords = [[-77.0, 38.9], [-77.1, 39.0]]
    const loc = { lat: 38.9, lng: -77.0 }
    const d = minDistToPolyline(coords, loc)
    expect(d).toBe(0)
  })
})
