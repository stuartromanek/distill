import type { LlmContentPart } from '../types.ts'
import { loggedLlmFetch } from '../http.ts'
import { parseLlmLogPath } from '../../request-log.ts'

function partsToOpenAiContent(parts: LlmContentPart[]): Array<Record<string, unknown>> {
  return parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text }
    }
    return {
      type: 'image_url',
      image_url: { url: `data:${part.mime};base64,${part.base64}` },
    }
  })
}

export async function postChatCompletions(opts: {
  baseUrl: string
  apiKey: string
  model: string
  systemPrompt: string
  parts: LlmContentPart[]
  jsonMode: boolean
  extraHeaders?: Record<string, string>
  logLabel: string
  providerId: 'openai'
}): Promise<{ raw: string; durationMs: number }> {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`
  const { path, label } = parseLlmLogPath(url)

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: partsToOpenAiContent(opts.parts) },
    ],
    temperature: 0.2,
  }

  if (opts.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const { response, durationMs } = await loggedLlmFetch({
    url,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      ...opts.extraHeaders,
    },
    body,
    logPath: path,
    logLabel: label ?? opts.logLabel,
  })

  if (!response.ok) {
    const err = await response.text()
    throw createError({ statusCode: 502, message: `LLM request failed: ${err}` })
  }

  const json = await response.json()
  const raw = json.choices?.[0]?.message?.content
  if (!raw) {
    throw createError({ statusCode: 502, message: 'Empty LLM response' })
  }

  return { raw, durationMs }
}

export function resolveOpenAiVisionModel(modelHint: string): string {
  const model = modelHint.trim()
  if (!model || model === 'auto') return 'gpt-4o-mini'
  if (/^gpt-[34o]|^o[0-9-]/i.test(model)) return model
  return 'gpt-4o-mini'
}
