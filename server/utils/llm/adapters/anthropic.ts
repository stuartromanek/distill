import type { LlmProviderDefinition } from '../types.ts'

// Future: POST {baseUrl}/messages
// system: systemPrompt
// messages: [{ role: 'user', content: [{ type: 'text' }, { type: 'image', source: { type: 'base64', ... } }] }]
// Do NOT route through cursor-api-proxy (strips images like OpenAI compat path)

const CAPABILITIES = {
  vision: true,
  jsonMode: 'prompt_only' as const,
}

export const anthropicProvider: LlmProviderDefinition = {
  id: 'anthropic',
  capabilities: CAPABILITIES,
  validateConfig(config) {
    if (!config.anthropic.apiKey) {
      throw createError({
        statusCode: 500,
        message: 'NUXT_ANTHROPIC_API_KEY is not configured',
      })
    }
  },
  resolveModel(config) {
    return config.anthropic.model.trim() || 'claude-sonnet-4-20250514'
  },
  async createAdapter() {
    throw createError({
      statusCode: 501,
      message: 'Anthropic provider not implemented yet. Set NUXT_LLM_PROVIDER=gemini or openai.',
    })
  },
}
