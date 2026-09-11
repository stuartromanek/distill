<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
  submitLabel?: string
  compact?: boolean
  processedImages?: { id: string; dataUrl: string; name: string }[]
}>()

const emit = defineEmits<{
  submit: [payload: { text: string; images: string[]; imageItems: { dataUrl: string; name: string }[] }]
}>()

const text = ref('')
const images = ref<{ id: string; dataUrl: string; name: string }[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const previewDialog = ref<HTMLDialogElement | null>(null)
const previewId = ref<string | null>(null)
const { showToast } = useToast()

const processedImages = computed(() => props.processedImages ?? [])
const previewImage = computed(() =>
  [...processedImages.value, ...images.value].find(img => img.id === previewId.value) ?? null,
)
const displayedImages = computed(() => [
  ...processedImages.value.map(img => ({ ...img, processed: true })),
  ...images.value.map(img => ({ ...img, processed: false })),
])
const imageSlotCount = computed(() => processedImages.value.length + images.value.length)

const MAX_IMAGES = 5
const MAX_SIZE = 5 * 1024 * 1024

function isImageFile(file: File) {
  return file.type.startsWith('image/')
    || /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name)
}

function fileLabel(file: File) {
  return file.name || 'Dropped file'
}

function validateImageFile(file: File) {
  if (!isImageFile(file)) {
    return `${fileLabel(file)} is not a supported image. Use PNG, JPG, GIF, WebP, AVIF, or HEIC.`
  }
  if (file.size > MAX_SIZE) {
    return `${fileLabel(file)} is too large. Images must be 5 MB or smaller.`
  }
  return null
}

function addImageFile(file: File, name?: string) {
  const issue = validateImageFile(file)
  if (issue) {
    showToast(issue, 'error')
    return false
  }

  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      images.value.push({
        id: crypto.randomUUID(),
        dataUrl: reader.result,
        name: name ?? file.name ?? 'pasted-image.png',
      })
    }
  }
  reader.readAsDataURL(file)
  return true
}

function addImageFiles(files: File[]) {
  for (const file of files) {
    if (imageSlotCount.value >= MAX_IMAGES) {
      showToast(`You can attach up to ${MAX_IMAGES} images. Remove one before adding more.`, 'error')
      break
    }
    addImageFile(file)
  }
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  addImageFiles(Array.from(input.files ?? []))
  input.value = ''
}

function onPaste(event: ClipboardEvent) {
  if (props.loading) return

  const imageFiles = Array.from(event.clipboardData?.items ?? [])
    .filter(item => item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)

  if (!imageFiles.length) return

  event.preventDefault()
  addImageFiles(imageFiles)
}

onMounted(() => {
  document.addEventListener('paste', onPaste, true)
})

onUnmounted(() => {
  document.removeEventListener('paste', onPaste, true)
})

function removeImage(id: string) {
  if (previewId.value === id) {
    closePreview()
  }
  images.value = images.value.filter(img => img.id !== id)
}

function openPreview(id: string) {
  previewId.value = id
  previewDialog.value?.showModal()
}

function closePreview() {
  previewDialog.value?.close()
}

function onPreviewBackdropClick(event: MouseEvent) {
  if (event.target === previewDialog.value) {
    closePreview()
  }
}

function onPreviewClosed() {
  previewId.value = null
}

function submit() {
  if (props.loading) return
  if (!text.value.trim() && !images.value.length) return

  emit('submit', {
    text: text.value.trim(),
    images: images.value.map(i => i.dataUrl),
    imageItems: images.value.map(i => ({ dataUrl: i.dataUrl, name: i.name })),
  })
}

function clear() {
  text.value = ''
  images.value = []
  closePreview()
}

defineExpose({ clear, addImageFiles })
</script>

<template>
  <div class="input-panel" :class="{ 'input-panel--compact': compact }">
    <label box-="round" class="input-panel__textarea-wrap">
      <textarea
        v-model="text"
        placeholder="Paste a track list, setlist, or song mentions…"
        :disabled="loading"
      />
    </label>

    <div box-="round" class="input-panel__images">
      <div
        v-if="displayedImages.length"
        class="input-panel__images-header"
      >
        <span class="micro-label">Images</span>
        <span class="input-panel__images-count">{{ imageSlotCount }}/{{ MAX_IMAGES }}</span>
      </div>

      <div
        class="input-panel__images-grid"
        :class="{ 'input-panel__images-grid--empty': !displayedImages.length }"
      >
        <div
          v-for="img in displayedImages"
          :key="img.id"
          class="input-panel__thumb input-panel__tile"
          :class="{ 'input-panel__thumb--processed': img.processed }"
        >
          <img :src="img.dataUrl" :alt="img.name">
          <div class="input-panel__thumb-actions">
            <button
              type="button"
              class="input-panel__thumb-action"
              aria-label="View larger"
              @click="openPreview(img.id)"
            >
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                <circle cx="5" cy="5" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5" />
                <path d="M7.5 7.5 10.5 10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
            <button
              v-if="!img.processed"
              type="button"
              class="input-panel__thumb-action"
              aria-label="Remove image"
              @click="removeImage(img.id)"
            >
              ×
            </button>
          </div>
        </div>

        <label
          v-if="imageSlotCount < MAX_IMAGES"
          class="input-panel__add input-panel__tile"
          :class="{ 'input-panel__add--disabled': loading }"
        >
          <span class="input-panel__add-icon" aria-hidden="true" />
          <span class="input-panel__add-label">add image</span>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            multiple
            hidden
            :disabled="loading"
            @change="onFilesSelected"
          >
        </label>
      </div>
    </div>

    <button
      type="button"
      size-="small"
      box-="round"
      class="button-primary"
      :disabled="loading || (!text.trim() && !images.length)"
      @click="submit"
    >
      <span v-if="loading" is-="spinner" />
      {{ submitLabel ?? 'Find songs' }}
    </button>

    <Teleport to="body">
      <dialog
        ref="previewDialog"
        class="input-panel__preview"
        @click="onPreviewBackdropClick"
        @close="onPreviewClosed"
      >
        <div
          v-if="previewImage"
          class="input-panel__preview-body"
          @click.stop
        >
          <div class="input-panel__preview-media">
            <img
              :src="previewImage.dataUrl"
              :alt="previewImage.name"
              class="input-panel__preview-image"
            >
          </div>
          <footer class="input-panel__preview-footer">
            <span class="input-panel__preview-name">{{ previewImage.name }}</span>
            <button
              type="button"
              box-="round"
              size-="small"
              @click="closePreview"
            >
              Close
            </button>
          </footer>
        </div>
      </dialog>
    </Teleport>
  </div>
</template>

<style scoped>
.input-panel {
  display: flex;
  flex-direction: column;
  gap: 1lh;
}

.input-panel--compact {
  flex: 1;
  gap: 0.35lh;
  min-height: 0;
  height: 100%;
}

.input-panel__textarea-wrap {
  display: block;
  width: 100%;
}

.input-panel__textarea-wrap textarea {
  min-height: 8lh;
  width: 100%;
  resize: vertical;
}

.input-panel--compact .input-panel__textarea-wrap textarea {
  min-height: 4lh;
}

.input-panel__images {
  --image-tile-size: calc(5 * var(--font-size) * var(--line-height));
  display: flex;
  flex-direction: column;
  gap: 0.5lh;
}

.input-panel--compact .input-panel__images {
  --image-tile-size: calc(3 * var(--font-size) * var(--line-height));
  gap: 0.25lh;
}

.input-panel__images-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1ch;
}

.input-panel__images-count {
  font-size: 0.625rem;
  font-variant-numeric: tabular-nums;
  color: var(--foreground2);
}

.input-panel__images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--image-tile-size));
  gap: 0.5lh;
  align-items: start;
}

.input-panel--compact .input-panel__images-grid {
  gap: 0.25lh;
}

.input-panel__images-grid--empty {
  display: block;
}

.input-panel__images-grid--empty .input-panel__add {
  width: 100%;
  max-width: none;
  flex-direction: row;
  gap: 0.75ch;
  border-style: dashed;
}

.input-panel__images-grid--empty .input-panel__add-label {
  font-size: 1.25rem;
}

.input-panel__images-grid--empty .input-panel__add-icon {
  width: 2.5rem;
  height: 2.5rem;
}

.input-panel--compact .input-panel__images-grid--empty .input-panel__add {
  min-height: calc(1lh + var(--box-border-width, 2px) * 2);
  padding-block: 0;
}

.input-panel__tile {
  width: var(--image-tile-size);
  height: var(--image-tile-size);
  min-width: var(--image-tile-size);
  min-height: var(--image-tile-size);
  max-width: var(--image-tile-size);
  max-height: var(--image-tile-size);
  box-sizing: border-box;
}

.input-panel__thumb {
  position: relative;
  overflow: hidden;
  border: var(--box-border-width, 2px) solid var(--box-border-color);
}

.input-panel__thumb--processed {
  --box-border-color: var(--foreground2);
}

.input-panel__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

[data-webtui-theme='dark'] .input-panel__thumb img {
  outline-color: rgba(255, 255, 255, 0.1);
}

.input-panel__thumb-actions {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
}

.input-panel__thumb-action {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25lh;
  height: 1.25lh;
  padding: 0;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-family: var(--font-family);
  font-size: 0.875rem;
  line-height: 1;
  cursor: pointer;
}

.input-panel__thumb-action + .input-panel__thumb-action {
  border-left: 1px solid rgba(255, 255, 255, 0.2);
}

.input-panel__thumb-action::after {
  content: '';
  position: absolute;
  inset: -0.375lh;
}

.input-panel__thumb-action:hover {
  background: rgba(0, 0, 0, 0.72);
}

.input-panel__thumb-action:active {
  transform: scale(0.96);
}

.input-panel__preview {
  position: fixed;
  inset: 0;
  width: min(90vw, 64ch);
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

.input-panel__preview::backdrop {
  background: rgba(0, 0, 0, 0.65);
}

.input-panel__preview-body {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: hidden;
  min-height: 0;
}

.input-panel__preview-media {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  max-height: calc(90vh - 3lh);
  overflow: hidden;
  background: var(--background1);
}

.input-panel__preview-image {
  display: block;
  max-width: 100%;
  max-height: calc(90vh - 3lh);
  width: auto;
  height: auto;
  object-fit: contain;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

[data-webtui-theme='dark'] .input-panel__preview-image {
  outline-color: rgba(255, 255, 255, 0.1);
}

.input-panel__preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1ch;
  flex-shrink: 0;
  padding: 0.5lh 1ch;
  border-top: var(--box-border-width, 2px) solid var(--box-border-color);
}

.input-panel__preview-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--foreground2);
  font-size: 0.875rem;
}

.input-panel__add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125lh;
  margin: 0;
  border: var(--box-border-width, 2px) dashed var(--foreground2);
  background: color-mix(in srgb, var(--background1) 72%, transparent);
  color: var(--foreground2);
  font-family: var(--font-family);
  font-size: var(--font-size);
  line-height: var(--line-height);
  cursor: pointer;
}

.input-panel__add-icon {
  display: block;
  width: 2.5rem;
  height: 2.5rem;
  background: currentColor;
  mask: url('/icons/Photography-Photo-Image--Streamline-Pixel.svg') center / contain no-repeat;
}

.input-panel__add-label {
  font-family: var(--font-family-heading);
  font-size: 0.875rem;
  letter-spacing: 0.04em;
}

.input-panel--compact .input-panel__add-label {
  font-size: 0.5625rem;
}

.input-panel--compact .input-panel__images-grid--empty .input-panel__add-icon {
  width: 2rem;
  height: 2rem;
}

.input-panel--compact .input-panel__images-grid--empty .input-panel__add-label {
  font-size: 1rem;
}

.input-panel--compact > button[box-] {
  margin-top: auto;
  width: 100%;
}

.input-panel__add:hover:not(.input-panel__add--disabled) {
  background: color-mix(in srgb, var(--foreground0) 8%, var(--background1));
  color: var(--foreground0);
  border-color: var(--foreground0);
}

.input-panel__add:active:not(.input-panel__add--disabled) {
  transform: scale(0.96);
}

.input-panel__add--disabled {
  cursor: not-allowed;
  opacity: 0.45;
  pointer-events: none;
}
</style>
