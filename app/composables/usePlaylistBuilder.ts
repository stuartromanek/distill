import type {
  MatchedSong,
  MatchingState,
  ParsedSong,
  PlaylistCreateResult,
  PlaylistMetadataSuggestion,
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
  dryRunPlaylistSuggestion,
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
    return TIDAL_RECONNECT_MESSAGE
  }
  return msg
}

const TIDAL_RECONNECT_MESSAGE = 'Tidal session expired — reconnect, then try again'
const TIDAL_POPUP_MESSAGE = 'tidal-oauth'
const TIDAL_POPUP_FEATURES = [
  'popup=yes',
  'width=520',
  'height=720',
  'left=120',
  'top=80',
  'noopener=no',
  'noreferrer=no',
].join(',')

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
  let workVersion = 0

  function beginWork() {
    workVersion += 1
    return workVersion
  }

  function cancelCurrentWork() {
    workVersion += 1
  }

  function isCurrentWork(version: number) {
    return version === workVersion
  }

  function applyPlaylistSuggestion(playlist?: PlaylistMetadataSuggestion) {
    const name = playlist?.name?.trim()
    const description = playlist?.description?.trim()
    if (name) playlistName.value = name
    if (description) playlistDescription.value = description
  }

  function resetWizardState() {
    cancelCurrentWork()
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
      return authStatus.value
    }

    try {
      authStatus.value = await $fetch<TidalAuthStatus>('/api/auth/tidal/status')
      if (authStatus.value.connected && step.value === 'connect') {
        step.value = 'input'
      }
    } catch {
      authStatus.value = { connected: false }
    }

    return authStatus.value
  }

  function connectTidal() {
    if (dryRunEnabled.value) {
      authStatus.value = { connected: true, displayName: 'Dry Run' }
      step.value = 'input'
      return
    }

    error.value = null
    const popup = window.open('/api/auth/tidal/login?popup=1', 'tidal-connect', TIDAL_POPUP_FEATURES)

    if (!popup) {
      error.value = 'Could not open the Tidal sign-in popup. Please allow popups and try again.'
      return
    }

    popup.focus()

    function cleanupPopupListeners() {
      window.clearInterval(authPollTimer)
      window.clearTimeout(authTimeout)
      window.removeEventListener('message', onPopupMessage)
    }

    const authPollTimer = window.setInterval(async () => {
      const status = await refreshAuth()
      if (status.connected) {
        cleanupPopupListeners()
        popup.close()
      }
    }, 1500)

    const authTimeout = window.setTimeout(() => {
      cleanupPopupListeners()
    }, 10 * 60 * 1000)

    async function onPopupMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (!event.data || typeof event.data !== 'object') return
      if ((event.data as { type?: string }).type !== TIDAL_POPUP_MESSAGE) return

      cleanupPopupListeners()
      popup.close()

      const data = event.data as { ok?: boolean; message?: string }
      if (!data.ok) {
        error.value = data.message ?? 'Tidal sign-in failed.'
        return
      }

      await refreshAuth()
    }

    window.addEventListener('message', onPopupMessage)
  }

  function reconnectTidal() {
    connectTidal()
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

  async function matchSongsWithProgress(songs: ParsedSong[], workId: number) {
    for (let i = 0; i < songs.length; i++) {
      if (!isCurrentWork(workId)) return false

      const song = songs[i]!
      matchingState.value = {
        index: i,
        total: songs.length,
        current: song,
      }
      await nextTick()
      if (!isCurrentWork(workId)) return false

      if (dryRunEnabled.value) {
        await sleep(350)
        if (!isCurrentWork(workId)) return false
        const match = DRY_RUN_MATCHES[i] ?? DRY_RUN_MATCHES[0]!
        reviewTracks.value.push(dryRunMatchToReviewTrack(match))
      } else {
        const { matches: batch } = await $fetch<{ matches: MatchedSong[] }>('/api/tidal/search', {
          method: 'POST',
          body: { songs: [song] },
        })
        if (!isCurrentWork(workId)) return false
        reviewTracks.value.push(matchToReviewTrack(batch[0]!))
      }
      await nextTick()
    }
    return true
  }

  async function matchDryRunFixtures(workId: number) {
    const songs = dryRunParsedSongs()
    return matchSongsWithProgress(songs, workId)
  }

  async function parseAndMatch(text?: string, images?: string[]) {
    const workId = beginWork()
    loading.value = true
    error.value = null
    reviewTracks.value = []
    step.value = 'matching'
    matchingState.value = { parsing: true, index: 0, total: 0 }

    try {
      if (dryRunEnabled.value) {
        await sleep(400)
        if (!isCurrentWork(workId)) return
        applyPlaylistSuggestion(dryRunPlaylistSuggestion())
        const completed = await matchDryRunFixtures(workId)
        if (!completed || !isCurrentWork(workId)) return
        step.value = 'review'
        return
      }

      const { songs, playlist } = await $fetch<{
        songs: ParsedSong[]
        playlist?: PlaylistMetadataSuggestion
      }>('/api/parse', {
        method: 'POST',
        body: { text, images },
      })
      if (!isCurrentWork(workId)) return

      if (!songs.length) {
        error.value = 'No songs found in the input.'
        step.value = 'input'
        return
      }

      applyPlaylistSuggestion(playlist)
      const completed = await matchSongsWithProgress(songs, workId)
      if (!completed || !isCurrentWork(workId)) return
      step.value = 'review'
    } catch (e: unknown) {
      if (!isCurrentWork(workId)) return
      error.value = formatAppError(e)
      step.value = 'input'
    } finally {
      if (isCurrentWork(workId)) {
        loading.value = false
        matchingState.value = null
      }
    }
  }

  async function appendFromInput(payload: { text: string; images: string[] }) {
    const { text, images } = payload
    const workId = workVersion
    loading.value = true
    appendSummary.value = null
    error.value = null

    try {
      if (dryRunEnabled.value) {
        await sleep(300)
        if (!isCurrentWork(workId)) return
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
      if (!isCurrentWork(workId)) return

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
      if (!isCurrentWork(workId)) return

      reviewTracks.value.push(...matches.map(matchToReviewTrack))
      appendSummary.value = `Added ${matches.length} song${matches.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}`
    } catch (e: unknown) {
      if (!isCurrentWork(workId)) return
      error.value = formatAppError(e)
    } finally {
      if (isCurrentWork(workId)) {
        loading.value = false
      }
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
    const workId = workVersion

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
        if (!isCurrentWork(workId)) return
        playlistResult.value = {
          playlistId: 'dry-run-playlist',
          url: 'https://tidal.com/browse/playlist/dry-run-playlist',
        }
        step.value = 'done'
        return
      }

      const status = await refreshAuth()
      if (!isCurrentWork(workId)) return
      if (!status.connected) {
        error.value = TIDAL_RECONNECT_MESSAGE
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
      if (!isCurrentWork(workId)) return
      step.value = 'done'
    } catch (e: unknown) {
      if (!isCurrentWork(workId)) return
      error.value = formatAppError(e)
    } finally {
      if (isCurrentWork(workId)) {
        loading.value = false
      }
    }
  }

  function startOver() {
    cancelCurrentWork()
    reviewTracks.value = []
    matchingState.value = null
    loading.value = false
    playlistResult.value = null
    appendSummary.value = null
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
    reconnectTidal,
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
