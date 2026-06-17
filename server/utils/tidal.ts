import type { H3Event } from 'h3'
import { getTidalSession, setTidalSession } from './session'
import { createTidalClient } from './tidal-client'
import { getTidalRateLimitOptions } from './tidal-rate-limit'

const TIDAL_API = 'https://openapi.tidal.com/v2'
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token'

type TidalTokens = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

async function refreshAccessToken(event: H3Event, refreshToken: string) {
  const config = useRuntimeConfig(event)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.tidalClientId,
    client_secret: config.tidalClientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw createError({ statusCode: 401, message: 'Tidal session expired — please reconnect' })
  }

  const data = (await res.json()) as TidalTokens
  const session = getTidalSession(event)
  setTidalSession(event, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    displayName: session?.displayName,
  })
  return data.access_token
}

export async function getAccessToken(event: H3Event) {
  const session = getTidalSession(event)
  if (!session) {
    throw createError({ statusCode: 401, message: 'Not connected to Tidal' })
  }

  if (Date.now() >= session.expiresAt - 60_000) {
    return refreshAccessToken(event, session.refreshToken)
  }

  return session.accessToken
}

export async function tidalFetch(
  event: H3Event,
  path: string,
  options: RequestInit = {},
) {
  const config = useRuntimeConfig(event)
  const rateLimitOpts = getTidalRateLimitOptions(config)
  let token = await getAccessToken(event)
  let client = createTidalClient(token, config.tidalCountryCode, rateLimitOpts)
  let res = await client.fetch(path, options)

  if (res.status === 401) {
    const session = getTidalSession(event)
    if (!session?.refreshToken) {
      throw createError({ statusCode: 401, message: 'Tidal session expired — please reconnect' })
    }
    token = await refreshAccessToken(event, session.refreshToken)
    client = createTidalClient(token, config.tidalCountryCode, rateLimitOpts)
    res = await client.fetch(path, options)
    if (res.status === 401) {
      throw createError({ statusCode: 401, message: 'Tidal session expired — please reconnect' })
    }
  }

  return res
}

export async function exchangeCodeForTokens(
  event: H3Event,
  code: string,
  codeVerifier: string,
) {
  const config = useRuntimeConfig(event)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.tidalClientId,
    client_secret: config.tidalClientSecret,
    code,
    redirect_uri: config.tidalRedirectUri,
    code_verifier: codeVerifier,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw createError({ statusCode: 400, message: `Tidal auth failed: ${text}` })
  }

  return (await res.json()) as TidalTokens
}

export async function fetchUserProfile(event: H3Event, accessToken: string) {
  const config = useRuntimeConfig(event)
  const res = await fetch(
    `${TIDAL_API}/users/me?countryCode=${config.tidalCountryCode}`,
    {
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  if (!res.ok) return undefined

  const json = await res.json()
  return json?.data?.attributes?.username as string | undefined
}

export { TIDAL_API }
