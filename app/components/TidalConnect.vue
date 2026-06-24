<script setup lang="ts">
defineProps<{
  connected: boolean
  displayName?: string
}>()

const emit = defineEmits<{
  connect: []
  logout: []
}>()

const streamingProviders = [
  { id: 'tidal', name: 'Tidal', available: true },
  { id: 'spotify', name: 'Spotify', available: false },
  { id: 'apple-music', name: 'Apple Music', available: false },
  { id: 'amazon-music', name: 'Amazon Music', available: false },
]

const llmProviders = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'claude', name: 'Claude' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'custom', name: 'Custom' },
]
</script>

<template>
  <section class="connect">
    <section box-="round" shear-="top" class="connect__section">
      <header class="connect__header">
        <span is-="badge" cap-="square">Streaming platform</span>
        <div class="connect__copy">
          <h2>Connect to a streaming platform</h2>
          <p class="muted">
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
          :class="{ 'button-primary': provider.available && !(provider.id === 'tidal' && connected) }"
          :disabled="!provider.available"
          @click="provider.id === 'tidal' && connected ? emit('logout') : provider.available ? emit('connect') : undefined"
        >
          {{ provider.id === 'tidal' && connected ? 'Disconnect Tidal' : `Connect to ${provider.name}` }}
        </button>
      </div>
    </section>

    <section box-="round" shear-="top" class="connect__section">
      <header class="connect__header">
        <span is-="badge" cap-="square">LLM provider</span>
        <div class="connect__copy">
          <h2>Connect to an LLM provider</h2>
          <p class="muted">
            Future connector options for extracting tracks from text and images.
          </p>
        </div>
      </header>

      <div class="connect__grid">
        <button
          v-for="provider in llmProviders"
          :key="provider.id"
          type="button"
          size-="small"
          box-="round"
          disabled
        >
          Connect to {{ provider.name }}
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

.connect__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75lh;
  padding-inline: 1ch;
}

.connect-card {
  display: flex;
  flex-direction: column;
  gap: 0.75lh;
  min-width: 0;
  padding: 0.75lh 1ch;
  background: var(--background0);
}

.connect-card--selected {
  box-shadow: inset 0 0 0 1px #007a41;
}

.connect-card__body {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1ch;
  min-width: 0;
}

.connect-card__name {
  min-width: 0;
  font-weight: var(--font-weight-bold);
}

.connect-card__meta {
  margin: -0.25lh 0 0;
  overflow-wrap: anywhere;
}

</style>
