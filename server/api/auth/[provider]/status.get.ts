import type { AuthStatus } from '../../../../shared/types/playlist'
import { clearProviderSession, getProviderSession, setProviderSession } from '../../../utils/session'
import { resolveProvider } from '../../../utils/music/resolve'
import { verifySpotifyAccessToken } from '../../../utils/music/providers/spotify/api'

export default defineEventHandler(async (event): Promise<AuthStatus> => {
  const provider = resolveProvider(event)
  const session = getProviderSession(event, provider.id)
  if (!session?.accessToken) {
    return { connected: false, provider: provider.id }
  }

  try {
    if (provider.id === 'spotify') {
      const verification = await verifySpotifyAccessToken(session.accessToken)
      if (!verification.ok) {
        clearProviderSession(event, provider.id)
        return {
          connected: false,
          provider: provider.id,
          needsReconnect: true,
          error: verification.message,
        }
      }

      if (verification.displayName && verification.displayName !== session.displayName) {
        setProviderSession(event, provider.id, {
          ...session,
          displayName: verification.displayName,
        })
      }

      return {
        connected: true,
        provider: provider.id,
        displayName: verification.displayName ?? session.displayName,
      }
    }

    const ok = await provider.verifyConnection(event)
    if (!ok) {
      clearProviderSession(event, provider.id)
      return { connected: false, provider: provider.id, needsReconnect: true }
    }

    return {
      connected: true,
      provider: provider.id,
      displayName: session.displayName,
    }
  } catch (err) {
    const statusCode = err && typeof err === 'object' && 'statusCode' in err
      ? (err as { statusCode?: number }).statusCode
      : undefined

    if (statusCode === 401) {
      clearProviderSession(event, provider.id)
      return { connected: false, provider: provider.id, needsReconnect: true }
    }

    throw err
  }
})
