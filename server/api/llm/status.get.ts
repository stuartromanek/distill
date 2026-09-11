import { isServerLlmConfigured, readDefaultServerProvider, readLlmEnvProvider } from '../../utils/llm/config'

export default defineEventHandler(() => {
  const envProvider = readLlmEnvProvider()
  return {
    envProvider,
    serverConfigured: isServerLlmConfigured(),
    defaultProvider: envProvider ?? readDefaultServerProvider(),
  }
})
