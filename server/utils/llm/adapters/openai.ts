import type { LlmAdapter, LlmCompleteInput, LlmConfig, LlmProviderDefinition } from '../types.ts'
import { postChatCompletions, resolveOpenAiVisionModel } from '../transport/openai-chat.ts'

const CAPABILITIES = {
  vision: true,
  jsonMode: 'openai_response_format' as const,
}

function validateOpenAiConfig(config: LlmConfig): void {
  if (!config.openai.apiKey) {
    throw createError({
      statusCode: 500,
      message: 'NUXT_OPENAI_API_KEY is not configured',
    })
  }
}

function resolveModel(config: LlmConfig, ctx: { hasImages: boolean }): string {
  if (ctx.hasImages) {
    return resolveOpenAiVisionModel(config.openai.model)
  }
  return config.openai.model.trim() || 'gpt-4o-mini'
}

export function createOpenAiAdapter(config: LlmConfig, model: string): LlmAdapter {
  return {
    id: 'openai',
    capabilities: CAPABILITIES,
    model,
    async complete(input: LlmCompleteInput) {
      const { raw, durationMs } = await postChatCompletions({
        baseUrl: config.openai.baseUrl,
        apiKey: config.openai.apiKey,
        model,
        systemPrompt: input.systemPrompt,
        parts: input.parts,
        jsonMode: true,
        logLabel: 'parse',
        providerId: 'openai',
      })

      return {
        raw,
        model,
        durationMs,
        provider: 'openai' as const,
      }
    },
  }
}

export const openaiProvider: LlmProviderDefinition = {
  id: 'openai',
  capabilities: CAPABILITIES,
  validateConfig: validateOpenAiConfig,
  resolveModel,
  async createAdapter(config, ctx) {
    validateOpenAiConfig(config)
    const model = resolveModel(config, ctx)
    return createOpenAiAdapter(config, model)
  },
}
