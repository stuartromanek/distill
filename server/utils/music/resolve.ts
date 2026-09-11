import type { H3Event } from 'h3'
import type { MusicProviderDefinition } from './types.ts'
import { getMusicProvider, isMusicProviderId } from './registry.ts'

/** Resolve the provider from the `:provider` route param, validating it. */
export function resolveProvider(event: H3Event): MusicProviderDefinition {
  const param = getRouterParam(event, 'provider')
  if (!param || !isMusicProviderId(param)) {
    throw createError({
      statusCode: 404,
      message: `Unknown music provider "${param ?? ''}".`,
    })
  }
  return getMusicProvider(param)
}
