import { describe, it, expect } from 'vitest'
import {
  formatDietaryTag,
  getDietaryTagIcon,
  formatDietaryTagWithIcon,
  normalizeDietaryTag,
} from '../utils/dietaryTags'

describe('formatDietaryTag', () => {
  it('capitalizes and splits underscores', () => {
    expect(formatDietaryTag('non_veg')).toBe('Non Veg')
  })

  it('capitalizes and splits hyphens', () => {
    expect(formatDietaryTag('gluten-free')).toBe('Gluten Free')
  })

  it('handles single word', () => {
    expect(formatDietaryTag('vegan')).toBe('Vegan')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatDietaryTag(null)).toBe('')
    expect(formatDietaryTag(undefined)).toBe('')
  })
})

describe('getDietaryTagIcon', () => {
  it('returns plant icon for vegan', () => {
    expect(getDietaryTagIcon('vegan')).toBe('🌿')
  })

  it('returns dairy icon for contains_dairy', () => {
    expect(getDietaryTagIcon('contains_dairy')).toBe('🥛')
  })

  it('returns meat icon for non_veg', () => {
    expect(getDietaryTagIcon('non_veg')).toBe('🍗')
  })

  it('returns fallback tag for unknown', () => {
    expect(getDietaryTagIcon('unknown_custom_tag')).toBe('🏷️')
  })

  it('returns fallback for empty string', () => {
    expect(getDietaryTagIcon('')).toBe('🏷️')
  })
})

describe('formatDietaryTagWithIcon', () => {
  it('combines icon and label', () => {
    expect(formatDietaryTagWithIcon('halal')).toBe('🕌 Halal')
  })
})

describe('normalizeDietaryTag', () => {
  it('lowercases and trims', () => {
    expect(normalizeDietaryTag('  Vegan  ')).toBe('vegan')
  })

  it('replaces spaces with underscores', () => {
    expect(normalizeDietaryTag('gluten free')).toBe('gluten_free')
  })

  it('handles null', () => {
    expect(normalizeDietaryTag(null)).toBe('')
  })
})
