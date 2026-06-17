<script setup lang="ts">
type RequestLogStatus = 'pending' | 'ok' | 'retry' | 'error'
type RequestLogSource = 'tidal' | 'llm'

type RequestLogEntry = {
  id: string
  source: RequestLogSource
  method: string
  path: string
  status: RequestLogStatus
  statusCode?: number
  durationMs?: number
  retryAttempt?: number
  maxRetries?: number
  waitMs?: number
  timestamp: number
  label?: string
}

type RequestLogStats = {
  ok: number
  retry: number
  error: number
  pending: number
  rpm: number
  avgLatencyMs: number
  queueDepth: number
}

type RequestLogResponse = {
  entries: RequestLogEntry[]
  stats: RequestLogStats
}

type ParseDebugInfo = {
  model: string
  durationMs: number
  rawContent: string
  filteredCount: number
  droppedCount: number
}

type ParseLogEntry = {
  id: string
  timestamp: number
  imageCount: number
  textPresent: boolean
  songCount: number
  durationMs: number
  model: string
  droppedCount: number
  debug: ParseDebugInfo
}

type ParseLogResponse = {
  entries: ParseLogEntry[]
}

const expanded = ref(false)
const entries = ref<RequestLogEntry[]>([])
const parseEntries = ref<ParseLogEntry[]>([])
const expandedParseId = ref<string | null>(null)
const stats = ref<RequestLogStats>({
  ok: 0,
  retry: 0,
  error: 0,
  pending: 0,
  rpm: 0,
  avgLatencyMs: 0,
  queueDepth: 0,
})

let pollTimer: ReturnType<typeof setInterval> | undefined

async function refresh() {
  try {
    const data = await $fetch<RequestLogResponse>('/api/dev/request-log')
    entries.value = data.entries
    stats.value = data.stats
  } catch {
    // dev server not ready or route unavailable
  }

  try {
    const parseData = await $fetch<ParseLogResponse>('/api/dev/parse-log')
    parseEntries.value = parseData.entries
  } catch {
    // dev server not ready or route unavailable
  }
}

function startPolling() {
  stopPolling()
  const interval = expanded.value || stats.value.pending > 0 || stats.value.retry > 0
    ? 500
    : 2000
  pollTimer = setInterval(refresh, interval)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

function toggleExpanded() {
  expanded.value = !expanded.value
  startPolling()
}

async function clearLog() {
  await $fetch('/api/dev/request-log', { method: 'DELETE' })
  await refresh()
}

async function clearParseLog() {
  await $fetch('/api/dev/parse-log', { method: 'DELETE' })
  expandedParseId.value = null
  await refresh()
}

function toggleParseEntry(id: string) {
  expandedParseId.value = expandedParseId.value === id ? null : id
}

function truncateRaw(raw: string, max = 2048) {
  if (raw.length <= max) return raw
  return `${raw.slice(0, max)}\n… (${raw.length - max} more chars)`
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const target = e.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable]')) return
    e.preventDefault()
    toggleExpanded()
  }
}

function statusLabel(entry: RequestLogEntry) {
  if (entry.status === 'ok') {
    return `${entry.statusCode ?? 200} · ${entry.durationMs ?? 0}ms`
  }
  if (entry.status === 'retry') {
    const wait = entry.waitMs ? `${(entry.waitMs / 1000).toFixed(1)}s` : '…'
    return `retry ${entry.retryAttempt}/${entry.maxRetries ?? '?'} · wait ${wait}`
  }
  if (entry.status === 'pending') return 'in flight'
  return `failed ${entry.statusCode ?? ''}`.trim()
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

watch([expanded, () => stats.value.pending, () => stats.value.retry], () => {
  startPolling()
})

onMounted(() => {
  refresh()
  startPolling()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  stopPolling()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="dev-hud" :class="{ 'dev-hud--expanded': expanded }">
    <button type="button" class="dev-hud__pill" @click="toggleExpanded">
      <span class="dev-hud__title">API</span>
      <span class="dev-hud__stat dev-hud__stat--ok">{{ stats.ok }}✓</span>
      <span v-if="stats.retry" class="dev-hud__stat dev-hud__stat--retry">{{ stats.retry }}⟳</span>
      <span v-if="stats.error" class="dev-hud__stat dev-hud__stat--error">{{ stats.error }}✗</span>
      <span v-if="stats.queueDepth" class="dev-hud__queue">queue {{ stats.queueDepth }}</span>
    </button>

    <div v-if="expanded" class="dev-hud__panel">
      <div class="dev-hud__toolbar">
        <span class="dev-hud__meta">
          {{ stats.rpm }}/min · avg {{ stats.avgLatencyMs }}ms
        </span>
        <button type="button" class="dev-hud__clear" @click="clearLog">Clear</button>
      </div>

      <ul v-if="entries.length" class="dev-hud__list">
        <li
          v-for="entry in entries"
          :key="entry.id"
          class="dev-hud__row"
          :class="`dev-hud__row--${entry.status}`"
        >
          <div class="dev-hud__row-head">
            <span class="dev-hud__badge">{{ entry.source }}</span>
            <span v-if="entry.label" class="dev-hud__label">{{ entry.label }}</span>
            <span class="dev-hud__status">{{ statusLabel(entry) }}</span>
            <span class="dev-hud__time">{{ formatTime(entry.timestamp) }}</span>
          </div>
          <code class="dev-hud__path">{{ entry.method }} {{ entry.path }}</code>
        </li>
      </ul>

      <p v-else class="dev-hud__empty">No requests yet — import songs or search to populate.</p>

      <div v-if="parseEntries.length" class="dev-hud__parse">
        <div class="dev-hud__parse-head">
          <span class="dev-hud__parse-title">Last parse</span>
          <button type="button" class="dev-hud__clear" @click="clearParseLog">Clear</button>
        </div>
        <ul class="dev-hud__parse-list">
          <li
            v-for="entry in parseEntries"
            :key="entry.id"
            class="dev-hud__parse-row"
          >
            <button
              type="button"
              class="dev-hud__parse-toggle"
              @click="toggleParseEntry(entry.id)"
            >
              <span>{{ entry.songCount }} songs · {{ entry.imageCount }} img · {{ entry.durationMs }}ms</span>
              <span class="dev-hud__time">{{ formatTime(entry.timestamp) }}</span>
            </button>
            <pre
              v-if="expandedParseId === entry.id"
              class="dev-hud__parse-raw"
            >{{ truncateRaw(entry.debug.rawContent) }}</pre>
          </li>
        </ul>
      </div>

      <p class="dev-hud__hint">Press <kbd>`</kbd> to toggle</p>
    </div>
  </div>
</template>

<style scoped>
.dev-hud {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 9999;
  font-size: 12px;
  line-height: 1.35;
  pointer-events: none;
}

.dev-hud__pill,
.dev-hud__panel {
  pointer-events: auto;
}

.dev-hud__pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.65rem;
  border-radius: 999px;
  background: rgba(23, 23, 23, 0.92);
  color: #fafafa;
  box-shadow: var(--shadow-md);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dev-hud__title {
  opacity: 0.65;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 10px;
}

.dev-hud__stat--ok { color: #6ee7a8; }
.dev-hud__stat--retry { color: #fbbf77; }
.dev-hud__stat--error { color: #ff8a8a; }

.dev-hud__queue {
  opacity: 0.55;
  font-size: 11px;
}

.dev-hud__panel {
  margin-top: 0.5rem;
  width: min(360px, calc(100vw - 2rem));
  max-height: min(420px, 50vh);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-medium);
  background: rgba(23, 23, 23, 0.96);
  color: #f5f5f5;
  box-shadow: var(--shadow-menu);
  overflow: hidden;
}

.dev-hud__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.dev-hud__meta {
  opacity: 0.7;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dev-hud__clear {
  color: #fafafa;
  opacity: 0.75;
  font-size: 11px;
  padding: 0.15rem 0.35rem;
  border-radius: var(--radius-base);
}

.dev-hud__clear:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
}

.dev-hud__list {
  list-style: none;
  margin: 0;
  padding: 0.35rem 0;
  overflow: auto;
}

.dev-hud__row {
  padding: 0.45rem 0.75rem;
  border-left: 3px solid transparent;
}

.dev-hud__row--ok { border-left-color: #6ee7a8; }
.dev-hud__row--retry { border-left-color: #fbbf77; }
.dev-hud__row--error { border-left-color: #ff8a8a; }
.dev-hud__row--pending { border-left-color: #93c5fd; }

.dev-hud__row-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.2rem;
}

.dev-hud__badge {
  font-size: 10px;
  text-transform: uppercase;
  opacity: 0.55;
}

.dev-hud__label {
  font-size: 10px;
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.dev-hud__status {
  margin-left: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.dev-hud__row--ok .dev-hud__status { color: #6ee7a8; }
.dev-hud__row--retry .dev-hud__status { color: #fbbf77; }
.dev-hud__row--error .dev-hud__status { color: #ff8a8a; }
.dev-hud__row--pending .dev-hud__status { color: #93c5fd; }

.dev-hud__time {
  opacity: 0.45;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.dev-hud__path {
  display: block;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
}

.dev-hud__empty,
.dev-hud__hint {
  margin: 0;
  padding: 0.75rem;
  opacity: 0.6;
}

.dev-hud__parse {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.dev-hud__parse-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem 0.35rem;
}

.dev-hud__parse-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.65;
}

.dev-hud__parse-list {
  list-style: none;
  margin: 0;
  padding: 0 0 0.35rem;
}

.dev-hud__parse-row {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.dev-hud__parse-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.45rem 0.75rem;
  text-align: left;
  color: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.dev-hud__parse-toggle:hover {
  background: rgba(255, 255, 255, 0.05);
}

.dev-hud__parse-raw {
  margin: 0;
  padding: 0.5rem 0.75rem 0.75rem;
  max-height: 180px;
  overflow: auto;
  font-size: 10px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  opacity: 0.85;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.dev-hud__hint {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
}

.dev-hud__hint kbd {
  padding: 0.05rem 0.25rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  font-family: inherit;
}
</style>
