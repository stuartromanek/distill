<script setup lang="ts">
const {
  step,
  authStatus,
  reviewTracks,
  matchingState,
  loading,
  error,
  playlistResult,
  appendSummary,
  toastMessage,
  playlistName,
  playlistDescription,
  resolvableCount,
  unresolvedCount,
  refreshAuth,
  connectTidal,
  logoutTidal,
  parseAndMatch,
  appendFromInput,
  selectAlternative,
  removeRow,
  reorderRows,
  createPlaylist,
  startOver,
  dryRunEnabled,
} = usePlaylistBuilder()

onMounted(async () => {
  await refreshAuth()
  const route = useRoute()
  if (route.query.connected) {
    await refreshAuth()
  }
  if (route.query.auth_error) {
    error.value = String(route.query.auth_error)
  }
})

function onInputSubmit(payload: { text: string; images: string[] }) {
  parseAndMatch(payload.text, payload.images)
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>Tidal Playlist</h1>
      <p class="muted">
        Turn text and images into a Tidal playlist.
      </p>
    </header>

    <main class="app-main">
      <p v-if="error" class="error-text">
        {{ error }}
      </p>

      <TidalConnect
        v-if="step === 'connect'"
        :connected="authStatus.connected"
        :display-name="authStatus.displayName"
        @connect="connectTidal"
        @logout="logoutTidal"
      />

      <section v-else-if="step === 'input'" box-="round" shear-="top" class="panel panel--overlap">
        <h2 class="panel__title">
          <span is-="badge" cap-="square">Add songs</span>
        </h2>
        <div class="panel__body">
          <p class="muted">
            Paste a track list, or paste or upload images of setlists, screenshots, or notes.
          </p>
          <InputPanel
            :loading="loading"
            @submit="onInputSubmit"
          />
        </div>
      </section>

      <section v-else-if="step === 'matching' || step === 'review'" box-="round" class="panel">
        <h2>{{ step === 'matching' ? 'Matching tracks' : 'Review playlist' }}</h2>
        <p class="muted">
          <template v-if="step === 'matching' && matchingState?.parsing">
            Extracting songs…
          </template>
          <template v-else-if="step === 'matching' && matchingState">
            {{ reviewTracks.length }} of {{ matchingState.total }} matched
            <template v-if="matchingState.current">
              · matching {{ matchingState.current.artist }} — {{ matchingState.current.title }}
            </template>
          </template>
          <template v-else>
            Fix matches, reorder, or add more songs before creating.
          </template>
        </p>
        <MatchReview
          :tracks="reviewTracks"
          :matching="step === 'matching' ? matchingState : null"
          :loading="loading"
          :resolvable-count="resolvableCount"
          :unresolved-count="unresolvedCount"
          :playlist-name="playlistName"
          :playlist-description="playlistDescription"
          :append-summary="appendSummary"
          @remove="removeRow"
          @reorder="reorderRows"
          @select-alternative="selectAlternative"
          @append-input="appendFromInput"
          @create="createPlaylist"
          @update:playlist-name="playlistName = $event"
          @update:playlist-description="playlistDescription = $event"
        />
      </section>

      <PlaylistResult
        v-else-if="step === 'done' && playlistResult"
        :result="playlistResult"
        :dry-run="dryRunEnabled"
        @start-over="startOver"
      />
    </main>

    <div v-if="toastMessage" box-="round" class="toast">
      {{ toastMessage }}
    </div>
  </div>
</template>

