import { generatePkce, setOAuthPending } from '../../../utils/session'
import { buildAuthorizeUrl } from '../../../utils/music/oauth'
import { resolveProvider } from '../../../utils/music/resolve'

export default defineEventHandler((event) => {
  const provider = resolveProvider(event)
  provider.validateConfig(event)

  const query = getQuery(event)
  const { codeVerifier, codeChallenge, state } = generatePkce()

  setOAuthPending(event, {
    provider: provider.id,
    codeVerifier,
    state,
    popup: query.popup === '1',
  })

  const oauthConfig = provider.oauthConfig(event)
  const url = buildAuthorizeUrl(oauthConfig, { codeChallenge, state })
  return sendRedirect(event, url)
})
