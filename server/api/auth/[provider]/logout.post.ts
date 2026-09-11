import { clearProviderSession } from '../../../utils/session'
import { resolveProvider } from '../../../utils/music/resolve'

export default defineEventHandler((event) => {
  const provider = resolveProvider(event)
  clearProviderSession(event, provider.id)
  return { ok: true }
})
