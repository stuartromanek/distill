import type { LlmProviderId } from '../../../shared/types/playlist'
import type { LlmProviderDefinition } from './types.ts'

const providers = new Map<LlmProviderId, LlmProviderDefinition>()

export function registerProvider(def: LlmProviderDefinition): void {
  providers.set(def.id, def)
}

export function getProvider(id: LlmProviderId): LlmProviderDefinition {
  const def = providers.get(id)
  if (!def) {
    throw createError({
      statusCode: 500,
      message: `Unknown LLM provider "${id}".`,
    })
  }
  return def
}

export function listProviderIds(): LlmProviderId[] {
  return [...providers.keys()]
}
