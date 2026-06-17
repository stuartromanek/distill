import { decryptSealed } from '../../utils/session-crypto'
import { getTidalSession, type SessionData } from '../../utils/session'

function refreshTokenFromCookie(rawCookie: string): SessionData | null {
  const config = useRuntimeConfig()
  const password = config.sessionPassword
  if (!password || password.length < 16) {
    throw createError({
      statusCode: 500,
      message: 'NUXT_SESSION_PASSWORD must be set (16+ characters) on the dev server',
    })
  }

  return decryptSealed<SessionData>(rawCookie, password)
}

/** Dev-only: decode pasted tidal_session cookie (POST body: { cookie }). */
export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }

  const body = await readBody<{ cookie?: string }>(event)
  const rawCookie = body?.cookie?.trim()
  if (!rawCookie) {
    throw createError({ statusCode: 400, message: 'Provide { "cookie": "<tidal_session value>" }' })
  }

  const session = refreshTokenFromCookie(rawCookie)
  if (!session?.refreshToken) {
    throw createError({
      statusCode: 400,
      message:
        'Could not decrypt tidal_session. Log out and reconnect Tidal in the app (especially if NUXT_SESSION_PASSWORD changed), then retry.',
    })
  }

  return {
    refreshToken: session.refreshToken,
    hint: 'Add to .env as TIDAL_REFRESH_TOKEN=...',
  }
})
