import type { ParsedSong, PlaylistMetadataSuggestion } from '../../../shared/types/playlist.ts'
import type { LlmAdapter } from './types.ts'

const SYSTEM_PROMPT = `You create concise playlist metadata from a track list.
Return ONLY valid JSON: { "name": string, "description": string }
Rules:
- name should be short, natural, and playlist-like
- description should be one sentence, no more than 140 characters
- Do not mention that you are an AI
- Do not include markdown`

function parseSuggestion(raw: string): PlaylistMetadataSuggestion {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  let jsonText = fenced ? fenced[1]!.trim() : trimmed

  if (!jsonText.startsWith('{')) {
    const embedded = jsonText.match(/\{[\s\S]*"name"[\s\S]*"description"[\s\S]*\}/)
    if (embedded) jsonText = embedded[0]!
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<PlaylistMetadataSuggestion>
    const name = parsed.name?.trim()
    const description = parsed.description?.trim()

    if (!name || !description) {
      throw new Error('Missing name or description')
    }

    return {
      name: name.slice(0, 80),
      description: description.slice(0, 160),
    }
  } catch {
    throw createError({
      statusCode: 502,
      message: `LLM returned invalid playlist metadata: ${raw.slice(0, 200)}${raw.length > 200 ? '...' : ''}`,
    })
  }
}

function summarizeSongs(songs: ParsedSong[]) {
  return songs
    .slice(0, 50)
    .map((song, index) => `${index + 1}. ${song.artist} - ${song.title}${song.album ? ` (${song.album})` : ''}`)
    .join('\n')
}

export async function suggestPlaylistMetadata(
  songs: ParsedSong[],
  adapter: LlmAdapter,
): Promise<PlaylistMetadataSuggestion> {
  const result = await adapter.complete({
    systemPrompt: SYSTEM_PROMPT,
    parts: [
      {
        type: 'text',
        text: `Track list:\n${summarizeSongs(songs)}`,
      },
    ],
  })

  return parseSuggestion(result.raw)
}
