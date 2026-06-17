import { anthropicProvider } from './adapters/anthropic.ts'
import { cursorProvider } from './adapters/cursor.ts'
import { geminiProvider } from './adapters/gemini.ts'
import { openaiProvider } from './adapters/openai.ts'
import { PROVIDER_IDS, isHttpError, readLlmConfig } from './config.ts'
import { getProvider, listProviderIds, registerProvider } from './registry.ts'
import type { LlmAdapter, LlmConfig, LlmProviderId } from './types.ts'

let providersRegistered = false

/** Nitro can tree-shake side-effect-only adapter imports; register explicitly. */
function ensureProvidersRegistered() {
  if (providersRegistered) return
  providersRegistered = true
  registerProvider(cursorProvider)
  registerProvider(openaiProvider)
  registerProvider(geminiProvider)
  registerProvider(anthropicProvider)
}

function isKnownProvider(id: string): id is LlmProviderId {
  return PROVIDER_IDS.includes(id as LlmProviderId)
}

export async function resolveLlmAdapter(
  config: LlmConfig,
  ctx: { hasImages: boolean },
): Promise<LlmAdapter> {
  ensureProvidersRegistered()
  if (!isKnownProvider(config.provider)) {
    throw createError({
      statusCode: 500,
      message: `Unknown LLM provider "${config.provider}". Supported: ${listProviderIds().join(', ')}`,
    })
  }

  const def = getProvider(config.provider)
  def.validateConfig(config)

  // Cursor handles image fallback inside createAdapter; skip generic vision guard
  if (ctx.hasImages && !def.capabilities.vision && config.provider !== 'cursor') {
    throw createError({
      statusCode: 502,
      message: `Provider "${config.provider}" does not support image input.`,
    })
  }

  try {
    return await def.createAdapter(config, ctx)
  } catch (err) {
    if (isHttpError(err)) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw createError({
      statusCode: 500,
      message: `LLM setup failed: ${message}`,
    })
  }
}

