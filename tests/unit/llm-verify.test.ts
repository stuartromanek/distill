import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveLlmAdapter = vi.fn()

vi.mock('../../server/utils/llm/resolve', () => ({
  resolveLlmAdapter,
}))

function h3Error({ statusCode, message }: { statusCode: number; message: string }) {
  return Object.assign(new Error(message), { statusCode, message })
}

describe('llm verify handler', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.stubGlobal('createError', h3Error)
    vi.stubGlobal('readBody', vi.fn())
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    resolveLlmAdapter.mockReset()
    process.env = { ...originalEnv }
    delete process.env.DST_LLM_PROVIDER
    delete process.env.DST_OPENAI_API_KEY
    delete process.env.DST_GEMINI_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('rejects missing apiKey', async () => {
    const readBody = vi.mocked(globalThis.readBody)
    readBody.mockResolvedValue({ provider: 'openai', apiKey: '' })

    const handler = (await import('../../server/api/llm/verify.post')).default
    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      message: 'apiKey is required',
    })
  })

  it('rejects invalid provider', async () => {
    const readBody = vi.mocked(globalThis.readBody)
    readBody.mockResolvedValue({ provider: 'anthropic', apiKey: 'key' })

    const handler = (await import('../../server/api/llm/verify.post')).default
    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      message: 'provider must be openai or gemini',
    })
  })

  it('rejects verify when server LLM is configured', async () => {
    process.env.DST_OPENAI_API_KEY = 'env-sk-test'
    const readBody = vi.mocked(globalThis.readBody)
    readBody.mockResolvedValue({ provider: 'openai', apiKey: 'browser-key' })

    vi.resetModules()
    const handler = (await import('../../server/api/llm/verify.post')).default
    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('configured on the server'),
    })
  })

  it('returns ok when adapter completes', async () => {
    vi.resetModules()
    const readBody = vi.mocked(globalThis.readBody)
    readBody.mockResolvedValue({ provider: 'gemini', apiKey: 'test-key' })
    resolveLlmAdapter.mockResolvedValue({
      complete: vi.fn().mockResolvedValue({ raw: 'ok' }),
    })

    const handler = (await import('../../server/api/llm/verify.post')).default
    await expect(handler({} as never)).resolves.toEqual({ ok: true })
  })
})
