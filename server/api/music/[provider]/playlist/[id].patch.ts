import { getProviderSession } from '../../../../utils/session'
import { resolveProvider } from '../../../../utils/music/resolve'
import { isMusicRateLimitError } from '../../../../utils/music/rate-limit'

export default defineEventHandler(async (event) => {
  const provider = resolveProvider(event)

  if (!getProviderSession(event, provider.id)) {
    throw createError({ statusCode: 401, message: `Connect ${provider.displayName} first` })
  }

  const playlistId = getRouterParam(event, 'id')
  if (!playlistId) {
    throw createError({ statusCode: 400, message: 'Playlist id is required' })
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

    return await provider.updatePlaylist(event, {
      playlistId,
      name: body.name,
      description: body.description,
      trackIds: body.trackIds,
    })
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
