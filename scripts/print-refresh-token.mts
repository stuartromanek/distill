import { loadEnv } from './_load-env.mts'
import { decryptSealedOrThrow, normalizeSealedCookie } from '../server/utils/session-crypto.ts'

/**
 * Dev helper: print Tidal refresh token for TIDAL_REFRESH_TOKEN in .env.
 *
 * Preferred (logged in, dev server running):
 *   open http://localhost:3000/api/dev/tidal-refresh-token
 *
 * With cookie paste (dev server must be running):
 *   pnpm print-refresh-token -- '<tidal_session cookie value>'
 */

loadEnv()

const args = process.argv.slice(2)
const serverUrl = process.env.NUXT_DEV_URL ?? 'http://127.0.0.1:3000'
const cookie = args.filter(a => !a.startsWith('--')).join(' ').trim()

async function fromDevServer(sealed: string): Promise<string> {
  const res = await fetch(`${serverUrl}/api/dev/tidal-refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie: sealed }),
  })

  const text = await res.text()
  let json: { refreshToken?: string; message?: string; statusMessage?: string }
  try {
    json = JSON.parse(text)
  } catch {
    json = {}
  }

  if (!res.ok) {
    throw new Error(json.statusMessage ?? json.message ?? text)
  }

  if (!json.refreshToken) {
    throw new Error('Dev server returned no refreshToken')
  }

  return json.refreshToken
}

function fromLocalEnv(sealed: string): string {
  const password = process.env.NUXT_SESSION_PASSWORD
  if (!password) {
    throw new Error('NUXT_SESSION_PASSWORD not set in .env')
  }

  type SessionData = { refreshToken: string }
  const session = decryptSealedOrThrow<SessionData>(sealed, password)
  if (!session.refreshToken) {
    throw new Error('Session decrypted but no refreshToken — reconnect Tidal in the app')
  }
  return session.refreshToken
}

async function main() {
  if (!cookie) {
    console.error('Usage: pnpm print-refresh-token -- \'<tidal_session cookie value>\'')
    console.error('')
    console.error('Easier: visit http://localhost:3000/api/dev/tidal-refresh-token while logged in')
    process.exit(1)
  }

  const sealed = normalizeSealedCookie(cookie)

  let refreshToken: string | undefined
  let serverError: string | undefined
  let localError: string | undefined

  try {
    refreshToken = await fromDevServer(sealed)
  } catch (e) {
    serverError = e instanceof Error ? e.message : String(e)
  }

  if (!refreshToken) {
    try {
      refreshToken = fromLocalEnv(sealed)
    } catch (e) {
      localError = e instanceof Error ? e.message : String(e)
    }
  }

  if (!refreshToken) {
    console.error('Could not extract refresh token.\n')
    if (serverError) {
      console.error(`Dev server (${serverUrl}): ${serverError}`)
    }
    if (localError) {
      console.error(`Local decrypt: ${localError}`)
    }
    console.error('')
    console.error('Try this instead:')
    console.error('  1. Make sure pnpm dev is running')
    console.error('  2. Log into Tidal in the app (or log out and back in if you changed NUXT_SESSION_PASSWORD)')
    console.error('  3. Open http://localhost:3000/api/dev/tidal-refresh-token in the same browser')
    process.exit(1)
  }

  console.log('\nAdd to .env:\n')
  console.log(`TIDAL_REFRESH_TOKEN=${refreshToken}`)
  console.log('')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
