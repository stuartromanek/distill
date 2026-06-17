import {
  logRequestEnd,
  logRequestPending,
  logRequestRetry,
  logRequestStart,
  parseTidalLogPath,
  setRequestQueueDepth,
} from './request-log.ts'

export type TidalRateLimitOptions = {
  maxConcurrent: number
  minIntervalMs: number
  maxRetries: number
  baseBackoffMs: number
}

export const DEFAULT_TIDAL_RATE_LIMIT: TidalRateLimitOptions = {
  maxConcurrent: 1,
  minIntervalMs: 300,
  maxRetries: 5,
  baseBackoffMs: 1000,
}

export class TidalRateLimitError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 503) {
    super(message)
    this.name = 'TidalRateLimitError'
    this.statusCode = statusCode
  }
}

export function isTidalRateLimitError(err: unknown): err is TidalRateLimitError {
  return err instanceof TidalRateLimitError
    || (err instanceof Error && /rate limit|429/i.test(err.message))
}

type RateLimitConfig = {
  tidalMaxConcurrent?: number | string
  tidalMinIntervalMs?: number | string
  tidalMaxRetries?: number | string
}

export function getTidalRateLimitOptions(config?: RateLimitConfig): TidalRateLimitOptions {
  return {
    maxConcurrent: toInt(config?.tidalMaxConcurrent, DEFAULT_TIDAL_RATE_LIMIT.maxConcurrent),
    minIntervalMs: toInt(config?.tidalMinIntervalMs, DEFAULT_TIDAL_RATE_LIMIT.minIntervalMs),
    maxRetries: toInt(config?.tidalMaxRetries, DEFAULT_TIDAL_RATE_LIMIT.maxRetries),
    baseBackoffMs: DEFAULT_TIDAL_RATE_LIMIT.baseBackoffMs,
  }
}

function toInt(value: number | string | undefined, fallback: number) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(header)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return undefined
}

function backoffMs(attempt: number, baseMs: number, retryAfterMs?: number) {
  const exponential = baseMs * 2 ** attempt
  const jitter = Math.floor(Math.random() * 250)
  return Math.max(retryAfterMs ?? 0, exponential + jitter)
}

class TidalRequestQueue {
  private inFlight = 0
  private lastStartMs = 0
  private waiters: Array<() => void> = []
  private opts: TidalRateLimitOptions

  constructor(opts: TidalRateLimitOptions) {
    this.opts = opts
  }

  async acquire() {
    await this.waitForSlot()
    await this.waitForInterval()
    this.inFlight++
    updateQueueDepth()
  }

  release() {
    this.inFlight = Math.max(0, this.inFlight - 1)
    updateQueueDepth()
    const next = this.waiters.shift()
    if (next) next()
  }

  getInFlight() {
    return this.inFlight
  }

  private waitForSlot() {
    if (this.inFlight < this.opts.maxConcurrent) return Promise.resolve()
    return new Promise<void>(resolve => this.waiters.push(resolve))
  }

  private async waitForInterval() {
    const elapsed = Date.now() - this.lastStartMs
    const wait = Math.max(0, this.opts.minIntervalMs - elapsed)
    if (wait > 0) await sleep(wait)
    this.lastStartMs = Date.now()
  }
}

const queues = new Map<string, TidalRequestQueue>()

function queueFor(opts: TidalRateLimitOptions) {
  const key = `${opts.maxConcurrent}:${opts.minIntervalMs}:${opts.maxRetries}`
  let queue = queues.get(key)
  if (!queue) {
    queue = new TidalRequestQueue(opts)
    queues.set(key, queue)
  }
  return queue
}

function updateQueueDepth() {
  let total = 0
  for (const queue of queues.values()) total += queue.getInFlight()
  setRequestQueueDepth(total)
}

export async function tidalFetchWithRateLimit(
  url: string,
  init: RequestInit,
  opts: TidalRateLimitOptions = DEFAULT_TIDAL_RATE_LIMIT,
): Promise<Response> {
  const queue = queueFor(opts)
  const method = init.method ?? 'GET'
  const { path, label } = parseTidalLogPath(url, method)
  const logId = logRequestStart({
    source: 'tidal',
    method,
    path,
    label,
    maxRetries: opts.maxRetries,
  })
  const startedAt = Date.now()

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    logRequestPending(logId)
    await queue.acquire()
    let res: Response
    try {
      res = await fetch(url, init)
    } finally {
      queue.release()
    }

    if (res.ok || !isRetryableStatus(res.status)) {
      logRequestEnd(logId, {
        status: res.ok ? 'ok' : 'error',
        statusCode: res.status,
        durationMs: Date.now() - startedAt,
      })
      return res
    }

    await res.text().catch(() => '')

    if (attempt >= opts.maxRetries) {
      logRequestEnd(logId, {
        status: 'error',
        statusCode: res.status,
        durationMs: Date.now() - startedAt,
      })
      throw new TidalRateLimitError(
        `Tidal rate limit: ${res.status} after ${opts.maxRetries} retries`,
        res.status === 429 ? 429 : 503,
      )
    }

    const waitMs = backoffMs(
      attempt,
      opts.baseBackoffMs,
      parseRetryAfterMs(res.headers.get('Retry-After')),
    )
    logRequestRetry(logId, {
      retryAttempt: attempt + 1,
      waitMs,
      statusCode: res.status,
    })
    await sleep(waitMs)
  }

  logRequestEnd(logId, {
    status: 'error',
    statusCode: 503,
    durationMs: Date.now() - startedAt,
  })
  throw new TidalRateLimitError('Tidal rate limit: retries exhausted')
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 503
}
