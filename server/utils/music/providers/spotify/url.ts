const TRACK_URL = /(?:open\.spotify\.com\/track\/|spotify:track:)([A-Za-z0-9]+)/i

export function parseSpotifyTrackUrl(url: string): string | null {
  const match = url.trim().match(TRACK_URL)
  return match?.[1] ?? null
}

export function spotifyTrackBrowseUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`
}
