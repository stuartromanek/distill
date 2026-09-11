import { resolveProvider } from '../../../../utils/music/resolve'

export default defineEventHandler(async (event) => {
  const provider = resolveProvider(event)
  const body = await readBody<{ url?: string }>(event)
  const trackId = provider.parseTrackUrl(body.url ?? '')

  if (!trackId) {
    throw createError({ statusCode: 400, message: `Invalid ${provider.displayName} track URL` })
  }

  const client = await provider.createSearchClient(event)
  const track = await client.getTrackById(trackId)

  if (!track) {
    throw createError({ statusCode: 404, message: 'Track not found' })
  }

  return { track }
})
