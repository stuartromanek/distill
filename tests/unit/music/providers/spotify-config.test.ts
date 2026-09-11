import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spotifyOAuthConfig } from '../../../../server/utils/music/providers/spotify/config'

function eventWithHost(host: string) {
  return {
    req: {
      url: `http://${host}/api/auth/spotify/login`,
      headers: new Headers({ host }),
    },
  }
}

describe('spotify OAuth config', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.DST_SPOTIFY_CLIENT_ID = 'spotify-client-id'
    delete process.env.DST_PUBLIC_URL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('rewrites localhost to 127.0.0.1 in redirect URIs', () => {
    const cfg = spotifyOAuthConfig(eventWithHost('localhost:3000') as never)
    expect(cfg.redirectUri).toBe('http://127.0.0.1:3000/api/oauth/callback/spotify')
  })

  it('keeps https loopback redirect URIs in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DST_PUBLIC_URL = 'https://distill.example.com'
    const cfg = spotifyOAuthConfig(eventWithHost('distill.example.com') as never)
    expect(cfg.redirectUri).toBe('https://distill.example.com/api/oauth/callback/spotify')
  })

  it('uses http for loopback redirect URIs in development', () => {
    process.env.NODE_ENV = 'development'
    process.env.DST_PUBLIC_URL = 'https://127.0.0.1:3000'
    process.env.PORT = '3002'
    const cfg = spotifyOAuthConfig(eventWithHost('127.0.0.1:3002') as never)
    expect(cfg.redirectUri).toBe('http://127.0.0.1:3002/api/oauth/callback/spotify')
  })

  it('uses https for loopback when the login request is https', () => {
    process.env.NODE_ENV = 'development'
    const event = {
      req: {
        url: 'https://127.0.0.1:3002/api/auth/spotify/login',
        headers: new Headers({ host: '127.0.0.1:3002' }),
      },
    }
    const cfg = spotifyOAuthConfig(event as never)
    expect(cfg.redirectUri).toBe('https://127.0.0.1:3002/api/oauth/callback/spotify')
  })
})
