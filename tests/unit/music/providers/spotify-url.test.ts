import { describe, expect, it } from 'vitest'
import {
  parseSpotifyTrackUrl,
  spotifyTrackBrowseUrl,
} from '../../../../server/utils/music/providers/spotify/url'

describe('Spotify URL helpers', () => {
  it('parses web and URI track identifiers', () => {
    expect(parseSpotifyTrackUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc')).toBe('4uLU6hMCjMI75M1A2tKUQC')
    expect(parseSpotifyTrackUrl('spotify:track:7ouMYWpwJ422jRcDASZB7P')).toBe('7ouMYWpwJ422jRcDASZB7P')
  })

  it('rejects non-track URLs', () => {
    expect(parseSpotifyTrackUrl('https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX')).toBeNull()
    expect(parseSpotifyTrackUrl('https://tidal.com/browse/track/123')).toBeNull()
    expect(parseSpotifyTrackUrl('not a track url')).toBeNull()
  })

  it('builds public browse URLs', () => {
    expect(spotifyTrackBrowseUrl('4uLU6hMCjMI75M1A2tKUQC')).toBe(
      'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    )
  })
})
