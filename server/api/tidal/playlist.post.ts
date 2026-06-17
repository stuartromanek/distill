import { tidalFetch } from '../../utils/tidal'
import { getTidalSession } from '../../utils/session'
import { isTidalRateLimitError } from '../../utils/tidal-rate-limit'

const PLAYLIST_ADD_BATCH_SIZE = 20

export default defineEventHandler(async (event) => {
  if (!getTidalSession(event)) {
    throw createError({ statusCode: 401, message: 'Connect Tidal first' })
  }

  try {
    const body = await readBody<{
      name: string
      description?: string
      trackIds: string[]
    }>(event)

    if (!body.name?.trim()) {
      throw createError({ statusCode: 400, message: 'Playlist name is required' })
    }

    if (!body.trackIds?.length) {
      throw createError({ statusCode: 400, message: 'At least one track is required' })
    }

    const attributes: Record<string, string> = {
      name: body.name.trim(),
    }
    const description = body.description?.trim()
    if (description) {
      attributes.description = description
    }

    const createRes = await tidalFetch(event, '/playlists', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'playlists',
          attributes,
        },
      }),
    })

    if (!createRes.ok) {
      const err = await createRes.text()
      throw createError({ statusCode: 502, message: `Failed to create playlist: ${err}` })
    }

    const created = await createRes.json()
    const playlistId = created.data?.id as string

    if (!playlistId) {
      throw createError({ statusCode: 502, message: 'No playlist ID returned' })
    }

    const failures: { trackId: string; position: number }[] = []

    for (let i = 0; i < body.trackIds.length; i += PLAYLIST_ADD_BATCH_SIZE) {
      const batch = body.trackIds.slice(i, i + PLAYLIST_ADD_BATCH_SIZE)
      const addRes = await tidalFetch(event, `/playlists/${playlistId}/relationships/items`, {
        method: 'POST',
        body: JSON.stringify({
          data: batch.map(trackId => ({ type: 'tracks', id: trackId })),
        }),
      })

      if (!addRes.ok) {
        for (let j = 0; j < batch.length; j++) {
          failures.push({ trackId: batch[j]!, position: i + j + 1 })
        }
      }
    }

    const shareUrl =
      created.data?.attributes?.externalLinks?.find(
        (l: { meta?: { type?: string } }) => l.meta?.type === 'TIDAL_SHARING',
      )?.href ?? `https://tidal.com/browse/playlist/${playlistId}`

    return {
      playlistId,
      url: shareUrl,
      failures: failures.length ? failures : undefined,
    }
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
