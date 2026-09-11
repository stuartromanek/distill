import type { LlmProviderId } from '../../shared/types/playlist'

const PROVIDER_STORAGE_KEY = 'music-playlist:llm-provider'
const API_KEY_STORAGE_KEY = 'music-playlist:llm-api-key'

export type LlmCredentialMode = 'server' | 'browser'

type BrowserLlmCredentials = {
  provider: LlmProviderId
  apiKey: string
}

function loadStoredProvider(): LlmProviderId | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY)
    if (raw === 'openai' || raw === 'gemini') return raw
  } catch {
    /* ignore */
  }
  return null
}

function loadStoredApiKey(): BrowserLlmCredentials | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(API_KEY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BrowserLlmCredentials>
    if (
      (parsed.provider === 'openai' || parsed.provider === 'gemini')
      && typeof parsed.apiKey === 'string'
      && parsed.apiKey.trim()
    ) {
      return { provider: parsed.provider, apiKey: parsed.apiKey.trim() }
    }
  } catch {
    /* ignore */
  }
  return null
}

function persistBrowserCredentials(provider: LlmProviderId, apiKey: string) {
  if (!import.meta.client) return
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, provider)
    localStorage.setItem(API_KEY_STORAGE_KEY, JSON.stringify({ provider, apiKey }))
  } catch {
    /* ignore */
  }
}

function clearStoredBrowserCredentials() {
  if (!import.meta.client) return
  try {
    localStorage.removeItem(PROVIDER_STORAGE_KEY)
    localStorage.removeItem(API_KEY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function useLlmProvider() {
  const envProvider = ref<LlmProviderId | null>(null)
  const serverConfigured = ref(false)
  const serverDefaultProvider = ref<LlmProviderId | null>(null)
  const selectedLlmProvider = ref<LlmProviderId | null>(loadStoredProvider())
  const browserCredentials = ref<BrowserLlmCredentials | null>(loadStoredApiKey())
  const apiKeyDraft = ref('')
  const apiKeyError = ref<string | null>(null)
  const verifying = ref(false)
  const pendingProvider = ref<LlmProviderId | null>(null)

  const llmProviderLocked = computed(() => Boolean(envProvider.value))

  const llmCredentialMode = computed<LlmCredentialMode | null>(() => {
    if (llmProviderLocked.value || serverConfigured.value) return 'server'
    if (browserCredentials.value) return 'browser'
    return null
  })

  const llmReady = computed(() => llmCredentialMode.value !== null)

  function clearBrowserCredentials() {
    browserCredentials.value = null
    clearStoredBrowserCredentials()
  }

  function applyServerLlmStatus(status: {
    envProvider: LlmProviderId | null
    serverConfigured: boolean
    defaultProvider: LlmProviderId | null
  }) {
    envProvider.value = status.envProvider
    serverConfigured.value = status.serverConfigured
    serverDefaultProvider.value = status.defaultProvider

    const useServerMode = Boolean(status.envProvider || status.serverConfigured)
    if (useServerMode) {
      clearBrowserCredentials()
      selectedLlmProvider.value = status.envProvider ?? status.defaultProvider
      return
    }

    if (browserCredentials.value) {
      selectedLlmProvider.value = browserCredentials.value.provider
    }
  }

  async function refreshLlmStatus() {
    try {
      const status = await $fetch<{
        envProvider: LlmProviderId | null
        serverConfigured: boolean
        defaultProvider: LlmProviderId | null
      }>('/api/llm/status')
      applyServerLlmStatus(status)
    } catch {
      envProvider.value = null
      serverConfigured.value = false
      serverDefaultProvider.value = null
    }
  }

  function beginLlmProviderEntry(provider: LlmProviderId) {
    if (llmProviderLocked.value || serverConfigured.value || llmReady.value) return
    if (provider !== 'openai' && provider !== 'gemini') return
    pendingProvider.value = provider
    selectedLlmProvider.value = provider
    apiKeyDraft.value = ''
    apiKeyError.value = null
  }

  function setLlmProvider(provider: LlmProviderId) {
    if (llmProviderLocked.value || serverConfigured.value) return
    if (provider !== 'openai' && provider !== 'gemini') return
    beginLlmProviderEntry(provider)
  }

  function cancelLlmProviderEntry() {
    if (verifying.value) return
    pendingProvider.value = null
    selectedLlmProvider.value = browserCredentials.value?.provider ?? null
    apiKeyDraft.value = ''
    apiKeyError.value = null
  }

  async function verifyLlmKey(provider: LlmProviderId, apiKey: string): Promise<boolean> {
    const trimmed = apiKey.trim()
    if (!trimmed) {
      apiKeyError.value = 'Enter an API key.'
      return false
    }

    verifying.value = true
    apiKeyError.value = null

    try {
      await $fetch('/api/llm/verify', {
        method: 'POST',
        body: { provider, apiKey: trimmed },
      })
      browserCredentials.value = { provider, apiKey: trimmed }
      selectedLlmProvider.value = provider
      pendingProvider.value = null
      persistBrowserCredentials(provider, trimmed)
      apiKeyDraft.value = ''
      return true
    } catch (err: unknown) {
      const data = err && typeof err === 'object' && 'data' in err
        ? (err as { data?: { message?: string } }).data
        : undefined
      apiKeyError.value = data?.message
        ?? (err instanceof Error ? err.message : 'Could not verify API key.')
      return false
    } finally {
      verifying.value = false
    }
  }

  function requireLlmProvider(): LlmProviderId | null {
    if (llmCredentialMode.value === 'server') {
      return envProvider.value ?? serverDefaultProvider.value ?? selectedLlmProvider.value
    }
    if (browserCredentials.value) return browserCredentials.value.provider
    return selectedLlmProvider.value
  }

  function getLlmCredentials(): { provider: LlmProviderId; apiKey?: string } | null {
    const mode = llmCredentialMode.value
    if (mode === 'server') {
      const provider = envProvider.value ?? serverDefaultProvider.value ?? selectedLlmProvider.value
      if (!provider || provider === 'anthropic') return null
      return { provider }
    }
    if (mode === 'browser' && browserCredentials.value) {
      return browserCredentials.value
    }
    return null
  }

  if (import.meta.client) {
    onMounted(() => {
      void refreshLlmStatus()
    })
  }

  return {
    envProvider: readonly(envProvider),
    serverConfigured: readonly(serverConfigured),
    serverDefaultProvider: readonly(serverDefaultProvider),
    selectedLlmProvider: readonly(selectedLlmProvider),
    browserCredentials: readonly(browserCredentials),
    llmProviderLocked,
    llmCredentialMode,
    llmReady,
    pendingProvider: readonly(pendingProvider),
    apiKeyDraft,
    apiKeyError: readonly(apiKeyError),
    verifying: readonly(verifying),
    beginLlmProviderEntry,
    cancelLlmProviderEntry,
    setLlmProvider,
    verifyLlmKey,
    requireLlmProvider,
    getLlmCredentials,
    refreshLlmStatus,
  }
}
