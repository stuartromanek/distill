import { getTrackById } from '../../../utils/match'
import { tidalClientForSearch } from '../../../utils/match-api'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id?.trim()) {
    throw createError({ statusCode: 400, message: 'Track ID required' })
  }

  const client = await tidalClientForSearch(event)
  const track = await getTrackById(client, id.trim())

  if (!track) {
    throw createError({ statusCode: 404, message: 'Track not found' })
  }

  return { track }
})
