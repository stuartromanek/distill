import { generatePkce, setOAuthPending } from '../../../utils/session'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)

  if (!config.tidalClientId) {
    throw createError({ statusCode: 500, message: 'NUXT_TIDAL_CLIENT_ID is not configured' })
  }

  const { codeVerifier, codeChallenge, state } = generatePkce()
  setOAuthPending(event, { codeVerifier, state })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.tidalClientId,
    redirect_uri: config.tidalRedirectUri,
    scope: 'playlists.read playlists.write search.read',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
  })

  return sendRedirect(event, `https://login.tidal.com/authorize?${params}`)
})
