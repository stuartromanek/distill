export type ParsedSong = {
  title: string
  artist: string
  album?: string
  confidence: 'high' | 'medium' | 'low'
  source: 'text' | 'image'
}

export type TidalTrackSummary = {
  id: string
  title: string
  artist: string
  album?: string
  albumArtUrl?: string
  score?: number
}

export type MatchStatus = 'matched' | 'ambiguous' | 'not_found' | 'manual'

export type MatchedSong = {
  parsed?: ParsedSong
  bestMatch?: TidalTrackSummary
  alternatives: TidalTrackSummary[]
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
  alternatives?: TidalTrackSummary[]
}

export type ReviewTrack = {
  id: string
  parsed?: ParsedSong
  selectedTrackId?: string
  selectedTrack?: TidalTrackSummary
  alternatives: TidalTrackSummary[]
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

export type WizardStep = 'connect' | 'input' | 'matching' | 'review' | 'done'

export type MatchingState = {
  parsing?: boolean
  current?: ParsedSong | null
  index: number
  total: number
}

export type TidalAuthStatus = {
  connected: boolean
  displayName?: string
  needsReconnect?: boolean
}

export type PlaylistMetadataSuggestion = {
  name: string
  description: string
}

export type PlaylistCreateResult = {
  playlistId: string
  url?: string
  failures?: { trackId: string; position: number }[]
}
