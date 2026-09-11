import { describe, expect, it, vi } from 'vitest'
import type { ParsedSong, TrackSummary } from '../../../shared/types/playlist'
import type { MusicSearchClient } from '../../../server/utils/music/types'
import { runMatchCascade } from '../../../server/utils/music/match/cascade'
import { matchSongWithMeta } from '../../../server/utils/music/match/match'

function parsed(overrides: Partial<ParsedSong> = {}): ParsedSong {
  return {
    artist: 'The Artist',
    title: 'Perfect Song',
    confidence: 'high',
    source: 'text',
    ...overrides,
  }
}

function track(overrides: Partial<TrackSummary> = {}): TrackSummary {
  return {
    id: 'track-1',
    title: 'Perfect Song',
    artist: 'The Artist',
    album: 'Perfect Album',
    ...overrides,
  }
}

describe('provider-agnostic match cascade', () => {
  it('uses the generic search client and returns the best scored match', async () => {
    const search = vi.fn(async () => [track()])
    const client: MusicSearchClient = {
      providerId: 'spotify',
      search,
      getTrackById: vi.fn(),
    }

    const result = await matchSongWithMeta(client, parsed())

    expect(search).toHaveBeenCalledWith('The Artist Perfect Song', 20)
    expect(result.strategyUsed).toBe('search-combined')
    expect(result.match.status).toBe('matched')
    expect(result.match.bestMatch).toEqual(expect.objectContaining({
      id: 'track-1',
      score: expect.any(Number),
    }))
  })

  it('works for providers without optional browse strategies', async () => {
    const client: MusicSearchClient = {
      providerId: 'spotify',
      search: vi.fn(async () => []),
      getTrackById: vi.fn(),
    }

    await expect(runMatchCascade(client, parsed())).resolves.toEqual({
      allScored: [],
      strategyUsed: 'none',
      searchQuery: 'The Artist Perfect Song',
    })
  })

  it('merges optional provider strategy candidates when search is weak', async () => {
    const search = vi.fn(async () => [
      track({ id: 'wrong', title: 'Different Song', artist: 'Other Artist' }),
    ])
    const artistDiscographyStrategy = vi.fn(async () => ({
      strategy: 'artist-discography',
      searchQuery: 'The Artist → artist:artist-1',
      candidates: [track({ id: 'browse-hit' })],
    }))
    const albumTracklistStrategy = vi.fn(async () => ({
      strategy: 'album-tracklist',
      searchQuery: 'The Artist Perfect Album → album:album-1',
      candidates: [track({ id: 'album-hit', title: 'Perfect Song', artist: 'The Artist' })],
    }))
    const client: MusicSearchClient = {
      providerId: 'tidal',
      search,
      getTrackById: vi.fn(),
      artistDiscographyStrategy,
      albumTracklistStrategy,
    }

    const result = await runMatchCascade(client, parsed({ album: 'Perfect Album' }))

    expect(artistDiscographyStrategy).toHaveBeenCalled()
    expect(albumTracklistStrategy).toHaveBeenCalled()
    expect(result.allScored.map(t => t.id)).toContain('browse-hit')
    expect(result.allScored.map(t => t.id)).toContain('album-hit')
    expect(result.strategyUsed).toBeTruthy()
  })
})
