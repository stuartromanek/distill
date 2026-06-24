<template>
  <div data-webtui-theme="dark">
    <NuxtRouteAnnouncer />
    <NuxtPage />
    <ClientOnly>
      <AppToasts />
      <DryRunToggle v-if="showDevControls" />
      <DevRequestHud v-if="showDevControls" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
const showDevControls = false
</script>
