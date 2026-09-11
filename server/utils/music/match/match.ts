import type {
  MatchedSong,
  MatchStatus,
  ParsedSong,
  TrackSummary,
} from '../../../../shared/types/playlist'
import type { MusicSearchClient } from '../types.ts'
import { artistSimilarity, ARTIST_GATE_MIN } from '../../match-scoring.ts'
import { runMatchCascade } from './cascade.ts'

export type MatchSongMeta = {
  match: MatchedSong
  searchQuery: string
  strategyUsed: string
  allScored: TrackSummary[]
}

export async function matchSongWithMeta(
  client: MusicSearchClient,
  parsed: ParsedSong,
): Promise<MatchSongMeta> {
  const { allScored, strategyUsed, searchQuery } = await runMatchCascade(client, parsed)

  if (allScored.length === 0) {
    return {
      match: { parsed, alternatives: [], status: 'not_found' },
      searchQuery,
      strategyUsed,
      allScored: [],
    }
  }

  const best = allScored[0]!
  const alternatives = allScored.slice(1, 5)

  let status: MatchStatus = 'matched'
  if ((best.score ?? 0) < 0.55) status = 'not_found'
  else if ((best.score ?? 0) < 0.75) status = 'ambiguous'
  else if (artistSimilarity(parsed.artist, best.artist) < ARTIST_GATE_MIN) status = 'ambiguous'

  return {
    match: { parsed, bestMatch: best, alternatives, status, strategyUsed },
    searchQuery,
    strategyUsed,
    allScored,
  }
}

export async function matchSong(
  client: MusicSearchClient,
  parsed: ParsedSong,
): Promise<MatchedSong> {
  const { match } = await matchSongWithMeta(client, parsed)
  return match
}

export async function matchSongsBatch(
  client: MusicSearchClient,
  songs: ParsedSong[],
  concurrency = 1,
): Promise<MatchedSong[]> {
  const results: MatchedSong[] = []
  let index = 0

  async function worker() {
    while (index < songs.length) {
      const i = index++
      results[i] = await matchSong(client, songs[i]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, songs.length) }, worker))
  return results
}
