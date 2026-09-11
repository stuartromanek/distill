import type { H3Event } from 'h3'
import type { MusicProviderId } from '../../../shared/types/playlist'
import { requestPublicOrigin } from '../request-origin.ts'
import { getProviderSession, setProviderSession } from '../session.ts'

export type ResolvedOAuthConfig = {
  authorizeUrl: string
  tokenUrl: string
  scopes: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  /** Send client credentials via HTTP Basic auth header instead of body params. */
  useBasicAuth?: boolean
}

export type OAuthTokens = {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
}

export function callbackRedirectUri(event: H3Event, providerId: MusicProviderId): string {
  return new URL(`/api/oauth/callback/${providerId}`, requestPublicOrigin(event)).toString()
}

export function buildAuthorizeUrl(
  cfg: ResolvedOAuthConfig,
  params: { codeChallenge: string; state: string },
): string {
  const search = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
    code_challenge_method: 'S256',
    code_challenge: params.codeChallenge,
    state: params.state,
  })
  return `${cfg.authorizeUrl}?${search}`
}

function authHeaders(cfg: ResolvedOAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (cfg.useBasicAuth && cfg.clientSecret) {
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
    headers.Authorization = `Basic ${basic}`
  }
  return headers
}

function withClientCredentials(body: URLSearchParams, cfg: ResolvedOAuthConfig) {
  if (cfg.useBasicAuth && cfg.clientSecret) return body
  body.set('client_id', cfg.clientId)
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret)
  return body
}

export async function exchangeCodeForTokens(
  cfg: ResolvedOAuthConfig,
  params: { code: string; codeVerifier: string },
): Promise<OAuthTokens> {
  const body = withClientCredentials(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: cfg.redirectUri,
      code_verifier: params.codeVerifier,
    }),
    cfg,
  )

  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: authHeaders(cfg),
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw createError({ statusCode: 400, message: `Auth failed: ${text}` })
  }

  return (await res.json()) as OAuthTokens
}

export async function refreshTokens(
  cfg: ResolvedOAuthConfig,
  refreshToken: string,
): Promise<OAuthTokens> {
  const body = withClientCredentials(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    cfg,
  )

  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: authHeaders(cfg),
    body,
  })

  if (!res.ok) {
    throw createError({ statusCode: 401, message: 'Session expired — please reconnect' })
  }

  return (await res.json()) as OAuthTokens
}

/**
 * Returns a valid user access token for the given provider, refreshing
 * (and re-persisting the session) when it is near expiry.
 */
export async function getValidAccessToken(
  event: H3Event,
  provider: MusicProviderId,
  cfg: ResolvedOAuthConfig,
): Promise<string> {
  const session = getProviderSession(event, provider)
  if (!session) {
    throw createError({ statusCode: 401, message: 'Not connected' })
  }

  if (Date.now() < session.expiresAt - 60_000) {
    return session.accessToken
  }

  const tokens = await refreshTokens(cfg, session.refreshToken)
  setProviderSession(event, provider, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    displayName: session.displayName,
  })
  return tokens.access_token
}
