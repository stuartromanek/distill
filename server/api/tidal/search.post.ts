import type { ParsedSong } from '../../shared/types/playlist'
import { matchSong, matchSongsBatch, searchTidalQuery } from '../../utils/match'
import { tidalClientForSearch } from '../../utils/match-api'
import { isTidalRateLimitError } from '../../utils/tidal-rate-limit'

export default defineEventHandler(async (event) => {
  try {
    const client = await tidalClientForSearch(event)
    const body = await readBody<{ songs?: ParsedSong[]; query?: string }>(event)

    if (body.query?.trim()) {
      const query = body.query.trim()
      const results = await searchTidalQuery(client, query, 10)
      return {
        matches: results.map(r => ({
          bestMatch: r,
          alternatives: [],
          status: 'manual' as const,
        })),
      }
    }

    if (!body.songs?.length) {
      throw createError({ statusCode: 400, message: 'Provide songs or query' })
    }

    const matches = body.songs.length === 1
      ? [await matchSong(client, body.songs[0]!)]
      : await matchSongsBatch(client, body.songs)

    return { matches }
  } catch (err) {
    if (isTidalRateLimitError(err)) {
      throw createError({
        statusCode: err.statusCode === 429 ? 429 : 503,
        message: err.message,
      })
    }
    throw err
  }
})
