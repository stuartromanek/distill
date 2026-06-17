export type RequestLogStatus = 'pending' | 'ok' | 'retry' | 'error'
export type RequestLogSource = 'tidal' | 'llm'

export type RequestLogEntry = {
  id: string
  source: RequestLogSource
  method: string
  path: string
  status: RequestLogStatus
  statusCode?: number
  durationMs?: number
  retryAttempt?: number
  maxRetries?: number
  waitMs?: number
  timestamp: number
  label?: string
}

export type RequestLogStats = {
  ok: number
  retry: number
  error: number
  pending: number
  rpm: number
  avgLatencyMs: number
  queueDepth: number
}

const MAX_ENTRIES = 200
const entries: RequestLogEntry[] = []
let queueDepth = 0

function isDevLoggingEnabled() {
  return process.env.NODE_ENV !== 'production'
}

export function setRequestQueueDepth(depth: number) {
  if (!isDevLoggingEnabled()) return
  queueDepth = Math.max(0, depth)
}

export function logRequestStart(input: {
  source: RequestLogSource
  method: string
  path: string
  label?: string
  maxRetries?: number
}): string | undefined {
  if (!isDevLoggingEnabled()) return undefined

  const id = crypto.randomUUID()
  const entry: RequestLogEntry = {
    id,
    source: input.source,
    method: input.method.toUpperCase(),
    path: truncatePath(input.path),
    status: 'pending',
    timestamp: Date.now(),
    label: input.label,
    maxRetries: input.maxRetries,
  }

  entries.unshift(entry)
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
  return id
}

export function logRequestPending(id: string | undefined) {
  if (!id || !isDevLoggingEnabled()) return
  updateEntry(id, { status: 'pending', waitMs: undefined })
}

export function logRequestRetry(
  id: string | undefined,
  update: { retryAttempt: number; waitMs: number; statusCode: number },
) {
  if (!id || !isDevLoggingEnabled()) return
  updateEntry(id, {
    status: 'retry',
    retryAttempt: update.retryAttempt,
    waitMs: update.waitMs,
    statusCode: update.statusCode,
  })
}

export function logRequestEnd(
  id: string | undefined,
  update: {
    status: 'ok' | 'error'
    statusCode: number
    durationMs: number
  },
) {
  if (!id || !isDevLoggingEnabled()) return
  updateEntry(id, {
    status: update.status,
    statusCode: update.statusCode,
    durationMs: update.durationMs,
    waitMs: undefined,
    retryAttempt: undefined,
  })
}

function updateEntry(id: string, patch: Partial<RequestLogEntry>) {
  const entry = entries.find(e => e.id === id)
  if (entry) Object.assign(entry, patch)
}

export function getRequestLog(): { entries: RequestLogEntry[]; stats: RequestLogStats } {
  const now = Date.now()
  const recentOk = entries.filter(
    e => e.status === 'ok' && e.timestamp >= now - 60_000,
  )

  const latencies = recentOk
    .map(e => e.durationMs)
    .filter((ms): ms is number => ms !== undefined)

  const stats: RequestLogStats = {
    ok: entries.filter(e => e.status === 'ok').length,
    retry: entries.filter(e => e.status === 'retry').length,
    error: entries.filter(e => e.status === 'error').length,
    pending: entries.filter(e => e.status === 'pending').length,
    rpm: recentOk.length,
    avgLatencyMs: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0,
    queueDepth,
  }

  return { entries: [...entries], stats }
}

export function clearRequestLog() {
  entries.length = 0
}

export function truncatePath(path: string, maxLen = 72) {
  const normalized = path.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen - 1)}…`
}

export function parseTidalLogPath(url: string, method = 'GET'): { path: string; label?: string } {
  try {
    const parsed = new URL(url)
    let path = parsed.pathname.replace(/^\/v2/, '') + parsed.search
    path = path.replace(/([?&])countryCode=[^&]*/g, '')
    path = path.replace(/\?&/, '?').replace(/\?$/, '')

    const upperMethod = method.toUpperCase()
    let label: string | undefined

    if (path.includes('/searchResults/')) {
      label = 'search'
      const q = path.match(/\/searchResults\/([^?]+)/)?.[1]
      if (q) path = `/searchResults/${decodeURIComponent(q)}`
    } else if (path.startsWith('/tracks')) {
      label = 'track-details'
      if (path.includes('filter[id]')) {
        path = '/tracks?filter[id]=…'
      }
    } else if (path.includes('/artists/') && path.includes('/relationships/tracks')) {
      label = 'artist-discography'
      path = path.replace(/\/artists\/[^/]+/, '/artists/…')
    } else if (path.includes('/albums/') && path.includes('/relationships/tracks')) {
      label = 'album-tracklist'
      path = path.replace(/\/albums\/[^/]+/, '/albums/…')
    } else if (path.includes('/relationships/items')) {
      label = 'playlist-add'
      path = path.replace(/\/playlists\/[^/]+/, '/playlists/…')
    } else if (path.startsWith('/playlists') && upperMethod === 'POST') {
      label = 'playlist-create'
      path = '/playlists'
    }

    return { path: truncatePath(path), label }
  } catch {
    return { path: truncatePath(url), label: 'tidal' }
  }
}

export function parseLlmLogPath(url: string): { path: string; label?: string } {
  try {
    const parsed = new URL(url)
    return { path: truncatePath(parsed.pathname), label: 'parse' }
  } catch {
    return { path: '/chat/completions', label: 'parse' }
  }
}
