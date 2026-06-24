<script setup lang="ts">
import type { MatchingState, ReviewTrack, TidalTrackSummary } from '../../shared/types/playlist'

const props = defineProps<{
  tracks: ReviewTrack[]
  matching?: MatchingState | null
  loading?: boolean
  resolvableCount: number
  unresolvedCount: number
  playlistName: string
  playlistDescription: string
  appendSummary?: string | null
}>()

const emit = defineEmits<{
  remove: [id: string]
  reorder: [from: number, to: number]
  selectAlternative: [id: string, track: TidalTrackSummary]
  appendInput: [payload: { text: string; images: string[] }]
  create: [options?: { discardUnresolved?: boolean }]
  'update:playlistName': [value: string]
  'update:playlistDescription': [value: string]
}>()

const showStagger = ref(false)
const discardDialog = ref<HTMLDialogElement | null>(null)

const isMatching = computed(() => Boolean(props.matching))

const matchingLine = computed(() => {
  if (!props.matching) return ''
  if (props.matching.parsing) return 'Extracting songs…'
  if (props.matching.current) {
    return `${props.matching.current.artist} — ${props.matching.current.title}`
  }
  return 'Matching…'
})

const editorStatus = computed(() => {
  if (!props.matching) return 'Fix matches, reorder, or add more songs before creating.'
  if (props.matching.parsing) return 'Extracting songs…'

  const base = `${props.tracks.length} of ${props.matching.total} matched`
  return props.matching.current
    ? `${base} · matching ${props.matching.current.artist} — ${props.matching.current.title}`
    : base
})

onMounted(() => {
  requestAnimationFrame(() => {
    showStagger.value = true
  })
})

function onCreateClick() {
  if (props.unresolvedCount > 0) {
    discardDialog.value?.showModal()
    return
  }
  emit('create')
}

function onConfirmDiscard() {
  discardDialog.value?.close()
  emit('create', { discardUnresolved: true })
}

function onCancelDiscard() {
  discardDialog.value?.close()
}

function onDiscardBackdropClick(event: MouseEvent) {
  if (event.target === discardDialog.value) {
    onCancelDiscard()
  }
}
</script>

<template>
  <section class="review" :class="{ 'review--matching': isMatching }">
    <div class="review__editor">
      <section box-="round" shear-="top" class="review__editor-panel">
        <header class="review__editor-status">
          <span is-="badge" cap-="square">
            {{ isMatching ? 'Matching tracks' : 'Review playlist' }}
          </span>
          <!-- <span class="muted review__editor-status-text">{{ editorStatus }}</span> -->
        </header>

        <div class="review__list">
          <TrackRow
            v-for="(track, index) in tracks"
            :key="track.id"
            :track="track"
            :index="index"
            :total="tracks.length + (isMatching ? 1 : 0)"
            :animate="isMatching || showStagger"
            :style="!isMatching && showStagger ? { animationDelay: `${index * 80}ms` } : undefined"
            @remove="emit('remove', track.id)"
            @move-up="emit('reorder', index, index - 1)"
            @move-down="emit('reorder', index, index + 1)"
            @reorder="(from, to) => emit('reorder', from, to)"
            @select-alternative="(t) => emit('selectAlternative', track.id, t)"
          />

          <div
            v-if="matching"
            class="matching-row-wrap row-enter"
          >
            <span class="matching-row__num muted">{{ tracks.length + 1 }}</span>
            <article box-="round" shear-="top" class="matching-row">
              <span is-="badge" variant-="foreground2">Matching</span>
              <div class="matching-row__inner">
                <p class="matching-row__title" :title="matchingLine">
                  {{ matchingLine }}
                </p>
                <span is-="spinner" />
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <aside class="review__details">
      <div class="review__add-more">
        <AddMoreInput :loading="loading" @submit="emit('appendInput', $event)" />

        <p v-if="appendSummary" class="muted">
          {{ appendSummary }}
        </p>
      </div>

      <section box-="round" shear-="top" class="review__footer">
        <span is-="badge" cap-="square">Playlist</span>

        <div class="review__footer-fields">
          <div box-="round" shear-="top" class="review__footer-field">
            <span is-="badge" variant-="foreground2">Title</span>
            <label class="review__footer-field-input">
              <input
                :value="playlistName"
                placeholder="Playlist name"
                @input="emit('update:playlistName', ($event.target as HTMLInputElement).value)"
              >
            </label>
          </div>
          <div box-="round" shear-="top" class="review__footer-field">
            <span is-="badge" variant-="foreground2">Description</span>
            <label class="review__footer-field-input">
              <input
                :value="playlistDescription"
                placeholder="Optional"
                @input="emit('update:playlistDescription', ($event.target as HTMLInputElement).value)"
              >
            </label>
          </div>
        </div>

        <div class="review__footer-actions">
          <span class="muted">
            {{ tracks.length }} track{{ tracks.length === 1 ? '' : 's' }}
            <template v-if="unresolvedCount">
              · {{ unresolvedCount }} need{{ unresolvedCount === 1 ? 's' : '' }} attention
            </template>
          </span>
          <button
            type="button"
            size-="small"
            box-="round"
            class="button-primary"
            :disabled="loading || tracks.length === 0"
            @click="onCreateClick"
          >
            <span v-if="loading" is-="spinner" />
            Create playlist
          </button>
        </div>
      </section>
    </aside>

    <Teleport to="body">
      <dialog
        ref="discardDialog"
        box-="round"
        class="review__discard"
        @click="onDiscardBackdropClick"
      >
        <div class="review__discard-body" @click.stop>
          <p class="review__discard-title">
            Discard unmatched tracks?
          </p>
          <p class="muted">
            {{ unresolvedCount }} unmatched track{{ unresolvedCount === 1 ? '' : 's' }}
            will be left out of the playlist.
          </p>
          <div class="review__discard-actions">
            <button
              type="button"
              size-="small"
              box-="round"
              variant-="foreground2"
              @click="onCancelDiscard"
            >
              Cancel
            </button>
            <button
              type="button"
              size-="small"
              box-="round"
              :disabled="resolvableCount === 0"
              @click="onConfirmDiscard"
            >
              Continue with {{ resolvableCount }} track{{ resolvableCount === 1 ? '' : 's' }}
            </button>
          </div>
        </div>
      </dialog>
    </Teleport>
  </section>
</template>

<style scoped>
.review {
  display: grid;
  grid-template-columns: minmax(0, 60vw) minmax(0, 40vw);
  height: 100%;
  width: 100vw;
  overflow: hidden;
  margin-inline: calc(var(--app-gutter, 2ch) * -1);
  padding-bottom: 0;
}

.review--matching {
  padding-bottom: 0;
}

.review__editor {
  height: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 1lh 1ch 1lh var(--app-gutter, 2ch);
  box-sizing: border-box;
}

.review__editor-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75lh;
  height: 100%;
  min-height: 0;
  padding: 0 1ch 1lh;
  box-sizing: border-box;
  overflow: hidden;
}

.review__editor-status {
  display: flex;
  align-items: center;
  gap: 1ch;
  min-width: 0;
  flex-wrap: wrap;
  padding-inline: 1ch;
  box-sizing: border-box;
}

.review__editor-status > [is-='badge'] {
  flex-shrink: 0;
}

.review__editor-status-text {
  flex: 1 1 18ch;
  min-width: 0;
  overflow: hidden;
  padding-top: 0.45lh;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review__details {
  display: grid;
  grid-template-rows: minmax(0, 60fr) minmax(0, 40fr);
  gap: 1lh;
  height: 100%;
  min-width: 0;
  padding: 1lh var(--app-gutter, 2ch) 1lh 1ch;
  box-sizing: border-box;
  overflow: hidden;
}

.review__add-more {
  display: flex;
  flex-direction: column;
  gap: 0.5lh;
  min-height: 0;
}

.review__add-more .add-more {
  flex: 1;
}

.review__list {
  display: flex;
  flex-direction: column;
  gap: 0.25lh;
  min-height: 0;
  overflow: auto;
  padding: 0 0 1lh 1ch;
  padding-right: calc(1ch + 10px);
  box-sizing: border-box;
}

.matching-row-wrap {
  display: flex;
  gap: 0.5ch;
  align-items: flex-start;
}

.matching-row__num {
  flex-shrink: 0;
  width: 2ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
  padding-top: calc(1lh + 0.25lh);
}

.matching-row {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25lh;
  padding-inline: 1ch;
  padding-bottom: 0.5lh;
  line-height: 1.35;
  opacity: 0.85;
}

.matching-row > [is-='badge'] {
  align-self: flex-start;
}

.matching-row__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1ch;
  min-width: 0;
  margin: 5px;
}

.matching-row__title {
  flex: 1 1 auto;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.matching-row__inner > [is-='spinner'] {
  flex-shrink: 0;
}

.review__discard {
  position: fixed;
  inset: 0;
  width: min(90vw, 40ch);
  height: fit-content;
  max-height: 90vh;
  margin: auto;
  padding: 0;
  overflow: hidden;
  border: var(--box-border-width, 2px) solid var(--box-border-color);
  border-radius: var(--box-rounded-radius, 4px);
  background-color: var(--background0);
  translate: none;
  transform: none;
}

.review__discard::backdrop {
  background: rgba(0, 0, 0, 0.35);
}

.review__discard-body {
  display: flex;
  flex-direction: column;
  gap: 1lh;
  padding: 1lh 1ch;
}

.review__discard-title {
  margin: 0;
  text-wrap: balance;
}

.review__discard-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5ch;
  flex-wrap: wrap;
}
</style>
