import { randomBytes } from 'node:crypto'
import type { LlmProviderId } from '../../shared/types/playlist'

const ENV_PREFIX = 'DST_'
const LLM_PROVIDER_IDS: LlmProviderId[] = ['openai', 'gemini', 'anthropic']

let devSessionPassword: string | null = null
let devSessionPasswordWarned = false

function readEnv(suffix: string): string {
  return process.env[`${ENV_PREFIX}${suffix}`]?.trim() ?? ''
}

export function envVarName(suffix: string): string {
  return `${ENV_PREFIX}${suffix}`
}

export function isSessionPasswordConfigured(): boolean {
  return readEnv('SESSION_PASSWORD').length >= 16
}

export function sessionPasswordFromEnv(): string {
  return readEnv('SESSION_PASSWORD')
}

/** Env value with `\\n` escape sequences expanded to newlines. */
export function readMultilineEnv(name: string): string {
  const raw = readEnv(name)
  if (!raw) return ''
  return raw.replace(/\\n/g, '\n')
}

function readIntEnv(name: string, fallback: number): number {
  const raw = readEnv(name)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isLlmProviderId(value: string): value is LlmProviderId {
  return LLM_PROVIDER_IDS.includes(value as LlmProviderId)
}

/** Session encryption key — required in production; ephemeral in dev when unset. */
export function sessionPassword(): string {
  const fromEnv = readEnv('SESSION_PASSWORD')
  if (fromEnv.length >= 16) return fromEnv

  if (process.env.NODE_ENV === 'production') {
    throw createError({
      statusCode: 500,
      message: `${envVarName('SESSION_PASSWORD')} must be set (16+ characters)`,
    })
  }

  if (!devSessionPassword) {
    devSessionPassword = randomBytes(32).toString('base64')
    if (!devSessionPasswordWarned) {
      devSessionPasswordWarned = true
      console.warn(
        `[distill] ${envVarName('SESSION_PASSWORD')} not set — using ephemeral dev key; sessions will not survive restart`,
      )
    }
  }
  return devSessionPassword
}

export function tidalClientId(): string {
  return readEnv('TIDAL_CLIENT_ID')
}

export function tidalClientSecret(): string {
  return readEnv('TIDAL_CLIENT_SECRET')
}

export function getTidalCountryCode(): string {
  return readEnv('TIDAL_COUNTRY_CODE') || 'US'
}

export function tidalMaxConcurrent(): number {
  return readIntEnv('TIDAL_MAX_CONCURRENT', 1)
}

export function tidalMinIntervalMs(): number {
  return readIntEnv('TIDAL_MIN_INTERVAL_MS', 300)
}

export function tidalMaxRetries(): number {
  return readIntEnv('TIDAL_MAX_RETRIES', 5)
}

export function spotifyClientId(): string {
  return readEnv('SPOTIFY_CLIENT_ID')
}

export function llmProvider(): LlmProviderId | null {
  const raw = readEnv('LLM_PROVIDER').toLowerCase()
  if (!raw) return null
  return isLlmProviderId(raw) ? raw : null
}

export function openaiApiKey(): string {
  return readEnv('OPENAI_API_KEY')
}

export function openaiBaseUrl(): string {
  return readEnv('OPENAI_BASE_URL') || 'https://api.openai.com/v1'
}

export function openaiModel(): string {
  return readEnv('OPENAI_MODEL') || 'auto'
}

export function geminiApiKey(): string {
  return readEnv('GEMINI_API_KEY')
}

export function geminiBaseUrl(): string {
  return readEnv('GEMINI_BASE_URL') || 'https://generativelanguage.googleapis.com/v1beta'
}

export function geminiModel(): string {
  return readEnv('GEMINI_MODEL') || 'gemini-2.5-flash'
}

export function anthropicApiKey(): string {
  return readEnv('ANTHROPIC_API_KEY')
}

export function anthropicBaseUrl(): string {
  return readEnv('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com/v1'
}

export function anthropicModel(): string {
  return readEnv('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514'
}

export function devUrl(): string {
  return readEnv('DEV_URL') || 'http://127.0.0.1:3000'
}

/** Optional public origin override for OAuth callbacks (e.g. https://127.0.0.1:3000). */
export function publicAppOrigin(): string | null {
  const raw = readEnv('PUBLIC_URL')
  if (!raw) return null
  try {
    const url = new URL(raw)
    const envPort = process.env.PORT?.trim()
    if (envPort && url.port !== envPort) {
      url.port = envPort
    }
    return url.origin
  }
  catch {
    return null
  }
}

/** Reset ephemeral dev session password (tests only). */
export function resetDevSessionPasswordForTests(): void {
  devSessionPassword = null
  devSessionPasswordWarned = false
}
