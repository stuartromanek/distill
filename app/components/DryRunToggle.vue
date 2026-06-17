<script setup lang="ts">
const { isDryRunAvailable, dryRunEnabled, toggleDryRun } = useDryRun()
</script>

<template>
  <button
    v-if="isDryRunAvailable"
    type="button"
    class="dry-run-toggle"
    :class="{ 'dry-run-toggle--on': dryRunEnabled }"
    @click="toggleDryRun"
  >
    Dry run
    <span class="dry-run-toggle__state">{{ dryRunEnabled ? 'ON' : 'OFF' }}</span>
  </button>
</template>

<style scoped>
.dry-run-toggle {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(250, 250, 250, 0.2);
  background: rgba(23, 23, 23, 0.92);
  color: #fafafa;
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
  font-family: var(--font-family);
}

.dry-run-toggle--on {
  border-color: #fbbf24;
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.35);
}

.dry-run-toggle__state {
  font-variant-numeric: tabular-nums;
  color: #fbbf24;
}

.dry-run-toggle:not(.dry-run-toggle--on) .dry-run-toggle__state {
  color: #a3a3a3;
}
</style>
