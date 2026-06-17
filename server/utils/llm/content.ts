import type { ParseDebugInfo } from '../parse-log.ts'
import type { LlmContentPart, ParseInput } from './types.ts'

function parseImageDataUrl(dataUrl: string): { mime: string; base64: string } {
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      return { mime: match[1]!, base64: match[2]! }
    }
  }
  return { mime: 'image/jpeg', base64: dataUrl }
}

export function buildContentParts(input: ParseInput): LlmContentPart[] {
  const hasText = Boolean(input.text?.trim())
  const parts: LlmContentPart[] = []

  if (hasText) {
    parts.push({
      type: 'text',
      text: `Extract all songs from this text:\n\n${input.text!.trim()}`,
    })
  }

  if (input.images?.length) {
    if (!hasText) {
      parts.unshift({
        type: 'text',
        text: 'Extract all songs visible in these images.',
      })
    }

    for (const img of input.images) {
      const { mime, base64 } = parseImageDataUrl(
        img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`,
      )
      parts.push({ type: 'image', mime, base64 })
    }
  }

  return parts
}

export function summarizeContentParts(
  parts: LlmContentPart[],
): ParseDebugInfo['userContentSummary'] {
  return parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text }
    }
    return {
      type: 'image' as const,
      mime: part.mime,
      bytes: Math.round((part.base64.length * 3) / 4),
    }
  })
}
