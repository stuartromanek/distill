import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function stripQuotes(val: string) {
  if (
    (val.startsWith('"') && val.endsWith('"'))
    || (val.startsWith('\'') && val.endsWith('\''))
  ) {
    return val.slice(1, -1)
  }
  return val
}

/** Extract refresh token from raw env value (plain token or dev-endpoint JSON). */
export function parseTidalRefreshToken(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined

  let val = stripQuotes(raw.trim())

  if (val.startsWith('{')) {
    try {
      const json = JSON.parse(val) as { refreshToken?: string }
      if (json.refreshToken?.trim()) return json.refreshToken.trim()
    } catch {
      /* fall through */
    }
  }

  const embedded = val.match(/"refreshToken"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/)
  if (embedded?.[1]) return embedded[1].replace(/\\"/g, '"')

  return val.trim() || undefined
}

/** Read DST_TIDAL_REFRESH_TOKEN from .env (handles multiline JSON paste from dev endpoint). */
export function readTidalRefreshTokenFromFile(): string | undefined {
  const envPath = resolve(root, '.env')
  if (!existsSync(envPath)) return undefined

  const content = readFileSync(envPath, 'utf8')
  const match = content.match(/^DST_TIDAL_REFRESH_TOKEN=(.*)$/ms)
  if (!match?.[1]) return undefined

  return parseTidalRefreshToken(match[1].trim())
}

export function getTidalRefreshToken(): string | undefined {
  return parseTidalRefreshToken(process.env.DST_TIDAL_REFRESH_TOKEN)
    ?? readTidalRefreshTokenFromFile()
}

export function loadEnv() {
  const envPath = resolve(root, '.env')
  if (!existsSync(envPath)) return

  const content = readFileSync(envPath, 'utf8')
  let i = 0
  const lines = content.split('\n')

  while (i < lines.length) {
    const trimmed = lines[i]!.trim()
    i++

    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue

    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1)

    // Multiline quoted value
    if (
      (val.startsWith('"') && !val.endsWith('"'))
      || (val.startsWith('\'') && !val.endsWith('\''))
    ) {
      const quote = val[0]!
      val = val.slice(1)
      while (i < lines.length && !val.endsWith(quote)) {
        val += `\n${lines[i]}`
        i++
      }
      if (val.endsWith(quote)) val = val.slice(0, -1)
    } else {
      val = stripQuotes(val.trim())
    }

    if (process.env[key] === undefined) {
      process.env[key] = val.trim()
    }
  }

  // Normalize refresh token to plain JWT for downstream scripts
  const token = getTidalRefreshToken()
  if (token) {
    process.env.DST_TIDAL_REFRESH_TOKEN = token
  }
}

export { root }
