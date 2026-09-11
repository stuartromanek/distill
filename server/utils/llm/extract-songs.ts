import type { ParsedSong, PlaylistMetadataSuggestion } from '../../../shared/types/playlist.ts'
import { logParseResult, type ParseDebugInfo } from '../parse-log.ts'
import { buildContentParts, summarizeContentParts } from './content.ts'
import { isHttpError, isServerLlmConfigured, readLlmConfig, type LlmRequestKeys } from './config.ts'
import { filterSongs, getExtractSystemPrompt, parseJsonFromLlm } from './parse-json.ts'
import { resolveLlmAdapter } from './resolve.ts'
import { suggestPlaylistMetadata } from './suggest-playlist.ts'
import type { ExtractSongsOptions, ParseInput } from './types.ts'

export type ExtractSongsResult = {
  songs: ParsedSong[]
  playlist?: PlaylistMetadataSuggestion
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
  const provider = options?.provider ?? input.provider
  const requestApiKey = options?.apiKey?.trim()

  if (requestApiKey && isServerLlmConfigured()) {
    throw createError({
      statusCode: 400,
      message: 'This instance uses server-configured LLM credentials — browser API keys are not accepted',
    })
  }

  if (requestApiKey && !provider) {
    throw createError({
      statusCode: 400,
      message: 'provider is required when apiKey is sent',
    })
  }

  const requestKeys: LlmRequestKeys | undefined = requestApiKey && provider
    ? { [provider]: requestApiKey }
    : undefined
  const config = readLlmConfig(provider, requestKeys)

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

  const systemPrompt = getExtractSystemPrompt()
  const result = await adapter.complete({
    systemPrompt,
    parts,
  })

  const parsed = parseJsonFromLlm(result.raw)
  const rawSongs = parsed.songs ?? []
  const songs = filterSongs(rawSongs)
  const droppedCount = rawSongs.length - songs.length
  const playlist = songs.length
    ? await suggestPlaylistMetadata(songs, adapter)
    : undefined

  const debug: ParseDebugInfo = {
    model: result.model,
    durationMs: result.durationMs,
    systemPrompt,
    userContentSummary: summarizeContentParts(parts),
    rawContent: result.raw,
    parsedJson: parsed,
    filteredCount: songs.length,
    droppedCount,
  }

  if (isDevLoggingEnabled()) {
    logParseResult(input, songs, debug)
  }

  return options?.debug ? { songs, playlist, debug } : { songs, playlist }
}
