import type { LlmProviderId } from '../../shared/types/playlist'
import { extractSongs } from '../utils/llm/extract-songs'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    text?: string
    images?: string[]
    debug?: boolean
    provider?: LlmProviderId
    apiKey?: string
  }>(event)
  const wantDebug = process.env.NODE_ENV !== 'production' && body?.debug === true
  const result = await extractSongs(body ?? {}, {
    debug: wantDebug,
    provider: body?.provider,
    apiKey: body?.apiKey,
  })

  if (wantDebug && result.debug) {
    return { songs: result.songs, playlist: result.playlist, debug: result.debug }
  }

  return { songs: result.songs, playlist: result.playlist }
})
