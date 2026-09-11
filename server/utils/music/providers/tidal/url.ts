const TRACK_PATH = /(?:^|\/)(?:browse\/)?track\/(\d+)\/?$/i
const PLAYLIST_PATH = /(?:^|\/)(?:browse\/)?playlist\/([0-9a-f-]{36})\/?$/i

function tidalPath(value: string): string | null {
  try {
    const parsed = new URL(value.trim())
    return parsed.hostname.endsWith('tidal.com') ? parsed.pathname : null
  } catch {
    return null
  }
}

export function parseTidalTrackUrl(url: string): string | null {
  const match = tidalPath(url)?.match(TRACK_PATH)
  return match?.[1] ?? null
}

export function parseTidalPlaylistUrl(url: string): string | null {
  const match = tidalPath(url)?.match(PLAYLIST_PATH)
  return match?.[1] ?? null
}

export function tidalTrackBrowseUrl(trackId: string): string {
  return `https://tidal.com/browse/track/${trackId}`
}
