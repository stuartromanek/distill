import {
  createHash,
  randomBytes,
} from 'node:crypto'
import type { H3Event } from 'h3'
import type { MusicProviderId } from '../../shared/types/playlist'
import { sessionPassword as readSessionPassword } from './env'
import { isSecureRequest } from './request-origin.ts'
import { decryptSealed, encryptSealed } from './session-crypto'

const OAUTH_COOKIE = 'music_oauth'

export type SessionData = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  displayName?: string
}

export type OAuthPending = {
  provider: MusicProviderId
  codeVerifier: string
  state: string
  popup?: boolean
}

type OAuthPendingStore =
  | OAuthPending
  | { attempts: OAuthPending[] }

function sessionCookieName(provider: MusicProviderId) {
  return `session_${provider}`
}

function encrypt(value: unknown, password: string) {
  return encryptSealed(value, password)
}

function decrypt<T>(payload: string, password: string): T | null {
  return decryptSealed<T>(payload, password)
}

function sessionPassword(_event: H3Event) {
  return readSessionPassword()
}

export function setProviderSession(event: H3Event, provider: MusicProviderId, data: SessionData) {
  const sealed = encrypt(data, sessionPassword(event))
  setCookie(event, sessionCookieName(provider), sealed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function getProviderSession(event: H3Event, provider: MusicProviderId): SessionData | null {
  const cookie = getCookie(event, sessionCookieName(provider))
  if (!cookie) return null
  return decrypt<SessionData>(cookie, sessionPassword(event))
}

export function clearProviderSession(event: H3Event, provider: MusicProviderId) {
  deleteCookie(event, sessionCookieName(provider), { path: '/' })
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
    secure: isSecureRequest(event),
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
        secure: isSecureRequest(event),
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
