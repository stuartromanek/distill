import type { H3Event } from 'h3'
import { getProviderSession } from '../../../session.ts'
import { getValidAccessToken } from '../../oauth.ts'
import type { MusicProviderDefinition, MusicSearchClient } from '../../types.ts'
import { createSpotifyHttpClient } from './client.ts'
import { spotifyOAuthConfig, validateSpotifyConfig } from './config.ts'
import { createSpotifySearchClient } from './search.ts'
import { createSpotifyPlaylist, updateSpotifyPlaylist, verifySpotifyConnection } from './api.ts'
import { parseSpotifyTrackUrl, spotifyTrackBrowseUrl } from './url.ts'

export const spotifyProvider: MusicProviderDefinition = {
  id: 'spotify',
  displayName: 'Spotify',
  capabilities: { artistBrowse: false, albumBrowse: false },

  oauthConfig: spotifyOAuthConfig,
  validateConfig: validateSpotifyConfig,

  async createSearchClient(event: H3Event): Promise<MusicSearchClient> {
    if (!getProviderSession(event, 'spotify')) {
      throw createError({ statusCode: 401, message: 'Connect Spotify first' })
    }

    const token = await getValidAccessToken(event, 'spotify', spotifyOAuthConfig(event))
    return createSpotifySearchClient(createSpotifyHttpClient(token))
  },

  verifyConnection: verifySpotifyConnection,
  createPlaylist: createSpotifyPlaylist,
  updatePlaylist: updateSpotifyPlaylist,

  parseTrackUrl: parseSpotifyTrackUrl,
  trackUrl: spotifyTrackBrowseUrl,
}
