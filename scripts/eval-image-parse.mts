import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, basename, extname } from 'node:path'
import './_nitro-shim.mts'
import { loadEnv, root } from './_load-env.mts'
import { parseArgs } from './_args.mts'
import { extractSongs } from '../server/utils/llm/extract-songs.ts'
import { createTidalHttpClient, getClientCredentialsToken } from '../server/utils/music/providers/tidal/client.ts'
import { createTidalSearchClient, searchTidalQuery } from '../server/utils/music/providers/tidal/search.ts'
import { buildMatchQuery } from '../server/utils/music/match/cascade.ts'
import { matchSongWithMeta } from '../server/utils/music/match/match.ts'
import {
  normalize,
  normalizeSongKey,
  normalizeTitleForSearch,
  normalizeArtistForSearch,
  artistSimilarity,
  parseTitleMetadata,
  scoreTrack,
  SCORE_WEIGHTS,
  similarity,
} from '../server/utils/match-scoring.ts'
import { envVarName, getTidalCountryCode, tidalClientId, tidalClientSecret } from '../server/utils/env.ts'
import type { ParsedSong, TidalTrackSummary } from '../shared/types/playlist.ts'

loadEnv()

type GroundTruthRow = { id: string; artist: string; title: string; expectedTrackId?: string }

type AlternateResult = {
  name: string
  query: string
  best?: { id: string; artist: string; title: string; score: number }
  wouldFix: boolean
}

type SongReport = {
  groundTruth?: GroundTruthRow
  parsed: ParsedSong
  parseMatchedGroundTruth: boolean
  status: string
  strategyUsed: string
  searchQuery: string
  bestMatch?: { id: string; artist: string; title: string; score: number }
  topCandidates: Array<{ id: string; artist: string; title: string; score: number }>
  alternateStrategies: AlternateResult[]
  failureReason?: string
  recommendedPlan?: string
}

function mimeFromExt(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    default: return 'image/jpeg'
  }
}

function loadImageDataUrl(path: string): string {
  const buf = readFileSync(path)
  return `data:${mimeFromExt(path)};base64,${buf.toString('base64')}`
}

function artistTheVariants(artist: string): string[] {
  const trimmed = artist.trim()
  const lower = trimmed.toLowerCase()
  const variants = new Set<string>([trimmed])
  if (lower.startsWith('the ')) {
    variants.add(trimmed.slice(4).trim())
  } else {
    variants.add(`The ${trimmed}`)
  }
  return [...variants]
}

function fuzzyRowMatch(a: { artist: string; title: string }, b: { artist: string; title: string }) {
  const keyA = normalizeSongKey(a.artist, a.title)
  const keyB = normalizeSongKey(b.artist, b.title)
  if (keyA === keyB) return true
  return artistSimilarity(a.artist, b.artist) >= 0.85 && similarity(a.title, b.title) >= 0.85
}

function summarizeTrack(t: TidalTrackSummary) {
  return {
    id: t.id,
    artist: t.artist,
    title: t.title,
    score: t.score ?? 0,
  }
}

async function scoreSearchResults(
  parsed: ParsedSong,
  query: string,
  client: ReturnType<typeof createTidalHttpClient>,
  limit = 12,
) {
  const raw = await searchTidalQuery(client, query, limit)
  return raw
    .map(c => ({ ...c, score: scoreTrack(parsed, c.title, c.artist, SCORE_WEIGHTS.combined) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

async function testAlternateStrategies(
  parsed: ParsedSong,
  client: ReturnType<typeof createTidalHttpClient>,
  baseline: SongReport,
): Promise<AlternateResult[]> {
  const results: AlternateResult[] = []
  const baselineScore = baseline.bestMatch?.score ?? 0
  const meta = parseTitleMetadata(parsed.title)

  const alternates: Array<{ name: string; query: string; plan?: string }> = [
    {
      name: 'punctuation-normalized',
      query: `${normalizeArtistForSearch(parsed.artist)} ${normalizeTitleForSearch(parsed.title)}`,
      plan: 'D',
    },
    {
      name: 'full-raw-title',
      query: `${parsed.artist} ${parsed.title}`,
      plan: 'A',
    },
    {
      name: 'title-base-only',
      query: `${parsed.artist} ${meta.base}`,
      plan: 'A',
    },
    {
      name: 'title-first-no-artist',
      query: meta.base,
      plan: 'E',
    },
  ]

  for (const artistVariant of artistTheVariants(parsed.artist)) {
    alternates.push({
      name: `the-prefix:${artistVariant === parsed.artist ? 'same' : artistVariant}`,
      query: `${artistVariant} ${meta.base}`,
      plan: 'C',
    })
  }

  if (meta.suffixes.length) {
    alternates.push({
      name: 'full-title-with-suffixes',
      query: `${parsed.artist} ${meta.raw}`,
      plan: 'A',
    })
  }

  const seen = new Set<string>()
  for (const alt of alternates) {
    const q = alt.query.trim()
    if (!q || seen.has(q)) continue
    seen.add(q)

    const scored = await testAlternateStrategies_scored(parsed, client, q)
    const best = scored[0]
    const bestSummary = best ? summarizeTrack(best) : undefined
    const wouldFix =
      baseline.status !== 'matched'
      && Boolean(bestSummary && bestSummary.score >= 0.75)

    results.push({
      name: alt.name,
      query: q,
      best: bestSummary,
      wouldFix,
    })

    if (wouldFix && alt.plan && !baseline.recommendedPlan) {
      baseline.recommendedPlan = `Plan ${alt.plan}`
    }
  }

  // Artist-gated title-first: filter candidates with low artist similarity
  const titleOnly = await scoreSearchResults(parsed, meta.base, client, 30)
  const gated = titleOnly.filter(c => artistSimilarity(parsed.artist, c.artist) >= 0.55)
  const gatedBest = gated[0]
  if (gatedBest) {
    const wouldFix = baseline.status !== 'matched' && (gatedBest.score ?? 0) >= 0.75
    results.push({
      name: 'artist-gated-title-first',
      query: meta.base,
      best: summarizeTrack(gatedBest),
      wouldFix,
    })
    if (wouldFix && !baseline.recommendedPlan) baseline.recommendedPlan = 'Plan B+E'
  }

  return results
}

async function testAlternateStrategies_scored(
  parsed: ParsedSong,
  client: ReturnType<typeof createTidalHttpClient>,
  query: string,
) {
  return scoreSearchResults(parsed, query, client, 12)
}

function inferFailureReason(report: SongReport): string | undefined {
  if (report.status === 'matched') return undefined

  const best = report.bestMatch
  if (!best) return 'catalog_miss_or_no_search_results'

  const artistSim = artistSimilarity(report.parsed.artist, best.artist)
  const titleSim = similarity(report.parsed.title, best.title)

  if (titleSim >= 0.85 && artistSim < 0.55) return 'homonym_wrong_artist'
  if (artistSim >= 0.7 && titleSim < 0.7) return 'title_variant_or_catalog_gap'
  if (best.score >= 0.55 && best.score < 0.75) return 'ambiguous_low_confidence'
  return 'not_found_low_score'
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const verbose = Boolean(args.verbose)
  const parsedPath = String(args.parsed ?? resolve(root, 'fixtures/parsed-setlist-image.json'))
  const groundTruthPath = String(args['ground-truth'] ?? resolve(root, 'fixtures/setlist-ground-truth.json'))
  const outJson = String(args.out ?? resolve(root, 'fixtures/eval-setlist-image-report.json'))
  const outMd = String(args['out-md'] ?? resolve(root, 'fixtures/eval-setlist-image-report.md'))
  const imagePath = args.image ? String(args.image) : undefined

  const clientId = tidalClientId()
  const clientSecret = tidalClientSecret()
  const countryCode = getTidalCountryCode()

  if (!clientId || !clientSecret) {
    console.error(`Set ${envVarName('TIDAL_CLIENT_ID')} and ${envVarName('TIDAL_CLIENT_SECRET')} in .env`)
    process.exit(1)
  }

  let parsedSongs: ParsedSong[]
  let parseDebug: unknown

  if (imagePath && !args.parsed) {
    console.log(`Parsing image: ${basename(imagePath)}`)
    const images = [loadImageDataUrl(resolve(imagePath))]
    const result = await extractSongs({ images }, { debug: true })
    parsedSongs = result.songs
    parseDebug = result.debug
    writeFileSync(parsedPath, JSON.stringify({ songs: parsedSongs, debug: parseDebug }, null, 2))
  } else if (existsSync(parsedPath)) {
    const data = JSON.parse(readFileSync(parsedPath, 'utf8')) as { songs: ParsedSong[]; debug?: unknown }
    parsedSongs = data.songs
    parseDebug = data.debug
  } else {
    console.error(`No parsed output at ${parsedPath}. Run debug:parse or pass --image.`)
    process.exit(1)
  }

  const groundTruth = JSON.parse(readFileSync(groundTruthPath, 'utf8')) as GroundTruthRow[]

  const token = await getClientCredentialsToken(clientId, clientSecret)
  const client = createTidalHttpClient(token, countryCode)
  const searchClient = createTidalSearchClient(client)

  // Parse recall: match parsed songs to ground truth rows
  const gtMatched = new Set<string>()
  for (const song of parsedSongs) {
    for (const gt of groundTruth) {
      if (fuzzyRowMatch(song, gt)) gtMatched.add(gt.id)
    }
  }

  console.log(`\nParse: ${parsedSongs.length} songs extracted`)
  console.log(`Ground truth recall: ${gtMatched.size}/${groundTruth.length}`)

  const songReports: SongReport[] = []
  let matched = 0
  let ambiguous = 0
  let notFound = 0

  for (let i = 0; i < parsedSongs.length; i++) {
    const parsed = parsedSongs[i]!
    const gt = groundTruth.find(row => fuzzyRowMatch(parsed, row))

    process.stdout.write(`\rMatching ${i + 1}/${parsedSongs.length}: ${parsed.artist} — ${parsed.title}`.slice(0, 80).padEnd(80))

    const { match, searchQuery, strategyUsed, allScored } = await matchSongWithMeta(searchClient, parsed)
    const status = match.status
    if (status === 'matched') matched++
    else if (status === 'ambiguous') ambiguous++
    else notFound++

    const report: SongReport = {
      groundTruth: gt,
      parsed,
      parseMatchedGroundTruth: Boolean(gt),
      status,
      strategyUsed,
      searchQuery,
      bestMatch: match.bestMatch ? summarizeTrack(match.bestMatch) : undefined,
      topCandidates: allScored.slice(0, 5).map(summarizeTrack),
      alternateStrategies: [],
    }

    if (status !== 'matched') {
      report.alternateStrategies = await testAlternateStrategies(parsed, client, report)
      report.failureReason = inferFailureReason(report)
    }

    songReports.push(report)

    if (verbose && status !== 'matched') {
      console.log('')
      console.log(`  [${status.toUpperCase()}] ${parsed.artist} — ${parsed.title}`)
      console.log(`  query: ${searchQuery} | strategy: ${strategyUsed}`)
      if (report.bestMatch) {
        console.log(`  best: ${report.bestMatch.artist} — ${report.bestMatch.title} (${report.bestMatch.score.toFixed(2)})`)
      }
      for (const alt of report.alternateStrategies.filter(a => a.wouldFix)) {
        console.log(`  FIX via ${alt.name}: ${alt.best?.artist} — ${alt.best?.title} (${alt.best?.score.toFixed(2)})`)
      }
    }
  }

  console.log('\n')

  const planTriggers = {
    A: [] as string[],
    B: [] as string[],
    C: [] as string[],
    D: [] as string[],
    E: [] as string[],
    F: [] as string[],
    G: [] as string[],
    I: [] as string[],
  }

  for (const r of songReports) {
    if (r.status === 'matched') continue
    const id = r.groundTruth?.id ?? normalizeSongKey(r.parsed.artist, r.parsed.title)
    if (r.failureReason === 'homonym_wrong_artist') planTriggers.B.push(id)
    if (r.failureReason === 'title_variant_or_catalog_gap') planTriggers.A.push(id)
    if (r.alternateStrategies.some(a => a.name.startsWith('the-prefix') && a.wouldFix)) planTriggers.C.push(id)
    if (r.alternateStrategies.some(a => a.name === 'punctuation-normalized' && a.wouldFix)) planTriggers.D.push(id)
    if (r.alternateStrategies.some(a => a.name === 'artist-gated-title-first' && a.wouldFix)) planTriggers.E.push(id)
    const collisionTitles = [
      'Ride', 'Outfit', 'Jean', 'Graceland', 'Whiskey',
      'Queen', 'Closet', 'Aside', 'Jane', 'Downtown',
    ]
    if (collisionTitles.includes(r.parsed.title)) planTriggers.G.push(id)
  }

  if (gtMatched.size < groundTruth.length) {
    planTriggers.I.push('parse-recall-gap')
  }

  const report = {
    generatedAt: new Date().toISOString(),
    image: imagePath ?? parsedPath,
    parseModel: (parseDebug as { model?: string } | undefined)?.model,
    parseDurationMs: (parseDebug as { durationMs?: number } | undefined)?.durationMs,
    summary: {
      parsedCount: parsedSongs.length,
      groundTruthCount: groundTruth.length,
      parseRecall: gtMatched.size,
      matched,
      ambiguous,
      notFound,
      matchRate: `${matched}/${parsedSongs.length}`,
    },
    planTriggers,
    songs: songReports,
  }

  writeFileSync(outJson, JSON.stringify(report, null, 2))

  const md = buildMarkdown(report, groundTruth, gtMatched)
  writeFileSync(outMd, md)

  console.log('Eval summary')
  console.log(`  Parse recall:     ${gtMatched.size}/${groundTruth.length}`)
  console.log(`  Match matched:    ${matched}/${parsedSongs.length}`)
  console.log(`  Match ambiguous:  ${ambiguous}`)
  console.log(`  Match not_found:  ${notFound}`)
  console.log(`\nWrote ${outJson}`)
  console.log(`Wrote ${outMd}`)

  if (notFound + ambiguous > 0) process.exit(1)
}

function buildMarkdown(
  report: {
    summary: {
      parsedCount: number
      groundTruthCount: number
      parseRecall: number
      matched: number
      ambiguous: number
      notFound: number
    }
    planTriggers: Record<string, string[]>
    songs: SongReport[]
  },
  groundTruth: GroundTruthRow[],
  gtMatched: Set<string>,
) {
  const lines: string[] = [
    '# Setlist image eval report',
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Parse extracted | ${report.summary.parsedCount} |`,
    `| Ground truth rows | ${report.summary.groundTruthCount} |`,
    `| Parse recall | ${report.summary.parseRecall}/${report.summary.groundTruthCount} |`,
    `| Matched (≥0.75) | ${report.summary.matched} |`,
    `| Ambiguous | ${report.summary.ambiguous} |`,
    `| Not found | ${report.summary.notFound} |`,
    '',
    '## Follow-up plan triggers',
    '',
  ]

  for (const [plan, ids] of Object.entries(report.planTriggers)) {
    lines.push(`- **Plan ${plan}**: ${ids.length ? ids.join(', ') : '(none)'}`)
  }

  lines.push('', '## Per-song results', '')
  lines.push('| # | Artist | Title | Status | Score | Strategy | Best Tidal match | Notes |')
  lines.push('|---|--------|-------|--------|-------|----------|------------------|-------|')

  report.songs.forEach((s, i) => {
    const best = s.bestMatch
    const notes: string[] = []
    if (s.failureReason) notes.push(s.failureReason)
    if (s.recommendedPlan) notes.push(s.recommendedPlan)
    const fixes = s.alternateStrategies.filter(a => a.wouldFix).map(a => a.name)
    if (fixes.length) notes.push(`fix:${fixes.join('+')}`)
    lines.push(
      `| ${i + 1} | ${s.parsed.artist} | ${s.parsed.title} | ${s.status} | ${best?.score.toFixed(2) ?? '-'} | ${s.strategyUsed} | ${best ? `${best.artist} — ${best.title}` : '-'} | ${notes.join('; ') || '-'} |`,
    )
  })

  const failures = report.songs.filter(s => s.status !== 'matched')
  if (failures.length) {
    lines.push('', '## Unmatchable / failed rows', '')
    for (const s of failures) {
      lines.push(`### ${s.parsed.artist} — ${s.parsed.title}`)
      lines.push(`- Status: ${s.status}`)
      lines.push(`- Reason: ${s.failureReason ?? 'unknown'}`)
      lines.push(`- Query: \`${s.searchQuery}\``)
      if (s.topCandidates.length) {
        lines.push('- Top candidates:')
        for (const c of s.topCandidates) {
          lines.push(`  - ${c.artist} — ${c.title} (${c.score.toFixed(2)}, id ${c.id})`)
        }
      }
      const fixes = s.alternateStrategies.filter(a => a.wouldFix)
      if (fixes.length) {
        lines.push('- Alternate strategies that would fix:')
        for (const f of fixes) {
          lines.push(`  - **${f.name}**: ${f.best?.artist} — ${f.best?.title} (${f.best?.score.toFixed(2)})`)
        }
      } else {
        lines.push('- No alternate strategy reached ≥0.75 (possible Tidal catalog gap)')
      }
      lines.push('')
    }
  }

  const missedGt = groundTruth.filter(gt => ![...gtMatched].includes(gt.id))
  if (missedGt.length) {
    lines.push('## Ground truth rows not in parse output', '')
    for (const gt of missedGt) {
      lines.push(`- ${gt.artist} — ${gt.title}`)
    }
  }

  return lines.join('\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
