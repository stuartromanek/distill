<script setup lang="ts">
const {
  step,
  authStatus,
  reviewTracks,
  matchingState,
  loading,
  error,
  playlistResult,
  appendSummary,
  toastMessage,
  playlistName,
  playlistDescription,
  resolvableCount,
  unresolvedCount,
  refreshAuth,
  connectTidal,
  reconnectTidal,
  logoutTidal,
  parseAndMatch,
  appendFromInput,
  selectAlternative,
  removeRow,
  reorderRows,
  createPlaylist,
  startOver,
  dryRunEnabled,
} = usePlaylistBuilder()

const inputPanelRef = ref<{ addImageFiles: (files: File[]) => void } | null>(null)
const inputDragDepth = ref(0)
const inputDragActive = computed(() => step.value === 'input' && inputDragDepth.value > 0)
const { showToast } = useToast()
const DIRECT_IMAGE_UPLOAD_ERROR = 'This image can\'t be uploaded directly — try saving it first and dragging the file'
const isTidalAuthError = computed(() =>
  Boolean(error.value && /Tidal session expired|Connect Tidal|Not connected/i.test(error.value)),
)

onMounted(async () => {
  await refreshAuth()
  const route = useRoute()
  if (route.query.connected) {
    await refreshAuth()
  }
  if (route.query.auth_error) {
    error.value = String(route.query.auth_error)
  }
})

function onInputSubmit(payload: { text: string; images: string[] }) {
  parseAndMatch(payload.text, payload.images)
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
    :class="{ 'app-shell--drop-active': inputDragActive }"
    @dragenter="onInputDragEnter"
    @dragover="onInputDragOver"
    @dragleave="onInputDragLeave"
    @drop="onInputDrop"
  >
    <header
      v-if="step !== 'matching' && step !== 'review'"
      class="app-header"
    >
      <h1>Tidal Playlist</h1>
      <p class="muted">
        Turn text and images into a Tidal playlist.
      </p>
    </header>

    <main
      class="app-main"
      :class="{ 'app-main--review': step === 'matching' || step === 'review' }"
    >
      <div v-if="error" box-="round" class="error-panel">
        <p class="error-text">
          {{ error }}
        </p>
        <button
          v-if="isTidalAuthError"
          type="button"
          size-="small"
          box-="round"
          class="button-primary"
          @click="reconnectTidal"
        >
          Reconnect Tidal
        </button>
      </div>

      <TidalConnect
        v-if="step === 'connect'"
        :connected="authStatus.connected"
        :display-name="authStatus.displayName"
        @connect="connectTidal"
        @logout="logoutTidal"
      />

      <section v-else-if="step === 'input'" box-="round" shear-="top" class="panel panel--overlap">
        <div class="panel__title">
          <span is-="badge" cap-="square">Add songs</span>
        </div>
        <div class="panel__body">
          <p class="muted">
            Paste a track list, or paste or upload images of setlists, screenshots, or notes.
          </p>
          <InputPanel
            ref="inputPanelRef"
            :loading="loading"
            @submit="onInputSubmit"
          />
        </div>
      </section>

      <section v-else-if="step === 'matching' || step === 'review'" class="review-screen">
        <nav class="review-menu" aria-label="Review actions">
          <div class="review-menu__tabs">
            <span class="review-menu__tab review-menu__tab--active">Review</span>
            <button
              type="button"
              class="review-menu__tab review-menu__tab--action"
              @click="startOver"
            >
              New Playlist
            </button>
          </div>
        </nav>

        <MatchReview
          :tracks="reviewTracks"
          :matching="step === 'matching' ? matchingState : null"
          :loading="loading"
          :resolvable-count="resolvableCount"
          :unresolved-count="unresolvedCount"
          :playlist-name="playlistName"
          :playlist-description="playlistDescription"
          :append-summary="appendSummary"
          @remove="removeRow"
          @reorder="reorderRows"
          @select-alternative="selectAlternative"
          @append-input="appendFromInput"
          @create="createPlaylist"
          @update:playlist-name="playlistName = $event"
          @update:playlist-description="playlistDescription = $event"
        />
      </section>

      <PlaylistResult
        v-else-if="step === 'done' && playlistResult"
        :result="playlistResult"
        :dry-run="dryRunEnabled"
        @start-over="startOver"
      />
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
.app-main--review {
  max-width: none;
  padding-inline: var(--app-gutter);
  padding-top: 0;
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
  height: 100vh;
  min-height: 0;
  width: 100%;
}

.review-screen .review {
  flex: 1;
  height: auto;
  min-height: 0;
}

.review-menu {
  flex: 0 0 34px;
  width: 100vw;
  margin-inline: calc(var(--app-gutter, 2ch) * -1);
  display: flex;
  align-items: stretch;
  background: var(--background0);
  box-shadow: inset 0 -1px 0 var(--foreground2);
  overflow: hidden;
}

.review-menu__tabs {
  display: flex;
  align-items: stretch;
  min-width: 0;
  width: 100%;
}

.review-menu__tab {
  display: inline-flex;
  align-items: center;
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
}

.review-menu__tab--active {
  background: var(--background1);
  box-shadow: inset 0 -2px 0 var(--foreground0);
}

.review-menu__tab--action {
  cursor: pointer;
  color: var(--foreground2);
  transition-property: background-color, color, transform;
  transition-duration: 140ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.review-menu__tab--action:hover {
  background: var(--background1);
  color: var(--foreground0);
}

.review-menu__tab--action:active {
  transform: scale(0.96);
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

