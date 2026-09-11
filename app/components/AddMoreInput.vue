<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
  processedImages?: { id: string; dataUrl: string; name: string }[]
}>()

const emit = defineEmits<{
  submit: [payload: { text: string; images: string[]; imageItems: { dataUrl: string; name: string }[] }]
}>()

const panelRef = ref<{ clear: () => void } | null>(null)

function onSubmit(payload: { text: string; images: string[]; imageItems: { dataUrl: string; name: string }[] }) {
  emit('submit', payload)
  panelRef.value?.clear()
}
</script>

<template>
  <section box-="round" shear-="top" class="add-more">
    <header class="box-header">
      <span is-="badge" cap-="square">Add more songs</span>
    </header>
    <div class="add-more__panel">
      <InputPanel
        ref="panelRef"
        compact
        :loading="loading"
        :processed-images="processedImages"
        submit-label="Add to list"
        @submit="onSubmit"
      />
    </div>
  </section>
</template>

<style scoped>
.add-more {
  display: flex;
  flex-direction: column;
  gap: 0.75lh;
  min-height: 0;
  padding: 0 1ch 1lh;
  overflow: hidden;
}

.add-more__panel {
  flex: 1;
  display: flex;
  min-height: 0;
  padding-inline: 1ch;
  box-sizing: border-box;
}

.add-more__panel :deep(.input-panel--compact) {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>
