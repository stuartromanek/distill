import type { ParsedSong, TidalTrackSummary } from '../../shared/types/playlist'
import type { TidalClient } from './tidal-client'
import {
  SCORE_WEIGHTS,
  ARTIST_GATE_MIN,
  COLLISION_ARTIST_MIN,
  artistSimilarity,
  isCollisionProneTitle,
  normalize,
  normalizeArtistForSearch,
  normalizeTitleForSearch,
  scoreTrack,
  similarity,
  parseTitleMetadata,
  featuredVerificationScore,
  hasStudioPreference,
  type ParsedTitleMeta,
} from './match-scoring.ts'

export type StrategyResult = {
  strategy: string
  searchQuery: string
  candidates: TidalTrackSummary[]
}

export type MatchCascadeResult = {
  allScored: TidalTrackSummary[]
  strategyUsed: string
  searchQuery: string
}

export type MatchStrategyDeps = {
  buildMatchQuery: (
    parsed: Pick<ParsedSong, 'artist' | 'title' | 'album'>,
  ) => string
  searchTidalQuery: (
    client: TidalClient,
    query: string,
    limit?: number,
  ) => Promise<TidalTrackSummary[]>
}

const EARLY_EXIT_SCORE = 0.85
const FEAT_EXPAND_THRESHOLD = 0.75
const ARTIST_DISCOGRAPHY_MAX_PAGES = 3
const ARTIST_ALBUM_SCAN_MAX = 12
const ALBUM_TITLE_MATCH_MIN = 0.45
const COMBINED_SEARCH_LIMIT = 20
const COLLISION_COMBINED_SEARCH_LIMIT = 20

type JsonApiResource = {
  id: string
  type: string
  attributes?: Record<string, unknown>
  relationships?: Record<string, {
    data?: { id: string; type: string } | Array<{ id: string; type: string }>
  }>
}

function buildIncludedMap(included: JsonApiResource[] = []) {
  const map = new Map<string, JsonApiResource>()
  for (const item of included) {
    map.set(`${item.type}:${item.id}`, item)
  }
  return map
}

function resolveArtist(resource: JsonApiResource, included: Map<string, JsonApiResource>) {
  const rel = resource.relationships?.artists?.data
  const artists = Array.isArray(rel) ? rel : rel ? [rel] : []

  let bestName: string | undefined
  let bestPopularity = -1

  for (const a of artists) {
    const found = included.get(`${a.type}:${a.id}`)
    const name = found?.attributes?.name
    if (!name) continue

    const popularity = Number(found.attributes?.popularity ?? 0)
    if (popularity > bestPopularity) {
      bestPopularity = popularity
      bestName = String(name)
    }
  }

  return bestName ?? 'Unknown Artist'
}

function resolveAlbum(resource: JsonApiResource, included: Map<string, JsonApiResource>) {
  const rel = resource.relationships?.albums?.data
  const albums = Array.isArray(rel) ? rel : rel ? [rel] : []
  for (const a of albums) {
    const found = included.get(`${a.type}:${a.id}`)
    if (found?.attributes?.title) return String(found.attributes.title)
  }
  return undefined
}

function resolveArtUrl(resource: JsonApiResource, included: Map<string, JsonApiResource>) {
  const rel = resource.relationships?.albums?.data
  const albums = Array.isArray(rel) ? rel : rel ? [rel] : []
  for (const a of albums) {
    const album = included.get(`${a.type}:${a.id}`)
    const coverRel = album?.relationships?.coverArt?.data ?? album?.relationships?.artworks?.data
    const coverId = Array.isArray(coverRel) ? coverRel[0]?.id : coverRel?.id
    if (coverId) {
      return `https://resources.tidal.com/images/${coverId.replace(/-/g, '/')}/320x320.jpg`
    }
  }
  return undefined
}

function toSummary(
  resource: JsonApiResource,
  included: Map<string, JsonApiResource>,
  score?: number,
): TidalTrackSummary {
  return {
    id: resource.id,
    title: String(resource.attributes?.title ?? 'Unknown'),
    artist: resolveArtist(resource, included),
    album: resolveAlbum(resource, included),
    albumArtUrl: resolveArtUrl(resource, included),
    score,
  }
}

async function fetchTrackDetails(
  client: TidalClient,
  trackIds: string[],
): Promise<{ tracks: JsonApiResource[]; included: Map<string, JsonApiResource> }> {
  if (!trackIds.length) {
    return { tracks: [], included: new Map() }
  }

  const params = new URLSearchParams({
    'filter[id]': trackIds.join(','),
    include: 'artists,albums,artworks',
  })

  const res = await client.fetch(`/tracks?${params}`)
  if (!res.ok) {
    console.error(`Tidal track detail failed (${res.status}) for ids: ${trackIds.join(',')}`)
    return { tracks: [], included: new Map() }
  }

  const json = await res.json()
  const included = buildIncludedMap(json.included ?? [])
  const byId = new Map<string, JsonApiResource>(
    (json.data ?? []).map((track: JsonApiResource) => [track.id, track]),
  )

  return {
    tracks: trackIds.map(id => byId.get(id)).filter(Boolean) as JsonApiResource[],
    included,
  }
}

function tracksFromSearchResponse(json: {
  data?: JsonApiResource
  included?: JsonApiResource[]
}) {
  const included = buildIncludedMap(json.included ?? [])

  const fromIncluded = (json.included ?? []).filter(item => item.type === 'tracks')
  if (fromIncluded.length > 0) {
    return { tracks: fromIncluded, included }
  }

  const trackRefs = json.data?.relationships?.tracks?.data ?? []
  const fromRelationships = (Array.isArray(trackRefs) ? trackRefs : [])
    .map(ref => included.get(`${ref.type}:${ref.id}`))
    .filter(Boolean) as JsonApiResource[]

  return { tracks: fromRelationships, included }
}

function artistsFromSearchResponse(json: {
  data?: JsonApiResource
  included?: JsonApiResource[]
}) {
  const included = buildIncludedMap(json.included ?? [])
  const fromIncluded = (json.included ?? []).filter(item => item.type === 'artists')
  if (fromIncluded.length > 0) {
    return { artists: fromIncluded, included }
  }

  const artistRefs = json.data?.relationships?.artists?.data ?? []
  const fromRelationships = (Array.isArray(artistRefs) ? artistRefs : [])
    .map(ref => included.get(`${ref.type}:${ref.id}`))
    .filter(Boolean) as JsonApiResource[]

  return { artists: fromRelationships, included }
}

function albumsFromSearchResponse(json: {
  data?: JsonApiResource
  included?: JsonApiResource[]
}) {
  const included = buildIncludedMap(json.included ?? [])
  const fromIncluded = (json.included ?? []).filter(item => item.type === 'albums')
  if (fromIncluded.length > 0) {
    return { albums: fromIncluded, included }
  }

  const albumRefs = json.data?.relationships?.albums?.data ?? []
  const fromRelationships = (Array.isArray(albumRefs) ? albumRefs : [])
    .map(ref => included.get(`${ref.type}:${ref.id}`))
    .filter(Boolean) as JsonApiResource[]

  return { albums: fromRelationships, included }
}

async function searchArtists(client: TidalClient, query: string) {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({ include: 'artists' })
  const res = await client.fetch(
    `/searchResults/${encodeURIComponent(trimmed)}?${params}`,
  )

  if (!res.ok) {
    console.error(`Tidal artist search failed (${res.status}) for "${trimmed}"`)
    return []
  }

  const json = await res.json()
  const { artists, included } = artistsFromSearchResponse(json)
  return artists.map(a => ({
    id: a.id,
    name: String(a.attributes?.name ?? 'Unknown'),
    popularity: Number(a.attributes?.popularity ?? 0),
    score: similarity(query, String(a.attributes?.name ?? '')),
  })).sort((a, b) => b.score - a.score)
}

async function fetchRelationshipTracks(
  client: TidalClient,
  path: string,
  cursor?: string,
): Promise<{
  tracks: TidalTrackSummary[]
  nextCursor?: string
}> {
  const params = new URLSearchParams({
    include: 'tracks,artists,albums,artworks',
  })
  if (cursor) params.set('page[cursor]', cursor)

  const res = await client.fetch(`${path}?${params}`)
  if (!res.ok) {
    console.error(`Tidal relationship tracks failed (${res.status}) for ${path}`)
    return { tracks: [] }
  }

  const json = await res.json()
  const itemRefs = json.data ?? []
  const trackIds = (Array.isArray(itemRefs) ? itemRefs : [])
    .filter((ref: { type: string }) => ref.type === 'tracks')
    .map((ref: { id: string }) => ref.id)

  let tracks: TidalTrackSummary[] = []
  if (trackIds.length) {
    const { tracks: detailed, included } = await fetchTrackDetails(client, trackIds)
    tracks = detailed.map(t => toSummary(t, included))
  }

  const next = json.links?.next as string | undefined
  let nextCursor: string | undefined
  if (next) {
    const nextUrl = new URL(next, 'https://openapi.tidal.com')
    nextCursor = nextUrl.searchParams.get('page[cursor]') ?? undefined
  }

  return { tracks, nextCursor }
}

async function fetchArtistAlbums(client: TidalClient, artistId: string) {
  const params = new URLSearchParams({
    include: 'albums',
    'page[size]': '50',
  })
  const res = await client.fetch(
    `/artists/${artistId}/relationships/albums?${params}`,
  )
  if (!res.ok) {
    console.error(`Tidal artist albums failed (${res.status}) for artist ${artistId}`)
    return [] as Array<{ id: string; title: string }>
  }

  const json = await res.json()
  const included = buildIncludedMap(json.included ?? [])
  const refs = json.data ?? []
  const albums: Array<{ id: string; title: string }> = []

  for (const ref of Array.isArray(refs) ? refs : []) {
    if (ref.type !== 'albums') continue
    const album = included.get(`albums:${ref.id}`)
    albums.push({
      id: ref.id,
      title: String(album?.attributes?.title ?? ''),
    })
  }

  return albums.filter(a => a.title)
}

async function fetchAlbumTracks(
  client: TidalClient,
  albumId: string,
): Promise<TidalTrackSummary[]> {
  const params = new URLSearchParams({
    include: 'tracks,artists,items,artworks',
  })
  const res = await client.fetch(`/albums/${albumId}?${params}`)
  if (!res.ok) {
    console.error(`Tidal album tracks failed (${res.status}) for album ${albumId}`)
    return []
  }

  const json = await res.json()
  const included = buildIncludedMap(json.included ?? [])
  const itemRefs = json.data?.relationships?.items?.data
    ?? json.data?.relationships?.tracks?.data
    ?? []
  const trackIds = (Array.isArray(itemRefs) ? itemRefs : [])
    .filter((ref: { type: string }) => ref.type === 'tracks')
    .map((ref: { id: string }) => ref.id)

  if (!trackIds.length) {
    const fromIncluded = (json.included ?? []).filter(
      (item: JsonApiResource) => item.type === 'tracks',
    ) as JsonApiResource[]
    trackIds.push(...fromIncluded.map(t => t.id))
  }

  if (!trackIds.length) return []

  const { tracks: detailed, included: detailIncluded } = await fetchTrackDetails(client, trackIds)
  for (const [key, value] of detailIncluded) included.set(key, value)
  return detailed.map(t => toSummary(t, included))
}

function albumTitleMatchesSong(albumTitle: string, parsedMeta: ParsedTitleMeta): boolean {
  const baseNorm = normalize(parsedMeta.base)
  const albumNorm = normalize(albumTitle)
  if (!baseNorm || !albumNorm) return false
  if (albumNorm.includes(baseNorm) || baseNorm.includes(albumNorm)) return true
  return similarity(albumTitle, parsedMeta.base) >= ALBUM_TITLE_MATCH_MIN
}

async function browseArtistAlbumsForTitle(
  client: TidalClient,
  artistId: string,
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
  options?: { requireTitleMatch?: boolean },
): Promise<TidalTrackSummary[]> {
  const albums = await fetchArtistAlbums(client, artistId)
  const requireTitleMatch = options?.requireTitleMatch !== false
  const matchingAlbums = (requireTitleMatch
    ? albums.filter(a => albumTitleMatchesSong(a.title, parsedMeta))
    : albums)
    .sort((a, b) => similarity(b.title, parsedMeta.base) - similarity(a.title, parsedMeta.base))
    .slice(0, ARTIST_ALBUM_SCAN_MAX)

  const pool: TidalTrackSummary[] = []
  for (const album of matchingAlbums) {
    const tracks = await fetchAlbumTracks(client, album.id)
    pool.push(...tracks)
    const scored = scoreCandidates(parsed, pool, SCORE_WEIGHTS.album, parsedMeta)
    if (bestScore(scored) >= 0.75) break
  }

  return pool
}

function compareCandidates(
  a: TidalTrackSummary,
  b: TidalTrackSummary,
  parsedMeta: ParsedTitleMeta,
  parsedArtist: string,
) {
  const scoreDiff = (b.score ?? 0) - (a.score ?? 0)
  const aArtistSim = artistSimilarity(parsedArtist, a.artist)
  const bArtistSim = artistSimilarity(parsedArtist, b.artist)

  if (isCollisionProneTitle(parsedMeta) && Math.abs(scoreDiff) <= 0.15) {
    const artistDiff = bArtistSim - aArtistSim
    if (Math.abs(artistDiff) > 0.001) return artistDiff
  }

  if (Math.abs(scoreDiff) <= 0.15) {
    const studioDiff =
      hasStudioPreference(parsedMeta, b.title) - hasStudioPreference(parsedMeta, a.title)
    if (studioDiff !== 0) return studioDiff
  }

  const aFailsGate = aArtistSim < ARTIST_GATE_MIN
  const bFailsGate = bArtistSim < ARTIST_GATE_MIN
  if (aFailsGate !== bFailsGate && Math.abs(scoreDiff) <= 0.2) {
    return aFailsGate ? 1 : -1
  }

  if (Math.abs(scoreDiff) > 0.001) return scoreDiff

  const featDiff =
    featuredVerificationScore(parsedMeta, b.title, b.artist)
    - featuredVerificationScore(parsedMeta, a.title, a.artist)
  if (Math.abs(featDiff) > 0.001) return featDiff

  const artistTieBreak = bArtistSim - aArtistSim
  if (Math.abs(artistTieBreak) > 0.001) return artistTieBreak

  return hasStudioPreference(parsedMeta, b.title) - hasStudioPreference(parsedMeta, a.title)
}

function scoreCandidates(
  parsed: ParsedSong,
  candidates: TidalTrackSummary[],
  weights: typeof SCORE_WEIGHTS[keyof typeof SCORE_WEIGHTS],
  parsedMeta: ParsedTitleMeta,
) {
  return candidates
    .map(c => ({
      ...c,
      score: scoreTrack(parsed, c.title, c.artist, weights),
    }))
    .sort((a, b) => compareCandidates(a, b, parsedMeta, parsed.artist))
}

function bestScore(candidates: TidalTrackSummary[]) {
  return candidates[0]?.score ?? 0
}

type ScoredWithStrategy = TidalTrackSummary & { strategy: string }

function mergeCandidates(
  pool: ScoredWithStrategy[],
  parsedMeta: ParsedTitleMeta,
  parsedArtist: string,
): TidalTrackSummary[] {
  const byId = new Map<string, ScoredWithStrategy>()
  for (const c of pool) {
    const existing = byId.get(c.id)
    if (!existing || (c.score ?? 0) > (existing.score ?? 0)) {
      byId.set(c.id, c)
    }
  }
  return [...byId.values()].sort((a, b) => compareCandidates(a, b, parsedMeta, parsedArtist))
}

function winningStrategy(
  pool: ScoredWithStrategy[],
  parsedMeta: ParsedTitleMeta,
  parsedArtist: string,
): string {
  if (!pool.length) return 'none'
  const best = [...pool].sort((a, b) => compareCandidates(a, b, parsedMeta, parsedArtist))[0]
  return best?.strategy ?? 'none'
}

function combinedSearchLimit(parsedMeta: ParsedTitleMeta): number {
  return isCollisionProneTitle(parsedMeta) ? COLLISION_COMBINED_SEARCH_LIMIT : COMBINED_SEARCH_LIMIT
}

function passesEarlyExit(
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
  candidates: TidalTrackSummary[],
): boolean {
  const best = candidates[0]
  if (!best || (best.score ?? 0) < EARLY_EXIT_SCORE) return false
  if (isCollisionProneTitle(parsedMeta)
    && artistSimilarity(parsed.artist, best.artist) < COLLISION_ARTIST_MIN) {
    return false
  }
  return true
}

function applyTitleFirstArtistGate(
  parsed: ParsedSong,
  candidates: TidalTrackSummary[],
): TidalTrackSummary[] {
  const passing = candidates.filter(
    c => artistSimilarity(parsed.artist, c.artist) >= ARTIST_GATE_MIN,
  )
  return passing.length ? passing : candidates
}

async function strategyTruncatedTitle(
  client: TidalClient,
  parsed: ParsedSong,
  deps: MatchStrategyDeps,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult | null> {
  if (!parsedMeta.truncated) return null

  const searchQuery = `${normalizeArtistForSearch(parsed.artist)} ${normalizeTitleForSearch(parsedMeta.base)}`.trim()
  const raw = await deps.searchTidalQuery(client, searchQuery, 20)
  const candidates = scoreCandidates(parsed, raw, SCORE_WEIGHTS.combined, parsedMeta)
  return { strategy: 'search-truncated', searchQuery, candidates }
}

async function strategyCombined(
  client: TidalClient,
  parsed: ParsedSong,
  deps: MatchStrategyDeps,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult> {
  const searchQuery = deps.buildMatchQuery(parsed)
  const raw = await deps.searchTidalQuery(client, searchQuery, combinedSearchLimit(parsedMeta))
  const candidates = scoreCandidates(parsed, raw, SCORE_WEIGHTS.combined, parsedMeta)
  return { strategy: 'search-combined', searchQuery, candidates }
}

async function strategyFeatExpanded(
  client: TidalClient,
  parsed: ParsedSong,
  deps: MatchStrategyDeps,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult | null> {
  const firstFeat = parsedMeta.featuredArtists[0]
  if (!firstFeat) return null

  const searchQuery = `${parsed.artist} ${parsedMeta.base} ${firstFeat}`.trim()
  const raw = await deps.searchTidalQuery(client, searchQuery, 12)
  const candidates = scoreCandidates(parsed, raw, SCORE_WEIGHTS.combined, parsedMeta)
  return { strategy: 'search-feat-expanded', searchQuery, candidates }
}

async function strategyTitleFirst(
  client: TidalClient,
  parsed: ParsedSong,
  deps: MatchStrategyDeps,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult> {
  const searchQuery = parsedMeta.base
  const raw = await deps.searchTidalQuery(client, searchQuery, 30)
  const scored = scoreCandidates(parsed, raw, SCORE_WEIGHTS.titleFirst, parsedMeta)
  const candidates = applyTitleFirstArtistGate(parsed, scored)
  return { strategy: 'search-title', searchQuery, candidates }
}

async function strategyArtistDiscography(
  client: TidalClient,
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult> {
  const searchQuery = parsed.artist.trim()
  const artists = await searchArtists(client, searchQuery)
  const bestArtist = artists[0]
  if (!bestArtist || bestArtist.score < 0.5) {
    return { strategy: 'artist-discography', searchQuery, candidates: [] }
  }

  const pool: TidalTrackSummary[] = []
  let cursor: string | undefined
  let pages = 0
  let tracksApiFailed = false

  while (pages < ARTIST_DISCOGRAPHY_MAX_PAGES) {
    const params = new URLSearchParams({
      include: 'tracks,artists,albums,artworks',
    })
    if (cursor) params.set('page[cursor]', cursor)

    const path = `/artists/${bestArtist.id}/relationships/tracks`
    const res = await client.fetch(`${path}?${params}`)
    if (!res.ok) {
      console.error(`Tidal relationship tracks failed (${res.status}) for ${path}`)
      tracksApiFailed = true
      break
    }

    const json = await res.json()
    const itemRefs = json.data ?? []
    const trackIds = (Array.isArray(itemRefs) ? itemRefs : [])
      .filter((ref: { type: string }) => ref.type === 'tracks')
      .map((ref: { id: string }) => ref.id)

    if (trackIds.length) {
      const { tracks: detailed, included } = await fetchTrackDetails(client, trackIds)
      pool.push(...detailed.map(t => toSummary(t, included)))
    }

    const scored = scoreCandidates(parsed, pool, SCORE_WEIGHTS.artistFirst, parsedMeta)
    if (bestScore(scored) >= 0.75) {
      return {
        strategy: 'artist-discography',
        searchQuery: `${searchQuery} → artist:${bestArtist.id}`,
        candidates: scored,
      }
    }

    const next = json.links?.next as string | undefined
    if (!next) break
    const nextUrl = new URL(next, 'https://openapi.tidal.com')
    cursor = nextUrl.searchParams.get('page[cursor]') ?? undefined
    if (!cursor) break
    pages++
  }

  if (tracksApiFailed || bestScore(scoreCandidates(parsed, pool, SCORE_WEIGHTS.artistFirst, parsedMeta)) < 0.75) {
    const albumBrowseTracks = await browseArtistAlbumsForTitle(
      client,
      bestArtist.id,
      parsed,
      parsedMeta,
      { requireTitleMatch: tracksApiFailed ? false : true },
    )
    if (albumBrowseTracks.length) {
      pool.push(...albumBrowseTracks)
    }
  }

  const candidates = scoreCandidates(parsed, pool, SCORE_WEIGHTS.artistFirst, parsedMeta)
  const usedAlbumBrowse = tracksApiFailed && candidates.some(c => (c.score ?? 0) >= 0.75)

  return {
    strategy: usedAlbumBrowse ? 'artist-album-browse' : 'artist-discography',
    searchQuery: `${searchQuery} → artist:${bestArtist.id}`,
    candidates,
  }
}

async function strategyAlbumTracklist(
  client: TidalClient,
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult | null> {
  if (!parsed.album?.trim()) return null

  const searchQuery = `${parsed.artist} ${parsed.album}`.trim()
  const params = new URLSearchParams({ include: 'albums,artists' })
  const res = await client.fetch(
    `/searchResults/${encodeURIComponent(searchQuery)}?${params}`,
  )

  if (!res.ok) {
    console.error(`Tidal album search failed (${res.status}) for "${searchQuery}"`)
    return { strategy: 'album-tracklist', searchQuery, candidates: [] }
  }

  const json = await res.json()
  const { albums, included } = albumsFromSearchResponse(json)
  if (!albums.length) {
    return { strategy: 'album-tracklist', searchQuery, candidates: [] }
  }

  const scoredAlbums = albums
    .map(a => ({
      id: a.id,
      title: String(a.attributes?.title ?? ''),
      score: similarity(parsed.album!, String(a.attributes?.title ?? '')),
    }))
    .sort((a, b) => b.score - a.score)

  const bestAlbum = scoredAlbums[0]
  if (!bestAlbum || bestAlbum.score < 0.45) {
    return { strategy: 'album-tracklist', searchQuery, candidates: [] }
  }

  const { tracks } = await fetchAlbumTracks(client, bestAlbum.id)
  const candidates = scoreCandidates(parsed, tracks, SCORE_WEIGHTS.album, parsedMeta)
  return {
    strategy: 'album-tracklist',
    searchQuery: `${searchQuery} → album:${bestAlbum.id}`,
    candidates,
  }
}

export async function runMatchCascade(
  client: TidalClient,
  parsed: ParsedSong,
  deps: MatchStrategyDeps,
): Promise<MatchCascadeResult> {
  const parsedMeta = parseTitleMetadata(parsed.title)
  const pool: ScoredWithStrategy[] = []
  let primaryQuery = deps.buildMatchQuery(parsed)

  const s1 = await strategyCombined(client, parsed, deps, parsedMeta)
  primaryQuery = s1.searchQuery
  for (const c of s1.candidates) {
    pool.push({ ...c, strategy: s1.strategy })
  }
  if (passesEarlyExit(parsed, parsedMeta, s1.candidates)) {
    const allScored = mergeCandidates(pool, parsedMeta, parsed.artist)
    return {
      allScored,
      strategyUsed: s1.strategy,
      searchQuery: primaryQuery,
    }
  }

  const s1c = await strategyTruncatedTitle(client, parsed, deps, parsedMeta)
  if (s1c) {
    for (const c of s1c.candidates) {
      pool.push({ ...c, strategy: s1c.strategy })
    }
    const mergedAfterTrunc = mergeCandidates(pool, parsedMeta, parsed.artist)
    if (passesEarlyExit(parsed, parsedMeta, mergedAfterTrunc)) {
      return {
        allScored: mergedAfterTrunc,
        strategyUsed: winningStrategy(pool, parsedMeta, parsed.artist),
        searchQuery: primaryQuery,
      }
    }
  }

  if (bestScore(s1.candidates) < FEAT_EXPAND_THRESHOLD && parsedMeta.featuredArtists.length) {
    const s1b = await strategyFeatExpanded(client, parsed, deps, parsedMeta)
    if (s1b) {
      for (const c of s1b.candidates) {
        pool.push({ ...c, strategy: s1b.strategy })
      }
      const mergedAfter1b = mergeCandidates(pool, parsedMeta, parsed.artist)
      if (passesEarlyExit(parsed, parsedMeta, mergedAfter1b)) {
        return {
          allScored: mergedAfter1b,
          strategyUsed: winningStrategy(pool, parsedMeta, parsed.artist),
          searchQuery: primaryQuery,
        }
      }
    }
  }

  const s2 = await strategyTitleFirst(client, parsed, deps, parsedMeta)
  for (const c of s2.candidates) {
    pool.push({ ...c, strategy: s2.strategy })
  }
  const mergedAfter2 = mergeCandidates(pool, parsedMeta, parsed.artist)
  if (passesEarlyExit(parsed, parsedMeta, mergedAfter2)) {
    return {
      allScored: mergedAfter2,
      strategyUsed: winningStrategy(pool, parsedMeta, parsed.artist),
      searchQuery: primaryQuery,
    }
  }

  const s3 = await strategyArtistDiscography(client, parsed, parsedMeta)
  for (const c of s3.candidates) {
    pool.push({ ...c, strategy: s3.strategy })
  }

  const s4 = await strategyAlbumTracklist(client, parsed, parsedMeta)
  if (s4) {
    for (const c of s4.candidates) {
      pool.push({ ...c, strategy: s4.strategy })
    }
  }

  const allScored = mergeCandidates(pool, parsedMeta, parsed.artist)
  return {
    allScored,
    strategyUsed: winningStrategy(pool, parsedMeta, parsed.artist),
    searchQuery: primaryQuery,
  }
}
