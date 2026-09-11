import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const examplePath = resolve(root, '.env.example')
const envPath = resolve(root, '.env')

function generateSessionPassword(): string {
  return randomBytes(32).toString('base64')
}

function main() {
  if (existsSync(envPath)) {
    console.log('.env already exists — leaving it unchanged')
    console.log('Delete .env and re-run pnpm setup to regenerate from .env.example')
    return
  }

  if (!existsSync(examplePath)) {
    console.error('.env.example not found')
    process.exit(1)
  }

  let content = readFileSync(examplePath, 'utf8')
  const password = generateSessionPassword()

  if (/^DST_SESSION_PASSWORD=.*$/m.test(content)) {
    content = content.replace(/^DST_SESSION_PASSWORD=.*$/m, `DST_SESSION_PASSWORD=${password}`)
  } else {
    content = `DST_SESSION_PASSWORD=${password}\n${content}`
  }

  writeFileSync(envPath, content, 'utf8')
  console.log('Created .env with a generated DST_SESSION_PASSWORD')
  console.log('')
  console.log('Next steps:')
  console.log('  1. Add DST_TIDAL_CLIENT_ID and/or DST_SPOTIFY_CLIENT_ID (OAuth apps — see README)')
  console.log('  2. Add DST_OPENAI_API_KEY or DST_GEMINI_API_KEY')
  console.log('  3. pnpm dev')
}

main()
