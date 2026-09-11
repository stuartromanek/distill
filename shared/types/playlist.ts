export type MusicProviderId = 'tidal' | 'spotify'

export type MusicProviderInfo = {
  id: MusicProviderId
  name: string
}

export const MUSIC_PROVIDERS: MusicProviderInfo[] = [
  { id: 'tidal', name: 'Tidal' },
  { id: 'spotify', name: 'Spotify' },
]

export function musicProviderName(id: MusicProviderId): string {
  return MUSIC_PROVIDERS.find(p => p.id === id)?.name ?? id
}

/** Public web URL for a track on the given provider. */
export function trackBrowseUrl(provider: MusicProviderId, id: string): string {
  return provider === 'spotify'
    ? `https://open.spotify.com/track/${id}`
    : `https://tidal.com/browse/track/${id}`
}

export type ParsedSong = {
  title: string
  artist: string
  album?: string
  confidence: 'high' | 'medium' | 'low'
  source: 'text' | 'image'
}

export type TrackSummary = {
  id: string
  title: string
  artist: string
  album?: string
  albumArtUrl?: string
  score?: number
}

/** @deprecated use TrackSummary — kept for backwards compatibility. */
export type TidalTrackSummary = TrackSummary

export type MatchStatus = 'matched' | 'ambiguous' | 'not_found' | 'manual'

export type MatchedSong = {
  parsed?: ParsedSong
  bestMatch?: TrackSummary
  alternatives: TrackSummary[]
  status: MatchStatus
  strategyUsed?: string
}

export type ReviewTrackAutoMatch = {
  trackId?: string
  title?: string
  artist?: string
  score?: number
  searchQuery?: string
  strategyUsed?: string
  alternatives?: TrackSummary[]
}

export type ReviewTrack = {
  id: string
  parsed?: ParsedSong
  selectedTrackId?: string
  selectedTrack?: TrackSummary
  alternatives: TrackSummary[]
  status: MatchStatus
  autoMatch?: ReviewTrackAutoMatch
}

export type MatchFixture = {
  id: string
  input: Pick<ParsedSong, 'artist' | 'title' | 'album'>
  expectedTrackId: string
  expectedUrl?: string
  source?: 'reference-playlist' | 'manual' | 'feedback'
  notes?: string
}

export type WizardStep = 'connect' | 'input' | 'matching' | 'review'

export type MatchingState = {
  parsing?: boolean
  paused?: boolean
  current?: ParsedSong | null
  index: number
  total: number
}

export type AuthStatus = {
  connected: boolean
  provider?: MusicProviderId
  displayName?: string
  needsReconnect?: boolean
  error?: string
}

/** @deprecated use AuthStatus — kept for backwards compatibility. */
export type TidalAuthStatus = AuthStatus

export type PlaylistMetadataSuggestion = {
  name: string
  description: string
}

export type PlaylistCreateResult = {
  playlistId: string
  url?: string
  failures?: { trackId: string; position: number }[]
}

export type LlmProviderId = 'openai' | 'gemini' | 'anthropic'

export type LlmProviderInfo = {
  id: LlmProviderId
  name: string
}

export const LLM_PROVIDERS: LlmProviderInfo[] = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'gemini', name: 'Gemini' },
]

export function llmProviderName(id: LlmProviderId): string {
  if (id === 'anthropic') return 'Anthropic'
  return LLM_PROVIDERS.find(p => p.id === id)?.name ?? id
}
