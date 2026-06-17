import { getOpenAIOptionsAsync } from 'cursor-api-proxy'
import type { LlmAdapter, LlmCompleteInput, LlmConfig, LlmProviderDefinition } from '../types.ts'
import { postChatCompletions, resolveCursorModel } from '../transport/openai-chat.ts'
import { openaiProvider } from './openai.ts'

const CAPABILITIES = {
  vision: false,
  jsonMode: 'openai_response_format' as const,
}

const CURSOR_IMAGE_ERROR =
  'Image parsing requires a vision-capable LLM. The Cursor proxy does not send image data to the model — only a text placeholder. Set NUXT_LLM_PROVIDER=openai with NUXT_OPENAI_API_KEY and a vision model (e.g. gpt-4o), or paste the setlist as text.'

function createCursorAdapter(
  config: LlmConfig,
  endpoint: { baseUrl: string; apiKey: string },
  model: string,
): LlmAdapter {
  return {
    id: 'cursor',
    capabilities: CAPABILITIES,
    model,
    async complete(input: LlmCompleteInput) {
      const { raw, durationMs } = await postChatCompletions({
        baseUrl: endpoint.baseUrl,
        apiKey: endpoint.apiKey,
        model,
        systemPrompt: input.systemPrompt,
        parts: input.parts,
        jsonMode: true,
        extraHeaders: { 'X-Cursor-Proxy-Client': 'tidal-playlist' },
        logLabel: 'parse',
        providerId: 'cursor',
      })

      return {
        raw,
        model,
        durationMs,
        provider: 'cursor' as const,
      }
    },
  }
}

async function resolveCursorEndpoint(config: LlmConfig) {
  if (config.cursor.apiKey) {
    process.env.CURSOR_API_KEY = config.cursor.apiKey
  }
  process.env.CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE = 'false'

  const opts = await getOpenAIOptionsAsync({
    baseUrl: config.cursor.proxyUrl || undefined,
    apiKey: 'unused',
  })

  return {
    baseUrl: opts.baseURL,
    apiKey: opts.apiKey,
  }
}

export const cursorProvider: LlmProviderDefinition = {
  id: 'cursor',
  capabilities: CAPABILITIES,
  validateConfig() {
    // Cursor resolves auth dynamically via proxy; no static key required
  },
  resolveModel(config) {
    return resolveCursorModel(config.cursor.model)
  },
  async createAdapter(config, ctx) {
    if (ctx.hasImages) {
      if (!config.openai.apiKey) {
        throw createError({ statusCode: 502, message: CURSOR_IMAGE_ERROR })
      }
      return openaiProvider.createAdapter(config, ctx)
    }

    try {
      const endpoint = await resolveCursorEndpoint(config)
      const model = resolveCursorModel(config.cursor.model)
      return createCursorAdapter(config, endpoint, model)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw createError({
        statusCode: 500,
        message: `Cursor LLM setup failed: ${message}. See README — install \`agent\`, set NUXT_CURSOR_API_KEY, or run \`pnpm cursor-proxy\`.`,
      })
    }
  },
}

