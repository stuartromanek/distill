import { describe, expect, it } from 'vitest'
import {
  parseTidalPlaylistUrl,
  parseTidalTrackUrl,
  tidalTrackBrowseUrl,
} from '../../../../server/utils/music/providers/tidal/url'

describe('Tidal URL helpers', () => {
  it('parses track identifiers from Tidal URLs', () => {
    expect(parseTidalTrackUrl('https://tidal.com/browse/track/123456789')).toBe('123456789')
    expect(parseTidalTrackUrl('https://listen.tidal.com/track/987654321?u')).toBe('987654321')
  })

  it('separates track and playlist parsing', () => {
    const playlistId = '123e4567-e89b-12d3-a456-426614174000'

    expect(parseTidalTrackUrl(`https://tidal.com/browse/playlist/${playlistId}`)).toBeNull()
    expect(parseTidalPlaylistUrl(`https://tidal.com/browse/playlist/${playlistId}`)).toBe(playlistId)
    expect(parseTidalTrackUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toBeNull()
  })

  it('builds public browse URLs', () => {
    expect(tidalTrackBrowseUrl('123456789')).toBe('https://tidal.com/browse/track/123456789')
  })
})
