import {
  createHash,
  randomBytes,
} from 'node:crypto'
import type { H3Event } from 'h3'
import { decryptSealed, encryptSealed } from './session-crypto'

const COOKIE_NAME = 'tidal_session'
const OAUTH_COOKIE = 'tidal_oauth'

export type SessionData = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  displayName?: string
}

export type OAuthPending = {
  codeVerifier: string
  state: string
  popup?: boolean
}

type OAuthPendingStore =
  | OAuthPending
  | { attempts: OAuthPending[] }

function encrypt(value: unknown, password: string) {
  return encryptSealed(value, password)
}

function decrypt<T>(payload: string, password: string): T | null {
  return decryptSealed<T>(payload, password)
}

function sessionPassword(event: H3Event) {
  const config = useRuntimeConfig(event)
  const password = config.sessionPassword
  if (!password || password.length < 16) {
    throw createError({
      statusCode: 500,
      message: 'NUXT_SESSION_PASSWORD must be set (16+ characters)',
    })
  }
  return password
}

export function setTidalSession(event: H3Event, data: SessionData) {
  const sealed = encrypt(data, sessionPassword(event))
  setCookie(event, COOKIE_NAME, sealed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function getTidalSession(event: H3Event): SessionData | null {
  const cookie = getCookie(event, COOKIE_NAME)
  if (!cookie) return null
  return decrypt<SessionData>(cookie, sessionPassword(event))
}

export function clearTidalSession(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export function setOAuthPending(event: H3Event, data: OAuthPending) {
  const current = getOAuthPendingAttempts(event)
  const attempts = [
    data,
    ...current.filter(attempt => attempt.state !== data.state),
  ].slice(0, 5)
  const sealed = encrypt({ attempts }, sessionPassword(event))
  setCookie(event, OAUTH_COOKIE, sealed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
}

function getOAuthPendingAttempts(event: H3Event): OAuthPending[] {
  const cookie = getCookie(event, OAUTH_COOKIE)
  if (!cookie) return []
  const pending = decrypt<OAuthPendingStore>(cookie, sessionPassword(event))
  if (!pending) return []
  if ('attempts' in pending) return pending.attempts
  return [pending]
}

export function getOAuthPending(event: H3Event, state?: string): OAuthPending | null {
  const attempts = getOAuthPendingAttempts(event)
  if (state) {
    return attempts.find(attempt => attempt.state === state) ?? null
  }
  return attempts[0] ?? null
}

export function clearOAuthPending(event: H3Event, state?: string) {
  if (state) {
    const attempts = getOAuthPendingAttempts(event)
      .filter(attempt => attempt.state !== state)
    if (attempts.length) {
      const sealed = encrypt({ attempts }, sessionPassword(event))
      setCookie(event, OAUTH_COOKIE, sealed, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 600,
      })
      return
    }
  }
  deleteCookie(event, OAUTH_COOKIE, { path: '/' })
}

export function generatePkce() {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  const state = randomBytes(16).toString('base64url')
  return { codeVerifier, codeChallenge, state }
}
