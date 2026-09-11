import { parseSpotifyLogPath } from '../../../request-log.ts'
import {
  DEFAULT_RATE_LIMIT,
  fetchWithRateLimit,
  type RateLimitOptions,
} from '../../rate-limit.ts'

export const SPOTIFY_API = 'https://api.spotify.com/v1'

export type SpotifyHttpClient = {
  fetch(path: string, init?: RequestInit): Promise<Response>
}

export function createSpotifyHttpClient(
  accessToken: string,
  rateLimitOpts: RateLimitOptions = DEFAULT_RATE_LIMIT,
): SpotifyHttpClient {
  return {
    fetch(path: string, init: RequestInit = {}) {
      const url = path.startsWith('http') ? path : `${SPOTIFY_API}${path}`
      return fetchWithRateLimit(
        { source: 'spotify', parsePath: parseSpotifyLogPath },
        url,
        {
          ...init,
          headers: {
            Accept: 'application/json',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            Authorization: `Bearer ${accessToken}`,
            ...init.headers,
          },
        },
        rateLimitOpts,
      )
    },
  }
}
