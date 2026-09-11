import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAuthorizeUrl, callbackRedirectUri } from '../../../server/utils/music/oauth'

function eventWithHeaders(headers: Record<string, string>) {
  return {
    req: {
      url: 'http://internal.local:3000/api/auth/spotify/login',
      headers: new Headers(headers),
    },
  }
}

describe('music OAuth helpers', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.DST_PUBLIC_URL
    delete process.env.NODE_ENV
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('builds a PKCE authorization URL without leaking a client secret', () => {
    const url = new URL(buildAuthorizeUrl({
      authorizeUrl: 'https://accounts.example.test/authorize',
      tokenUrl: 'https://accounts.example.test/token',
      scopes: 'playlist-modify-public playlist-modify-private',
      clientId: 'public-client-id',
      clientSecret: 'should-not-appear',
      redirectUri: 'https://app.example.test/api/oauth/callback/spotify',
    }, {
      codeChallenge: 'challenge-value',
      state: 'state-value',
    }))

    expect(url.origin + url.pathname).toBe('https://accounts.example.test/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('public-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.test/api/oauth/callback/spotify')
    expect(url.searchParams.get('scope')).toBe('playlist-modify-public playlist-modify-private')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value')
    expect(url.searchParams.get('state')).toBe('state-value')
    expect(url.searchParams.has('client_secret')).toBe(false)
  })

  it('derives callback redirect URIs from forwarded request origin', () => {
    const event = eventWithHeaders({
      host: 'internal.local:3000',
      'x-forwarded-host': 'music.example.test',
      'x-forwarded-proto': 'https',
    })

    expect(callbackRedirectUri(event as never, 'spotify')).toBe(
      'https://music.example.test/api/oauth/callback/spotify',
    )
    expect(callbackRedirectUri(event as never, 'tidal')).toBe(
      'https://music.example.test/api/oauth/callback/tidal',
    )
  })

  it('uses DST_PUBLIC_URL when set', () => {
    process.env.DST_PUBLIC_URL = 'https://127.0.0.1:3002'
    const event = eventWithHeaders({ host: 'localhost:3002' })

    expect(callbackRedirectUri(event as never, 'spotify')).toBe(
      'https://127.0.0.1:3002/api/oauth/callback/spotify',
    )
  })

  it('upgrades http origins to https in production', () => {
    process.env.NODE_ENV = 'production'
    const event = {
      req: {
        url: 'http://distill.example.com/api/auth/spotify/login',
        headers: new Headers({ host: 'distill.example.com' }),
      },
    }

    expect(callbackRedirectUri(event as never, 'spotify')).toBe(
      'https://distill.example.com/api/oauth/callback/spotify',
    )
  })
})
