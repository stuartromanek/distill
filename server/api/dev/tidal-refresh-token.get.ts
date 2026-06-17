import { getTidalSession } from '../../utils/session'

/** Dev-only: return refresh token for CLI export-fixtures setup. */
export default defineEventHandler((event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }

  const session = getTidalSession(event)
  if (!session?.refreshToken) {
    throw createError({ statusCode: 401, message: 'Connect Tidal in the app first' })
  }

  return {
    refreshToken: session.refreshToken,
    hint: 'Add to .env as TIDAL_REFRESH_TOKEN=...',
  }
})
