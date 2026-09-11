import type { H3Event } from 'h3'
import type {
  MusicProviderId,
  ParsedSong,
  PlaylistCreateResult,
  TrackSummary,
} from '../../../shared/types/playlist'
import type { ParsedTitleMeta } from '../match-scoring.ts'
import type { ResolvedOAuthConfig } from './oauth.ts'

export type PlaylistInput = {
  name: string
  description?: string
  trackIds: string[]
}

export type PlaylistUpdateInput = PlaylistInput & {
  playlistId: string
}

export type MusicProviderCapabilities = {
  /** Provider can browse an artist's full catalog as a match strategy. */
  artistBrowse: boolean
  /** Provider can browse an album's tracklist as a match strategy. */
  albumBrowse: boolean
}

/** Result of a single match strategy: scored candidate tracks. */
export type StrategyResult = {
  strategy: string
  searchQuery: string
  candidates: TrackSummary[]
}

/**
 * Per-request, read-only client used for catalog search and the match cascade.
 * Built from a user token when available, otherwise app credentials.
 */
export interface MusicSearchClient {
  readonly providerId: MusicProviderId
  search(query: string, limit?: number): Promise<TrackSummary[]>
  getTrackById(id: string): Promise<TrackSummary | null>
  /** Optional advanced strategy: browse the artist's catalog. */
  artistDiscographyStrategy?(parsed: ParsedSong, parsedMeta: ParsedTitleMeta): Promise<StrategyResult>
  /** Optional advanced strategy: browse a matching album's tracklist. */
  albumTracklistStrategy?(parsed: ParsedSong, parsedMeta: ParsedTitleMeta): Promise<StrategyResult | null>
}

/**
 * Static, registry-level definition of a music streaming provider. Holds the
 * provider's OAuth shape plus factories for the per-request clients.
 */
export interface MusicProviderDefinition {
  readonly id: MusicProviderId
  readonly displayName: string
  readonly capabilities: MusicProviderCapabilities

  /** Resolve OAuth endpoints + credentials from runtime config. */
  oauthConfig(event: H3Event): ResolvedOAuthConfig
  /** Throw a 500 with a helpful message when required config is missing. */
  validateConfig(event: H3Event): void

  /** Catalog search/read client (user token preferred, app credentials fallback). */
  createSearchClient(event: H3Event): Promise<MusicSearchClient>
  /** Probe the current user session; true when still valid. */
  verifyConnection(event: H3Event): Promise<boolean>
  /** Create a playlist for the connected user and add tracks. */
  createPlaylist(event: H3Event, input: PlaylistInput): Promise<PlaylistCreateResult>
  /** Replace playlist metadata and tracklist on an existing playlist. */
  updatePlaylist(event: H3Event, input: PlaylistUpdateInput): Promise<PlaylistCreateResult>

  /** Parse a provider track URL into a track id, or null. */
  parseTrackUrl(url: string): string | null
  /** Public web URL for a track id. */
  trackUrl(id: string): string
}
