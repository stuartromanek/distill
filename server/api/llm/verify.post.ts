import type { LlmProviderId } from '../../../shared/types/playlist'
import { isHttpError, isServerLlmConfigured, readLlmConfig } from '../../utils/llm/config'
import { resolveLlmAdapter } from '../../utils/llm/resolve'

const VERIFY_PROVIDERS: LlmProviderId[] = ['openai', 'gemini']

function isVerifyProvider(value: string): value is LlmProviderId {
  return VERIFY_PROVIDERS.includes(value as LlmProviderId)
}

function formatVerifyError(err: unknown): string {
  if (isHttpError(err)) {
    const message = err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : ''
    if (/401|403|invalid.*api.*key|incorrect.*api.*key|API key not valid/i.test(message)) {
      return 'Invalid API key — check the key and try again.'
    }
    if (/rate limit|429/i.test(message)) {
      return 'Rate limited — wait a moment and try again.'
    }
    if (message) return message
  }
  if (err instanceof Error && err.message) return err.message
  return 'Could not verify API key — try again.'
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    provider?: string
    apiKey?: string
  }>(event)

  const provider = body?.provider?.trim() ?? ''
  const apiKey = body?.apiKey?.trim() ?? ''

  if (!isVerifyProvider(provider)) {
    throw createError({
      statusCode: 400,
      message: 'provider must be openai or gemini',
    })
  }

  if (!apiKey) {
    throw createError({
      statusCode: 400,
      message: 'apiKey is required',
    })
  }

  if (isServerLlmConfigured()) {
    throw createError({
      statusCode: 400,
      message: 'LLM is configured on the server — browser key verification is not available',
    })
  }

  const config = readLlmConfig(provider, { [provider]: apiKey })

  try {
    const adapter = await resolveLlmAdapter(config, { hasImages: false })
    await adapter.complete({
      systemPrompt: 'Reply with the single word: ok',
      parts: [{ type: 'text', text: 'ping' }],
      jsonMode: false,
    })
    return { ok: true as const }
  } catch (err) {
    if (isHttpError(err)) throw err
    throw createError({
      statusCode: 400,
      message: formatVerifyError(err),
    })
  }
})
