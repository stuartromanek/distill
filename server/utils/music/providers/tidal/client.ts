import { parseTidalLogPath } from '../../../request-log.ts'
import {
  DEFAULT_RATE_LIMIT,
  fetchWithRateLimit,
  toRateLimitInt,
  type RateLimitOptions,
} from '../../rate-limit.ts'

export const TIDAL_API = 'https://openapi.tidal.com/v2'
export const TIDAL_TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token'

export type TidalHttpClient = {
  fetch(path: string, init?: RequestInit): Promise<Response>
  countryCode: string
}

type TidalRateLimitConfig = {
  tidalMaxConcurrent?: number | string
  tidalMinIntervalMs?: number | string
  tidalMaxRetries?: number | string
}

export function getTidalRateLimitOptions(config?: TidalRateLimitConfig): RateLimitOptions {
  return {
    maxConcurrent: toRateLimitInt(config?.tidalMaxConcurrent, DEFAULT_RATE_LIMIT.maxConcurrent),
    minIntervalMs: toRateLimitInt(config?.tidalMinIntervalMs, DEFAULT_RATE_LIMIT.minIntervalMs),
    maxRetries: toRateLimitInt(config?.tidalMaxRetries, DEFAULT_RATE_LIMIT.maxRetries),
    baseBackoffMs: DEFAULT_RATE_LIMIT.baseBackoffMs,
  }
}

export async function getClientCredentialsToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TIDAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new Error(`Client credentials failed: ${await res.text()}`)
  }

  const json = await res.json() as { access_token: string }
  return json.access_token
}

export async function refreshUserAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TIDAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${await res.text()}`)
  }

  const json = await res.json() as { access_token: string }
  return json.access_token
}

export function createTidalHttpClient(
  accessToken: string,
  countryCode: string,
  rateLimitOpts: RateLimitOptions = DEFAULT_RATE_LIMIT,
): TidalHttpClient {
  return {
    countryCode,
    fetch(path: string, init: RequestInit = {}) {
      const separator = path.includes('?') ? '&' : '?'
      const url = path.startsWith('http')
        ? path
        : `${TIDAL_API}${path}${separator}countryCode=${countryCode}`

      return fetchWithRateLimit(
        { source: 'tidal', parsePath: parseTidalLogPath },
        url,
        {
          ...init,
          headers: {
            Accept: 'application/vnd.api+json',
            ...(init.body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
            Authorization: `Bearer ${accessToken}`,
            ...init.headers,
          },
        },
        rateLimitOpts,
      )
    },
  }
}
