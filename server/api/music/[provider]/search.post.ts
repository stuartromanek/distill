import type { ParsedSong } from '../../../../shared/types/playlist'
import { resolveProvider } from '../../../utils/music/resolve'
import { matchSong, matchSongsBatch } from '../../../utils/music/match/match'
import { isMusicRateLimitError } from '../../../utils/music/rate-limit'

export default defineEventHandler(async (event) => {
  const provider = resolveProvider(event)
  try {
    const client = await provider.createSearchClient(event)
    const body = await readBody<{ songs?: ParsedSong[]; query?: string }>(event)

    if (body.query?.trim()) {
      const results = await client.search(body.query.trim(), 10)
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
    if (isMusicRateLimitError(err)) {
      throw createError({
        statusCode: err.statusCode === 429 ? 429 : 503,
        message: err.message,
      })
    }
    throw err
  }
})
