import type { ParsedSong, TrackSummary } from '../../../../../shared/types/playlist'
import type { MusicSearchClient, StrategyResult } from '../../types.ts'
import {
  SCORE_WEIGHTS,
  normalize,
  similarity,
  type ParsedTitleMeta,
} from '../../../match-scoring.ts'
import { scoreCandidates, bestScore } from '../../match/cascade.ts'
import type { TidalHttpClient } from './client.ts'

const ARTIST_DISCOGRAPHY_MAX_PAGES = 3
const ARTIST_ALBUM_SCAN_MAX = 12
const ALBUM_TITLE_MATCH_MIN = 0.45

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
): TrackSummary {
  return {
    id: resource.id,
    title: String(resource.attributes?.title ?? 'Unknown'),
    artist: resolveArtist(resource, included),
    album: resolveAlbum(resource, included),
    albumArtUrl: resolveArtUrl(resource, included),
    score,
  }
}

function tracksNeedDetails(
  tracks: JsonApiResource[],
  included: Map<string, JsonApiResource>,
) {
  return tracks.some(t => resolveArtist(t, included) === 'Unknown Artist')
}

function mergeIncludedMaps(
  ...maps: Map<string, JsonApiResource>[]
): Map<string, JsonApiResource> {
  const merged = new Map<string, JsonApiResource>()
  for (const map of maps) {
    for (const [key, value] of map) merged.set(key, value)
  }
  return merged
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

async function fetchTrackDetails(
  client: TidalHttpClient,
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

export async function searchTidalQuery(
  client: TidalHttpClient,
  query: string,
  limit = 8,
): Promise<TrackSummary[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({
    include: 'tracks,artists,albums',
  })

  const res = await client.fetch(
    `/searchResults/${encodeURIComponent(trimmed)}?${params}`,
  )

  if (!res.ok) {
    const err = await res.text()
    console.error(`Tidal search failed (${res.status}) for "${trimmed}": ${err}`)
    return []
  }

  const json = await res.json()
  const { tracks: sparseTracks, included: searchIncluded } = tracksFromSearchResponse(json)
  const limited = sparseTracks.slice(0, limit)

  if (!tracksNeedDetails(limited, searchIncluded)) {
    return limited.map(t => toSummary(t, searchIncluded))
  }

  const needIds = limited
    .filter(t => resolveArtist(t, searchIncluded) === 'Unknown Artist')
    .map(t => t.id)

  if (!needIds.length) {
    return limited.map(t => toSummary(t, searchIncluded))
  }

  const { tracks, included: detailIncluded } = await fetchTrackDetails(client, needIds)
  const included = mergeIncludedMaps(searchIncluded, detailIncluded)
  const detailedById = new Map(tracks.map(t => [t.id, t]))

  return limited.map(t => toSummary(detailedById.get(t.id) ?? t, included))
}

export async function getTrackById(
  client: TidalHttpClient,
  trackId: string,
): Promise<TrackSummary | null> {
  const { tracks, included } = await fetchTrackDetails(client, [trackId])
  const track = tracks[0]
  return track ? toSummary(track, included) : null
}

async function searchArtists(client: TidalHttpClient, query: string) {
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
  const { artists } = artistsFromSearchResponse(json)
  return artists.map(a => ({
    id: a.id,
    name: String(a.attributes?.name ?? 'Unknown'),
    popularity: Number(a.attributes?.popularity ?? 0),
    score: similarity(query, String(a.attributes?.name ?? '')),
  })).sort((a, b) => b.score - a.score)
}

async function fetchArtistAlbums(client: TidalHttpClient, artistId: string) {
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
  client: TidalHttpClient,
  albumId: string,
): Promise<TrackSummary[]> {
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
  client: TidalHttpClient,
  artistId: string,
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
  options?: { requireTitleMatch?: boolean },
): Promise<TrackSummary[]> {
  const albums = await fetchArtistAlbums(client, artistId)
  const requireTitleMatch = options?.requireTitleMatch !== false
  const matchingAlbums = (requireTitleMatch
    ? albums.filter(a => albumTitleMatchesSong(a.title, parsedMeta))
    : albums)
    .sort((a, b) => similarity(b.title, parsedMeta.base) - similarity(a.title, parsedMeta.base))
    .slice(0, ARTIST_ALBUM_SCAN_MAX)

  const pool: TrackSummary[] = []
  for (const album of matchingAlbums) {
    const tracks = await fetchAlbumTracks(client, album.id)
    pool.push(...tracks)
    const scored = scoreCandidates(parsed, pool, SCORE_WEIGHTS.album, parsedMeta)
    if (bestScore(scored) >= 0.75) break
  }

  return pool
}

async function strategyArtistDiscography(
  client: TidalHttpClient,
  parsed: ParsedSong,
  parsedMeta: ParsedTitleMeta,
): Promise<StrategyResult> {
  const searchQuery = parsed.artist.trim()
  const artists = await searchArtists(client, searchQuery)
  const bestArtist = artists[0]
  if (!bestArtist || bestArtist.score < 0.5) {
    return { strategy: 'artist-discography', searchQuery, candidates: [] }
  }

  const pool: TrackSummary[] = []
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
  client: TidalHttpClient,
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
  const { albums } = albumsFromSearchResponse(json)
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

  const tracks = await fetchAlbumTracks(client, bestAlbum.id)
  const candidates = scoreCandidates(parsed, tracks, SCORE_WEIGHTS.album, parsedMeta)
  return {
    strategy: 'album-tracklist',
    searchQuery: `${searchQuery} → album:${bestAlbum.id}`,
    candidates,
  }
}

export async function fetchPlaylistTracks(
  client: TidalHttpClient,
  playlistId: string,
): Promise<TrackSummary[]> {
  const tracks: TrackSummary[] = []
  let cursor: string | undefined

  for (;;) {
    const params = new URLSearchParams({
      include: 'tracks,artists,albums',
    })
    if (cursor) params.set('page[cursor]', cursor)

    const res = await client.fetch(
      `/playlists/${playlistId}/relationships/items?${params}`,
    )

    if (!res.ok) {
      throw new Error(`Failed to fetch playlist items (${res.status}): ${await res.text()}`)
    }

    const json = await res.json()
    const itemRefs = json.data ?? []
    const trackIds = (Array.isArray(itemRefs) ? itemRefs : [])
      .filter((ref: { type: string }) => ref.type === 'tracks')
      .map((ref: { id: string }) => ref.id)

    if (trackIds.length) {
      const { tracks: detailed, included } = await fetchTrackDetails(client, trackIds)
      for (const t of detailed) {
        tracks.push(toSummary(t, included))
      }
    }

    const next = json.links?.next as string | undefined
    if (!next) break

    const nextUrl = new URL(next, 'https://openapi.tidal.com')
    cursor = nextUrl.searchParams.get('page[cursor]') ?? undefined
    if (!cursor) break
  }

  return tracks
}

/** Wrap a Tidal HTTP client as the generic, cascade-ready search client. */
export function createTidalSearchClient(http: TidalHttpClient): MusicSearchClient {
  return {
    providerId: 'tidal',
    search: (query, limit) => searchTidalQuery(http, query, limit),
    getTrackById: id => getTrackById(http, id),
    artistDiscographyStrategy: (parsed, parsedMeta) =>
      strategyArtistDiscography(http, parsed, parsedMeta),
    albumTracklistStrategy: (parsed, parsedMeta) =>
      strategyAlbumTracklist(http, parsed, parsedMeta),
  }
}
