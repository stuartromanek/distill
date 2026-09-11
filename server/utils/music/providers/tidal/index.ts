import type { H3Event } from 'h3'
import { getProviderSession } from '../../../session.ts'
import { getValidAccessToken } from '../../oauth.ts'
import type { MusicProviderDefinition, MusicSearchClient } from '../../types.ts'
import {
  tidalMaxConcurrent,
  tidalMaxRetries,
  tidalMinIntervalMs,
} from '../../../env.ts'
import { createTidalHttpClient, getTidalRateLimitOptions } from './client.ts'
import { tidalCountryCode, tidalOAuthConfig, validateTidalConfig } from './config.ts'
import { createTidalSearchClient } from './search.ts'
import { createTidalPlaylist, updateTidalPlaylist, verifyTidalConnection } from './api.ts'
import { parseTidalTrackUrl, tidalTrackBrowseUrl } from './url.ts'

export const tidalProvider: MusicProviderDefinition = {
  id: 'tidal',
  displayName: 'Tidal',
  capabilities: { artistBrowse: true, albumBrowse: true },

  oauthConfig: tidalOAuthConfig,
  validateConfig: validateTidalConfig,

  async createSearchClient(event: H3Event): Promise<MusicSearchClient> {
    const rateLimitOpts = getTidalRateLimitOptions({
      tidalMaxConcurrent: tidalMaxConcurrent(),
      tidalMinIntervalMs: tidalMinIntervalMs(),
      tidalMaxRetries: tidalMaxRetries(),
    })
    const country = tidalCountryCode(event)

    if (!getProviderSession(event, 'tidal')) {
      throw createError({ statusCode: 401, message: 'Connect Tidal first' })
    }

    const token = await getValidAccessToken(event, 'tidal', tidalOAuthConfig(event))
    return createTidalSearchClient(createTidalHttpClient(token, country, rateLimitOpts))
  },

  verifyConnection: verifyTidalConnection,
  createPlaylist: createTidalPlaylist,
  updatePlaylist: updateTidalPlaylist,

  parseTrackUrl: parseTidalTrackUrl,
  trackUrl: tidalTrackBrowseUrl,
}
