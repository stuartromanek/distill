import { getTidalSession } from '../../../utils/session'

export default defineEventHandler((event) => {
  const session = getTidalSession(event)
  return {
    connected: Boolean(session?.accessToken),
    displayName: session?.displayName,
  }
})
