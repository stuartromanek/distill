<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
    <ClientOnly>
      <DryRunToggle v-if="isDev" />
      <DevRequestHud v-if="isDev" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
const isDev = import.meta.dev
</script>
