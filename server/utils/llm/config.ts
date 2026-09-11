import type { LlmProviderId } from '../../../shared/types/playlist'
import type { LlmConfig } from './types.ts'
import {
  anthropicApiKey,
  anthropicBaseUrl,
  anthropicModel,
  geminiApiKey,
  geminiBaseUrl,
  geminiModel,
  llmProvider as readLlmProvider,
  envVarName,
  openaiApiKey,
  openaiBaseUrl,
  openaiModel,
} from '../env.ts'

const PROVIDER_IDS: LlmProviderId[] = ['openai', 'gemini', 'anthropic']

export type LlmCredentialSource = 'server' | 'browser'

function isProviderId(value: string): value is LlmProviderId {
  return PROVIDER_IDS.includes(value as LlmProviderId)
}

export type LlmRequestKeys = {
  openai?: string
  gemini?: string
}

function requestKeyForProvider(
  requestKeys: LlmRequestKeys | undefined,
  provider: LlmProviderId,
): string | undefined {
  if (!requestKeys) return undefined
  if (provider === 'openai') return requestKeys.openai
  if (provider === 'gemini') return requestKeys.gemini
  return undefined
}

export function inferCredentialSource(
  override?: LlmProviderId,
  requestKeys?: LlmRequestKeys,
): LlmCredentialSource {
  if (!override || !requestKeys) return 'server'
  const key = requestKeyForProvider(requestKeys, override)?.trim()
  return key ? 'browser' : 'server'
}

function resolveProvider(override: LlmProviderId | undefined, source: LlmCredentialSource): LlmProviderId {
  if (source === 'browser') {
    if (!override || !isProviderId(override) || override === 'anthropic') {
      throw createError({
        statusCode: 400,
        message: 'LLM provider must be openai or gemini when using a browser API key',
      })
    }
    return override
  }

  const fromEnv = readLlmProvider()
  if (fromEnv) return fromEnv
  if (override && isProviderId(override)) return override
  throw createError({
    statusCode: 400,
    message: `LLM provider not configured — set ${envVarName('LLM_PROVIDER')} or select a provider in the app`,
  })
}

function resolveApiKey(
  envKey: string,
  requestKey: string | undefined,
  source: LlmCredentialSource,
): string {
  if (source === 'browser') return requestKey?.trim() ?? ''
  return envKey
}

function buildLlmConfig(
  provider: LlmProviderId,
  requestKeys: LlmRequestKeys | undefined,
  source: LlmCredentialSource,
): LlmConfig {
  return {
    provider,
    openai: {
      apiKey: resolveApiKey(openaiApiKey(), requestKeys?.openai, source),
      baseUrl: openaiBaseUrl(),
      model: openaiModel(),
    },
    gemini: {
      apiKey: resolveApiKey(geminiApiKey(), requestKeys?.gemini, source),
      baseUrl: geminiBaseUrl(),
      model: geminiModel(),
    },
    anthropic: {
      apiKey: resolveApiKey(anthropicApiKey(), undefined, source),
      baseUrl: anthropicBaseUrl(),
      model: anthropicModel(),
    },
  }
}

export function readLlmConfig(override?: LlmProviderId, requestKeys?: LlmRequestKeys) {
  const source = inferCredentialSource(override, requestKeys)
  const provider = resolveProvider(override, source)
  return buildLlmConfig(provider, requestKeys, source)
}

export function isServerLlmConfigured(): boolean {
  const locked = readLlmProvider()
  if (locked === 'openai') return Boolean(openaiApiKey())
  if (locked === 'gemini') return Boolean(geminiApiKey())
  if (locked === 'anthropic') return false
  return Boolean(openaiApiKey() || geminiApiKey())
}

export function readLlmEnvProvider(): LlmProviderId | null {
  return readLlmProvider()
}

export function readDefaultServerProvider(): LlmProviderId | null {
  const locked = readLlmProvider()
  if (locked) return locked
  if (openaiApiKey()) return 'openai'
  if (geminiApiKey()) return 'gemini'
  return null
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
