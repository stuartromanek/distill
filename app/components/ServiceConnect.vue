<script setup lang="ts">
import {
  LLM_PROVIDERS,
  MUSIC_PROVIDERS,
  llmProviderName,
  type LlmProviderId,
  type MusicProviderId,
} from '../../shared/types/playlist'

const props = defineProps<{
  connectedProvider: MusicProviderId | null
  selectedLlmProvider: LlmProviderId | null
  llmProviderLocked?: boolean
  serverConfigured?: boolean
  llmReady?: boolean
  pendingProvider?: LlmProviderId | null
  apiKeyDraft?: string
  apiKeyError?: string | null
  verifying?: boolean
}>()

const emit = defineEmits<{
  connect: [provider: MusicProviderId]
  logout: [provider: MusicProviderId]
  selectLlm: [provider: LlmProviderId]
  cancelLlm: []
  verifyLlm: [provider: LlmProviderId, apiKey: string]
  'update:apiKeyDraft': [value: string]
}>()

const streamingProviders = MUSIC_PROVIDERS
const llmProviders = LLM_PROVIDERS

const showServerLlmInfo = computed(() =>
  Boolean(props.llmProviderLocked || props.serverConfigured),
)

const showLlmReadyState = computed(() =>
  Boolean(props.llmReady && !props.connectedProvider),
)

const showLlmPicker = computed(() =>
  !showServerLlmInfo.value && !props.llmReady,
)

function isActiveLlmOption(providerId: LlmProviderId) {
  return props.pendingProvider === providerId
}

function isHiddenLlmOption(providerId: LlmProviderId) {
  return Boolean(props.pendingProvider && props.pendingProvider !== providerId)
}

function onApiKeyInput(event: Event) {
  emit('update:apiKeyDraft', (event.target as HTMLInputElement).value)
}

function onVerify(provider: LlmProviderId) {
  emit('verifyLlm', provider, props.apiKeyDraft ?? '')
}

function registerApiKeyInput(el: unknown) {
  if (el instanceof HTMLInputElement) {
    nextTick(() => el.focus())
  }
}
</script>

<template>
  <section class="connect">
    <section box-="round" shear-="top" class="connect__section">
      <header class="connect__header">
        <div class="box-header">
          <span is-="badge" cap-="square">Streaming platform</span>
          <span
            v-if="connectedProvider"
            is-="badge"
            cap-="round"
            class="connect__ready-badge"
          >
            Connected
          </span>
        </div>
        <div class="connect__copy">
          <h2>Connect to a streaming platform</h2>
          <p v-if="connectedProvider" class="muted">
            {{ streamingProviders.find(p => p.id === connectedProvider)?.name }} is connected.
            <template v-if="!llmReady"> Choose an LLM provider below to continue.</template>
          </p>
          <p v-else class="muted">
            Choose where the finished playlist should be created.
          </p>
        </div>
      </header>

      <div class="connect__grid">
        <button
          v-for="provider in streamingProviders"
          :key="provider.id"
          type="button"
          size-="small"
          box-="round"
          :class="{ 'button-primary': connectedProvider !== provider.id }"
          @click="connectedProvider === provider.id ? emit('logout', provider.id) : emit('connect', provider.id)"
        >
          {{ connectedProvider === provider.id ? `Disconnect ${provider.name}` : `Connect to ${provider.name}` }}
        </button>
      </div>
    </section>

    <section box-="round" shear-="top" class="connect__section">
      <header class="connect__header">
        <div class="box-header">
          <span is-="badge" cap-="square">LLM provider</span>
          <span
            v-if="llmReady"
            is-="badge"
            cap-="round"
            class="connect__ready-badge"
          >
            Ready
          </span>
        </div>
        <div class="connect__copy">
          <template v-if="showLlmReadyState && selectedLlmProvider">
            <h2>LLM ready</h2>
            <p class="muted">
              <template v-if="llmProviderLocked">
                Using {{ llmProviderName(selectedLlmProvider) }} via
                <EnvVarText text="DST_LLM_PROVIDER" /> in the server environment.
              </template>
              <template v-else-if="serverConfigured">
                Using {{ llmProviderName(selectedLlmProvider) }} from the server environment.
              </template>
              <template v-else>
                Using {{ llmProviderName(selectedLlmProvider) }} with your browser API key.
              </template>
            </p>
            <p class="connect__next-step">
              Connect to Tidal or Spotify above to continue.
            </p>
          </template>

          <template v-else-if="showServerLlmInfo && selectedLlmProvider">
            <h2>LLM provider</h2>
            <p class="muted">
              <template v-if="llmProviderLocked">
                Using {{ llmProviderName(selectedLlmProvider) }} via
                <EnvVarText text="DST_LLM_PROVIDER" /> in the server environment.
              </template>
              <template v-else>
                Using {{ llmProviderName(selectedLlmProvider) }} from the server environment.
              </template>
            </p>
          </template>

          <template v-else-if="pendingProvider">
            <h2>Enter {{ llmProviderName(pendingProvider) }} API key</h2>
            <p class="muted connect__llm-key-note">
              Used only when you parse. Your key is never saved to a database or the server — it stays in this browser.
            </p>
          </template>

          <template v-else>
            <h2>Choose an LLM provider</h2>
            <p class="muted">
              Used to extract songs from text and images.
            </p>
          </template>
        </div>
      </header>

      <div v-if="showLlmPicker" class="connect__grid connect__llm-grid">
        <div
          v-for="provider in llmProviders"
          :key="provider.id"
          class="connect__llm-option"
          :class="{
            'connect__llm-option--active': isActiveLlmOption(provider.id),
            'connect__llm-option--hidden': isHiddenLlmOption(provider.id),
          }"
        >
          <div
            v-if="isActiveLlmOption(provider.id)"
            class="connect__llm-key"
          >
            <div box-="round" class="connect__llm-key-field">
              <span is-="badge" variant-="foreground2">API key</span>
              <label class="connect__llm-key-input">
                <input
                  :ref="registerApiKeyInput"
                  :value="apiKeyDraft"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="Paste your API key"
                  :disabled="verifying"
                  @input="onApiKeyInput"
                  @keydown.enter.prevent="onVerify(provider.id)"
                >
              </label>
            </div>
            <p v-if="apiKeyError" class="connect__llm-key-error">
              {{ apiKeyError }}
            </p>
          </div>

          <button
            type="button"
            size-="small"
            box-="round"
            class="button-primary"
            :disabled="verifying"
            @click="isActiveLlmOption(provider.id) ? onVerify(provider.id) : emit('selectLlm', provider.id)"
          >
            {{
              isActiveLlmOption(provider.id)
                ? (verifying ? `Checking ${provider.name}…` : `Use ${provider.name}`)
                : `Use ${provider.name}`
            }}
          </button>
          <button
            v-if="isActiveLlmOption(provider.id)"
            type="button"
            class="text-link connect__llm-back"
            :disabled="verifying"
            @click="emit('cancelLlm')"
          >
            Back to Selection
          </button>
        </div>

        <button
          type="button"
          size-="small"
          box-="round"
          class="connect__llm-option connect__llm-option--coming-soon"
          :class="{ 'connect__llm-option--hidden': Boolean(pendingProvider) }"
          disabled
        >
          Anthropic (coming soon)
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.connect {
  display: flex;
  flex-direction: column;
  gap: 1lh;
}

.connect__section {
  display: flex;
  flex-direction: column;
  gap: 1lh;
  padding: 0 1ch 1lh;
  background: var(--background0);
}

.connect__header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75lh;
}

.box-header {
  display: flex;
  align-items: center;
  gap: 0.5ch;
}

.connect__ready-badge {
  color: var(--background0);
  background: var(--foreground0);
}

.connect__copy {
  display: flex;
  flex-direction: column;
  gap: 0.25lh;
  padding-inline: 1ch;
}

.connect__copy h2,
.connect__copy p {
  margin: 0;
}

.connect__next-step {
  margin: 0;
  line-height: 1.35;
}

.connect__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75lh;
  padding-inline: 1ch;
}

.connect__llm-grid {
  gap: 0.5lh;
}

.connect__llm-option {
  display: flex;
  flex-direction: column;
  gap: 0.5lh;
  max-height: 20rem;
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 180ms ease,
    max-height 200ms ease,
    transform 180ms ease;
}

.connect__llm-option--hidden {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  margin: 0;
  gap: 0;
}

.connect__llm-option--coming-soon {
  margin-top: 0.25lh;
}

.connect__llm-key {
  display: flex;
  flex-direction: column;
  gap: 0.35lh;
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.connect__llm-key-field {
  display: flex;
  flex-direction: column;
  gap: 0.4lh;
  width: 100%;
  padding: 0 1ch 0.75lh;
  box-sizing: border-box;
}

.connect__llm-key-field > [is-='badge'] {
  align-self: flex-start;
}

.connect__llm-key-input {
  display: block;
  width: 100%;
}

.connect__llm-key-input input {
  font-family: var(--font-family);
  font-size: var(--font-size);
  line-height: var(--line-height);
  background: transparent;
  color: var(--foreground0);
  border: none;
  padding: 0.55lh 1ch;
  width: 100%;
  min-height: calc(1lh + 0.55lh);
  box-sizing: border-box;
}

.connect__llm-key-note {
  margin: 0;
  font-size: 0.9em;
  line-height: 1.35;
}

.connect__llm-key-error {
  margin: 0;
  color: #ff8f8f;
  font-size: 0.9em;
  line-height: 1.35;
}

.connect__llm-back {
  align-self: center;
  margin-top: -0.15lh;
  font-size: 0.85em;
}
</style>
