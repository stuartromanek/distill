import { clearTidalSession, getTidalSession } from '../../../utils/session'
import { tidalFetch } from '../../../utils/tidal'

export default defineEventHandler(async (event) => {
  const session = getTidalSession(event)
  if (!session?.accessToken) {
    return { connected: false }
  }

  try {
    const res = await tidalFetch(event, '/playlists?page[limit]=1')
    if (res.status === 401) {
      clearTidalSession(event)
      return { connected: false, needsReconnect: true }
    }

    return {
      connected: true,
      displayName: session.displayName,
    }
  } catch (err) {
    const statusCode = err && typeof err === 'object' && 'statusCode' in err
      ? (err as { statusCode?: number }).statusCode
      : undefined

    if (statusCode === 401) {
      clearTidalSession(event)
      return { connected: false, needsReconnect: true }
    }

    throw err
  }
})
