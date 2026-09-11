import type { LlmAdapter, LlmCompleteInput, LlmConfig, LlmContentPart, LlmProviderDefinition } from '../types.ts'
import { envVarName } from '../../env.ts'
import { loggedLlmFetch, parseGeminiLogPath } from '../http.ts'

const CAPABILITIES = {
  vision: true,
  jsonMode: 'native' as const,
}

function partsToGemini(parts: LlmContentPart[]): Array<Record<string, unknown>> {
  return parts.map((part) => {
    if (part.type === 'text') {
      return { text: part.text }
    }
    return {
      inlineData: {
        mimeType: part.mime,
        data: part.base64,
      },
    }
  })
}

function validateGeminiConfig(config: LlmConfig): void {
  if (!config.gemini.apiKey) {
    throw createError({
      statusCode: 500,
      message: `${envVarName('GEMINI_API_KEY')} is not configured`,
    })
  }
}

export function createGeminiAdapter(config: LlmConfig, model: string): LlmAdapter {
  return {
    id: 'gemini',
    capabilities: CAPABILITIES,
    model,
    async complete(input: LlmCompleteInput) {
      const baseUrl = config.gemini.baseUrl.replace(/\/$/, '')
      const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.gemini.apiKey)}`
      const { path, label } = parseGeminiLogPath(model)

      const body: Record<string, unknown> = {
        systemInstruction: {
          parts: [{ text: input.systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: partsToGemini(input.parts),
          },
        ],
        generationConfig: {
          temperature: 0.2,
          ...(input.jsonMode !== false ? { responseMimeType: 'application/json' } : {}),
        },
      }

      const { response, durationMs } = await loggedLlmFetch({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        logPath: path,
        logLabel: label,
      })

      if (!response.ok) {
        const err = await response.text()
        let message = `Gemini request failed: ${err}`
        try {
          const parsed = JSON.parse(err) as { error?: { code?: number; message?: string } }
          if (parsed.error?.code === 429) {
            message = `Gemini rate limit exceeded for model "${model}". Try GEMINI_MODEL=gemini-2.5-flash or check billing at https://ai.google.dev/gemini-api/docs/rate-limits`
          } else if (parsed.error?.message) {
            message = `Gemini request failed: ${parsed.error.message}`
          }
        } catch { /* use raw err */ }
        throw createError({ statusCode: 502, message })
      }

      const json = await response.json()
      const candidate = json.candidates?.[0]
      const blockReason = candidate?.finishReason ?? json.promptFeedback?.blockReason
      if (blockReason && blockReason !== 'STOP') {
        throw createError({
          statusCode: 502,
          message: `Gemini blocked response: ${blockReason}`,
        })
      }

      const raw = candidate?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim()

      if (!raw) {
        throw createError({ statusCode: 502, message: 'Empty Gemini response' })
      }

      return {
        raw,
        model,
        durationMs,
        provider: 'gemini' as const,
      }
    },
  }
}

export const geminiProvider: LlmProviderDefinition = {
  id: 'gemini',
  capabilities: CAPABILITIES,
  validateConfig: validateGeminiConfig,
  resolveModel(config) {
    return config.gemini.model.trim() || 'gemini-2.5-flash'
  },
  async createAdapter(config, _ctx) {
    validateGeminiConfig(config)
    const model = config.gemini.model.trim() || 'gemini-2.5-flash'
    return createGeminiAdapter(config, model)
  },
}
