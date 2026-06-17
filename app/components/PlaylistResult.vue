<script setup lang="ts">
import type { PlaylistCreateResult } from '../../shared/types/playlist'

defineProps<{
  result: PlaylistCreateResult
  dryRun?: boolean
}>()

const emit = defineEmits<{
  startOver: []
}>()

const visible = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    visible.value = true
  })
})
</script>

<template>
  <section box-="round" class="result panel" :class="{ 'result--visible': visible }">
    <h2>Playlist created</h2>
    <p class="muted">
      <template v-if="dryRun">
        Dry run — no playlist was created on Tidal.
      </template>
      <template v-else>
        Your playlist is ready on Tidal.
      </template>
    </p>

    <a
      v-if="result.url && !dryRun"
      :href="result.url"
      target="_blank"
      rel="noopener noreferrer"
      is-="button"
      class="result__link"
    >
      Open in Tidal
    </a>

    <p v-if="result.failures?.length" class="error-text">
      {{ result.failures.length }} track(s) could not be added.
    </p>

    <button
      type="button"
      size-="small"
      box-="round"
      @click="emit('startOver')"
    >
      Start over
    </button>
  </section>
</template>

<style scoped>
.result {
  align-items: flex-start;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.35s cubic-bezier(0.2, 0, 0, 1), transform 0.35s cubic-bezier(0.2, 0, 0, 1);
}

.result--visible {
  opacity: 1;
  transform: translateY(0);
}

.result__link {
  text-decoration: none;
}
</style>
