import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { getSetting, setSetting, getAllSettings } from '@/lib/db/settings'

describe('settings', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  describe('getSetting', () => {
    it('returns null for non-existent key', () => {
      expect(getSetting(db, 'nonexistent')).toBeNull()
    })

    it('returns the value for an existing key', () => {
      setSetting(db, 'theme', 'dark')
      expect(getSetting(db, 'theme')).toBe('dark')
    })
  })

  describe('setSetting', () => {
    it('creates a new setting', () => {
      setSetting(db, 'language', 'en')
      expect(getSetting(db, 'language')).toBe('en')
    })

    it('overwrites an existing setting', () => {
      setSetting(db, 'theme', 'dark')
      setSetting(db, 'theme', 'light')
      expect(getSetting(db, 'theme')).toBe('light')
    })
  })

  describe('getAllSettings', () => {
    it('returns empty object when no settings exist', () => {
      expect(getAllSettings(db)).toEqual({})
    })

    it('returns all settings as key-value pairs', () => {
      setSetting(db, 'theme', 'dark')
      setSetting(db, 'language', 'en')
      setSetting(db, 'provider_extraction', 'anthropic')

      expect(getAllSettings(db)).toEqual({
        theme: 'dark',
        language: 'en',
        provider_extraction: 'anthropic',
      })
    })
  })
})
