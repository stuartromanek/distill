import { resolveProvider } from '../../../../utils/music/resolve'

export default defineEventHandler(async (event) => {
  const provider = resolveProvider(event)
  const id = getRouterParam(event, 'id')
  if (!id?.trim()) {
    throw createError({ statusCode: 400, message: 'Track ID required' })
  }

  const client = await provider.createSearchClient(event)
  const track = await client.getTrackById(id.trim())

  if (!track) {
    throw createError({ statusCode: 404, message: 'Track not found' })
  }

  return { track }
})
