import { readFileSync, writeFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import './_nitro-shim.mts'
import { loadEnv } from './_load-env.mts'
import { parseArgs } from './_args.mts'
import { extractSongs } from '../server/utils/llm/extract-songs.ts'

loadEnv()

const args = parseArgs(process.argv.slice(2))
const verbose = Boolean(args.verbose)
const allowEmpty = Boolean(args['allow-empty'])
const outPath = args.out ? String(args.out) : undefined

function mimeFromExt(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    default: return 'image/jpeg'
  }
}

function loadImageDataUrl(path: string): string {
  const buf = readFileSync(path)
  const mime = mimeFromExt(path)
  return `data:${mime};base64,${buf.toString('base64')}`
}

function collectImages(argv: string[]): string[] {
  const paths: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--image' && argv[i + 1]) {
      paths.push(argv[++i]!)
    }
  }
  return paths
}

const imagePaths = collectImages(process.argv.slice(2))
const text = args.text ? String(args.text) : undefined

if (!text?.trim() && !imagePaths.length) {
  console.error('Usage: pnpm debug:parse --image path/to/setlist.jpg [--text "..."] [--verbose] [--out file.json] [--allow-empty]')
  process.exit(1)
}

const images = imagePaths.map(loadImageDataUrl)

console.log(`Input: ${imagePaths.length} image(s)${text ? ', text' : ''}`)
for (const p of imagePaths) {
  console.log(`  - ${basename(p)}`)
}

try {
  const { songs, debug } = await extractSongs({ text, images }, { debug: true })

  console.log('')
  console.log(`Songs (${songs.length}):`)
  if (!songs.length) {
    console.log('  (none)')
  } else {
    for (const [i, song] of songs.entries()) {
      const album = song.album ? ` · ${song.album}` : ''
      console.log(`  ${i + 1}. ${song.artist} — ${song.title}${album} [${song.confidence}, ${song.source}]`)
    }
  }

  if (debug) {
    console.log('')
    console.log('Debug:')
    console.log(`  model: ${debug.model}`)
    console.log(`  duration: ${debug.durationMs}ms`)
    console.log(`  filtered: ${debug.filteredCount}, dropped: ${debug.droppedCount}`)
    console.log('  user content:')
    for (const part of debug.userContentSummary) {
      if (part.type === 'text') {
        const preview = part.text.length > 120 ? `${part.text.slice(0, 117)}…` : part.text
        console.log(`    text: ${JSON.stringify(preview)}`)
      } else {
        console.log(`    image: ${part.mime}, ~${part.bytes} bytes`)
      }
    }

    if (verbose) {
      console.log('')
      console.log('Raw LLM content:')
      console.log(debug.rawContent)
      console.log('')
      console.log('Parsed JSON:')
      console.log(JSON.stringify(debug.parsedJson, null, 2))
    }
  }

  const payload = { songs, debug }
  if (outPath) {
    writeFileSync(outPath, JSON.stringify(payload, null, 2))
    console.log('')
    console.log(`Wrote ${outPath}`)
  }

  if (!songs.length && !allowEmpty) {
    process.exit(1)
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`Parse failed: ${message}`)
  process.exit(1)
}
