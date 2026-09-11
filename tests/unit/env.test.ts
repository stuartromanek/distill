import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  envVarName,
  publicAppOrigin,
  openaiApiKey,
  readMultilineEnv,
  resetDevSessionPasswordForTests,
  sessionPassword,
  tidalClientId,
  getTidalCountryCode,
  llmProvider,
} from '../../server/utils/env'

function h3Error({ statusCode, message }: { statusCode: number; message: string }) {
  return Object.assign(new Error(message), { statusCode })
}

describe('env', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    resetDevSessionPasswordForTests()
    vi.stubGlobal('createError', h3Error)
    process.env = { ...originalEnv }
    delete process.env.DST_SESSION_PASSWORD
    delete process.env.DST_TIDAL_CLIENT_ID
    delete process.env.DST_LLM_PROVIDER
    delete process.env.DST_PUBLIC_URL
    delete process.env.OPENAI_API_KEY
    delete process.env.NODE_ENV
  })

  afterEach(() => {
    process.env = originalEnv
    resetDevSessionPasswordForTests()
    vi.unstubAllGlobals()
  })

  it('reads DST_TIDAL_CLIENT_ID from env', () => {
    process.env.DST_TIDAL_CLIENT_ID = 'test-tidal-id'
    expect(tidalClientId()).toBe('test-tidal-id')
  })

  it('defaults TIDAL_COUNTRY_CODE to US', () => {
    expect(getTidalCountryCode()).toBe('US')
    process.env.DST_TIDAL_COUNTRY_CODE = 'GB'
    expect(getTidalCountryCode()).toBe('GB')
  })

  it('reads DST_LLM_PROVIDER when valid', () => {
    process.env.DST_LLM_PROVIDER = 'gemini'
    expect(llmProvider()).toBe('gemini')
    process.env.DST_LLM_PROVIDER = 'invalid'
    expect(llmProvider()).toBeNull()
  })

  it('uses DST_SESSION_PASSWORD from env when 16+ chars', () => {
    process.env.DST_SESSION_PASSWORD = 'a'.repeat(16)
    expect(sessionPassword()).toBe('a'.repeat(16))
  })

  it('generates ephemeral dev session password when unset', () => {
    process.env.NODE_ENV = 'development'
    const first = sessionPassword()
    const second = sessionPassword()
    expect(first.length).toBeGreaterThanOrEqual(16)
    expect(second).toBe(first)
  })

  it('requires DST_SESSION_PASSWORD in production', () => {
    process.env.NODE_ENV = 'production'
    expect(() => sessionPassword()).toThrow(/DST_SESSION_PASSWORD/)
  })

  it('expands \\n in readMultilineEnv', () => {
    process.env.DST_LLM_EXTRACT_SYSTEM_PROMPT = 'line one\\nline two'
    expect(readMultilineEnv('LLM_EXTRACT_SYSTEM_PROMPT')).toBe('line one\nline two')
  })

  it('ignores unprefixed OPENAI_API_KEY in shell', () => {
    process.env.OPENAI_API_KEY = 'sk-leak-from-shell'
    expect(openaiApiKey()).toBe('')
    expect(envVarName('OPENAI_API_KEY')).toBe('DST_OPENAI_API_KEY')
  })

  it('reads DST_PUBLIC_URL origin for OAuth callbacks', () => {
    expect(publicAppOrigin()).toBeNull()
    process.env.DST_PUBLIC_URL = 'https://127.0.0.1:3002/extra'
    expect(publicAppOrigin()).toBe('https://127.0.0.1:3002')
  })

  it('aligns DST_PUBLIC_URL port with PORT when they differ', () => {
    process.env.DST_PUBLIC_URL = 'https://127.0.0.1:3000'
    process.env.PORT = '3002'
    expect(publicAppOrigin()).toBe('https://127.0.0.1:3002')
  })
})
