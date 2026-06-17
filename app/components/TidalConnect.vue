<script setup lang="ts">
defineProps<{
  connected: boolean
  displayName?: string
}>()

const emit = defineEmits<{
  connect: []
  logout: []
}>()
</script>

<template>
  <section box-="round" class="connect panel">
    <h2>Connect Tidal</h2>
    <p class="muted">
      Sign in to create and populate playlists in your Tidal account.
    </p>

    <div v-if="connected" class="connect__status">
      <span is-="badge" variant-="connected">Connected</span>
      <span v-if="displayName" class="muted">{{ displayName }}</span>
      <button type="button" size-="small" box-="round" @click="emit('logout')">
        Disconnect
      </button>
    </div>

    <button
      v-else
      type="button"
      box-="round"
      @click="emit('connect')"
    >
      Connect with Tidal
    </button>
  </section>
</template>

<style scoped>
.connect__status {
  display: flex;
  align-items: center;
  gap: 1ch;
  flex-wrap: wrap;
}
</style>
