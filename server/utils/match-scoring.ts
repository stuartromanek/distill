import type { ParsedSong } from '../../shared/types/playlist'

export type ScoreWeights = {
  title: number
  artist: number
}

export const SCORE_WEIGHTS = {
  combined: { title: 0.6, artist: 0.4 },
  titleFirst: { title: 0.45, artist: 0.55 },
  artistFirst: { title: 0.65, artist: 0.35 },
  album: { title: 0.55, artist: 0.45 },
} as const

export type ParsedTitleMeta = {
  raw: string
  base: string
  suffixes: string[]
  featuredArtists: string[]
  variants: string[]
  truncated: boolean
}

const FEAT_PREFIX = /^(feat\.?|featuring|with|ft\.?)\s+/i
const VARIANT_PATTERN = /\b(live|remix|acoustic|karaoke|version|edit|instrumental|radio edit|deluxe|bonus|mix|remaster|re-recorded)\b/i
const DASH_VARIANT = /\s+-\s+(.+)$/
const ELLIPSIS_SUFFIX = /(?:\.{2,}|…)\s*$/
const LIVE_IN_TITLE = /\blive\b/i

function collapseWhitespace(str: string) {
  return str.replace(/\s+/g, ' ').trim()
}

function stripOuterQuotes(title: string) {
  const trimmed = title.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function splitFeaturedNames(text: string): string[] {
  return text
    .split(/\s*(?:&|,|\band\b)\s*/i)
    .map(s => s.trim())
    .filter(Boolean)
}

function classifySuffix(suffix: string, featuredArtists: string[], variants: string[]) {
  const trimmed = suffix.trim()
  if (!trimmed) return

  if (FEAT_PREFIX.test(trimmed)) {
    featuredArtists.push(...splitFeaturedNames(trimmed.replace(FEAT_PREFIX, '')))
    return
  }

  if (VARIANT_PATTERN.test(trimmed)) {
    const match = trimmed.match(VARIANT_PATTERN)
    if (match?.[1]) {
      const tag = match[1].toLowerCase()
      variants.push(tag === 'remaster' || tag === 're-recorded' ? 'mix' : tag)
    }
    return
  }

  if (/^live\b/i.test(trimmed)) {
    variants.push('live')
  }
}

function stripTrailingEllipsis(text: string): { text: string; truncated: boolean } {
  const match = text.match(ELLIPSIS_SUFFIX)
  if (!match || match.index === undefined) {
    return { text, truncated: false }
  }
  return {
    text: text.slice(0, match.index).trim(),
    truncated: true,
  }
}

export function titleSimilarity(
  parsedBase: string,
  trackBase: string,
  truncated = false,
): number {
  const na = normalize(parsedBase)
  const nb = normalize(trackBase)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (truncated && na.length >= 8 && (nb.startsWith(na) || na.startsWith(nb))) {
    return 0.95
  }
  if (na.includes(nb) || nb.includes(na)) return 0.85

  const ta = new Set(na.split(' '))
  const tb = new Set(nb.split(' '))
  const intersection = [...ta].filter(t => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : intersection / union
}

export function parseTitleMetadata(title: string): ParsedTitleMeta {
  const raw = title.trim()
  let working = stripOuterQuotes(raw)
  const suffixes: string[] = []
  const featuredArtists: string[] = []
  const variants: string[] = []

  for (;;) {
    const parenMatch = working.match(/\(([^()]*)\)\s*$/)
    const bracketMatch = working.match(/\[([^[\]]*)\]\s*$/)
    const match = parenMatch ?? bracketMatch
    if (!match) break

    suffixes.unshift(match[1]!)
    working = working.slice(0, match.index).trim()
  }

  const dashMatch = working.match(DASH_VARIANT)
  if (dashMatch) {
    const suffix = dashMatch[1]!.trim()
    suffixes.push(suffix)
    working = working.slice(0, dashMatch.index).trim()
  }

  for (const suffix of suffixes) {
    classifySuffix(suffix, featuredArtists, variants)
  }

  const collapsed = collapseWhitespace(working) || raw
  const { text: base, truncated } = stripTrailingEllipsis(collapsed)

  return {
    raw,
    base,
    suffixes,
    featuredArtists,
    variants: [...new Set(variants)],
    truncated,
  }
}

export function normalize(str: string) {
  return str
    .replace(/[\u2018\u2019\u201B`´']/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeTitleForSearch(text: string): string {
  return stripTrailingEllipsis(text).text
    .replace(/&/g, ' and ')
    .replace(/[\u2018\u2019\u201B`´'`.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeArtistForSearch(text: string): string {
  return text
    .replace(/&/g, ' and ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @deprecated Use normalizeTitleForSearch / normalizeArtistForSearch */
export function normalizeForSearch(text: string): string {
  return normalizeTitleForSearch(text)
}

function collapseArtistForEditDistance(name: string) {
  return normalize(name).replace(/\bthe\b/g, '').replace(/\s+/g, '')
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return 0

  const row = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = row[j]!
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        prev + cost,
      )
      prev = temp
    }
  }

  return 1 - row[n]! / Math.max(m, n)
}

export function similarity(a: string, b: string) {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85

  const ta = new Set(na.split(' '))
  const tb = new Set(nb.split(' '))
  const intersection = [...ta].filter(t => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : intersection / union
}

export function stripArtistCredit(name: string) {
  return name.replace(/\s+(feat\.?|featuring|with|ft\.?)\s+.+/i, '').trim()
}

export const ARTIST_GATE_MIN = 0.55
export const COLLISION_ARTIST_MIN = 0.7

export function artistSimilarity(a: string, b: string) {
  const sa = stripArtistCredit(a)
  const sb = stripArtistCredit(b)
  const tokenSim = similarity(sa, sb)
  const editSim = levenshteinRatio(
    collapseArtistForEditDistance(sa),
    collapseArtistForEditDistance(sb),
  )
  return Math.max(tokenSim, editSim >= 0.85 ? editSim : 0)
}

export function isCollisionProneTitle(parsedMeta: ParsedTitleMeta): boolean {
  const words = normalize(parsedMeta.base).split(' ').filter(Boolean)
  return words.length <= 2 && parsedMeta.base.length <= 20
}

function featuredArtistMatchRatio(
  featuredArtists: string[],
  trackTitle: string,
  trackArtist: string,
): number {
  if (!featuredArtists.length) return 0

  const haystack = `${trackTitle} ${trackArtist}`
  let matched = 0
  for (const name of featuredArtists) {
    if (similarity(name, haystack) >= 0.7 || normalize(haystack).includes(normalize(name))) {
      matched++
    }
  }
  return matched / featuredArtists.length
}

function trackHasLiveVariant(trackMeta: ParsedTitleMeta): boolean {
  return trackMeta.variants.includes('live') || LIVE_IN_TITLE.test(trackMeta.raw)
}

function applyVariantPenalty(
  score: number,
  parsedMeta: ParsedTitleMeta,
  trackMeta: ParsedTitleMeta,
) {
  const parsedWantsVariant = parsedMeta.variants.length > 0
  const trackHasVariant = trackMeta.variants.length > 0
  const trackIsLive = trackHasLiveVariant(trackMeta)

  if (!parsedWantsVariant && (trackHasVariant || trackIsLive)) {
    return score * (trackIsLive ? 0.75 : 0.85)
  }

  if (parsedWantsVariant && trackHasVariant) {
    const overlap = parsedMeta.variants.some(v => trackMeta.variants.includes(v))
    if (!overlap) {
      return score * 0.9
    }
  }

  if (parsedWantsVariant && !trackHasVariant && parsedMeta.variants.includes('mix')) {
    if (!/\bmix\b/i.test(trackMeta.raw)) {
      return score * 0.9
    }
  }

  if (!parsedWantsVariant && !trackHasVariant && trackIsLive) {
    return score * 0.75
  }

  return score
}

export function scoreTitleMatch(
  parsedMeta: ParsedTitleMeta,
  trackTitle: string,
  trackArtist: string,
): number {
  const trackMeta = parseTitleMetadata(trackTitle)
  let score = titleSimilarity(parsedMeta.base, trackMeta.base, parsedMeta.truncated)

  if (parsedMeta.featuredArtists.length > 0) {
    const ratio = featuredArtistMatchRatio(parsedMeta.featuredArtists, trackTitle, trackArtist)
    score = Math.min(1, score + ratio * 0.08)
  }

  return applyVariantPenalty(score, parsedMeta, trackMeta)
}

export function scoreTrack(
  parsed: Pick<ParsedSong, 'artist' | 'title'>,
  trackTitle: string,
  artistName: string,
  weights: ScoreWeights = SCORE_WEIGHTS.combined,
) {
  const parsedMeta = parseTitleMetadata(parsed.title)
  const parsedArtist = stripArtistCredit(parsed.artist)
  const trackArtist = stripArtistCredit(artistName)
  const titleScore = scoreTitleMatch(parsedMeta, trackTitle, artistName)
  const artistScore = artistSimilarity(parsedArtist, trackArtist)

  return titleScore * weights.title + artistScore * weights.artist
}

export function featuredVerificationScore(
  parsedMeta: ParsedTitleMeta,
  trackTitle: string,
  trackArtist: string,
): number {
  return featuredArtistMatchRatio(parsedMeta.featuredArtists, trackTitle, trackArtist)
}

export function hasStudioPreference(parsedMeta: ParsedTitleMeta, trackTitle: string): number {
  if (parsedMeta.variants.length > 0) return 0
  const trackMeta = parseTitleMetadata(trackTitle)
  return trackHasLiveVariant(trackMeta) ? 0 : 1
}

export function normalizeSongKey(artist: string, title: string) {
  return `${normalize(artist)}::${normalize(title)}`
}
