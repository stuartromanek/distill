import type {
  AuthStatus,
  MatchedSong,
  MatchingState,
  MusicProviderId,
  ParsedSong,
  PlaylistCreateResult,
  PlaylistMetadataSuggestion,
  ReviewTrack,
  TrackSummary,
  WizardStep,
} from '../../shared/types/playlist'
import { musicProviderName } from '../../shared/types/playlist'
import {
  DRY_RUN_MATCHES,
  dryRunAppendMatch,
  dryRunMatchToReviewTrack,
  dryRunParsedSongs,
  dryRunPlaylistSuggestion,
  dryRunSearchResults,
} from '../fixtures/dry-run-tracks'
import { sleep, useDryRun } from './useDryRun'
import { useLlmProvider } from './useLlmProvider'
import { useToast } from './useToast'

const PROVIDER_STORAGE_KEY = 'music-playlist:provider'
const OAUTH_POPUP_MESSAGE = 'music-oauth'
const DEFAULT_PLAYLIST_NAME = 'Imported playlist'
const POPUP_FEATURES = [
  'popup=yes',
  'width=520',
  'height=720',
  'left=120',
  'top=80',
].join(',')

const OAUTH_STORAGE_KEY = 'music-oauth'

let oauthPopup: Window | null = null
let oauthPopupCleanup: (() => void) | null = null

type PlaylistSessionStep = Exclude<WizardStep, 'connect'>

type PlaylistInputImage = {
  id: string
  dataUrl: string
  name: string
}

type SavedPlaylistState = {
  name: string
  description: string
  trackIds: string[]
}

type PlaylistSession = {
  id: string
  step: PlaylistSessionStep
  reviewTracks: ReviewTrack[]
  matchingState: MatchingState | null
  matchingPaused: boolean
  matchingPauseWaiters: Array<() => void>
  loading: boolean
  error: string | null
  playlistResult: PlaylistCreateResult | null
  savedPlaylistState: SavedPlaylistState | null
  appendSummary: string | null
  playlistName: string
  playlistDescription: string
  processedImages: PlaylistInputImage[]
  workVersion: number
}

function loadSelectedProvider(): MusicProviderId {
  if (!import.meta.client) return 'tidal'
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY)
    if (raw === 'tidal' || raw === 'spotify') return raw
  } catch {
    /* ignore */
  }
  return 'tidal'
}

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

function playlistSnapshot(session: PlaylistSession): SavedPlaylistState {
  return {
    name: session.playlistName.trim(),
    description: session.playlistDescription.trim(),
    trackIds: session.reviewTracks
      .filter(isPlaylistReady)
      .map(track => track.selectedTrackId!),
  }
}

function snapshotsEqual(a: SavedPlaylistState, b: SavedPlaylistState) {
  if (a.name !== b.name || a.description !== b.description) return false
  if (a.trackIds.length !== b.trackIds.length) return false
  return a.trackIds.every((id, index) => id === b.trackIds[index])
}

function reconnectMessage(providerName: string) {
  return `${providerName} session expired — reconnect, then try again`
}

function formatAppError(e: unknown, providerName: string): string {
  const data = e && typeof e === 'object' && 'data' in e
    ? (e as { data?: { message?: string } }).data
    : undefined
  const msg = data?.message
    ?? (e instanceof Error ? e.message : 'Something went wrong')
  if (/rate limit|429/i.test(msg)) {
    return `${providerName} is rate limiting — wait a minute and try again`
  }
  if (/401|Connect (Tidal|Spotify)|session expired|Not connected/i.test(msg)) {
    return reconnectMessage(providerName)
  }
  return msg
}

export function usePlaylistBuilder() {
  const { dryRunEnabled, registerWizardReset } = useDryRun()
  const { showToast } = useToast()
  const {
    selectedLlmProvider,
    llmProviderLocked,
    serverConfigured,
    envProvider,
    llmReady,
    pendingProvider,
    apiKeyDraft,
    apiKeyError,
    verifying,
    setLlmProvider,
    beginLlmProviderEntry,
    cancelLlmProviderEntry,
    verifyLlmKey,
    requireLlmProvider,
    getLlmCredentials,
    refreshLlmStatus,
  } = useLlmProvider()
  const selectedProvider = ref<MusicProviderId>(loadSelectedProvider())
  const providerName = computed(() => musicProviderName(selectedProvider.value))
  const authStatus = ref<AuthStatus>({ connected: false, provider: selectedProvider.value })
  const toastMessage = ref<string | null>(null)
  const sessions = ref<PlaylistSession[]>([createPlaylistSession()])
  const activeSessionId = ref(sessions.value[0]!.id)

  const activeSession = computed(() => getActiveSession())
  const step = computed<WizardStep>(() =>
    authStatus.value.connected && (llmReady.value || dryRunEnabled.value)
      ? activeSession.value.step
      : 'connect',
  )

  function parseRequestBody(payload: {
    text?: string
    images?: string[]
  }) {
    const credentials = getLlmCredentials()
    if (!credentials) return null
    return {
      ...payload,
      provider: credentials.provider,
      ...(credentials.apiKey ? { apiKey: credentials.apiKey } : {}),
    }
  }

  const reviewTracks = computed({
    get: () => activeSession.value.reviewTracks,
    set: value => { activeSession.value.reviewTracks = value },
  })
  const matchingState = computed({
    get: () => activeSession.value.matchingState,
    set: value => { activeSession.value.matchingState = value },
  })
  const loading = computed({
    get: () => activeSession.value.loading,
    set: value => { activeSession.value.loading = value },
  })
  const error = computed({
    get: () => activeSession.value.error,
    set: value => { activeSession.value.error = value },
  })
  const playlistResult = computed({
    get: () => activeSession.value.playlistResult,
    set: value => { activeSession.value.playlistResult = value },
  })
  const appendSummary = computed({
    get: () => activeSession.value.appendSummary,
    set: value => { activeSession.value.appendSummary = value },
  })
  const playlistName = computed({
    get: () => activeSession.value.playlistName,
    set: value => { activeSession.value.playlistName = value },
  })
  const playlistDescription = computed({
    get: () => activeSession.value.playlistDescription,
    set: value => { activeSession.value.playlistDescription = value },
  })
  const processedImages = computed(() => activeSession.value.processedImages)

  const playlistDirty = computed(() => {
    const session = activeSession.value
    if (!session.playlistResult || !session.savedPlaylistState) return false
    return !snapshotsEqual(session.savedPlaylistState, playlistSnapshot(session))
  })

  const playlistTabs = computed(() =>
    sessions.value.map((session, index) => ({
      id: session.id,
      label: playlistTabLabel(session, index),
      loading: session.loading,
      step: session.step,
    })),
  )
  const activePlaylistId = computed(() => activeSessionId.value)

  function wakeMatchingPauseWaiters(session: PlaylistSession) {
    const waiters = session.matchingPauseWaiters
    session.matchingPauseWaiters = []
    for (const wake of waiters) wake()
  }

  function createPlaylistSession(): PlaylistSession {
    return {
      id: newId(),
      step: 'input',
      reviewTracks: [],
      matchingState: null,
      matchingPaused: false,
      matchingPauseWaiters: [],
      loading: false,
      error: null,
      playlistResult: null,
      savedPlaylistState: null,
      appendSummary: null,
      playlistName: DEFAULT_PLAYLIST_NAME,
      playlistDescription: '',
      processedImages: [],
      workVersion: 0,
    }
  }

  function playlistTabLabel(session: PlaylistSession, index: number) {
    const name = session.playlistName.trim()
    return name || `Playlist ${index + 1}`
  }

  function getActiveSession() {
    const session = sessions.value.find(s => s.id === activeSessionId.value)
    if (session) return session

    const fallback = sessions.value[0] ?? createPlaylistSession()
    if (!sessions.value.length) sessions.value = [fallback]
    activeSessionId.value = fallback.id
    return fallback
  }

  function resetSessions() {
    const session = createPlaylistSession()
    sessions.value = [session]
    activeSessionId.value = session.id
  }

  function beginWork(session: PlaylistSession) {
    session.workVersion += 1
    return session.workVersion
  }

  function cancelSessionWork(session: PlaylistSession) {
    session.workVersion += 1
    session.matchingPaused = false
    if (session.matchingState) {
      session.matchingState = { ...session.matchingState, paused: false }
    }
    wakeMatchingPauseWaiters(session)
  }

  async function waitWhileMatchingPaused(session: PlaylistSession, workId: number) {
    while (session.matchingPaused && isCurrentWork(session, workId)) {
      await new Promise<void>((resolve) => {
        session.matchingPauseWaiters.push(resolve)
      })
    }
  }

  function pauseMatching() {
    const session = getActiveSession()
    if (!session.matchingState || session.matchingState.parsing) return
    session.matchingPaused = true
    session.matchingState = { ...session.matchingState, paused: true }
  }

  function resumeMatching() {
    const session = getActiveSession()
    if (!session.matchingState) return
    session.matchingPaused = false
    session.matchingState = { ...session.matchingState, paused: false }
    wakeMatchingPauseWaiters(session)
  }

  function toggleMatchingPause() {
    const session = getActiveSession()
    if (session.matchingPaused) resumeMatching()
    else pauseMatching()
  }

  function cancelAllWork() {
    for (const session of sessions.value) {
      cancelSessionWork(session)
      session.loading = false
      session.matchingState = null
    }
  }

  function isCurrentWork(session: PlaylistSession, version: number) {
    return version === session.workVersion
  }

  function applyPlaylistSuggestion(session: PlaylistSession, playlist?: PlaylistMetadataSuggestion) {
    const name = playlist?.name?.trim()
    const description = playlist?.description?.trim()
    if (name) session.playlistName = name
    if (description) session.playlistDescription = description
  }

  function inputImagesToProcessed(images: { dataUrl: string; name: string }[] = []): PlaylistInputImage[] {
    return images.map(image => ({
      id: newId(),
      dataUrl: image.dataUrl,
      name: image.name,
    }))
  }

  function resetWizardState() {
    cancelAllWork()
    resetSessions()
    toastMessage.value = null
    authStatus.value = { connected: false, provider: selectedProvider.value }
  }

  registerWizardReset(resetWizardState)

  function persistProvider(provider: MusicProviderId) {
    if (!import.meta.client) return
    try {
      localStorage.setItem(PROVIDER_STORAGE_KEY, provider)
    } catch {
      /* ignore */
    }
  }

  /** Switch the active streaming service. Resets matches (track ids are provider-scoped). */
  function setProvider(provider: MusicProviderId) {
    if (provider === selectedProvider.value) return
    selectedProvider.value = provider
    persistProvider(provider)
    cancelAllWork()
    resetSessions()
    authStatus.value = { connected: false, provider }
  }

  async function refreshAuth() {
    if (dryRunEnabled.value) {
      authStatus.value = { connected: false, provider: selectedProvider.value }
      return authStatus.value
    }

    try {
      authStatus.value = await $fetch<AuthStatus>(`/api/auth/${selectedProvider.value}/status`)
    } catch {
      authStatus.value = { connected: false, provider: selectedProvider.value }
    }

    return authStatus.value
  }

  async function completeOAuthConnect(activeProvider: MusicProviderId, name: string) {
    const status = await refreshAuth()
    if (status.connected) {
      error.value = null
      showToast(`Connected to ${name}`, 'info')
    }
    else if (status.error) {
      error.value = status.error
    }
    return status
  }

  function connect(provider: MusicProviderId = selectedProvider.value) {
    setProvider(provider)
    const activeProvider = provider
    const name = musicProviderName(activeProvider)

    if (dryRunEnabled.value) {
      authStatus.value = { connected: true, provider: activeProvider, displayName: 'Dry Run' }
      return
    }

    error.value = null
    const loginUrl = `/api/auth/${activeProvider}/login?popup=1`

    if (oauthPopup && !oauthPopup.closed) {
      try {
        oauthPopup.location.assign(loginUrl)
      }
      catch {
        // Popup is on Spotify or another origin — focus it instead of opening a second window.
      }
      oauthPopup.focus()
      return
    }

    oauthPopupCleanup?.()
    oauthPopupCleanup = null

    const popup = window.open(loginUrl, 'music-connect', POPUP_FEATURES)
    oauthPopup = popup

    if (!popup) {
      error.value = `Could not open the ${name} sign-in popup. Please allow popups and try again.`
      oauthPopup = null
      return
    }

    popup.focus()

    function cleanupPopupListeners() {
      window.clearInterval(authPollTimer)
      window.clearTimeout(authTimeout)
      window.removeEventListener('message', onPopupMessage)
      window.removeEventListener('storage', onOAuthStorage)
      oauthPopupCleanup = null
    }

    let oauthHandled = false

    async function handleOAuthSuccess() {
      if (oauthHandled) return
      oauthHandled = true
      cleanupPopupListeners()
      popup?.close()
      oauthPopup = null
      await completeOAuthConnect(activeProvider, name)
    }

    const authPollTimer = window.setInterval(async () => {
      const status = await refreshAuth()
      if (status.connected) {
        await handleOAuthSuccess()
      }
    }, 1500)

    const authTimeout = window.setTimeout(() => {
      cleanupPopupListeners()
    }, 10 * 60 * 1000)

    async function onPopupMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (!event.data || typeof event.data !== 'object') return
      const data = event.data as { type?: string; provider?: string; ok?: boolean; message?: string }
      if (data.type !== OAUTH_POPUP_MESSAGE) return
      if (data.provider && data.provider !== activeProvider) return

      if (!data.ok) {
        cleanupPopupListeners()
        popup?.close()
        oauthPopup = null
        error.value = data.message ?? `${name} sign-in failed.`
        return
      }

      await handleOAuthSuccess()
    }

    async function onOAuthStorage(event: StorageEvent) {
      if (event.key !== OAUTH_STORAGE_KEY || !event.newValue) return
      let data: { type?: string; provider?: string; ok?: boolean; message?: string }
      try {
        data = JSON.parse(event.newValue) as typeof data
      }
      catch {
        return
      }
      if (data.type !== OAUTH_POPUP_MESSAGE) return
      if (data.provider && data.provider !== activeProvider) return

      if (!data.ok) {
        cleanupPopupListeners()
        popup?.close()
        oauthPopup = null
        error.value = data.message ?? `${name} sign-in failed.`
        return
      }

      await handleOAuthSuccess()
    }

    window.addEventListener('message', onPopupMessage)
    window.addEventListener('storage', onOAuthStorage)
    oauthPopupCleanup = cleanupPopupListeners
  }

  function reconnect() {
    connect(selectedProvider.value)
  }

  async function logout() {
    const provider = selectedProvider.value
    if (dryRunEnabled.value) {
      authStatus.value = { connected: false, provider }
      resetSessions()
      return
    }
    await $fetch(`/api/auth/${provider}/logout`, { method: 'POST' })
    authStatus.value = { connected: false, provider }
    resetSessions()
  }

  async function matchSongsWithProgress(session: PlaylistSession, songs: ParsedSong[], workId: number) {
    for (let i = 0; i < songs.length; i++) {
      if (!isCurrentWork(session, workId)) return false
      await waitWhileMatchingPaused(session, workId)
      if (!isCurrentWork(session, workId)) return false

      const song = songs[i]!
      session.matchingState = {
        index: i,
        total: songs.length,
        current: song,
        paused: session.matchingPaused,
      }
      await nextTick()
      if (!isCurrentWork(session, workId)) return false
      await waitWhileMatchingPaused(session, workId)
      if (!isCurrentWork(session, workId)) return false

      if (dryRunEnabled.value) {
        await sleep(350)
        if (!isCurrentWork(session, workId)) return false
        const match = DRY_RUN_MATCHES[i] ?? DRY_RUN_MATCHES[0]!
        session.reviewTracks.push(dryRunMatchToReviewTrack(match))
      } else {
        const { matches: batch } = await $fetch<{ matches: MatchedSong[] }>(`/api/music/${selectedProvider.value}/search`, {
          method: 'POST',
          body: { songs: [song] },
        })
        if (!isCurrentWork(session, workId)) return false
        session.reviewTracks.push(matchToReviewTrack(batch[0]!))
      }
      await nextTick()
    }
    return true
  }

  async function matchDryRunFixtures(session: PlaylistSession, workId: number) {
    const songs = dryRunParsedSongs()
    return matchSongsWithProgress(session, songs, workId)
  }

  async function parseAndMatch(
    text?: string,
    images?: string[],
    imageItems: { dataUrl: string; name: string }[] = [],
  ) {
    const session = getActiveSession()
    const workId = beginWork(session)
    session.loading = true
    session.error = null
    session.reviewTracks = []
    session.processedImages = inputImagesToProcessed(imageItems)
    session.matchingPaused = false
    session.matchingPauseWaiters = []
    session.step = 'matching'
    session.matchingState = { parsing: true, index: 0, total: 0 }

    try {
      if (dryRunEnabled.value) {
        await sleep(400)
        if (!isCurrentWork(session, workId)) return
        applyPlaylistSuggestion(session, dryRunPlaylistSuggestion())
        const completed = await matchDryRunFixtures(session, workId)
        if (!completed || !isCurrentWork(session, workId)) return
        session.step = 'review'
        return
      }

      const llmProvider = requireLlmProvider()
      if (!llmProvider) {
        session.error = 'Select an LLM provider and enter an API key on the connect screen.'
        session.step = 'input'
        return
      }

      const parseBody = parseRequestBody({ text, images })
      if (!parseBody) {
        session.error = 'Select an LLM provider and enter an API key on the connect screen.'
        session.step = 'input'
        return
      }

      const { songs, playlist } = await $fetch<{
        songs: ParsedSong[]
        playlist?: PlaylistMetadataSuggestion
      }>('/api/parse', {
        method: 'POST',
        body: parseBody,
      })
      if (!isCurrentWork(session, workId)) return

      if (!songs.length) {
        session.error = 'No songs found in the input.'
        session.step = 'input'
        return
      }

      applyPlaylistSuggestion(session, playlist)
      const completed = await matchSongsWithProgress(session, songs, workId)
      if (!completed || !isCurrentWork(session, workId)) return
      session.step = 'review'
    } catch (e: unknown) {
      if (!isCurrentWork(session, workId)) return
      session.error = formatAppError(e, providerName.value)
      session.step = 'input'
    } finally {
      if (isCurrentWork(session, workId)) {
        session.loading = false
        session.matchingState = null
        session.matchingPaused = false
        session.matchingPauseWaiters = []
      }
    }
  }

  async function appendFromInput(payload: {
    text: string
    images: string[]
    imageItems?: { dataUrl: string; name: string }[]
  }) {
    const { text, images, imageItems = [] } = payload
    const session = getActiveSession()
    const workId = session.workVersion
    session.loading = true
    session.appendSummary = null
    session.error = null

    try {
      if (dryRunEnabled.value) {
        await sleep(300)
        if (!isCurrentWork(session, workId)) return
        const appendMatch = dryRunAppendMatch()
        const key = normalizeKey(appendMatch.parsed!.artist, appendMatch.parsed!.title)
        const exists = session.reviewTracks.some(t =>
          t.parsed ? normalizeKey(t.parsed.artist, t.parsed.title) === key : false,
        )
        session.processedImages.push(...inputImagesToProcessed(imageItems))

        if (exists) {
          session.appendSummary = 'Skipped 1 duplicate'
          return
        }

        session.reviewTracks.push(dryRunMatchToReviewTrack(appendMatch))
        session.appendSummary = 'Added 1 song'
        return
      }

      const llmProvider = requireLlmProvider()
      if (!llmProvider) {
        session.error = 'Select an LLM provider and enter an API key on the connect screen.'
        return
      }

      const parseBody = parseRequestBody({ text, images })
      if (!parseBody) {
        session.error = 'Select an LLM provider and enter an API key on the connect screen.'
        return
      }

      const { songs } = await $fetch<{ songs: ParsedSong[] }>('/api/parse', {
        method: 'POST',
        body: parseBody,
      })
      if (!isCurrentWork(session, workId)) return
      session.processedImages.push(...inputImagesToProcessed(imageItems))

      const existingKeys = new Set(
        session.reviewTracks.map(t =>
          t.parsed
            ? normalizeKey(t.parsed.artist, t.parsed.title)
            : t.selectedTrack
              ? `track::${t.selectedTrack.id}`
              : '',
        ),
      )
      const newSongs = songs.filter(s => {
        const key = normalizeKey(s.artist, s.title)
        return !existingKeys.has(key)
      })

      const skipped = songs.length - newSongs.length

      if (!newSongs.length) {
        session.appendSummary = skipped
          ? `Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}`
          : 'No new songs found'
        return
      }

      const { matches } = await $fetch<{ matches: MatchedSong[] }>(`/api/music/${selectedProvider.value}/search`, {
        method: 'POST',
        body: { songs: newSongs },
      })
      if (!isCurrentWork(session, workId)) return

      session.reviewTracks.push(...matches.map(matchToReviewTrack))
      session.appendSummary = `Added ${matches.length} song${matches.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}`
    } catch (e: unknown) {
      if (!isCurrentWork(session, workId)) return
      session.error = formatAppError(e, providerName.value)
    } finally {
      if (isCurrentWork(session, workId)) {
        session.loading = false
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

    const { matches } = await $fetch<{ matches: MatchedSong[] }>(`/api/music/${selectedProvider.value}/search`, {
      method: 'POST',
      body: { query },
    })

    if (!matches[0]?.bestMatch) return

    row.alternatives = matches[0].alternatives
    applyTrackCorrection(row, matches[0].bestMatch)
  }

  function applyTrackCorrection(
    row: ReviewTrack,
    track: TrackSummary,
  ) {
    row.selectedTrack = track
    row.selectedTrackId = track.id
    row.status = row.autoMatch?.trackId === track.id ? 'matched' : 'manual'
  }

  function selectAlternative(id: string, track: TrackSummary) {
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

  async function savePlaylist({ discardUnresolved = false }: { discardUnresolved?: boolean } = {}) {
    const session = getActiveSession()
    const workId = session.workVersion

    if (discardUnresolved) {
      session.reviewTracks = session.reviewTracks.filter(isPlaylistReady)
    }

    if (!session.reviewTracks.length) {
      session.error = 'No matched tracks to add to the playlist.'
      return
    }

    if (!session.reviewTracks.every(isPlaylistReady)) {
      return
    }

    const isUpdate = Boolean(session.playlistResult?.playlistId)
    if (isUpdate && !playlistDirty.value) {
      return
    }

    session.loading = true
    session.error = null

    const payload = {
      name: session.playlistName,
      description: session.playlistDescription || undefined,
      trackIds: session.reviewTracks.map(track => track.selectedTrackId!),
    }

    try {
      if (dryRunEnabled.value) {
        await sleep(500)
        if (!isCurrentWork(session, workId)) return
        const result = {
          playlistId: session.playlistResult?.playlistId ?? 'dry-run-playlist',
          url: session.playlistResult?.url ?? 'https://tidal.com/browse/playlist/dry-run-playlist',
        }
        session.playlistResult = result
        session.savedPlaylistState = playlistSnapshot(session)
        showToast(
          isUpdate ? 'Playlist updated (dry run).' : 'Playlist created (dry run).',
          'info',
          { href: result.url, linkLabel: 'Open playlist' },
        )
        return
      }

      const status = await refreshAuth()
      if (!isCurrentWork(session, workId)) return
      if (!status.connected) {
        session.error = reconnectMessage(providerName.value)
        return
      }

      const result = isUpdate
        ? await $fetch<PlaylistCreateResult>(`/api/music/${selectedProvider.value}/playlist/${session.playlistResult!.playlistId}`, {
            method: 'PATCH',
            body: payload,
          })
        : await $fetch<PlaylistCreateResult>(`/api/music/${selectedProvider.value}/playlist`, {
            method: 'POST',
            body: payload,
          })

      if (!isCurrentWork(session, workId)) return

      session.playlistResult = result
      session.savedPlaylistState = playlistSnapshot(session)

      const message = isUpdate
        ? 'Playlist updated.'
        : `Playlist created on ${providerName.value}.`
      showToast(message, 'info', {
        href: result.url,
        linkLabel: 'Open playlist',
      })

      if (result.failures?.length) {
        showToast(
          `${result.failures.length} track${result.failures.length === 1 ? '' : 's'} could not be added.`,
          'error',
          { href: result.url, linkLabel: 'Open playlist' },
        )
      }
    } catch (e: unknown) {
      if (!isCurrentWork(session, workId)) return
      session.error = formatAppError(e, providerName.value)
    } finally {
      if (isCurrentWork(session, workId)) {
        session.loading = false
      }
    }
  }

  function startNewPlaylist() {
    const session = createPlaylistSession()
    sessions.value.push(session)
    activeSessionId.value = session.id
  }

  function switchPlaylist(id: string) {
    if (sessions.value.some(session => session.id === id)) {
      activeSessionId.value = id
    }
  }

  return {
    step,
    authStatus,
    selectedProvider,
    providerName,
    selectedLlmProvider,
    llmProviderLocked,
    serverConfigured,
    envProvider,
    llmReady,
    pendingProvider,
    apiKeyDraft,
    apiKeyError,
    verifying,
    setLlmProvider,
    beginLlmProviderEntry,
    cancelLlmProviderEntry,
    verifyLlmKey,
    refreshLlmStatus,
    reviewTracks,
    matchingState,
    loading,
    error,
    playlistResult,
    appendSummary,
    toastMessage,
    playlistName,
    playlistDescription,
    processedImages,
    playlistTabs,
    activePlaylistId,
    resolvableCount,
    unresolvedCount,
    playlistDirty,
    refreshAuth,
    setProvider,
    connect,
    reconnect,
    logout,
    parseAndMatch,
    toggleMatchingPause,
    appendFromInput,
    searchRow,
    selectAlternative,
    removeRow,
    reorderRows,
    savePlaylist,
    startNewPlaylist,
    switchPlaylist,
    dryRunEnabled,
  }
}