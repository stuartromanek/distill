import {
  DEFAULT_TIDAL_RATE_LIMIT,
  tidalFetchWithRateLimit,
  type TidalRateLimitOptions,
} from './tidal-rate-limit.ts'

const TIDAL_API = 'https://openapi.tidal.com/v2'
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token'

export type TidalClient = {
  fetch(path: string, init?: RequestInit): Promise<Response>
  countryCode: string
}

export function createTidalClient(
  accessToken: string,
  countryCode: string,
  rateLimitOpts: TidalRateLimitOptions = DEFAULT_TIDAL_RATE_LIMIT,
): TidalClient {
  return {
    countryCode,
    fetch(path: string, init: RequestInit = {}) {
      const separator = path.includes('?') ? '&' : '?'
      const url = path.startsWith('http')
        ? path
        : `${TIDAL_API}${path}${separator}countryCode=${countryCode}`

      return tidalFetchWithRateLimit(url, {
        ...init,
        headers: {
          Accept: 'application/vnd.api+json',
          ...(init.body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
          Authorization: `Bearer ${accessToken}`,
          ...init.headers,
        },
      }, rateLimitOpts)
    },
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

  const res = await fetch(TOKEN_URL, {
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

  const res = await fetch(TOKEN_URL, {
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

export { TOKEN_URL }
