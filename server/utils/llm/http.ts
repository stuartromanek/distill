import { logRequestEnd, logRequestStart } from '../request-log.ts'

export async function loggedLlmFetch(opts: {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
  logPath: string
  logLabel: string
}): Promise<{ response: Response; durationMs: number; logId: string | undefined }> {
  const logId = logRequestStart({
    source: 'llm',
    method: opts.method,
    path: opts.logPath,
    label: opts.logLabel,
  })
  const startedAt = Date.now()

  const response = await fetch(opts.url, {
    method: opts.method,
    headers: opts.headers,
    body: JSON.stringify(opts.body),
  })

  const durationMs = Date.now() - startedAt

  if (!response.ok) {
    logRequestEnd(logId, {
      status: 'error',
      statusCode: response.status,
      durationMs,
    })
    return { response, durationMs, logId }
  }

  logRequestEnd(logId, {
    status: 'ok',
    statusCode: response.status,
    durationMs,
  })

  return { response, durationMs, logId }
}

export function parseGeminiLogPath(model: string): { path: string; label: string } {
  return { path: `/models/${model}:generateContent`, label: 'parse-gemini' }
}
