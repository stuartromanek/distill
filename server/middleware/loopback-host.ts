import { getRequestURL } from 'h3'

/** Dev-only: keep OAuth cookies on 127.0.0.1 (Spotify rejects localhost redirect URIs). */
export default defineEventHandler((event) => {
  if (process.env.NODE_ENV === 'production') return

  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  if (url.hostname !== 'localhost') return

  url.hostname = '127.0.0.1'
  return sendRedirect(event, url.toString(), 302)
})
