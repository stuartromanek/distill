import type { H3Event } from 'h3'
import type { MusicProviderId } from '../../../../shared/types/playlist'
import { musicProviderName } from '../../../../shared/types/playlist'
import {
  clearOAuthPending,
  getOAuthPending,
  setProviderSession,
} from '../../../utils/session'
import { exchangeCodeForTokens } from '../../../utils/music/oauth'
import { resolveProvider } from '../../../utils/music/resolve'
import { verifySpotifyAccessToken } from '../../../utils/music/providers/spotify/api'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function sendPopupResult(
  event: H3Event,
  provider: MusicProviderId,
  payload: { ok: boolean; message?: string },
) {
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  const name = musicProviderName(provider)
  const message = payload.message ?? (payload.ok ? `Connected to ${name}.` : `${name} sign-in failed.`)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)} sign-in</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #fff;
      color: #111;
    }
    main {
      max-width: 36ch;
      padding: 1rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <main>
    <p>${escapeHtml(message)}</p>
    <p>You can close this window.</p>
  </main>
  <script>
    const payload = ${JSON.stringify({ type: 'music-oauth', provider, ...payload })};
    try {
      localStorage.setItem('music-oauth', JSON.stringify(payload));
    } catch {}
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      window.close();
    }
  </script>
</body>
</html>`
}

export default defineEventHandler(async (event) => {
  const provider = resolveProvider(event)
  const query = getQuery(event)
  const code = query.code as string | undefined
  const state = query.state as string | undefined
  const error = query.error as string | undefined

  if (error) {
    const pending = state ? getOAuthPending(event, state) : null
    if (state) clearOAuthPending(event, state)
    if (pending?.popup) {
      return sendPopupResult(event, provider.id, { ok: false, message: error })
    }
    return sendRedirect(event, `/?auth_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    throw createError({ statusCode: 400, message: 'Missing OAuth code or state' })
  }

  const pending = getOAuthPending(event, state)
  if (!pending || pending.provider !== provider.id) {
    const message = `${provider.displayName} sign-in expired. Use https://127.0.0.1:${process.env.PORT ?? '3000'} (not localhost) and try again.`
    return sendPopupResult(event, provider.id, { ok: false, message })
  }

  clearOAuthPending(event, state)

  const tokens = await exchangeCodeForTokens(provider.oauthConfig(event), {
    code,
    codeVerifier: pending.codeVerifier,
  })

  if (provider.id === 'spotify') {
    const verification = await verifySpotifyAccessToken(tokens.access_token)
    if (!verification.ok) {
      const message = verification.message
      if (pending.popup) {
        return sendPopupResult(event, provider.id, { ok: false, message })
      }
      return sendRedirect(event, `/?auth_error=${encodeURIComponent(message)}`)
    }

    setProviderSession(event, provider.id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? '',
      expiresAt: Date.now() + tokens.expires_in * 1000,
      displayName: verification.displayName,
    })
  }
  else {
    setProviderSession(event, provider.id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? '',
      expiresAt: Date.now() + tokens.expires_in * 1000,
    })
  }

  if (pending.popup) {
    return sendPopupResult(event, provider.id, { ok: true })
  }

  return sendRedirect(event, `/?connected=1&provider=${provider.id}`)
})
