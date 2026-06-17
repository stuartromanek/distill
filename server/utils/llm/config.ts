import type { LlmConfig, LlmProviderId } from './types.ts'

const PROVIDER_IDS: LlmProviderId[] = ['cursor', 'openai', 'gemini', 'anthropic']

function parseProvider(raw: string | undefined): LlmProviderId {
  const value = (raw ?? 'cursor').trim().toLowerCase()
  if (PROVIDER_IDS.includes(value as LlmProviderId)) {
    return value as LlmProviderId
  }
  return 'cursor'
}

function configFromEnv(): LlmConfig {
  return {
    provider: parseProvider(process.env.NUXT_LLM_PROVIDER),
    openai: {
      apiKey: process.env.NUXT_OPENAI_API_KEY ?? '',
      baseUrl: process.env.NUXT_OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      model: process.env.NUXT_OPENAI_MODEL ?? 'auto',
    },
    cursor: {
      apiKey: process.env.NUXT_CURSOR_API_KEY ?? '',
      proxyUrl: process.env.NUXT_CURSOR_PROXY_URL ?? 'http://127.0.0.1:8765',
      model: process.env.NUXT_OPENAI_MODEL ?? 'auto',
    },
    gemini: {
      apiKey: process.env.NUXT_GEMINI_API_KEY ?? '',
      baseUrl: process.env.NUXT_GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta',
      model: process.env.NUXT_GEMINI_MODEL ?? 'gemini-2.5-flash',
    },
    anthropic: {
      apiKey: process.env.NUXT_ANTHROPIC_API_KEY ?? '',
      baseUrl: process.env.NUXT_ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1',
      model: process.env.NUXT_ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
    },
  }
}

export function readLlmConfig(): LlmConfig {
  try {
    const config = useRuntimeConfig()
    return {
      provider: parseProvider(config.llmProvider),
      openai: {
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        model: config.openaiModel,
      },
      cursor: {
        apiKey: config.cursorApiKey,
        proxyUrl: config.cursorProxyUrl,
        model: config.openaiModel,
      },
      gemini: {
        apiKey: config.geminiApiKey,
        baseUrl: config.geminiBaseUrl,
        model: config.geminiModel,
      },
      anthropic: {
        apiKey: config.anthropicApiKey,
        baseUrl: config.anthropicBaseUrl,
        model: config.anthropicModel,
      },
    }
  } catch {
    return configFromEnv()
  }
}

export function isHttpError(err: unknown): err is { statusCode: number } {
  return Boolean(
    err &&
    typeof err === 'object' &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number',
  )
}

export { PROVIDER_IDS }
