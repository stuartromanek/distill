import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSetupIssues } from '../../server/utils/setup-status'

describe('setup-status', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.NODE_ENV
    delete process.env.DST_SESSION_PASSWORD
    delete process.env.DST_TIDAL_CLIENT_ID
    delete process.env.DST_SPOTIFY_CLIENT_ID
    delete process.env.DST_LLM_PROVIDER
    delete process.env.DST_OPENAI_API_KEY
    delete process.env.DST_GEMINI_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('reports missing streaming when unset', () => {
    const issues = getSetupIssues()
    expect(issues.some(i => i.id === 'streaming')).toBe(true)
    expect(issues.some(i => i.id === 'llm_key')).toBe(false)
  })

  it('is ready when tidal is configured without server LLM keys', () => {
    process.env.DST_TIDAL_CLIENT_ID = 'tidal-id'
    expect(getSetupIssues()).toEqual([])
  })

  it('is ready when tidal and gemini are configured', () => {
    process.env.DST_TIDAL_CLIENT_ID = 'tidal-id'
    process.env.DST_GEMINI_API_KEY = 'gemini-key'
    expect(getSetupIssues()).toEqual([])
  })

  it('requires session password in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DST_TIDAL_CLIENT_ID = 'tidal-id'
    process.env.DST_OPENAI_API_KEY = 'sk-test'
    const issues = getSetupIssues()
    expect(issues.some(i => i.id === 'session_password')).toBe(true)
  })

  it('requires key matching locked LLM provider', () => {
    process.env.DST_TIDAL_CLIENT_ID = 'tidal-id'
    process.env.DST_LLM_PROVIDER = 'openai'
    const issues = getSetupIssues()
    expect(issues.some(i => i.id === 'openai_key')).toBe(true)
  })
})
