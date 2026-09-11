import { envVarName, sessionPassword } from '../../utils/env'
import { decryptSealed } from '../../utils/session-crypto'
import type { SessionData } from '../../utils/session'

function refreshTokenFromCookie(rawCookie: string): SessionData | null {
  return decryptSealed<SessionData>(rawCookie, sessionPassword())
}

/** Dev-only: decode pasted session_tidal cookie (POST body: { cookie }). */
export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }

  const body = await readBody<{ cookie?: string }>(event)
  const rawCookie = body?.cookie?.trim()
  if (!rawCookie) {
    throw createError({ statusCode: 400, message: 'Provide { "cookie": "<session_tidal value>" }' })
  }

  let session: SessionData | null
  try {
    session = refreshTokenFromCookie(rawCookie)
  } catch {
    throw createError({
      statusCode: 500,
      message: `${envVarName('SESSION_PASSWORD')} must be set (16+ characters) on the dev server`,
    })
  }

  if (!session?.refreshToken) {
    throw createError({
      statusCode: 400,
      message:
        `Could not decrypt session_tidal. Log out and reconnect Tidal in the app (especially if ${envVarName('SESSION_PASSWORD')} changed), then retry.`,
    })
  }

  return {
    refreshToken: session.refreshToken,
    hint: `Add to .env as ${envVarName('TIDAL_REFRESH_TOKEN')}=...`,
  }
})
