import { getRequestURL, type H3Event } from 'h3'
import { publicAppOrigin } from './env.ts'

export function requestPublicOrigin(event: H3Event): string {
  const configured = publicAppOrigin()
  if (configured) return configured

  let origin = getRequestURL(event, {
    xForwardedHost: true,
    xForwardedProto: true,
  }).origin

  if (process.env.NODE_ENV === 'production' && origin.startsWith('http://')) {
    origin = `https://${origin.slice('http://'.length)}`
  }

  return origin
}

export function isSecureRequest(event: H3Event): boolean {
  if (process.env.NODE_ENV === 'production') return true
  return getRequestURL(event, { xForwardedProto: true }).protocol === 'https:'
}
