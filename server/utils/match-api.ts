import type { H3Event } from 'h3'
import { createTidalClient, getClientCredentialsToken, type TidalClient } from './tidal-client'
import { getTidalRateLimitOptions } from './tidal-rate-limit'
import { getTidalSession } from './session'
import { getAccessToken } from './tidal'

let appTokenCache: { token: string; expiresAt: number } | null = null

async function tidalClientFromCredentials(event: H3Event): Promise<TidalClient> {
  const config = useRuntimeConfig(event)
  if (!config.tidalClientId || !config.tidalClientSecret) {
    throw createError({
      statusCode: 503,
      message: 'Tidal search unavailable — set NUXT_TIDAL_CLIENT_ID and NUXT_TIDAL_CLIENT_SECRET in .env',
    })
  }

  const now = Date.now()
  if (!appTokenCache || now >= appTokenCache.expiresAt) {
    const token = await getClientCredentialsToken(config.tidalClientId, config.tidalClientSecret)
    appTokenCache = { token, expiresAt: now + 55 * 60_000 }
  }

  return createTidalClient(
    appTokenCache.token,
    config.tidalCountryCode,
    getTidalRateLimitOptions(config),
  )
}

export async function tidalClientFromEvent(event: H3Event): Promise<TidalClient> {
  const config = useRuntimeConfig(event)
  const token = await getAccessToken(event)
  return createTidalClient(
    token,
    config.tidalCountryCode,
    getTidalRateLimitOptions(config),
  )
}

/** Catalog search/read — prefers user session, falls back to app client credentials. */
export async function tidalClientForSearch(event: H3Event): Promise<TidalClient> {
  if (getTidalSession(event)) {
    try {
      return await tidalClientFromEvent(event)
    } catch {
      // User token expired or invalid — app credentials can still search the catalog
    }
  }
  return tidalClientFromCredentials(event)
}
