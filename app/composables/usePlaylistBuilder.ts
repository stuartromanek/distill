import type {
  MatchedSong,
  MatchingState,
  ParsedSong,
  PlaylistCreateResult,
  ReviewTrack,
  TidalAuthStatus,
  TidalTrackSummary,
  WizardStep,
} from '../../shared/types/playlist'
import {
  DRY_RUN_MATCHES,
  dryRunAppendMatch,
  dryRunMatchToReviewTrack,
  dryRunParsedSongs,
  dryRunSearchResults,
} from '../fixtures/dry-run-tracks'
import { sleep, useDryRun } from './useDryRun'

function newId() {
  return crypto.randomUUID()
}

function matchToReviewTrack(match: MatchedSong): ReviewTrack {
  const searchQuery = match.parsed
    ? match.parsed.album
      ? `${match.parsed.artist} ${match.parsed.title} ${match.parsed.album}`
      : `${match.parsed.artist} ${match.parsed.title}`
    : undefined

  return {
    id: newId(),
    parsed: match.parsed,
    selectedTrackId: match.bestMatch?.id,
    selectedTrack: match.bestMatch,
    alternatives: match.alternatives,
    status: match.status,
    autoMatch: match.bestMatch
      ? {
          trackId: match.bestMatch.id,
          title: match.bestMatch.title,
          artist: match.bestMatch.artist,
          score: match.bestMatch.score,
          searchQuery,
          strategyUsed: match.strategyUsed,
          alternatives: match.alternatives,
        }
      : searchQuery
        ? { searchQuery, strategyUsed: match.strategyUsed, alternatives: match.alternatives }
        : undefined,
  }
}

function normalizeKey(artist: string, title: string) {
  return `${artist.toLowerCase().trim()}::${title.toLowerCase().trim()}`
}

function isPlaylistReady(track: ReviewTrack) {
  return Boolean(track.selectedTrackId) && (
    track.status === 'matched'
    || track.status === 'manual'
    || track.status === 'ambiguous'
  )
}

function formatAppError(e: unknown): string {
  const data = e && typeof e === 'object' && 'data' in e
    ? (e as { data?: { message?: string } }).data
    : undefined
  const msg = data?.message
    ?? (e instanceof Error ? e.message : 'Something went wrong')
  if (/rate limit|429/i.test(msg)) {
    return 'Tidal is rate limiting — wait a minute and try again'
  }
  if (/401|Connect Tidal|session expired|Not connected/i.test(msg)) {
    return 'Tidal session expired — disconnect and reconnect, then try again'
  }
  return msg
}

export function usePlaylistBuilder() {
  const { dryRunEnabled, registerWizardReset } = useDryRun()
  const step = ref<WizardStep>('connect')
  const authStatus = ref<TidalAuthStatus>({ connected: false })
  const reviewTracks = ref<ReviewTrack[]>([])
  const matchingState = ref<MatchingState | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const playlistResult = ref<PlaylistCreateResult | null>(null)
  const appendSummary = ref<string | null>(null)
  const toastMessage = ref<string | null>(null)

  const playlistName = ref('Imported playlist')
  const playlistDescription = ref('')

  function resetWizardState() {
    reviewTracks.value = []
    matchingState.value = null
    loading.value = false
    error.value = null
    playlistResult.value = null
    appendSummary.value = null
    toastMessage.value = null
    playlistName.value = 'Imported playlist'
    playlistDescription.value = ''
    authStatus.value = { connected: false }
    step.value = 'connect'
  }

  registerWizardReset(resetWizardState)

  async function refreshAuth() {
    if (dryRunEnabled.value) {
      authStatus.value = { connected: false }
      return
    }

    try {
      authStatus.value = await $fetch<TidalAuthStatus>('/api/auth/tidal/status')
      if (authStatus.value.connected && step.value === 'connect') {
        step.value = 'input'
      }
    } catch {
      authStatus.value = { connected: false }
    }
  }

  function connectTidal() {
    if (dryRunEnabled.value) {
      authStatus.value = { connected: true, displayName: 'Dry Run' }
      step.value = 'input'
      return
    }
    window.location.href = '/api/auth/tidal/login'
  }

  async function logoutTidal() {
    if (dryRunEnabled.value) {
      authStatus.value = { connected: false }
      step.value = 'connect'
      reviewTracks.value = []
      return
    }
    await $fetch('/api/auth/tidal/logout', { method: 'POST' })
    authStatus.value = { connected: false }
    step.value = 'connect'
    reviewTracks.value = []
  }

  async function matchSongsWithProgress(songs: ParsedSong[]) {
    for (let i = 0; i < songs.length; i++) {
      const song = songs[i]!
      matchingState.value = {
        index: i,
        total: songs.length,
        current: song,
      }
      await nextTick()

      if (dryRunEnabled.value) {
        await sleep(350)
        const match = DRY_RUN_MATCHES[i] ?? DRY_RUN_MATCHES[0]!
        reviewTracks.value.push(dryRunMatchToReviewTrack(match))
      } else {
        const { matches: batch } = await $fetch<{ matches: MatchedSong[] }>('/api/tidal/search', {
          method: 'POST',
          body: { songs: [song] },
        })
        reviewTracks.value.push(matchToReviewTrack(batch[0]!))
      }
      await nextTick()
    }
  }

  async function matchDryRunFixtures() {
    const songs = dryRunParsedSongs()
    await matchSongsWithProgress(songs)
  }

  async function parseAndMatch(text?: string, images?: string[]) {
    loading.value = true
    error.value = null
    reviewTracks.value = []
    step.value = 'matching'
    matchingState.value = { parsing: true, index: 0, total: 0 }

    try {
      if (dryRunEnabled.value) {
        await sleep(400)
        await matchDryRunFixtures()
        step.value = 'review'
        return
      }

      const { songs } = await $fetch<{ songs: ParsedSong[] }>('/api/parse', {
        method: 'POST',
        body: { text, images },
      })

      if (!songs.length) {
        error.value = 'No songs found in the input.'
        step.value = 'input'
        return
      }

      await matchSongsWithProgress(songs)
      step.value = 'review'
    } catch (e: unknown) {
      error.value = formatAppError(e)
      step.value = 'input'
    } finally {
      loading.value = false
      matchingState.value = null
    }
  }

  async function appendFromInput(payload: { text: string; images: string[] }) {
    const { text, images } = payload
    loading.value = true
    appendSummary.value = null
    error.value = null

    try {
      if (dryRunEnabled.value) {
        await sleep(300)
        const appendMatch = dryRunAppendMatch()
        const key = normalizeKey(appendMatch.parsed!.artist, appendMatch.parsed!.title)
        const exists = reviewTracks.value.some(t =>
          t.parsed ? normalizeKey(t.parsed.artist, t.parsed.title) === key : false,
        )

        if (exists) {
          appendSummary.value = 'Skipped 1 duplicate'
          return
        }

        reviewTracks.value.push(dryRunMatchToReviewTrack(appendMatch))
        appendSummary.value = 'Added 1 song'
        return
      }

      const { songs } = await $fetch<{ songs: ParsedSong[] }>('/api/parse', {
        method: 'POST',
        body: { text, images },
      })

      const existingKeys = new Set(
        reviewTracks.value.map(t =>
          t.parsed
            ? normalizeKey(t.parsed.artist, t.parsed.title)
            : t.selectedTrack
              ? `track::${t.selectedTrack.id}`
              : '',
        ),
      )
      const existingTrackIds = new Set(
        reviewTracks.value.map(t => t.selectedTrackId).filter(Boolean),
      )

      const newSongs = songs.filter(s => {
        const key = normalizeKey(s.artist, s.title)
        return !existingKeys.has(key)
      })

      const skipped = songs.length - newSongs.length

      if (!newSongs.length) {
        appendSummary.value = skipped
          ? `Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}`
          : 'No new songs found'
        return
      }

      const { matches } = await $fetch<{ matches: MatchedSong[] }>('/api/tidal/search', {
        method: 'POST',
        body: { songs: newSongs },
      })

      reviewTracks.value.push(...matches.map(matchToReviewTrack))
      appendSummary.value = `Added ${matches.length} song${matches.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}`
    } catch (e: unknown) {
      error.value = formatAppError(e)
    } finally {
      loading.value = false
    }
  }

  async function searchRow(id: string, query: string) {
    const row = reviewTracks.value.find(t => t.id === id)
    if (!row) return

    if (dryRunEnabled.value) {
      const results = dryRunSearchResults(query)
      if (!results[0]) return
      row.alternatives = results
      applyTrackCorrection(row, results[0])
      return
    }

    const { matches } = await $fetch<{ matches: MatchedSong[] }>('/api/tidal/search', {
      method: 'POST',
      body: { query },
    })

    if (!matches[0]?.bestMatch) return

    row.alternatives = matches[0].alternatives
    applyTrackCorrection(row, matches[0].bestMatch)
  }

  function applyTrackCorrection(
    row: ReviewTrack,
    track: TidalTrackSummary,
  ) {
    row.selectedTrack = track
    row.selectedTrackId = track.id
    row.status = row.autoMatch?.trackId === track.id ? 'matched' : 'manual'
  }

  function selectAlternative(id: string, track: TidalTrackSummary) {
    const row = reviewTracks.value.find(t => t.id === id)
    if (!row) return
    applyTrackCorrection(row, track)
  }

  function removeRow(id: string) {
    const idx = reviewTracks.value.findIndex(t => t.id === id)
    if (idx === -1) return
    const removed = reviewTracks.value.splice(idx, 1)[0]
    toastMessage.value = `Removed "${removed?.selectedTrack?.title ?? removed?.parsed?.title ?? 'track'}"`
    setTimeout(() => { toastMessage.value = null }, 4000)
  }

  function undoRemove(track: ReviewTrack, index: number) {
    reviewTracks.value.splice(index, 0, track)
    toastMessage.value = null
  }

  function reorderRows(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return
    const items = [...reviewTracks.value]
    const [item] = items.splice(from, 1)
    if (!item) return
    items.splice(to, 0, item)
    reviewTracks.value = items
  }

  const resolvableCount = computed(() =>
    reviewTracks.value.filter(isPlaylistReady).length,
  )

  const unresolvedCount = computed(() =>
    reviewTracks.value.length - resolvableCount.value,
  )

  async function createPlaylist({ discardUnresolved = false }: { discardUnresolved?: boolean } = {}) {
    if (discardUnresolved) {
      reviewTracks.value = reviewTracks.value.filter(isPlaylistReady)
    }

    if (!reviewTracks.value.length) {
      error.value = 'No matched tracks to add to the playlist.'
      return
    }

    if (!reviewTracks.value.every(isPlaylistReady)) {
      return
    }

    loading.value = true
    error.value = null

    try {
      if (dryRunEnabled.value) {
        await sleep(500)
        playlistResult.value = {
          playlistId: 'dry-run-playlist',
          url: 'https://tidal.com/browse/playlist/dry-run-playlist',
        }
        step.value = 'done'
        return
      }

      playlistResult.value = await $fetch<PlaylistCreateResult>('/api/tidal/playlist', {
        method: 'POST',
        body: {
          name: playlistName.value,
          description: playlistDescription.value || undefined,
          trackIds: reviewTracks.value.map(t => t.selectedTrackId!),
        },
      })
      step.value = 'done'
    } catch (e: unknown) {
      error.value = formatAppError(e)
    } finally {
      loading.value = false
    }
  }

  function startOver() {
    reviewTracks.value = []
    playlistResult.value = null
    playlistName.value = 'Imported playlist'
    playlistDescription.value = ''
    error.value = null
    step.value = authStatus.value.connected ? 'input' : 'connect'
  }

  return {
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
    searchRow,
    selectAlternative,
    removeRow,
    reorderRows,
    createPlaylist,
    startOver,
    dryRunEnabled,
  }
}
