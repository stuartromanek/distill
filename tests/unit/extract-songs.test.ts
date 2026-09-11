import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractSongs } from '../../server/utils/llm/extract-songs'

function h3Error({ statusCode, message }: { statusCode: number; message: string }) {
  return Object.assign(new Error(message), { statusCode, message })
}

vi.mock('../../server/utils/llm/resolve', () => ({
  resolveLlmAdapter: vi.fn(),
}))

describe('extractSongs credential guard', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.stubGlobal('createError', h3Error)
    process.env = { ...originalEnv }
    delete process.env.DST_LLM_PROVIDER
    delete process.env.DST_OPENAI_API_KEY
    delete process.env.DST_GEMINI_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('rejects browser apiKey when server LLM is configured', async () => {
    process.env.DST_OPENAI_API_KEY = 'env-sk-test'

    await expect(
      extractSongs({ text: 'test song' }, { provider: 'openai', apiKey: 'browser-sk' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('server-configured'),
    })
  })
})
