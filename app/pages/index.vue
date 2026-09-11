<script setup lang="ts">
const {
  step,
  authStatus,
  selectedProvider,
  providerName,
  selectedLlmProvider,
  llmProviderLocked,
  serverConfigured,
  llmReady,
  pendingProvider,
  apiKeyDraft,
  apiKeyError,
  verifying,
  setLlmProvider,
  cancelLlmProviderEntry,
  verifyLlmKey,
  reviewTracks,
  matchingState,
  loading,
  error,
  playlistResult,
  playlistDirty,
  appendSummary,
  toastMessage,
  playlistName,
  playlistDescription,
  processedImages,
  playlistTabs,
  activePlaylistId,
  resolvableCount,
  unresolvedCount,
  refreshAuth,
  connect,
  reconnect,
  logout,
  parseAndMatch,
  toggleMatchingPause,
  appendFromInput,
  selectAlternative,
  removeRow,
  reorderRows,
  savePlaylist,
  startNewPlaylist,
  switchPlaylist,
  dryRunEnabled,
} = usePlaylistBuilder()

const inputPanelRef = ref<{ addImageFiles: (files: File[]) => void } | null>(null)
const inputDragDepth = ref(0)
const inputDragActive = computed(() => step.value === 'input' && inputDragDepth.value > 0)
const { showToast } = useToast()
const DIRECT_IMAGE_UPLOAD_ERROR = 'This image can\'t be uploaded directly — try saving it first and dragging the file'
const isAuthError = computed(() =>
  Boolean(error.value && /session expired|Connect (Tidal|Spotify)|Not connected/i.test(error.value)),
)
const connectedProvider = computed(() =>
  authStatus.value.connected ? selectedProvider.value : null,
)
const showPlaylistNav = computed(() => authStatus.value.connected)

type SetupIssue = {
  id: string
  envVar: string
  message: string
  hint?: string
}

const setupIssues = ref<SetupIssue[]>([])
const setupReady = computed(() => setupIssues.value.length === 0)

async function refreshSetupStatus() {
  try {
    const status = await $fetch<{ ready: boolean; issues: SetupIssue[] }>('/api/setup/status')
    setupIssues.value = status.issues
  } catch {
    setupIssues.value = []
  }
}

onMounted(async () => {
  await Promise.all([refreshAuth(), refreshSetupStatus()])
  const route = useRoute()
  if (route.query.connected) {
    await refreshAuth()
  }
  if (route.query.auth_error) {
    error.value = String(route.query.auth_error)
  }
})

function onInputSubmit(payload: { text: string; images: string[]; imageItems: { dataUrl: string; name: string }[] }) {
  parseAndMatch(payload.text, payload.images, payload.imageItems)
}

function getDroppedFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return []

  const directFiles = Array.from(dataTransfer.files ?? [])
  if (directFiles.length) return directFiles

  const itemFiles = Array.from(dataTransfer.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)

  return itemFiles
}

function hasDraggedUpload(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false
  const types = Array.from(dataTransfer.types ?? [])
  return Array.from(dataTransfer.items ?? []).some(item => item.kind === 'file')
    || types.includes('Files')
    || types.includes('text/uri-list')
    || types.includes('text/plain')
}

function getStringFromItem(item: DataTransferItem) {
  return new Promise<string>(resolve => item.getAsString(resolve))
}

async function getTransferText(dataTransfer: DataTransfer, type: string) {
  const item = Array.from(dataTransfer.items ?? [])
    .find(entry => entry.kind === 'string' && entry.type === type)
  if (item) {
    const value = (await getStringFromItem(item)).trim()
    if (value) return value
  }

  return dataTransfer.getData(type).trim()
}

function firstUrlFromText(text: string) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.match(/(?:https?:|blob:)[^\s]+/i)?.[0] ?? '')
    .find(Boolean)
}

async function getDroppedUrl(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return null

  const uriList = await getTransferText(dataTransfer, 'text/uri-list')
  const uri = firstUrlFromText(uriList)
  if (uri) return uri

  const plainText = await getTransferText(dataTransfer, 'text/plain')
  return firstUrlFromText(plainText) ?? null
}

function fileNameFromUrl(url: string, blob: Blob) {
  const fallbackExtension = blob.type.split('/')[1] || 'img'
  try {
    const parsed = new URL(url)
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '')
    if (name) return name
  } catch {
    /* use fallback */
  }
  return `dropped-image.${fallbackExtension}`
}

async function fetchDroppedUrlAsFile(url: string) {
  if (url.startsWith('blob:')) {
    throw new Error(DIRECT_IMAGE_UPLOAD_ERROR)
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(DIRECT_IMAGE_UPLOAD_ERROR)
    }
    const blob = await response.blob()
    return new File([blob], fileNameFromUrl(url, blob), { type: blob.type })
  } catch {
    throw new Error(DIRECT_IMAGE_UPLOAD_ERROR)
  }
}

function onInputDragEnter(event: DragEvent) {
  if (step.value !== 'input' || !hasDraggedUpload(event.dataTransfer)) return
  event.preventDefault()
  inputDragDepth.value += 1
}

function onInputDragOver(event: DragEvent) {
  if (step.value !== 'input' || !hasDraggedUpload(event.dataTransfer)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onInputDragLeave(event: DragEvent) {
  if (step.value !== 'input' || !hasDraggedUpload(event.dataTransfer)) return
  event.preventDefault()
  inputDragDepth.value = Math.max(0, inputDragDepth.value - 1)
}

async function onInputDrop(event: DragEvent) {
  if (step.value !== 'input') return
  event.preventDefault()
  const files = getDroppedFiles(event.dataTransfer)
  inputDragDepth.value = 0
  if (files.length) {
    inputPanelRef.value?.addImageFiles(files)
    return
  }

  const url = await getDroppedUrl(event.dataTransfer)
  if (!url) return

  try {
    const file = await fetchDroppedUrlAsFile(url)
    inputPanelRef.value?.addImageFiles([file])
  } catch (err) {
    showToast(err instanceof Error ? err.message : DIRECT_IMAGE_UPLOAD_ERROR, 'error')
  }
}
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--drop-active': inputDragActive,
      'app-shell--connect': step === 'connect',
    }"
    @dragenter="onInputDragEnter"
    @dragover="onInputDragOver"
    @dragleave="onInputDragLeave"
    @drop="onInputDrop"
  >
    <div
      v-if="step === 'connect'"
      class="app-connect"
    >
      <header class="app-header">
        <h1 class="app-header__title">Distill</h1>
        <p class="muted">
          Turn text and images into a playlist.
        </p>
      </header>

      <main class="app-main app-main--connect">
        <div v-if="error" box-="round" class="error-panel">
          <p class="error-text">
            {{ error }}
          </p>
          <button
            v-if="isAuthError"
            type="button"
            size-="small"
            box-="round"
            class="button-primary"
            @click="reconnect"
          >
            Reconnect {{ providerName }}
          </button>
        </div>

        <SetupRequired
          v-if="!setupReady"
          :issues="setupIssues"
        />

        <ServiceConnect
          v-else
          :connected-provider="connectedProvider"
          :selected-llm-provider="selectedLlmProvider"
          :llm-provider-locked="llmProviderLocked"
          :server-configured="serverConfigured"
          :llm-ready="llmReady"
          :pending-provider="pendingProvider"
          :api-key-draft="apiKeyDraft"
          :api-key-error="apiKeyError"
          :verifying="verifying"
          @connect="connect"
          @logout="logout"
          @select-llm="setLlmProvider"
          @cancel-llm="cancelLlmProviderEntry"
          @verify-llm="(provider, apiKey) => verifyLlmKey(provider, apiKey)"
          @update:api-key-draft="apiKeyDraft = $event"
        />
      </main>
    </div>

    <main
      v-else
      class="app-main"
      :class="{
        'app-main--with-playlist-nav': showPlaylistNav,
        'app-main--review': step === 'matching' || step === 'review',
      }"
    >
      <nav v-if="showPlaylistNav" class="playlist-menu" aria-label="Playlists">
        <div class="playlist-menu__tabs" role="tablist" aria-label="In-progress playlists">
          <button
            v-for="tab in playlistTabs"
            :key="tab.id"
            type="button"
            role="tab"
            class="playlist-menu__tab"
            :class="{
              'playlist-menu__tab--active': tab.id === activePlaylistId,
              'playlist-menu__tab--loading': tab.loading,
            }"
            :aria-selected="tab.id === activePlaylistId"
            :title="tab.label"
            @click="switchPlaylist(tab.id)"
          >
            <span class="playlist-menu__tab-label">{{ tab.label }}</span>
            <span v-if="tab.loading" class="playlist-menu__tab-status" aria-label="Loading">...</span>
          </button>
          <button
            type="button"
            class="playlist-menu__tab playlist-menu__tab--action playlist-menu__tab--new"
            aria-label="New playlist"
            title="New playlist"
            @click="startNewPlaylist"
          >
            +
          </button>
        </div>
      </nav>

      <div v-if="error" box-="round" class="error-panel">
        <p class="error-text">
          {{ error }}
        </p>
        <button
          v-if="isAuthError"
          type="button"
          size-="small"
          box-="round"
          class="button-primary"
          @click="reconnect"
        >
          Reconnect {{ providerName }}
        </button>
      </div>

      <section v-if="step === 'input'" box-="round" shear-="top" class="panel panel--overlap">
        <header class="box-header">
          <span is-="badge" cap-="square">Add songs</span>
        </header>
        <div class="panel__body">
          <p class="muted">
            Paste a track list, or paste or upload images of setlists, screenshots, or notes.
          </p>
          <InputPanel
            :key="activePlaylistId"
            ref="inputPanelRef"
            :loading="loading"
            @submit="onInputSubmit"
          />
        </div>
      </section>

      <section v-else-if="step === 'matching' || step === 'review'" class="review-screen">
        <MatchReview
          :key="activePlaylistId"
          :tracks="reviewTracks"
          :provider="selectedProvider"
          :provider-name="providerName"
          :matching="step === 'matching' ? matchingState : null"
          :loading="loading"
          :resolvable-count="resolvableCount"
          :unresolved-count="unresolvedCount"
          :playlist-name="playlistName"
          :playlist-description="playlistDescription"
          :playlist-url="playlistResult?.url"
          :playlist-dirty="playlistDirty"
          :processed-images="processedImages"
          :append-summary="appendSummary"
          @remove="removeRow"
          @reorder="reorderRows"
          @select-alternative="selectAlternative"
          @append-input="appendFromInput"
          @toggle-matching-pause="toggleMatchingPause"
          @create="savePlaylist"
          @update:playlist-name="playlistName = $event"
          @update:playlist-description="playlistDescription = $event"
        />
      </section>
    </main>

    <div v-if="toastMessage" box-="round" class="toast">
      {{ toastMessage }}
    </div>

    <div v-if="inputDragActive" class="drop-overlay">
      <div box-="round" shear-="top" class="drop-overlay__panel">
        <span is-="badge" cap-="square">Drop image</span>
        <p>Release anywhere to attach it.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-main--with-playlist-nav {
  padding-top: calc(1lh + 34px);
}

.app-main--review {
  max-width: none;
  padding-inline: var(--app-gutter);
  padding-top: 34px;
  padding-bottom: 0;
}

.error-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1ch;
  margin-bottom: 1lh;
  padding: 0.75lh 1ch;
}

.error-panel p {
  min-width: 0;
  margin: 0;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.review-screen {
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 34px);
  min-height: 0;
  width: 100%;
}

.review-screen .review {
  flex: 1;
  height: auto;
  min-height: 0;
}

.playlist-menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  height: 34px;
  min-height: 34px;
  width: 100vw;
  margin: 0;
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--foreground2);
  background: var(--background0);
  overflow: hidden;
}

.playlist-menu__tabs {
  display: flex;
  align-items: stretch;
  min-width: 0;
  width: 100%;
}

.playlist-menu__tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5ch;
  min-width: 0;
  height: 34px;
  min-height: 0;
  max-height: 34px;
  padding: 0 2ch;
  border: 0;
  border-right: 1px solid var(--foreground2);
  background: transparent;
  color: var(--foreground0);
  font: inherit;
  white-space: nowrap;
  box-sizing: border-box;
  cursor: pointer;
}

.playlist-menu__tab--active {
  background: var(--background1);
  border-bottom-color: var(--foreground0);
}

.playlist-menu__tab--action {
  color: var(--foreground2);
}

.playlist-menu__tab--new {
  justify-content: center;
  width: 34px;
  min-width: 34px;
  padding: 0;
  font-size: 1.25rem;
  line-height: 1;
}

.playlist-menu__tab-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-menu__tab-status {
  color: var(--foreground2);
  font-variant-numeric: tabular-nums;
}

.playlist-menu__tab:hover {
  background: var(--background1);
  color: var(--foreground0);
}

.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--app-gutter);
  background: rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

.drop-overlay__panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5lh;
  min-width: min(36ch, 100%);
  padding: 0 2ch 1lh;
  background: var(--background0);
}

.drop-overlay__panel p {
  margin: 0;
}
</style>

