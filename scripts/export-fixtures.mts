import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv, root, getTidalRefreshToken } from './_load-env.mts'
import { parseArgs, slugify } from './_args.mts'
import { createTidalClient, refreshUserAccessToken } from '../server/utils/tidal-client.ts'
import { fetchPlaylistTracks } from '../server/utils/match.ts'
import { normalizeSongKey } from '../server/utils/match-scoring.ts'
import { parseTidalPlaylistUrl, tidalTrackBrowseUrl } from '../server/utils/tidal-url.ts'
import type { MatchFixture, ParsedSong } from '../shared/types/playlist.ts'

loadEnv()

const args = parseArgs(process.argv.slice(2))
const playlistArg = String(args.playlist ?? '')
const parsedPath = String(args.parsed ?? resolve(root, 'fixtures/parsed.json'))
const outPath = String(args.out ?? resolve(root, 'fixtures/match-cases.json'))

const clientId = process.env.NUXT_TIDAL_CLIENT_ID
const clientSecret = process.env.NUXT_TIDAL_CLIENT_SECRET
const refreshToken = getTidalRefreshToken()
const countryCode = process.env.NUXT_TIDAL_COUNTRY_CODE ?? 'US'

if (!clientId || !clientSecret) {
  console.error('Set NUXT_TIDAL_CLIENT_ID and NUXT_TIDAL_CLIENT_SECRET in .env')
  process.exit(1)
}

if (!refreshToken) {
  console.error('Set TIDAL_REFRESH_TOKEN in .env (refresh token from OAuth — see README)')
  process.exit(1)
}

const playlistId = parseTidalPlaylistUrl(playlistArg) ?? playlistArg.replace(/[^0-9a-f-]/gi, '')
if (!playlistId) {
  console.error('Usage: pnpm export-fixtures --playlist <url-or-uuid> --parsed fixtures/parsed.json [--out fixtures/match-cases.json]')
  process.exit(1)
}

const parsedJson = JSON.parse(readFileSync(parsedPath, 'utf8')) as { songs: ParsedSong[] }
const songs = parsedJson.songs ?? parsedJson
if (!Array.isArray(songs) || !songs.length) {
  console.error(`No songs in ${parsedPath}`)
  process.exit(1)
}

const token = await refreshUserAccessToken(refreshToken, clientId, clientSecret)
const client = createTidalClient(token, countryCode)

console.log(`Fetching playlist ${playlistId}…`)
const playlistTracks = await fetchPlaylistTracks(client, playlistId)
console.log(`Playlist has ${playlistTracks.length} tracks`)

const byKey = new Map<string, typeof playlistTracks[0]>()
for (const t of playlistTracks) {
  byKey.set(normalizeSongKey(t.artist, t.title), t)
}

const fixtures: MatchFixture[] = []
const unmatched: string[] = []

for (const song of songs) {
  const key = normalizeSongKey(song.artist, song.title)
  const track = byKey.get(key)

  if (!track) {
    unmatched.push(`${song.artist} — ${song.title}`)
    continue
  }

  fixtures.push({
    id: slugify(song.artist, song.title),
    input: { artist: song.artist, title: song.title, album: song.album },
    expectedTrackId: track.id,
    expectedUrl: tidalTrackBrowseUrl(track.id),
    source: 'reference-playlist',
  })
}

writeFileSync(outPath, `${JSON.stringify(fixtures, null, 2)}\n`)
console.log(`Wrote ${fixtures.length} fixtures to ${outPath}`)

if (unmatched.length) {
  console.warn(`\n${unmatched.length} parsed songs not found in playlist (key mismatch):`)
  for (const u of unmatched) console.warn(`  - ${u}`)
  process.exit(unmatched.length === songs.length ? 1 : 0)
}
