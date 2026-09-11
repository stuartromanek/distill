import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProviderSession: vi.fn(),
  setProviderSession: vi.fn(),
  getValidAccessToken: vi.fn(),
  refreshTokens: vi.fn(),
}))

vi.mock('../../../../server/utils/session.ts', () => ({
  getProviderSession: mocks.getProviderSession,
  setProviderSession: mocks.setProviderSession,
}))

vi.mock('../../../../server/utils/music/oauth.ts', () => ({
  callbackRedirectUri: (_event: unknown, provider: string) =>
    `https://app.example.test/api/oauth/callback/${provider}`,
  getValidAccessToken: mocks.getValidAccessToken,
  refreshTokens: mocks.refreshTokens,
}))

vi.mock('../../../../server/utils/env.ts', () => ({
  tidalClientId: () => 'test-tidal-client-id',
  spotifyClientId: () => 'test-spotify-client-id',
  getTidalCountryCode: () => 'US',
  tidalMaxConcurrent: () => 1,
  tidalMinIntervalMs: () => 300,
  tidalMaxRetries: () => 5,
}))

const { spotifyProvider } = await import('../../../../server/utils/music/providers/spotify')
const { tidalProvider } = await import('../../../../server/utils/music/providers/tidal')

function event() {
  return {
    node: {
      req: {
        url: '/',
        headers: { host: 'app.example.test' },
      },
    },
  }
}

function h3Error({ statusCode, message }: { statusCode: number; message: string }) {
  return Object.assign(new Error(message), { statusCode })
}

describe('provider search session boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('createError', h3Error)
    mocks.getValidAccessToken.mockResolvedValue('user-access-token')
  })

  it('requires a Spotify session before creating a search client', async () => {
    mocks.getProviderSession.mockReturnValue(null)

    await expect(spotifyProvider.createSearchClient(event() as never)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Connect Spotify first',
    })
    expect(mocks.getValidAccessToken).not.toHaveBeenCalled()
  })

  it('creates Spotify search clients from the user access token', async () => {
    mocks.getProviderSession.mockReturnValue({ accessToken: 'old-token' })

    const client = await spotifyProvider.createSearchClient(event() as never)

    expect(client.providerId).toBe('spotify')
    expect(mocks.getValidAccessToken).toHaveBeenCalledWith(
      expect.anything(),
      'spotify',
      expect.objectContaining({ clientSecret: undefined }),
    )
  })

  it('requires a Tidal session before creating a search client', async () => {
    mocks.getProviderSession.mockReturnValue(null)

    await expect(tidalProvider.createSearchClient(event() as never)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Connect Tidal first',
    })
    expect(mocks.getValidAccessToken).not.toHaveBeenCalled()
  })

  it('creates Tidal search clients from the user access token', async () => {
    mocks.getProviderSession.mockReturnValue({ accessToken: 'old-token' })

    const client = await tidalProvider.createSearchClient(event() as never)

    expect(client.providerId).toBe('tidal')
    expect(mocks.getValidAccessToken).toHaveBeenCalledWith(
      expect.anything(),
      'tidal',
      expect.objectContaining({ clientSecret: undefined }),
    )
  })
})
