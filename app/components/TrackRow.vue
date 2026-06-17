<script setup lang="ts">
import type { ReviewTrack, TidalTrackSummary } from '../../shared/types/playlist'
import { dryRunResolveUrl, dryRunSearchResults } from '../fixtures/dry-run-tracks'

const props = defineProps<{
  track: ReviewTrack
  index: number
  total: number
  animate?: boolean
}>()

const emit = defineEmits<{
  remove: []
  moveUp: []
  moveDown: []
  reorder: [from: number, to: number]
  selectAlternative: [track: TidalTrackSummary]
}>()

const manualQuery = ref('')
const tidalUrl = ref('')
const manualResults = ref<TidalTrackSummary[]>([])
const searching = ref(false)
const resolvingUrl = ref(false)
const resolveError = ref<string | null>(null)
const dragging = ref(false)
const expanded = ref(false)
const { dryRunEnabled } = useDryRun()

watch(tidalUrl, () => {
  resolveError.value = null
})

const statusBadge = computed(() => {
  if (props.track.status === 'matched') return 'matched'
  if (props.track.status === 'manual') return 'manual'
  return props.track.status
})

const statusLabel = computed(() => {
  switch (statusBadge.value) {
    case 'matched':
      return 'Matched'
    case 'manual':
      return 'Manually Matched'
    case 'ambiguous':
      return 'Ambiguous'
    case 'not_found':
      return 'Not Found'
    default:
      return statusBadge.value
  }
})

const badgeVariant = computed(() => {
  if (statusBadge.value === 'matched' || statusBadge.value === 'manual') return 'matched'
  if (statusBadge.value === 'ambiguous') return 'ambiguous'
  return 'not-found'
})

const displayLine = computed(() => {
  if (props.track.status === 'manual' && props.track.selectedTrack) {
    return `${props.track.selectedTrack.artist} — ${props.track.selectedTrack.title}`
  }
  if (props.track.parsed) {
    return `${props.track.parsed.artist} — ${props.track.parsed.title}`
  }
  if (props.track.selectedTrack) {
    return `${props.track.selectedTrack.artist} — ${props.track.selectedTrack.title}`
  }
  return 'New track'
})

function tidalTrackUrl(id: string) {
  return `https://tidal.com/browse/track/${id}`
}

async function runManualSearch() {
  if (!manualQuery.value.trim()) return
  searching.value = true
  try {
    if (dryRunEnabled.value) {
      manualResults.value = dryRunSearchResults(manualQuery.value.trim())
      return
    }
    const query = manualQuery.value.trim()
    const { matches } = await $fetch<{ matches: { bestMatch?: TidalTrackSummary; alternatives: TidalTrackSummary[] }[] }>(
      '/api/tidal/search',
      { method: 'POST', body: { query } },
    )
    manualResults.value = matches.map(m => m.bestMatch!).filter(Boolean)
  } finally {
    searching.value = false
  }
}

function pickAlternative(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  const alt = props.track.alternatives.find(a => a.id === id)
  if (alt) pickTrack(alt)
}

function pickTrack(track: TidalTrackSummary) {
  emit('selectAlternative', track)
}

async function useTidalUrl() {
  if (!tidalUrl.value.trim()) return
  resolvingUrl.value = true
  resolveError.value = null
  try {
    const track = dryRunEnabled.value
      ? dryRunResolveUrl(tidalUrl.value.trim())
      : (await $fetch<{ track: TidalTrackSummary }>('/api/tidal/tracks/resolve', {
          method: 'POST',
          body: { url: tidalUrl.value.trim() },
        })).track
    pickTrack(track)
    tidalUrl.value = ''
  } catch (e: unknown) {
    const data = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data
      : undefined
    resolveError.value = data?.message
      ?? (e instanceof Error ? e.message : 'Could not resolve Tidal link')
  } finally {
    resolvingUrl.value = false
  }
}

function onDragStart(e: DragEvent) {
  dragging.value = true
  e.dataTransfer?.setData('text/plain', String(props.index))
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragEnd() {
  dragging.value = false
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const from = Number(e.dataTransfer?.getData('text/plain'))
  if (!Number.isNaN(from) && from !== props.index) {
    emit('reorder', from, props.index)
  }
}
</script>

<template>
  <div
    class="track-row-wrap"
    :class="[
      {
        'track-row-wrap--dragging': dragging,
        'track-row-wrap--resolving': resolvingUrl,
        'row-enter': animate,
      },
    ]"
  >
    <span class="track-row__num muted">{{ index + 1 }}</span>

    <article
      box-="round"
      shear-="top"
      class="track-row"
      :class="[`track-row--${statusBadge}`]"
      @dragover="onDragOver"
      @drop="onDrop"
    >
      <span is-="badge" cap-="square" :variant-="badgeVariant">
        {{ statusLabel }}
      </span>

      <div class="track-row__inner">
        <div class="track-row__header">
          <div class="track-row__left">
            <button
              type="button"
              size-="small"
              box-="round"
              class="track-row__handle"
              draggable="true"
              aria-label="Drag to reorder"
              title="Drag to reorder"
              @dragstart="onDragStart"
              @dragend="onDragEnd"
            >
              ⠿
            </button>
          </div>

          <div class="track-row__head">
            <p class="track-row__title" :title="displayLine">
              {{ displayLine }}
            </p>
          </div>

          <div class="track-row__actions">
            <button
              type="button"
              size-="small"
              box-="round"
              class="track-row__action"
              :aria-label="expanded ? 'Collapse' : 'Expand'"
              :title="expanded ? 'Collapse' : 'Expand'"
              @click="expanded = !expanded"
            >
              {{ expanded ? '↥' : '↧' }}
            </button>
            <button
              type="button"
              size-="small"
              box-="round"
              class="track-row__action"
              aria-label="Move up"
              :disabled="index === 0"
              @click="emit('moveUp')"
            >
              ↑
            </button>
            <button
              type="button"
              size-="small"
              box-="round"
              class="track-row__action"
              aria-label="Move down"
              :disabled="index >= total - 1"
              @click="emit('moveDown')"
            >
              ↓
            </button>
            <button
              type="button"
              size-="small"
              box-="round"
              class="track-row__action"
              aria-label="Remove"
              @click="emit('remove')"
            >
              ×
            </button>
          </div>
        </div>

        <div v-if="expanded" class="track-row__panel">
          <div
            v-if="track.alternatives.length"
            box-="round"
            shear-="top"
            class="track-row__section"
          >
            <span is-="badge" variant-="foreground2">Alternative</span>
            <select @change="pickAlternative">
              <option value="">
                Pick alternative…
              </option>
              <option
                v-for="alt in track.alternatives"
                :key="alt.id"
                :value="alt.id"
              >
                {{ alt.artist }} — {{ alt.title }}
              </option>
            </select>
          </div>

          <div box-="round" shear-="top" class="track-row__section">
            <span is-="badge" variant-="foreground2">Tidal link</span>
            <a
              v-if="track.selectedTrack"
              :href="tidalTrackUrl(track.selectedTrack.id)"
              target="_blank"
              rel="noopener noreferrer"
              class="track-row__tidal-link"
            >
              <code>{{ tidalTrackUrl(track.selectedTrack.id) }}</code>
            </a>
            <div class="track-row__inline-row">
              <input
                v-model="tidalUrl"
                size-="small"
                placeholder="Paste Tidal track URL…"
                @keydown.enter="useTidalUrl"
              >
              <button
                type="button"
                size-="small"
                box-="round"
                :disabled="resolvingUrl"
                @click="useTidalUrl"
              >
                <span v-if="resolvingUrl" is-="spinner" />
                Use
              </button>
            </div>
            <p v-if="resolveError" class="error-text track-row__resolve-error">
              {{ resolveError }}
            </p>
          </div>

          <div box-="round" shear-="top" class="track-row__section">
            <span is-="badge" variant-="foreground2">Manual search</span>
            <div class="track-row__inline-row">
              <input
                v-model="manualQuery"
                size-="small"
                placeholder="Search Tidal…"
                @keydown.enter="runManualSearch"
              >
              <button
                type="button"
                size-="small"
                box-="round"
                :disabled="searching"
                @click="runManualSearch"
              >
                Search
              </button>
            </div>
            <div v-if="manualResults.length" class="track-row__results">
              <button
                v-for="r in manualResults"
                :key="r.id"
                type="button"
                size-="small"
                box-="round"
                class="track-row__result-pick"
                @click="pickTrack(r)"
              >
                {{ r.artist }} — {{ r.title }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.track-row-wrap {
  display: flex;
  gap: 0.5ch;
  align-items: flex-start;
}

.track-row-wrap--dragging {
  opacity: 0.5;
}

.track-row-wrap--resolving {
  opacity: 0.45;
  pointer-events: none;
}

.track-row__num {
  flex-shrink: 0;
  width: 2ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
  padding-top: calc(1lh + 0.25lh);
}

.track-row {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25lh;
  padding-inline: 1ch;
  padding-bottom: 0.5lh;
  line-height: 1.35;
}

.track-row > [is-='badge'] {
  align-self: flex-start;
}

.track-row--ambiguous {
  --box-border-color: #a35200;
}

.track-row--not_found {
  --box-border-color: #c40000;
}

.track-row__inner {
  display: flex;
  flex-direction: column;
  gap: 0.5lh;
  min-width: 0;
  margin: 5px;
}

.track-row__header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.5ch;
  align-items: center;
  min-width: 0;
}

.track-row__left {
  display: flex;
  align-items: center;
}

.track-row__handle {
  cursor: grab;
}

.track-row__handle:active {
  cursor: grabbing;
}

.track-row__head {
  min-width: 0;
}

.track-row__title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-row__actions {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 0.25ch;
  align-items: center;
}

.track-row__panel {
  display: flex;
  flex-direction: column;
  gap: 0.5lh;
  min-width: 0;
  padding-top: 0.5lh;
  border-top: var(--box-border-width, 2px) solid var(--foreground2);
}

.track-row__section {
  display: flex;
  flex-direction: column;
  gap: 0.25lh;
  min-width: 0;
}

.track-row__section > [is-='badge'] {
  align-self: flex-start;
}

.track-row__inline-row {
  display: flex;
  gap: 0.5ch;
  align-items: center;
}

.track-row__inline-row input {
  flex: 1;
  min-width: 0;
}

.track-row__tidal-link {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-row__tidal-link code {
  font-size: 0.85em;
}

.track-row__results {
  display: flex;
  flex-direction: column;
  gap: 0.25lh;
}

.track-row__result-pick {
  display: flex;
  justify-content: flex-start;
  text-align: left;
  width: 100%;
}

.track-row__resolve-error {
  margin: 0;
  font-size: 0.85em;
}
</style>
