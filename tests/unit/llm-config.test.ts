import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  inferCredentialSource,
  isServerLlmConfigured,
  readLlmConfig,
} from '../../server/utils/llm/config'

function h3Error({ statusCode, message }: { statusCode: number; message: string }) {
  return Object.assign(new Error(message), { statusCode })
}

describe('llm config', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.stubGlobal('createError', h3Error)
    process.env = { ...originalEnv }
    delete process.env.DST_LLM_PROVIDER
    delete process.env.DST_OPENAI_API_KEY
    delete process.env.DST_GEMINI_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('infers browser source when request key is present for provider', () => {
    expect(inferCredentialSource('openai', { openai: 'browser-sk' })).toBe('browser')
    expect(inferCredentialSource('openai', { openai: '' })).toBe('server')
    expect(inferCredentialSource('openai', undefined)).toBe('server')
  })

  it('uses request key in browser mode even when env key is set', () => {
    process.env.DST_OPENAI_API_KEY = 'env-sk-test'
    const config = readLlmConfig('openai', { openai: 'browser-sk-test' })
    expect(config.openai.apiKey).toBe('browser-sk-test')
    expect(config.gemini.apiKey).toBe('')
  })

  it('uses env key in server mode', () => {
    process.env.DST_OPENAI_API_KEY = 'env-sk-test'
    const config = readLlmConfig('openai')
    expect(config.openai.apiKey).toBe('env-sk-test')
  })

  it('browser mode ignores DST_LLM_PROVIDER env lock', () => {
    process.env.DST_LLM_PROVIDER = 'gemini'
    process.env.DST_GEMINI_API_KEY = 'gemini-env'
    const config = readLlmConfig('openai', { openai: 'browser-sk-test' })
    expect(config.provider).toBe('openai')
    expect(config.openai.apiKey).toBe('browser-sk-test')
    expect(config.gemini.apiKey).toBe('')
  })

  it('server mode uses env provider lock', () => {
    process.env.DST_LLM_PROVIDER = 'gemini'
    process.env.DST_GEMINI_API_KEY = 'gemini-env'
    const config = readLlmConfig()
    expect(config.provider).toBe('gemini')
    expect(config.gemini.apiKey).toBe('gemini-env')
  })

  it('reports server configured when any server key exists', () => {
    expect(isServerLlmConfigured()).toBe(false)
    process.env.DST_GEMINI_API_KEY = 'gemini-key'
    expect(isServerLlmConfigured()).toBe(true)
  })

  it('requires matching key when LLM_PROVIDER is locked', () => {
    process.env.DST_LLM_PROVIDER = 'openai'
    expect(isServerLlmConfigured()).toBe(false)
    process.env.DST_OPENAI_API_KEY = 'sk-test'
    expect(isServerLlmConfigured()).toBe(true)
  })

  it('ignores unprefixed OPENAI_API_KEY for server config', () => {
    process.env.OPENAI_API_KEY = 'sk-leak'
    expect(isServerLlmConfigured()).toBe(false)
  })
})
