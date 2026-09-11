import type { TrackSummary } from '../../../../../shared/types/playlist'
import type { MusicSearchClient } from '../../types.ts'
import type { SpotifyHttpClient } from './client.ts'

type SpotifyImage = { url: string; width?: number; height?: number }

type SpotifyTrack = {
  id: string
  name: string
  artists?: Array<{ name?: string }>
  album?: { name?: string; images?: SpotifyImage[] }
}

function pickArtUrl(images: SpotifyImage[] = []): string | undefined {
  if (!images.length) return undefined
  // Prefer an image close to 300px wide; otherwise fall back to the smallest.
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const mid = sorted.find(img => (img.width ?? 0) >= 300) ?? sorted[sorted.length - 1]
  return mid?.url
}

function toSummary(track: SpotifyTrack, score?: number): TrackSummary {
  return {
    id: track.id,
    title: track.name ?? 'Unknown',
    artist: track.artists?.map(a => a.name).filter(Boolean).join(', ') || 'Unknown Artist',
    album: track.album?.name,
    albumArtUrl: pickArtUrl(track.album?.images),
    score,
  }
}

export async function searchSpotify(
  client: SpotifyHttpClient,
  query: string,
  limit = 8,
): Promise<TrackSummary[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({
    q: trimmed,
    type: 'track',
    limit: String(Math.min(Math.max(limit, 1), 50)),
  })

  const res = await client.fetch(`/search?${params}`)
  if (!res.ok) {
    const err = await res.text()
    console.error(`Spotify search failed (${res.status}) for "${trimmed}": ${err}`)
    return []
  }

  const json = await res.json() as { tracks?: { items?: SpotifyTrack[] } }
  return (json.tracks?.items ?? []).map(t => toSummary(t))
}

export async function getSpotifyTrackById(
  client: SpotifyHttpClient,
  trackId: string,
): Promise<TrackSummary | null> {
  const res = await client.fetch(`/tracks/${encodeURIComponent(trackId)}`)
  if (!res.ok) {
    console.error(`Spotify track detail failed (${res.status}) for id: ${trackId}`)
    return null
  }
  const track = await res.json() as SpotifyTrack
  return track?.id ? toSummary(track) : null
}

/** Wrap a Spotify HTTP client as the generic, cascade-ready search client. */
export function createSpotifySearchClient(http: SpotifyHttpClient): MusicSearchClient {
  return {
    providerId: 'spotify',
    search: (query, limit) => searchSpotify(http, query, limit),
    getTrackById: id => getSpotifyTrackById(http, id),
  }
}
