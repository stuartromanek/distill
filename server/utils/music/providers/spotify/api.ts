import type { H3Event } from 'h3'
import type { PlaylistCreateResult } from '../../../../../shared/types/playlist'
import { getProviderSession, setProviderSession } from '../../../session.ts'
import { getValidAccessToken, refreshTokens } from '../../oauth.ts'
import type { PlaylistInput, PlaylistUpdateInput } from '../../types.ts'
import { createSpotifyHttpClient, type SpotifyHttpClient } from './client.ts'
import { spotifyOAuthConfig } from './config.ts'

const PLAYLIST_ADD_BATCH_SIZE = 100

export type SpotifyAccessVerification =
  | { ok: true; displayName?: string }
  | { ok: false; status: number; message: string }

function spotifyVerifyErrorMessage(status: number, body: string): string {
  if (status === 403 && /premium subscription required/i.test(body)) {
    return 'Spotify requires an active Premium subscription on the app owner account for development API access.'
  }
  if (status === 403) {
    return 'Spotify denied API access. Add your Spotify email under User Management in the Spotify Developer Dashboard.'
  }
  return `Spotify connection could not be verified (HTTP ${status}).`
}

export async function verifySpotifyAccessToken(accessToken: string): Promise<SpotifyAccessVerification> {
  const client = createSpotifyHttpClient(accessToken)
  const res = await client.fetch('/me')
  if (res.ok) {
    const profile = await res.json().catch(() => null) as { display_name?: string } | null
    return { ok: true, displayName: profile?.display_name }
  }
  const body = await res.text().catch(() => '')
  const message = spotifyVerifyErrorMessage(res.status, body)
  return { ok: false, status: res.status, message }
}

async function spotifyClientForEvent(event: H3Event): Promise<SpotifyHttpClient> {
  const cfg = spotifyOAuthConfig(event)
  const token = await getValidAccessToken(event, 'spotify', cfg)
  return createSpotifyHttpClient(token)
}

/** Session-aware Spotify request that refreshes once on a 401. */
async function spotifyUserFetch(
  event: H3Event,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let client = await spotifyClientForEvent(event)
  let res = await client.fetch(path, init)

  if (res.status === 401) {
    const session = getProviderSession(event, 'spotify')
    if (!session?.refreshToken) {
      throw createError({ statusCode: 401, message: 'Spotify session expired — please reconnect' })
    }
    const cfg = spotifyOAuthConfig(event)
    const tokens = await refreshTokens(cfg, session.refreshToken)
    setProviderSession(event, 'spotify', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      displayName: session.displayName,
    })
    client = createSpotifyHttpClient(tokens.access_token)
    res = await client.fetch(path, init)
    if (res.status === 401) {
      throw createError({ statusCode: 401, message: 'Spotify session expired — please reconnect' })
    }
  }

  return res
}

export async function verifySpotifyConnection(event: H3Event): Promise<boolean> {
  const session = getProviderSession(event, 'spotify')
  if (!session?.accessToken) return false
  const verification = await verifySpotifyAccessToken(session.accessToken)
  return verification.ok
}

export async function createSpotifyPlaylist(
  event: H3Event,
  input: PlaylistInput,
): Promise<PlaylistCreateResult> {
  const meRes = await spotifyUserFetch(event, '/me')
  if (!meRes.ok) {
    throw createError({ statusCode: 502, message: 'Failed to load Spotify profile' })
  }
  const me = await meRes.json() as { id?: string }
  if (!me.id) {
    throw createError({ statusCode: 502, message: 'No Spotify user id returned' })
  }

  const body: Record<string, unknown> = { name: input.name.trim(), public: false }
  const description = input.description?.trim()
  if (description) body.description = description

  const createRes = await spotifyUserFetch(event, `/users/${encodeURIComponent(me.id)}/playlists`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!createRes.ok) {
    const err = await createRes.text()
    throw createError({ statusCode: 502, message: `Failed to create playlist: ${err}` })
  }

  const created = await createRes.json() as {
    id?: string
    external_urls?: { spotify?: string }
  }
  const playlistId = created.id
  if (!playlistId) {
    throw createError({ statusCode: 502, message: 'No playlist ID returned' })
  }

  const failures: { trackId: string; position: number }[] = []

  for (let i = 0; i < input.trackIds.length; i += PLAYLIST_ADD_BATCH_SIZE) {
    const batch = input.trackIds.slice(i, i + PLAYLIST_ADD_BATCH_SIZE)
    const addRes = await spotifyUserFetch(event, `/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: batch.map(id => `spotify:track:${id}`) }),
    })

    if (!addRes.ok) {
      for (let j = 0; j < batch.length; j++) {
        failures.push({ trackId: batch[j]!, position: i + j + 1 })
      }
    }
  }

  return {
    playlistId,
    url: created.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlistId}`,
    failures: failures.length ? failures : undefined,
  }
}

export async function updateSpotifyPlaylist(
  event: H3Event,
  input: PlaylistUpdateInput,
): Promise<PlaylistCreateResult> {
  const body: Record<string, unknown> = { name: input.name.trim() }
  const description = input.description?.trim()
  if (description) body.description = description

  const patchRes = await spotifyUserFetch(event, `/playlists/${encodeURIComponent(input.playlistId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  if (!patchRes.ok) {
    throw createError({ statusCode: 502, message: `Failed to update playlist: ${await patchRes.text()}` })
  }

  const replaceRes = await spotifyUserFetch(
    event,
    `/playlists/${encodeURIComponent(input.playlistId)}/tracks`,
    {
      method: 'PUT',
      body: JSON.stringify({ uris: input.trackIds.map(id => `spotify:track:${id}`) }),
    },
  )

  if (!replaceRes.ok) {
    throw createError({ statusCode: 502, message: `Failed to update playlist tracks: ${await replaceRes.text()}` })
  }

  return {
    playlistId: input.playlistId,
    url: `https://open.spotify.com/playlist/${input.playlistId}`,
  }
}
