import type {
  MatchedSong,
  MatchStatus,
  ParsedSong,
  TidalTrackSummary,
} from '../../shared/types/playlist'
import type { TidalClient } from './tidal-client'
import {
  normalizeSongKey,
  parseTitleMetadata,
  normalizeTitleForSearch,
  normalizeArtistForSearch,
  artistSimilarity,
  ARTIST_GATE_MIN,
} from './match-scoring.ts'
import { runMatchCascade } from './match-strategies.ts'

type JsonApiResource = {
  id: string
  type: string
  attributes?: Record<string, unknown>
  relationships?: Record<string, { data?: { id: string; type: string } | Array<{ id: string; type: string }> }>
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

export function buildMatchQuery(
  parsed: Pick<ParsedSong, 'artist' | 'title' | 'album'>,
): string {
  const titleBase = normalizeTitleForSearch(parseTitleMetadata(parsed.title).base)
  const artist = normalizeArtistForSearch(parsed.artist)
  return parsed.album
    ? `${artist} ${titleBase} ${normalizeTitleForSearch(parsed.album)}`
    : `${artist} ${titleBase}`
}

export async function getTrackById(
  client: TidalClient,
  trackId: string,
): Promise<TidalTrackSummary | null> {
  const { tracks, included } = await fetchTrackDetails(client, [trackId])
  const track = tracks[0]
  return track ? toSummary(track, included) : null
}

export async function searchTidalQuery(
  client: TidalClient,
  query: string,
  limit = 8,
): Promise<TidalTrackSummary[]> {
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

export type MatchSongMeta = {
  match: MatchedSong
  searchQuery: string
  strategyUsed: string
  allScored: TidalTrackSummary[]
}

const matchStrategyDeps = {
  buildMatchQuery,
  searchTidalQuery,
}

export async function matchSongWithMeta(
  client: TidalClient,
  parsed: ParsedSong,
  _searchLimit = 8,
): Promise<MatchSongMeta> {
  const { allScored, strategyUsed, searchQuery } = await runMatchCascade(
    client,
    parsed,
    matchStrategyDeps,
  )

  if (allScored.length === 0) {
    return {
      match: { parsed, alternatives: [], status: 'not_found' },
      searchQuery,
      strategyUsed,
      allScored: [],
    }
  }

  const best = allScored[0]!
  const alternatives = allScored.slice(1, 5)

  let status: MatchStatus = 'matched'
  if ((best.score ?? 0) < 0.55) status = 'not_found'
  else if ((best.score ?? 0) < 0.75) status = 'ambiguous'
  else if (artistSimilarity(parsed.artist, best.artist) < ARTIST_GATE_MIN) status = 'ambiguous'

  return {
    match: { parsed, bestMatch: best, alternatives, status, strategyUsed },
    searchQuery,
    strategyUsed,
    allScored,
  }
}

export async function matchSong(
  client: TidalClient,
  parsed: ParsedSong,
): Promise<MatchedSong> {
  const { match } = await matchSongWithMeta(client, parsed, 8)
  return match
}

export async function matchSongsBatch(
  client: TidalClient,
  songs: ParsedSong[],
  concurrency = 1,
): Promise<MatchedSong[]> {
  const results: MatchedSong[] = []
  let index = 0

  async function worker() {
    while (index < songs.length) {
      const i = index++
      results[i] = await matchSong(client, songs[i]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, songs.length) }, worker))
  return results
}

export type PlaylistTrackEntry = TidalTrackSummary

export async function fetchPlaylistTracks(
  client: TidalClient,
  playlistId: string,
): Promise<PlaylistTrackEntry[]> {
  const tracks: PlaylistTrackEntry[] = []
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
