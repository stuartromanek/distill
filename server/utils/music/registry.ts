import type { MusicProviderId } from '../../../shared/types/playlist.ts'
import type { MusicProviderDefinition } from './types.ts'
import { tidalProvider } from './providers/tidal/index.ts'
import { spotifyProvider } from './providers/spotify/index.ts'

const providers = new Map<MusicProviderId, MusicProviderDefinition>()
let registered = false

/** Nitro can tree-shake side-effect-only provider imports; register explicitly. */
function ensureProvidersRegistered() {
  if (registered) return
  registered = true
  registerMusicProvider(tidalProvider)
  registerMusicProvider(spotifyProvider)
}

export function registerMusicProvider(def: MusicProviderDefinition): void {
  providers.set(def.id, def)
}

export function listMusicProviderIds(): MusicProviderId[] {
  ensureProvidersRegistered()
  return [...providers.keys()]
}

export function getMusicProvider(id: MusicProviderId): MusicProviderDefinition {
  ensureProvidersRegistered()
  const def = providers.get(id)
  if (!def) {
    throw createError({
      statusCode: 404,
      message: `Unknown music provider "${id}".`,
    })
  }
  return def
}

const KNOWN_IDS: MusicProviderId[] = ['tidal', 'spotify']

export function isMusicProviderId(id: string): id is MusicProviderId {
  return (KNOWN_IDS as string[]).includes(id)
}
