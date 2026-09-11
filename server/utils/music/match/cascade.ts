import type { ParsedSong, TrackSummary } from '../../../../shared/types/playlist'
import type { MusicSearchClient, StrategyResult } from '../types.ts'
import {
  SCORE_WEIGHTS,
  ARTIST_GATE_MIN,
  COLLISION_ARTIST_MIN,
  artistSimilarity,
  isCollisionProneTitle,
  normalizeArtistForSearch,
  normalizeTitleForSearch,
  scoreTrack,
  featuredVerificationScore,
  hasStudioPreference,
  parseTitleMetadata,
  type ParsedTitleMeta,
} from '../../match-scoring.ts'

export type MatchCascadeResult = {
  allScored: TrackSummary[]
  strategyUsed: string
  searchQuery: string
}

const EARLY_EXIT_SCORE = 0.85
const FEAT_EXPAND_THRESHOLD = 0.75
const COMBINED_SEARCH_LIMIT = 20
const COLLISION_COMBINED_SEARCH_LIMIT = 20

/** Provider-agnostic query string for the primary "artist title [album]" search. */
export function buildMatchQuery(
  parsed: Pick<ParsedSong, 'artist' | 'title' | 'album'>,
): string {
  const titleBase = normalizeTitleForSearch(parseTitleMetadata(parsed.title).base)
  const artist = normalizeArtistForSearch(parsed.artist)
  return parsed.album
    ? `${artist} ${titleBase} ${normalizeTitleForSearch(parsed.album)}`
    : `${artist} ${titleBase}`
}

function compareCandidates(
  a: TrackSummary,
  b: TrackSummary,
  parsedMeta: ParsedTitleMeta,
  parsedArtist: string,
) {
  const scoreDiff = (b.score ?? 0) - (a.score ?? 0)
  const aArtistSim = artistSimilarity(parsedArtist, a.artist)
  const bArtistSim = artistSimilarity(parsedArtist, b.artist)

  if (isCollisionProneTitle(parsedMeta) && Math.abs(scoreDiff) <= 0.15) {
    const artistDiff = bArtistSim - aArtistSim
    if (Math.abs(artistDiff) > 0.001) return artistDiff
  }

  if (Math.abs(scoreDiff) <= 0.15) {
    const studioDiff =
      hasStudioPreference(parsedMeta, b.title) - hasStudioPreference(parsedMeta, a.title)
    if (studioDiff !== 0) return studioDiff
  }

  const aFailsGate = aArtistSim < ARTIST_GATE_MIN
  const bFailsGate = bArtistSim < ARTIST_GATE_MIN
  if (aFailsGate !== bFailsGate && Math.abs(scoreDiff) <= 0.2) {
    return aFailsGate ? 1 : -1
  }

  if (Math.abs(scoreDiff) > 0.001) return scoreDiff

  const featDiff =
    featuredVerificationScore(parsedMeta, b.title, b.artist)
    - featuredVerificationScore(parsedMeta, a.title, a.artist)
  if (Math.abs(featDiff) > 0.001) return featDiff

  const artistTieBreak = bArtistSim - aArtistSim
  if (Math.abs(artistTieBreak) > 0.001) return artistTieBreak

  return hasStudioPreference(parsedMeta, b.title) - hasStudioPreference(parsedMeta, a.title)
}

/** Score candidate tracks against the parsed song and sort best-first. */
export function scoreCandidates(
  parsed: ParsedSong,
  candidates: TrackSummary[],
  weights: typeof SCORE_WEIGHTS[keyof typeof SCORE_WEIGHTS],
  parsedMeta: ParsedTitleMeta,
) {
  return candidates
    .map(c => ({
      ...c,
      score: scoreTrack(parsed, c.title, c.artist, weights),
    }))
    .sort((a, b) => compareCandidates(a, b, parsedMeta, parsed.artist))
}

export function bestScore(candidates: TrackSummary[]) {
  return candidates[0]?.score ?? 0
}

type ScoredWithStrategy = TrackSummary & { strategy: string }

function mergeCandidates(
  pool: ScoredWithStrategy[],
  parsedMeta: ParsedTitleMeta,
  parsedArtist: string,
): TrackSummary[] {
  const byId = new Map<string, ScoredWithStrategy>()
  for (const c of pool) {
    const existing = byId.get(c.id)
    if (!existing || (c.score ?? 0) > (existing.score ?? 0)) {
      byId.set(c.id, c)
    }
  }
  return [...byId.values()].sort((a, b) => compareCandidates(a, b, parsedMeta, parsedArtist))
}

function winningStrategy(
  pool: ScoredWithStrategy[],
  parsedMeta: ParsedTitleMeta,
  parsedArtist: string,
): string {
  if (!pool.length) return 'none'
  const best = [...pool].sort((a, b) => compareCandidates(a, b, parsedMeta, parsedArtist))[0]
  return best?.strategy ?? 'none'
}

function combinedSearchLimit(parsedMeta: ParsedTitleMeta): number {
  return isCollisionProneTitle(parsedMeta) ? COLLISION_COMBINED_SEARCH_LIMIT : COMBINED_SEARCH_LIMIT
}

function passesEarlyExit(
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
  candidates: TrackSummary[],
): boolean {
  const best = candidates[0]
  if (!best || (best.score ?? 0) < EARLY_EXIT_SCORE) return false
  if (isCollisionProneTitle(parsedMeta)
    && artistSimilarity(parsed.artist, best.artist) < COLLISION_ARTIST_MIN) {
    return false
  }
  return true
}

function applyTitleFirstArtistGate(
  parsed: ParsedSong,
  candidates: TrackSummary[],
): TrackSummary[] {
  const passing = candidates.filter(
    c => artistSimilarity(parsed.artist, c.artist) >= ARTIST_GATE_MIN,
  )
  return passing.length ? passing : candidates
}

async function strategyTruncatedTitle(
  provider: MusicSearchClient,
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult | null> {
  if (!parsedMeta.truncated) return null

  const searchQuery = `${normalizeArtistForSearch(parsed.artist)} ${normalizeTitleForSearch(parsedMeta.base)}`.trim()
  const raw = await provider.search(searchQuery, 20)
  const candidates = scoreCandidates(parsed, raw, SCORE_WEIGHTS.combined, parsedMeta)
  return { strategy: 'search-truncated', searchQuery, candidates }
}

async function strategyCombined(
  provider: MusicSearchClient,
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult> {
  const searchQuery = buildMatchQuery(parsed)
  const raw = await provider.search(searchQuery, combinedSearchLimit(parsedMeta))
  const candidates = scoreCandidates(parsed, raw, SCORE_WEIGHTS.combined, parsedMeta)
  return { strategy: 'search-combined', searchQuery, candidates }
}

async function strategyFeatExpanded(
  provider: MusicSearchClient,
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult | null> {
  const firstFeat = parsedMeta.featuredArtists[0]
  if (!firstFeat) return null

  const searchQuery = `${parsed.artist} ${parsedMeta.base} ${firstFeat}`.trim()
  const raw = await provider.search(searchQuery, 12)
  const candidates = scoreCandidates(parsed, raw, SCORE_WEIGHTS.combined, parsedMeta)
  return { strategy: 'search-feat-expanded', searchQuery, candidates }
}

async function strategyTitleFirst(
  provider: MusicSearchClient,
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult> {
  const searchQuery = parsedMeta.base
  const raw = await provider.search(searchQuery, 30)
  const scored = scoreCandidates(parsed, raw, SCORE_WEIGHTS.titleFirst, parsedMeta)
  const candidates = applyTitleFirstArtistGate(parsed, scored)
  return { strategy: 'search-title', searchQuery, candidates }
}

/**
 * Run the full match cascade for a single parsed song against the provider's
 * catalog. Search-based strategies are provider-agnostic; artist/album browse
 * strategies are delegated to the provider when it advertises support.
 */
export async function runMatchCascade(
  provider: MusicSearchClient,
  parsed: ParsedSong,
): Promise<MatchCascadeResult> {
  const parsedMeta = parseTitleMetadata(parsed.title)
  const pool: ScoredWithStrategy[] = []
  let primaryQuery = buildMatchQuery(parsed)

  const s1 = await strategyCombined(provider, parsed, parsedMeta)
  primaryQuery = s1.searchQuery
  for (const c of s1.candidates) {
    pool.push({ ...c, strategy: s1.strategy })
  }
  if (passesEarlyExit(parsed, parsedMeta, s1.candidates)) {
    const allScored = mergeCandidates(pool, parsedMeta, parsed.artist)
    return {
      allScored,
      strategyUsed: s1.strategy,
      searchQuery: primaryQuery,
    }
  }

  const s1c = await strategyTruncatedTitle(provider, parsed, parsedMeta)
  if (s1c) {
    for (const c of s1c.candidates) {
      pool.push({ ...c, strategy: s1c.strategy })
    }
    const mergedAfterTrunc = mergeCandidates(pool, parsedMeta, parsed.artist)
    if (passesEarlyExit(parsed, parsedMeta, mergedAfterTrunc)) {
      return {
        allScored: mergedAfterTrunc,
        strategyUsed: winningStrategy(pool, parsedMeta, parsed.artist),
        searchQuery: primaryQuery,
      }
    }
  }

  if (bestScore(s1.candidates) < FEAT_EXPAND_THRESHOLD && parsedMeta.featuredArtists.length) {
    const s1b = await strategyFeatExpanded(provider, parsed, parsedMeta)
    if (s1b) {
      for (const c of s1b.candidates) {
        pool.push({ ...c, strategy: s1b.strategy })
      }
      const mergedAfter1b = mergeCandidates(pool, parsedMeta, parsed.artist)
      if (passesEarlyExit(parsed, parsedMeta, mergedAfter1b)) {
        return {
          allScored: mergedAfter1b,
          strategyUsed: winningStrategy(pool, parsedMeta, parsed.artist),
          searchQuery: primaryQuery,
        }
      }
    }
  }

  const s2 = await strategyTitleFirst(provider, parsed, parsedMeta)
  for (const c of s2.candidates) {
    pool.push({ ...c, strategy: s2.strategy })
  }
  const mergedAfter2 = mergeCandidates(pool, parsedMeta, parsed.artist)
  if (passesEarlyExit(parsed, parsedMeta, mergedAfter2)) {
    return {
      allScored: mergedAfter2,
      strategyUsed: winningStrategy(pool, parsedMeta, parsed.artist),
      searchQuery: primaryQuery,
    }
  }

  if (provider.artistDiscographyStrategy) {
    const s3 = await provider.artistDiscographyStrategy(parsed, parsedMeta)
    for (const c of s3.candidates) {
      pool.push({ ...c, strategy: s3.strategy })
    }
  }

  if (provider.albumTracklistStrategy) {
    const s4 = await provider.albumTracklistStrategy(parsed, parsedMeta)
    if (s4) {
      for (const c of s4.candidates) {
        pool.push({ ...c, strategy: s4.strategy })
      }
    }
  }

  const allScored = mergeCandidates(pool, parsedMeta, parsed.artist)
  return {
    allScored,
    strategyUsed: winningStrategy(pool, parsedMeta, parsed.artist),
    searchQuery: primaryQuery,
  }
}
