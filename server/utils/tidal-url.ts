const TRACK_URL = /\/track\/(\d+)/i
const PLAYLIST_URL = /\/playlist\/([0-9a-f-]{36})/i

export function parseTidalTrackUrl(url: string): string | null {
  const trimmed = url.trim()
  const match = trimmed.match(TRACK_URL)
  return match?.[1] ?? null
}

export function parseTidalPlaylistUrl(url: string): string | null {
  const trimmed = url.trim()
  const match = trimmed.match(PLAYLIST_URL)
  return match?.[1] ?? null
}

export function tidalTrackBrowseUrl(trackId: string): string {
  return `https://tidal.com/browse/track/${trackId}`
}
