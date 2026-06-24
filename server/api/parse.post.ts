import { extractSongs } from '../utils/llm/extract-songs'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ text?: string; images?: string[]; debug?: boolean }>(event)
  const wantDebug = process.env.NODE_ENV !== 'production' && body?.debug === true
  const result = await extractSongs(body ?? {}, { debug: wantDebug })

  if (wantDebug && result.debug) {
    return { songs: result.songs, playlist: result.playlist, debug: result.debug }
  }

  return { songs: result.songs, playlist: result.playlist }
})
