import type { LlmProviderId } from '../../../shared/types/playlist'

export type ParseInput = {
  text?: string
  images?: string[]
  provider?: LlmProviderId
}

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; base64: string }

export type LlmCompleteInput = {
  systemPrompt: string
  parts: LlmContentPart[]
  /** When false, skip provider JSON response constraints (e.g. key verification). Default: true */
  jsonMode?: boolean
}

export type LlmCompleteResult = {
  raw: string
  model: string
  durationMs: number
  provider: LlmProviderId
}

export type LlmJsonMode = 'native' | 'openai_response_format' | 'prompt_only'

export type LlmCapabilities = {
  vision: boolean
  jsonMode: LlmJsonMode
}

export interface LlmAdapter {
  readonly id: LlmProviderId
  readonly capabilities: LlmCapabilities
  readonly model: string
  complete(input: LlmCompleteInput): Promise<LlmCompleteResult>
}

export type LlmProviderDefinition = {
  id: LlmProviderId
  capabilities: LlmCapabilities
  validateConfig(config: LlmConfig): void
  resolveModel(config: LlmConfig, ctx: { hasImages: boolean }): string | Promise<string>
  createAdapter(config: LlmConfig, ctx: { hasImages: boolean }): Promise<LlmAdapter>
}

export type LlmConfig = {
  provider: LlmProviderId
  openai: { apiKey: string; baseUrl: string; model: string }
  gemini: { apiKey: string; baseUrl: string; model: string }
  anthropic: { apiKey: string; baseUrl: string; model: string }
}

export type ExtractSongsOptions = {
  debug?: boolean
  provider?: LlmProviderId
  apiKey?: string
}
