import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

export function getSessionKey(password: string) {
  return createHash('sha256').update(password).digest()
}

export function normalizeSealedCookie(raw: string): string {
  let value = raw.trim()
  if (!value) return value

  if (value.toLowerCase().startsWith('tidal_session=')) {
    value = value.slice('tidal_session='.length).trim()
  }

  const eq = value.indexOf('=')
  if (eq !== -1 && value.slice(0, eq).toLowerCase() === 'tidal_session') {
    value = value.slice(eq + 1).trim()
  }

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  ) {
    value = value.slice(1, -1).trim()
  }

  return value
}

export function decodeSealedPayload(sealed: string): Buffer {
  const normalized = normalizeSealedCookie(sealed)
  if (!normalized) {
    throw new Error(
      'Empty cookie value. Copy the tidal_session cookie value from browser devtools (Application → Cookies).',
    )
  }

  let decoded = normalized
  if (/%[0-9A-Fa-f]{2}/.test(normalized)) {
    try {
      decoded = decodeURIComponent(normalized)
    } catch {
      /* keep raw */
    }
  }

  const attempts: Buffer[] = [
    Buffer.from(decoded, 'base64url'),
  ]

  const b64 = decoded.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4))
  attempts.push(Buffer.from(pad, 'base64'))

  const best = attempts.reduce((a, b) => (a.length > b.length ? a : b))
  if (best.length >= 29) return best

  throw new Error(
    `Cookie value looks truncated (${best.length} bytes after decode, need ≥29). `
    + 'Copy the full tidal_session value, or visit http://localhost:3000/api/dev/tidal-refresh-token while logged in.',
  )
}

export function encryptSealed(value: unknown, password: string): string {
  const key = getSessionKey(password)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const json = JSON.stringify(value)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptSealed<T>(sealed: string, password: string): T | null {
  try {
    return decryptSealedOrThrow<T>(sealed, password)
  } catch {
    return null
  }
}

export function decryptSealedOrThrow<T>(sealed: string, password: string): T {
  const data = decodeSealedPayload(sealed)
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const encrypted = data.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getSessionKey(password), iv)
  decipher.setAuthTag(tag)
  const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  return JSON.parse(json) as T
}
