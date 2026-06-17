import type { ParsedSong } from '../../../shared/types/playlist.ts'

export const SYSTEM_PROMPT = `You extract song titles and artists from user-provided text and images.
Return ONLY valid JSON: { "songs": [{ "title", "artist", "album?", "confidence": "high"|"medium"|"low", "source": "text"|"image" }] }
Rules:
- Handle numbered lists, "Artist — Title", setlists, screenshots, social posts
- Deduplicate by artist+title (case insensitive)
- Omit non-song content (headers, dates, venue names without songs)
- If unsure, use lower confidence
- album is optional`

export function parseJsonFromLlm(raw: string): { songs?: ParsedSong[] } {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  let jsonText = fenced ? fenced[1]!.trim() : trimmed

  if (!jsonText.startsWith('{')) {
    const embedded = jsonText.match(/\{[\s\S]*"songs"[\s\S]*\}/)
    if (embedded) jsonText = embedded[0]!
  }

  try {
    return JSON.parse(jsonText) as { songs?: ParsedSong[] }
  } catch {
    throw createError({
      statusCode: 502,
      message: `LLM returned non-JSON response: ${raw.slice(0, 200)}${raw.length > 200 ? '…' : ''}`,
    })
  }
}

export function filterSongs(songs: ParsedSong[] | undefined): ParsedSong[] {
  return (songs ?? []).filter(s => s.title?.trim() && s.artist?.trim())
}
