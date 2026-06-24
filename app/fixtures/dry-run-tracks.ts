import type {
  MatchedSong,
  ParsedSong,
  PlaylistMetadataSuggestion,
  ReviewTrack,
  TidalTrackSummary,
} from '../../shared/types/playlist'

function newId() {
  return crypto.randomUUID()
}

const track = (
  id: string,
  artist: string,
  title: string,
  score?: number,
): TidalTrackSummary => ({
  id,
  artist,
  title,
  album: 'Dry Run Album',
  score,
})

const parsed = (
  artist: string,
  title: string,
  source: 'text' | 'image' = 'text',
): ParsedSong => ({
  artist,
  title,
  confidence: 'high',
  source,
})

function buildReviewTrack(
  match: MatchedSong,
  overrides?: Partial<ReviewTrack>,
): ReviewTrack {
  const searchQuery = match.parsed
    ? `${match.parsed.artist} ${match.parsed.title}`
    : undefined

  const row: ReviewTrack = {
    id: newId(),
    parsed: match.parsed,
    selectedTrackId: match.bestMatch?.id,
    selectedTrack: match.bestMatch,
    alternatives: match.alternatives,
    status: match.status,
    autoMatch: match.bestMatch
      ? {
          trackId: match.bestMatch.id,
          title: match.bestMatch.title,
          artist: match.bestMatch.artist,
          score: match.bestMatch.score,
          searchQuery,
          strategyUsed: match.strategyUsed,
          alternatives: match.alternatives,
        }
      : searchQuery
        ? { searchQuery, strategyUsed: match.strategyUsed, alternatives: match.alternatives }
        : undefined,
    ...overrides,
  }

  return row
}

const DRY_RUN_MATCHED: MatchedSong = {
  parsed: parsed('Radiohead', 'Creep'),
  status: 'matched',
  strategyUsed: 'dry-run',
  bestMatch: track('dry-run-001', 'Radiohead', 'Creep', 0.97),
  alternatives: [
    track('dry-run-001a', 'Radiohead', 'Creep (Live)'),
    track('dry-run-001b', 'Radiohead', 'Creep (Acoustic)'),
  ],
}

const DRY_RUN_MANUAL_AUTO = track('dry-run-002a', 'Björk', 'Hyperballad (Remaster)', 0.72)
const DRY_RUN_MANUAL_PICK = track('dry-run-002b', 'Björk', 'Hyperballad', 0.95)

const DRY_RUN_MANUAL: MatchedSong = {
  parsed: parsed('Björk', 'Hyperballad'),
  status: 'manual',
  strategyUsed: 'dry-run',
  bestMatch: DRY_RUN_MANUAL_PICK,
  alternatives: [DRY_RUN_MANUAL_AUTO],
}

const DRY_RUN_AMBIGUOUS: MatchedSong = {
  parsed: parsed('Denzel Curry', 'LIT EFFECT'),
  status: 'ambiguous',
  strategyUsed: 'dry-run',
  bestMatch: track('dry-run-003a', 'Denzel Curry', 'LIT EFFECT', 0.68),
  alternatives: [
    track('dry-run-003b', 'Denzel Curry', 'LIT EFFECT (feat. BKTHERULA)'),
    track('dry-run-003c', 'Denzel Curry', 'Lit Effect'),
  ],
}

const DRY_RUN_NOT_FOUND: MatchedSong = {
  parsed: parsed('Obscure Artist', 'Unreleased Demo'),
  status: 'not_found',
  strategyUsed: 'dry-run',
  alternatives: [],
}

export const DRY_RUN_MATCHES: MatchedSong[] = [
  DRY_RUN_MATCHED,
  DRY_RUN_MANUAL,
  DRY_RUN_AMBIGUOUS,
  DRY_RUN_NOT_FOUND,
]

export function dryRunParsedSongs(): ParsedSong[] {
  return DRY_RUN_MATCHES.map(m => m.parsed!).filter(Boolean)
}

export function dryRunPlaylistSuggestion(): PlaylistMetadataSuggestion {
  return {
    name: 'Dry Run Radio Mix',
    description: 'A test playlist spanning alt rock, art pop, rap, and one unresolved demo.',
  }
}

export function dryRunMatchToReviewTrack(match: MatchedSong): ReviewTrack {
  if (match === DRY_RUN_MANUAL) {
    return buildReviewTrack(match, {
      status: 'manual',
      selectedTrack: DRY_RUN_MANUAL_PICK,
      selectedTrackId: DRY_RUN_MANUAL_PICK.id,
      autoMatch: {
        trackId: DRY_RUN_MANUAL_AUTO.id,
        title: DRY_RUN_MANUAL_AUTO.title,
        artist: DRY_RUN_MANUAL_AUTO.artist,
        score: DRY_RUN_MANUAL_AUTO.score,
        searchQuery: 'Björk Hyperballad',
        strategyUsed: 'dry-run',
        alternatives: match.alternatives,
      },
    })
  }

  return buildReviewTrack(match)
}

export function dryRunAppendMatch(): MatchedSong {
  return {
    parsed: parsed('Portishead', 'Glory Box'),
    status: 'matched',
    strategyUsed: 'dry-run',
    bestMatch: track('dry-run-005', 'Portishead', 'Glory Box', 0.91),
    alternatives: [],
  }
}

export function dryRunSearchResults(_query: string): TidalTrackSummary[] {
  return [
    track('dry-run-search-1', 'Dry Run Artist', 'Search Result A', 0.88),
    track('dry-run-search-2', 'Dry Run Artist', 'Search Result B', 0.81),
  ]
}

export function dryRunResolveUrl(url: string): TidalTrackSummary {
  if (!/tidal\.com\/browse\/track\//i.test(url) && !url.startsWith('dry-run-')) {
    throw new Error('Paste a Tidal track URL (dry run accepts tidal.com/browse/track/…)')
  }
  return track('dry-run-resolve-1', 'Resolved Artist', 'Resolved Track', 1)
}
