import { getTrackById } from '../../../utils/match'
import { tidalClientForSearch } from '../../../utils/match-api'
import { parseTidalTrackUrl } from '../../../utils/tidal-url'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string }>(event)
  const trackId = parseTidalTrackUrl(body.url ?? '')

  if (!trackId) {
    throw createError({ statusCode: 400, message: 'Invalid Tidal track URL' })
  }

  const client = await tidalClientForSearch(event)
  const track = await getTrackById(client, trackId)

  if (!track) {
    throw createError({ statusCode: 404, message: 'Track not found' })
  }

  return { track }
})
