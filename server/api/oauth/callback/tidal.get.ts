import type { H3Event } from 'h3'
import {
  clearOAuthPending,
  getOAuthPending,
  setTidalSession,
} from '../../../utils/session'
import { exchangeCodeForTokens } from '../../../utils/tidal'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function sendPopupResult(event: H3Event, payload: { ok: boolean; message?: string }) {
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  const message = payload.message ?? (payload.ok ? 'Connected to Tidal.' : 'Tidal sign-in failed.')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tidal sign-in</title>
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
    const payload = ${JSON.stringify({ type: 'tidal-oauth', ...payload })};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      window.close();
    }
  </script>
</body>
</html>`
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string | undefined
  const state = query.state as string | undefined
  const error = query.error as string | undefined

  if (error) {
    const pending = state ? getOAuthPending(event, state) : null
    if (state) clearOAuthPending(event, state)
    if (pending?.popup) {
      return sendPopupResult(event, { ok: false, message: error })
    }
    return sendRedirect(event, `/?auth_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    throw createError({ statusCode: 400, message: 'Missing OAuth code or state' })
  }

  const pending = getOAuthPending(event, state)
  if (!pending) {
    return sendRedirect(event, `/?auth_error=${encodeURIComponent('Tidal sign-in expired. Please try connecting again.')}`)
  }

  clearOAuthPending(event, state)

  const tokens = await exchangeCodeForTokens(event, code, pending.codeVerifier)

  setTidalSession(event, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  })

  if (pending.popup) {
    return sendPopupResult(event, { ok: true })
  }

  return sendRedirect(event, '/?connected=1')
})
