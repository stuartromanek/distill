<script setup lang="ts">
import type { MusicProviderId, ReviewTrack, TrackSummary } from '../../shared/types/playlist'
import { trackBrowseUrl } from '../../shared/types/playlist'
import { dryRunResolveUrl, dryRunSearchResults } from '../fixtures/dry-run-tracks'

const props = defineProps<{
  track: ReviewTrack
  provider: MusicProviderId
  providerName: string
  index: number
  animate?: boolean
}>()

const emit = defineEmits<{
  remove: []
  reorder: [from: number, to: number]
  selectAlternative: [track: TrackSummary]
}>()

const manualQuery = ref('')
const trackUrl = ref('')
const manualResults = ref<TrackSummary[]>([])
const searching = ref(false)
const resolvingUrl = ref(false)
const resolveError = ref<string | null>(null)
const dragging = ref(false)
const dropPosition = ref<'before' | 'after' | null>(null)
const rowEl = ref<HTMLElement | null>(null)
const dragGhostX = ref(0)
const dragGhostY = ref(0)
const dragGhostWidth = ref(320)
const dragGhostOffsetX = ref(0)
const dragGhostOffsetY = ref(0)
const expanded = ref(false)
const { dryRunEnabled } = useDryRun()
let nativeDragImageEl: HTMLElement | null = null

watch(trackUrl, () => {
  resolveError.value = null
})

onUnmounted(() => {
  cleanupNativeDragImage()
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

function providerTrackUrl(id: string) {
  return trackBrowseUrl(props.provider, id)
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
    const { matches } = await $fetch<{ matches: { bestMatch?: TrackSummary; alternatives: TrackSummary[] }[] }>(
      `/api/music/${props.provider}/search`,
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

function pickTrack(track: TrackSummary) {
  emit('selectAlternative', track)
}

async function useTrackUrl() {
  if (!trackUrl.value.trim()) return
  resolvingUrl.value = true
  resolveError.value = null
  try {
    const track = dryRunEnabled.value
      ? dryRunResolveUrl(trackUrl.value.trim())
      : (await $fetch<{ track: TrackSummary }>(`/api/music/${props.provider}/tracks/resolve`, {
          method: 'POST',
          body: { url: trackUrl.value.trim() },
        })).track
    pickTrack(track)
    trackUrl.value = ''
  } catch (e: unknown) {
    const data = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data
      : undefined
    resolveError.value = data?.message
      ?? (e instanceof Error ? e.message : `Could not resolve ${props.providerName} link`)
  } finally {
    resolvingUrl.value = false
  }
}

function updateDragGhostPosition(e: DragEvent) {
  if (e.clientX === 0 && e.clientY === 0) return
  dragGhostX.value = e.clientX
  dragGhostY.value = e.clientY
}

function cleanupNativeDragImage() {
  nativeDragImageEl?.remove()
  nativeDragImageEl = null
}

function hideNativeDragImage(e: DragEvent) {
  cleanupNativeDragImage()
  const el = document.createElement('div')
  el.style.position = 'fixed'
  el.style.top = '-100px'
  el.style.left = '-100px'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
  document.body.appendChild(el)
  nativeDragImageEl = el
  e.dataTransfer?.setDragImage(el, 0, 0)
}

function onDragStart(e: DragEvent) {
  dragging.value = true
  e.dataTransfer?.setData('text/plain', String(props.index))
  e.dataTransfer!.effectAllowed = 'move'
  const rect = rowEl.value?.getBoundingClientRect()
  if (rect) {
    dragGhostWidth.value = rect.width
    dragGhostOffsetX.value = e.clientX - rect.left
    dragGhostOffsetY.value = e.clientY - rect.top
  } else {
    dragGhostWidth.value = 320
    dragGhostOffsetX.value = 0
    dragGhostOffsetY.value = 0
  }
  updateDragGhostPosition(e)
  hideNativeDragImage(e)
}

function onDrag(e: DragEvent) {
  updateDragGhostPosition(e)
}

function onDragEnd() {
  dragging.value = false
  dropPosition.value = null
  cleanupNativeDragImage()
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  if (dragging.value) {
    dropPosition.value = null
    return
  }
  const rect = rowEl.value?.getBoundingClientRect()
  if (!rect) return
  dropPosition.value = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

function onDragLeave(e: DragEvent) {
  const nextTarget = e.relatedTarget
  if (nextTarget instanceof Node && rowEl.value?.contains(nextTarget)) return
  dropPosition.value = null
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const from = Number(e.dataTransfer?.getData('text/plain'))
  const rawTarget = props.index + (dropPosition.value === 'after' ? 1 : 0)
  const target = from < rawTarget ? rawTarget - 1 : rawTarget
  dropPosition.value = null
  if (!Number.isNaN(from) && from !== target) {
    emit('reorder', from, target)
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
        'track-row-wrap--drop-before': dropPosition === 'before',
        'track-row-wrap--drop-after': dropPosition === 'after',
        'row-enter': animate,
      },
    ]"
  >
    <span class="track-row__num muted">{{ index + 1 }}</span>

    <article
      ref="rowEl"
      box-="round"
      shear-="top"
      class="track-row"
      :class="[`track-row--${statusBadge}`]"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
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
              @drag="onDrag"
              @dragend="onDragEnd"
            >
              <span aria-hidden="true" class="track-row__handle-icon" />
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
              class="track-row__action track-row__expand-toggle"
              :class="{ 'track-row__expand-toggle--expanded': expanded }"
              :aria-label="expanded ? 'Collapse' : 'Expand'"
              :title="expanded ? 'Collapse' : 'Expand'"
              @click="expanded = !expanded"
            >
              <span
                aria-hidden="true"
                class="track-row__expand-icon track-row__expand-icon--expand"
              />
              <span
                aria-hidden="true"
                class="track-row__expand-icon track-row__expand-icon--shrink"
              />
            </button>
            <button
              type="button"
              size-="small"
              box-="round"
              class="track-row__action track-row__remove"
              aria-label="Remove"
              @click="emit('remove')"
            >
              <span aria-hidden="true" class="track-row__remove-icon" />
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
            <span is-="badge" variant-="foreground2">{{ providerName }} link</span>
            <a
              v-if="track.selectedTrack"
              :href="providerTrackUrl(track.selectedTrack.id)"
              target="_blank"
              rel="noopener noreferrer"
              class="track-row__tidal-link"
            >
              <code>{{ providerTrackUrl(track.selectedTrack.id) }}</code>
            </a>
            <div class="track-row__inline-row">
              <input
                v-model="trackUrl"
                size-="small"
                :placeholder="`Paste ${providerName} track URL…`"
                @keydown.enter="useTrackUrl"
              >
              <button
                type="button"
                size-="small"
                box-="round"
                :disabled="resolvingUrl"
                @click="useTrackUrl"
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
                :placeholder="`Search ${providerName}…`"
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

    <Teleport to="body">
      <div
        v-if="dragging"
        box-="round"
        shear-="top"
        class="track-row-ghost"
        :class="[`track-row--${statusBadge}`]"
        :style="{
          '--track-row-ghost-x': `${dragGhostX}px`,
          '--track-row-ghost-y': `${dragGhostY}px`,
          '--track-row-ghost-offset-x': `${dragGhostOffsetX}px`,
          '--track-row-ghost-offset-y': `${dragGhostOffsetY}px`,
          '--track-row-ghost-width': `${dragGhostWidth}px`,
        }"
        aria-hidden="true"
      >
        <span is-="badge" cap-="square" :variant-="badgeVariant">
          {{ statusLabel }}
        </span>
        <div class="track-row-ghost__inner">
          <span class="track-row-ghost__handle">
            <span class="track-row__handle-icon" />
          </span>
          <p class="track-row-ghost__title">
            {{ displayLine }}
          </p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.track-row-wrap {
  position: relative;
  display: flex;
  gap: 0.5ch;
  align-items: flex-start;
}

.track-row-wrap--drop-before::before,
.track-row-wrap--drop-after::after {
  content: '';
  position: absolute;
  left: calc(2ch + 0.5ch);
  right: 0;
  z-index: 10;
  height: 0;
  border-top: 2px solid var(--foreground0);
  pointer-events: none;
}

.track-row-wrap--drop-before::before {
  top: -0.125lh;
}

.track-row-wrap--drop-after::after {
  bottom: -0.125lh;
}

.track-row-wrap--dragging {
  opacity: 0.5;
}

.track-row-wrap--resolving {
  opacity: 0.45;
  pointer-events: none;
}

.track-row-ghost {
  position: fixed;
  left: var(--track-row-ghost-x);
  top: var(--track-row-ghost-y);
  z-index: 2000;
  width: min(var(--track-row-ghost-width), calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25lh;
  padding: 0.75lh 1.5ch 0.875lh;
  box-sizing: border-box;
  background: var(--background0);
  color: var(--foreground0);
  line-height: 1.35;
  pointer-events: none;
  transform: translate(
    calc(var(--track-row-ghost-offset-x) * -1),
    calc(var(--track-row-ghost-offset-y) * -1)
  );
  box-shadow: var(--shadow-menu);
}

.track-row-ghost > [is-='badge'] {
  align-self: flex-start;
}

.track-row-ghost__inner {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5ch;
  align-items: center;
  min-width: 0;
}

.track-row-ghost__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(1lh + var(--box-border-width, 2px) * 2 + 6px);
  height: calc(1lh + var(--box-border-width, 2px) * 2 + 6px);
  color: var(--foreground1);
}

.track-row-ghost__title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  padding: 0.75lh 1.5ch 0.875lh;
  line-height: 1.35;
}

.track-row > [is-='badge'] {
  align-self: flex-start;
}

.track-row--ambiguous {
  --box-border-color: #a35200;
}

.track-row--not_found {
  --box-border-color: rgb(239 68 68);
}

.track-row__inner {
  display: flex;
  flex-direction: column;
  gap: 0.5lh;
  min-width: 0;
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

.track-row__handle,
.track-row__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-width: 2px;
  outline-width: 1px;
  width: calc(1lh + var(--box-border-width, 2px) * 2 + 6px);
  min-width: calc(1lh + var(--box-border-width, 2px) * 2 + 6px);
  height: calc(1lh + var(--box-border-width, 2px) * 2 + 6px);
  min-height: calc(1lh + var(--box-border-width, 2px) * 2 + 6px);
  padding: 0;
}

.track-row__handle {
  color: var(--foreground1);
  cursor: grab;
}

.track-row__handle:hover {
  color: var(--foreground0);
}

.track-row__handle:active {
  cursor: grabbing;
}

.track-row__handle-icon {
  display: block;
  width: 1rem;
  height: 1rem;
  background: currentColor;
  mask: url('/icons/Interface-Essential-Move--Streamline-Pixel.svg') center / contain no-repeat;
}

.track-row__remove {
  color: var(--foreground1);
}

.track-row__remove:hover {
  color: var(--foreground0);
}

.track-row__remove-icon {
  display: block;
  width: 1rem;
  height: 1rem;
  background: currentColor;
  mask: url('/icons/Interface-Essential-Bin--Streamline-Pixel.svg') center / contain no-repeat;
}

.track-row__expand-toggle {
  position: relative;
  color: var(--foreground1);
}

.track-row__expand-toggle:hover {
  color: var(--foreground0);
}

.track-row__expand-icon {
  position: absolute;
  display: block;
  width: 1rem;
  height: 1rem;
  background: currentColor;
  opacity: 0;
  filter: blur(4px);
  transform: scale(0.25);
}

.track-row__expand-icon--expand {
  mask: url('/icons/Interface-Essential-Expand-2--Streamline-Pixel.svg?v=2') center / contain no-repeat;
}

.track-row__expand-icon--shrink {
  mask: url('/icons/Interface-Essential-Shrink-2--Streamline-Pixel.svg') center / contain no-repeat;
}

.track-row__expand-toggle:not(.track-row__expand-toggle--expanded) .track-row__expand-icon--expand,
.track-row__expand-toggle--expanded .track-row__expand-icon--shrink {
  opacity: 1;
  filter: blur(0);
  transform: scale(1);
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
