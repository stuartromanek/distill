import { getRequestURL, type H3Event } from 'h3'
import { spotifyClientId } from '../../../env.ts'
import { callbackRedirectUri, type ResolvedOAuthConfig } from '../../oauth.ts'

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SCOPES = 'playlist-modify-public playlist-modify-private'

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === 'localhost'
}

function spotifyRedirectUri(event: H3Event): string {
  let uri = callbackRedirectUri(event, 'spotify')
    .replace('//localhost:', '//127.0.0.1:')
    .replace('//localhost/', '//127.0.0.1/')

  const url = new URL(uri)
  let requestProto = url.protocol
  try {
    requestProto = getRequestURL(event, { xForwardedProto: true }).protocol
  }
  catch {
    // Some internal callers pass relative request URLs.
  }

  // On loopback dev, match the protocol the browser used to reach the app.
  if (process.env.NODE_ENV !== 'production' && isLoopbackHost(url.hostname)) {
    url.protocol = requestProto
    uri = url.toString()
  }

  return uri
}

export function spotifyOAuthConfig(event: H3Event): ResolvedOAuthConfig {
  return {
    authorizeUrl: AUTHORIZE_URL,
    tokenUrl: TOKEN_URL,
    scopes: SCOPES,
    clientId: spotifyClientId(),
    clientSecret: undefined,
    redirectUri: spotifyRedirectUri(event),
  }
}

export function validateSpotifyConfig(): void {
  if (!spotifyClientId()) {
    throw createError({ statusCode: 500, message: 'SPOTIFY_CLIENT_ID is not configured' })
  }
}
