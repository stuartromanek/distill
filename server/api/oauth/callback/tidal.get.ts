import {
  clearOAuthPending,
  getOAuthPending,
  setTidalSession,
} from '../../../utils/session'
import { exchangeCodeForTokens, fetchUserProfile } from '../../../utils/tidal'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string | undefined
  const state = query.state as string | undefined
  const error = query.error as string | undefined

  if (error) {
    return sendRedirect(event, `/?auth_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    throw createError({ statusCode: 400, message: 'Missing OAuth code or state' })
  }

  const pending = getOAuthPending(event)
  if (!pending || pending.state !== state) {
    throw createError({ statusCode: 400, message: 'Invalid OAuth state' })
  }

  clearOAuthPending(event)

  const tokens = await exchangeCodeForTokens(event, code, pending.codeVerifier)
  const displayName = await fetchUserProfile(event, tokens.access_token)

  setTidalSession(event, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    displayName,
  })

  return sendRedirect(event, '/?connected=1')
})
