import { describe, expect, it, vi } from 'vitest'
import type { TidalHttpClient } from '../../../../server/utils/music/providers/tidal/client'
import {
  getTrackById,
  searchTidalQuery,
} from '../../../../server/utils/music/providers/tidal/search'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function trackResource(id: string, title: string, artistId = 'artist-1', albumId = 'album-1') {
  return {
    id,
    type: 'tracks',
    attributes: { title },
    relationships: {
      artists: { data: [{ id: artistId, type: 'artists' }] },
      albums: { data: [{ id: albumId, type: 'albums' }] },
    },
  }
}

const includedMetadata = [
  {
    id: 'artist-1',
    type: 'artists',
    attributes: { name: 'Tidal Artist', popularity: 80 },
  },
  {
    id: 'album-1',
    type: 'albums',
    attributes: { title: 'Tidal Album' },
    relationships: {
      coverArt: { data: { id: '00000000-1111-2222-3333-444444444444', type: 'artworks' } },
    },
  },
]

describe('Tidal search mapping', () => {
  it('maps JSON:API search responses into TrackSummary objects', async () => {
    const fetch = vi.fn(async () => jsonResponse({
      included: [
        trackResource('123', 'Tidal Song'),
        ...includedMetadata,
      ],
    }))
    const client = { fetch, countryCode: 'US' } satisfies TidalHttpClient

    await expect(searchTidalQuery(client, 'Tidal Song', 5)).resolves.toEqual([{
      id: '123',
      title: 'Tidal Song',
      artist: 'Tidal Artist',
      album: 'Tidal Album',
      albumArtUrl: 'https://resources.tidal.com/images/00000000/1111/2222/3333/444444444444/320x320.jpg',
      score: undefined,
    }])

    expect(fetch).toHaveBeenCalledTimes(1)
    const path = fetch.mock.calls[0]?.[0] as string
    expect(path.startsWith('/searchResults/Tidal%20Song?')).toBe(true)
    expect(new URLSearchParams(path.split('?')[1]).get('include')).toBe('tracks,artists,albums')
  })

  it('fetches details when search results do not include artist metadata', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        included: [{
          id: '456',
          type: 'tracks',
          attributes: { title: 'Sparse Song' },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [trackResource('456', 'Sparse Song')],
        included: includedMetadata,
      }))
    const client = { fetch, countryCode: 'US' } satisfies TidalHttpClient

    await expect(searchTidalQuery(client, 'Sparse Song', 1)).resolves.toEqual([expect.objectContaining({
      id: '456',
      title: 'Sparse Song',
      artist: 'Tidal Artist',
      album: 'Tidal Album',
    })])

    expect(fetch).toHaveBeenCalledTimes(2)
    const detailPath = fetch.mock.calls[1]?.[0] as string
    expect(detailPath.startsWith('/tracks?')).toBe(true)
    const params = new URLSearchParams(detailPath.split('?')[1])
    expect(params.get('filter[id]')).toBe('456')
    expect(params.get('include')).toBe('artists,albums,artworks')
  })

  it('maps track detail lookups', async () => {
    const fetch = vi.fn(async () => jsonResponse({
      data: [trackResource('789', 'Detail Song')],
      included: includedMetadata,
    }))
    const client = { fetch, countryCode: 'US' } satisfies TidalHttpClient

    await expect(getTrackById(client, '789')).resolves.toEqual(expect.objectContaining({
      id: '789',
      title: 'Detail Song',
      artist: 'Tidal Artist',
      album: 'Tidal Album',
    }))
  })

  it('returns an empty result for failed search responses', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = {
      fetch: vi.fn(async () => new Response('nope', { status: 500 })),
      countryCode: 'US',
    } satisfies TidalHttpClient

    await expect(searchTidalQuery(client, 'Song')).resolves.toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
