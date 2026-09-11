import type { H3Event } from 'h3'
import { envVarName, getTidalCountryCode, tidalClientId } from '../../../env.ts'
import { callbackRedirectUri, type ResolvedOAuthConfig } from '../../oauth.ts'

const AUTHORIZE_URL = 'https://login.tidal.com/authorize'
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token'
const SCOPES = 'playlists.read playlists.write search.read'

export function tidalOAuthConfig(event: H3Event): ResolvedOAuthConfig {
  return {
    authorizeUrl: AUTHORIZE_URL,
    tokenUrl: TOKEN_URL,
    scopes: SCOPES,
    clientId: tidalClientId(),
    clientSecret: undefined,
    redirectUri: callbackRedirectUri(event, 'tidal'),
  }
}

export function tidalCountryCode(_event: H3Event): string {
  return getTidalCountryCode()
}

export function validateTidalConfig(): void {
  if (!tidalClientId()) {
    throw createError({ statusCode: 500, message: `${envVarName('TIDAL_CLIENT_ID')} is not configured` })
  }
}
