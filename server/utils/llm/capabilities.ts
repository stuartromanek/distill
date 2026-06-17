import type { LlmCapabilities } from './types.ts'

export function supportsVision(capabilities: LlmCapabilities): boolean {
  return capabilities.vision
}
