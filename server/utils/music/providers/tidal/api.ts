import type { H3Event } from 'h3'
import type { PlaylistCreateResult } from '../../../../../shared/types/playlist'
import { getProviderSession, setProviderSession } from '../../../session.ts'
import { getValidAccessToken, refreshTokens } from '../../oauth.ts'
import type { PlaylistInput, PlaylistUpdateInput } from '../../types.ts'
import {
  tidalMaxConcurrent,
  tidalMaxRetries,
  tidalMinIntervalMs,
} from '../../../env.ts'
import { createTidalHttpClient, getTidalRateLimitOptions } from './client.ts'
import { tidalCountryCode, tidalOAuthConfig } from './config.ts'

const PLAYLIST_ADD_BATCH_SIZE = 20

/** Session-aware Tidal request that refreshes once on a 401. */
export async function tidalUserFetch(
  event: H3Event,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const rateLimitOpts = getTidalRateLimitOptions({
    tidalMaxConcurrent: tidalMaxConcurrent(),
    tidalMinIntervalMs: tidalMinIntervalMs(),
    tidalMaxRetries: tidalMaxRetries(),
  })
  const country = tidalCountryCode(event)
  const cfg = tidalOAuthConfig(event)

  let token = await getValidAccessToken(event, 'tidal', cfg)
  let client = createTidalHttpClient(token, country, rateLimitOpts)
  let res = await client.fetch(path, init)

  if (res.status === 401) {
    const session = getProviderSession(event, 'tidal')
    if (!session?.refreshToken) {
      throw createError({ statusCode: 401, message: 'Tidal session expired — please reconnect' })
    }
    const tokens = await refreshTokens(cfg, session.refreshToken)
    setProviderSession(event, 'tidal', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      displayName: session.displayName,
    })
    token = tokens.access_token
    client = createTidalHttpClient(token, country, rateLimitOpts)
    res = await client.fetch(path, init)
    if (res.status === 401) {
      throw createError({ statusCode: 401, message: 'Tidal session expired — please reconnect' })
    }
  }

  return res
}

export async function verifyTidalConnection(event: H3Event): Promise<boolean> {
  const res = await tidalUserFetch(event, '/playlists?page[limit]=1')
  return res.status !== 401
}

export async function createTidalPlaylist(
  event: H3Event,
  input: PlaylistInput,
): Promise<PlaylistCreateResult> {
  const attributes: Record<string, string> = { name: input.name.trim() }
  const description = input.description?.trim()
  if (description) attributes.description = description

  const createRes = await tidalUserFetch(event, '/playlists', {
    method: 'POST',
    body: JSON.stringify({ data: { type: 'playlists', attributes } }),
  })

  if (!createRes.ok) {
    const err = await createRes.text()
    throw createError({ statusCode: 502, message: `Failed to create playlist: ${err}` })
  }

  const created = await createRes.json()
  const playlistId = created.data?.id as string
  if (!playlistId) {
    throw createError({ statusCode: 502, message: 'No playlist ID returned' })
  }

  const failures: { trackId: string; position: number }[] = []

  for (let i = 0; i < input.trackIds.length; i += PLAYLIST_ADD_BATCH_SIZE) {
    const batch = input.trackIds.slice(i, i + PLAYLIST_ADD_BATCH_SIZE)
    const addRes = await tidalUserFetch(event, `/playlists/${playlistId}/relationships/items`, {
      method: 'POST',
      body: JSON.stringify({
        data: batch.map(trackId => ({ type: 'tracks', id: trackId })),
      }),
    })

    if (!addRes.ok) {
      for (let j = 0; j < batch.length; j++) {
        failures.push({ trackId: batch[j]!, position: i + j + 1 })
      }
    }
  }

  const shareUrl = tidalPlaylistShareUrl(playlistId, created)

  return {
    playlistId,
    url: shareUrl,
    failures: failures.length ? failures : undefined,
  }
}

type TidalItemRef = { type: string; id: string }

async function fetchTidalPlaylistItemRefs(
  event: H3Event,
  playlistId: string,
): Promise<TidalItemRef[]> {
  const refs: TidalItemRef[] = []
  let cursor: string | undefined

  for (;;) {
    const params = new URLSearchParams()
    if (cursor) params.set('page[cursor]', cursor)

    const res = await tidalUserFetch(
      event,
      `/playlists/${playlistId}/relationships/items?${params}`,
    )
    if (!res.ok) {
      throw createError({
        statusCode: 502,
        message: `Failed to load playlist items: ${await res.text()}`,
      })
    }

    const json = await res.json() as {
      data?: TidalItemRef[]
      links?: { next?: string }
    }
    refs.push(...(json.data ?? []))

    const next = json.links?.next
    if (!next) break

    const nextUrl = new URL(next, 'https://openapi.tidal.com')
    cursor = nextUrl.searchParams.get('page[cursor]') ?? undefined
    if (!cursor) break
  }

  return refs
}

async function replaceTidalPlaylistTracks(
  event: H3Event,
  playlistId: string,
  trackIds: string[],
): Promise<{ trackId: string; position: number }[]> {
  const existing = await fetchTidalPlaylistItemRefs(event, playlistId)
  const failures: { trackId: string; position: number }[] = []

  for (let i = 0; i < existing.length; i += PLAYLIST_ADD_BATCH_SIZE) {
    const batch = existing.slice(i, i + PLAYLIST_ADD_BATCH_SIZE)
    const deleteRes = await tidalUserFetch(event, `/playlists/${playlistId}/relationships/items`, {
      method: 'DELETE',
      body: JSON.stringify({ data: batch }),
    })
    if (!deleteRes.ok) {
      throw createError({
        statusCode: 502,
        message: `Failed to clear playlist tracks: ${await deleteRes.text()}`,
      })
    }
  }

  for (let i = 0; i < trackIds.length; i += PLAYLIST_ADD_BATCH_SIZE) {
    const batch = trackIds.slice(i, i + PLAYLIST_ADD_BATCH_SIZE)
    const addRes = await tidalUserFetch(event, `/playlists/${playlistId}/relationships/items`, {
      method: 'POST',
      body: JSON.stringify({
        data: batch.map(trackId => ({ type: 'tracks', id: trackId })),
      }),
    })

    if (!addRes.ok) {
      for (let j = 0; j < batch.length; j++) {
        failures.push({ trackId: batch[j]!, position: i + j + 1 })
      }
    }
  }

  return failures
}

type TidalPlaylistCreated = {
  data?: {
    attributes?: {
      externalLinks?: Array<{ meta?: { type?: string }; href?: string }>
    }
  }
}

function tidalPlaylistShareUrl(playlistId: string, created?: unknown) {
  const links = (created as TidalPlaylistCreated | undefined)?.data?.attributes?.externalLinks
  return links?.find(l => l.meta?.type === 'TIDAL_SHARING')?.href
    ?? `https://tidal.com/browse/playlist/${playlistId}`
}

export async function updateTidalPlaylist(
  event: H3Event,
  input: PlaylistUpdateInput,
): Promise<PlaylistCreateResult> {
  const attributes: Record<string, string> = { name: input.name.trim() }
  const description = input.description?.trim()
  if (description) attributes.description = description

  const patchRes = await tidalUserFetch(event, `/playlists/${input.playlistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'playlists', id: input.playlistId, attributes } }),
  })

  if (!patchRes.ok) {
    throw createError({ statusCode: 502, message: `Failed to update playlist: ${await patchRes.text()}` })
  }

  const failures = await replaceTidalPlaylistTracks(event, input.playlistId, input.trackIds)

  return {
    playlistId: input.playlistId,
    url: tidalPlaylistShareUrl(input.playlistId),
    failures: failures.length ? failures : undefined,
  }
}
