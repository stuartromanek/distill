import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv, root } from './_load-env.mts'
import { parseArgs } from './_args.mts'
import { createTidalClient, getClientCredentialsToken } from '../server/utils/tidal-client.ts'
import { matchSongWithMeta } from '../server/utils/match.ts'
import { parseTitleMetadata } from '../server/utils/match-scoring.ts'
import type { MatchFixture } from '../shared/types/playlist.ts'

loadEnv()

const args = parseArgs(process.argv.slice(2))
const verbose = Boolean(args.verbose)
const fixturesPath = String(
  args.fixtures ?? resolve(root, 'fixtures/match-cases.json'),
)

if (!existsSync(fixturesPath)) {
  console.error(`Fixtures not found: ${fixturesPath}`)
  console.error('Run pnpm export-fixtures first, or pass --fixtures path.json')
  process.exit(1)
}

const clientId = process.env.NUXT_TIDAL_CLIENT_ID
const clientSecret = process.env.NUXT_TIDAL_CLIENT_SECRET
const countryCode = process.env.NUXT_TIDAL_COUNTRY_CODE ?? 'US'

if (!clientId || !clientSecret) {
  console.error('Set NUXT_TIDAL_CLIENT_ID and NUXT_TIDAL_CLIENT_SECRET in .env')
  process.exit(1)
}

const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as MatchFixture[]
const token = await getClientCredentialsToken(clientId, clientSecret)
const client = createTidalClient(token, countryCode)

let top1 = 0
let top5 = 0
const failures: MatchFixture[] = []
const strategyStats = new Map<string, { top1: number; top5: number; total: number }>()

function recordStrategy(strategy: string, inTop1: boolean, inTop5: boolean) {
  const stats = strategyStats.get(strategy) ?? { top1: 0, top5: 0, total: 0 }
  stats.total++
  if (inTop1) stats.top1++
  if (inTop5) stats.top5++
  strategyStats.set(strategy, stats)
}

for (const fixture of fixtures) {
  const parsed = {
    ...fixture.input,
    confidence: 'high' as const,
    source: 'text' as const,
  }

  const { match, searchQuery, strategyUsed, allScored } = await matchSongWithMeta(client, parsed)
  const predictedId = match.bestMatch?.id
  const candidates = [
    match.bestMatch,
    ...match.alternatives,
  ].filter(Boolean)

  const inTop1 = predictedId === fixture.expectedTrackId
  const inTop5 = candidates.some(c => c?.id === fixture.expectedTrackId)
    || allScored.some(c => c.id === fixture.expectedTrackId)

  if (inTop1) top1++
  if (inTop5) top5++
  else failures.push(fixture)

  recordStrategy(strategyUsed, inTop1, inTop5)

  if (verbose || !inTop1) {
    const status = inTop1 ? 'OK' : inTop5 ? 'TOP5' : 'MISS'
    console.log(`[${status}] ${fixture.input.artist} — ${fixture.input.title}`)
    console.log(`  expected: ${fixture.expectedTrackId}`)
    console.log(`  predicted: ${predictedId ?? 'none'} (${match.bestMatch?.artist ?? ''} — ${match.bestMatch?.title ?? ''}, score ${match.bestMatch?.score?.toFixed(2) ?? '-'})`)
    console.log(`  strategy: ${strategyUsed}`)
    console.log(`  title base: ${parseTitleMetadata(fixture.input.title).base}`)
    console.log(`  query: ${searchQuery}`)
    if (!inTop1 && candidates.length) {
      console.log('  top candidates:')
      for (const c of candidates.slice(0, 5)) {
        console.log(`    - ${c!.id} ${c!.artist} — ${c!.title} (${c!.score?.toFixed(2) ?? '-'})`)
      }
    }
  }
}

const n = fixtures.length
console.log(`\nEval: ${fixturesPath}`)
console.log(`Top-1 accuracy: ${top1}/${n} (${((top1 / n) * 100).toFixed(1)}%)`)
console.log(`Top-5 recall:   ${top5}/${n} (${((top5 / n) * 100).toFixed(1)}%)`)

if (strategyStats.size) {
  console.log('\nBy strategy:')
  for (const [strategy, stats] of [...strategyStats.entries()].sort()) {
    console.log(
      `  ${strategy}: top-1 ${stats.top1}/${stats.total}, top-5 ${stats.top5}/${stats.total}`,
    )
  }
}

if (top1 < n) {
  process.exit(1)
}
