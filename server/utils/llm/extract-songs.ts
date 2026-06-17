import type { ParsedSong } from '../../../shared/types/playlist.ts'
import { logParseResult, type ParseDebugInfo } from '../parse-log.ts'
import { buildContentParts, summarizeContentParts } from './content.ts'
import { isHttpError, readLlmConfig } from './config.ts'
import { filterSongs, parseJsonFromLlm, SYSTEM_PROMPT } from './parse-json.ts'
import { resolveLlmAdapter } from './resolve.ts'
import type { ExtractSongsOptions, ParseInput } from './types.ts'

export type ExtractSongsResult = {
  songs: ParsedSong[]
  debug?: ParseDebugInfo
}

function isDevLoggingEnabled() {
  return process.env.NODE_ENV !== 'production'
}

export async function extractSongs(
  input: ParseInput,
  options?: ExtractSongsOptions,
): Promise<ExtractSongsResult> {
  const hasText = Boolean(input.text?.trim())
  const hasImages = Boolean(input.images?.length)

  if (!hasText && !hasImages) {
    throw createError({ statusCode: 400, message: 'Provide text or images' })
  }

  if (hasImages && input.images!.length > 5) {
    throw createError({ statusCode: 400, message: 'Maximum 5 images allowed' })
  }

  const parts = buildContentParts(input)
  const partsHaveImages = parts.some(p => p.type === 'image')
  const config = readLlmConfig()

  let adapter
  try {
    adapter = await resolveLlmAdapter(config, { hasImages: partsHaveImages })
  } catch (err) {
    if (isHttpError(err)) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw createError({
      statusCode: 500,
      message: `LLM setup failed: ${message}`,
    })
  }

  const result = await adapter.complete({
    systemPrompt: SYSTEM_PROMPT,
    parts,
  })

  const parsed = parseJsonFromLlm(result.raw)
  const rawSongs = parsed.songs ?? []
  const songs = filterSongs(rawSongs)
  const droppedCount = rawSongs.length - songs.length

  const debug: ParseDebugInfo = {
    model: result.model,
    durationMs: result.durationMs,
    systemPrompt: SYSTEM_PROMPT,
    userContentSummary: summarizeContentParts(parts),
    rawContent: result.raw,
    parsedJson: parsed,
    filteredCount: songs.length,
    droppedCount,
  }

  if (isDevLoggingEnabled()) {
    logParseResult(input, songs, debug)
  }

  return options?.debug ? { songs, debug } : { songs }
}
