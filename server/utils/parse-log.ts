import type { ParsedSong } from '../../shared/types/playlist'

export type ParseDebugInfo = {
  model: string
  durationMs: number
  systemPrompt: string
  userContentSummary: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; mime: string; bytes: number }
  >
  rawContent: string
  parsedJson: unknown
  filteredCount: number
  droppedCount: number
}

export type ParseLogEntry = {
  id: string
  timestamp: number
  imageCount: number
  textPresent: boolean
  songCount: number
  durationMs: number
  model: string
  droppedCount: number
  debug: ParseDebugInfo
}

const MAX_ENTRIES = 20
const entries: ParseLogEntry[] = []

function isDevLoggingEnabled() {
  return process.env.NODE_ENV !== 'production'
}

export function logParseResult(
  input: { text?: string; images?: string[] },
  songs: ParsedSong[],
  debug: ParseDebugInfo,
) {
  if (!isDevLoggingEnabled()) return

  const entry: ParseLogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    imageCount: input.images?.length ?? 0,
    textPresent: Boolean(input.text?.trim()),
    songCount: songs.length,
    durationMs: debug.durationMs,
    model: debug.model,
    droppedCount: debug.droppedCount,
    debug,
  }

  entries.unshift(entry)
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
}

export function getParseLog(): { entries: ParseLogEntry[] } {
  return { entries: [...entries] }
}

export function clearParseLog() {
  entries.length = 0
}
