import { describe, expect, it, vi } from 'vitest'
import type { SpotifyHttpClient } from '../../../../server/utils/music/providers/spotify/client'
import {
  getSpotifyTrackById,
  searchSpotify,
} from '../../../../server/utils/music/providers/spotify/search'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Spotify search mapping', () => {
  it('maps search responses into TrackSummary objects and clamps limits', async () => {
    const fetch = vi.fn(async () => jsonResponse({
      tracks: {
        items: [{
          id: 'track-1',
          name: 'Song One',
          artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
          album: {
            name: 'Album One',
            images: [
              { url: 'small.jpg', width: 64 },
              { url: 'medium.jpg', width: 300 },
              { url: 'large.jpg', width: 640 },
            ],
          },
        }],
      },
    }))
    const client = { fetch } satisfies SpotifyHttpClient

    await expect(searchSpotify(client, '  Song One  ', 999)).resolves.toEqual([{
      id: 'track-1',
      title: 'Song One',
      artist: 'Artist A, Artist B',
      album: 'Album One',
      albumArtUrl: 'medium.jpg',
      score: undefined,
    }])

    expect(fetch).toHaveBeenCalledTimes(1)
    const path = fetch.mock.calls[0]?.[0] as string
    const params = new URLSearchParams(path.split('?')[1])
    expect(path.startsWith('/search?')).toBe(true)
    expect(params.get('q')).toBe('Song One')
    expect(params.get('type')).toBe('track')
    expect(params.get('limit')).toBe('50')
  })

  it('maps track detail responses and URL-encodes ids', async () => {
    const fetch = vi.fn(async () => jsonResponse({
      id: 'track/id',
      name: 'Detail Song',
      artists: [{ name: 'Detail Artist' }],
      album: { name: 'Detail Album', images: [{ url: 'detail.jpg', width: 640 }] },
    }))
    const client = { fetch } satisfies SpotifyHttpClient

    await expect(getSpotifyTrackById(client, 'track/id')).resolves.toEqual({
      id: 'track/id',
      title: 'Detail Song',
      artist: 'Detail Artist',
      album: 'Detail Album',
      albumArtUrl: 'detail.jpg',
      score: undefined,
    })
    expect(fetch).toHaveBeenCalledWith('/tracks/track%2Fid')
  })

  it('returns an empty result for failed search responses', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = {
      fetch: vi.fn(async () => new Response('nope', { status: 500 })),
    } satisfies SpotifyHttpClient

    await expect(searchSpotify(client, 'Song')).resolves.toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
