import assert from 'node:assert/strict'
import { buildContentParts, summarizeContentParts } from '../server/utils/llm/content.ts'
import { parseJsonFromLlm, filterSongs } from '../server/utils/llm/parse-json.ts'

const parts = buildContentParts({
  text: 'Radiohead - Creep',
  images: ['data:image/png;base64,iVBORw0KGgo='],
})

assert.equal(parts.length, 2)
assert.equal(parts[0]?.type, 'text')
assert.equal(parts[1]?.type, 'image')
if (parts[1]?.type === 'image') {
  assert.equal(parts[1].mime, 'image/png')
}

const summary = summarizeContentParts(parts)
assert.equal(summary.length, 2)
assert.equal(summary[1]?.type, 'image')

const parsed = parseJsonFromLlm('{"songs":[{"title":"Creep","artist":"Radiohead","confidence":"high","source":"text"}]}')
assert.equal(filterSongs(parsed.songs).length, 1)

const fenced = parseJsonFromLlm('```json\n{"songs":[{"title":"A","artist":"B","confidence":"high","source":"text"}]}\n```')
assert.equal(filterSongs(fenced.songs).length, 1)

console.log('llm-parse tests passed')
