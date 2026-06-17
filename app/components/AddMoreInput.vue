<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: { text: string; images: string[] }]
}>()

const open = ref(false)
const panelRef = ref<{ clear: () => void } | null>(null)

function onSubmit(payload: { text: string; images: string[] }) {
  emit('submit', payload)
  panelRef.value?.clear()
}

watch(() => props.loading, (val, old) => {
  if (old && !val) open.value = false
})
</script>

<template>
  <section class="add-more">
    <button
      type="button"
      box-="round"
      class="add-more__toggle"
      @click="open = !open"
    >
      {{ open ? '−' : '+' }} Add more songs
    </button>

    <template v-if="open">
      <span is-="separator" direction-="horizontal" class="add-more__sep" />
      <div class="add-more__panel">
        <InputPanel
          ref="panelRef"
          compact
          :loading="loading"
          submit-label="Add to list"
          @submit="onSubmit"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.add-more {
  padding: 0.5lh 1ch;
  margin-bottom: 1lh;
}

.add-more__toggle {
  width: 100%;
  text-align: left;
}

.add-more__sep {
  display: block;
  width: 100%;
  margin: 0.5lh 0;
}

.add-more__panel {
  padding-top: 0.5lh;
}
</style>
