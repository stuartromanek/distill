import assert from 'node:assert/strict'
import {
  parseTitleMetadata,
  scoreTitleMatch,
  scoreTrack,
  artistSimilarity,
  normalizeTitleForSearch,
  normalizeArtistForSearch,
} from '../server/utils/match-scoring.ts'

function testParseTitleMetadata() {
  const denzel = parseTitleMetadata('LIT EFFECT (feat. BKTHERULA & LAZER DIM 700)')
  assert.equal(denzel.base, 'LIT EFFECT')
  assert.deepEqual(denzel.featuredArtists, ['BKTHERULA', 'LAZER DIM 700'])
  assert.equal(denzel.variants.length, 0)

  const quoted = parseTitleMetadata('"LIT EFFECT (feat. BKTHERULA & LAZER DIM 700)"')
  assert.equal(quoted.base, 'LIT EFFECT')
  assert.deepEqual(quoted.featuredArtists, ['BKTHERULA', 'LAZER DIM 700'])

  const remix = parseTitleMetadata('Der Mussolini (Giorgio Moroder Remix)')
  assert.equal(remix.base, 'Der Mussolini')
  assert.ok(remix.variants.includes('remix'))

  const live = parseTitleMetadata('Song (Live at Wembley)')
  assert.equal(live.base, 'Song')
  assert.ok(live.variants.includes('live'))

  const dash = parseTitleMetadata('Track Name - Radio Edit')
  assert.equal(dash.base, 'Track Name')
  assert.ok(dash.variants.includes('radio edit'))

  const ellipsis = parseTitleMetadata('Whatever Happened To My Rock...')
  assert.equal(ellipsis.base, 'Whatever Happened To My Rock')
  assert.equal(ellipsis.truncated, true)

  const mix = parseTitleMetadata('Dead Flowers - 2009 Mix')
  assert.equal(mix.base, 'Dead Flowers')
  assert.ok(mix.variants.includes('mix'))
}

function testScoreTitleMatch() {
  const parsedMeta = parseTitleMetadata('LIT EFFECT (feat. BKTHERULA & LAZER DIM 700)')

  const baseOnlyScore = scoreTitleMatch(parsedMeta, 'LIT EFFECT', 'Denzel Curry')
  assert.ok(baseOnlyScore >= 0.95, `expected high base score, got ${baseOnlyScore}`)

  const fullTitleOldWay = scoreTitleMatch(
    parseTitleMetadata('LIT EFFECT (feat. BKTHERULA & LAZER DIM 700)'),
    'LIT EFFECT (feat. BKTHERULA & LAZER DIM 700)',
    'Denzel Curry',
  )
  assert.ok(baseOnlyScore >= fullTitleOldWay - 0.1)

  const remixPenalty = scoreTitleMatch(parsedMeta, 'LIT EFFECT (Remix)', 'Denzel Curry')
  assert.ok(remixPenalty < baseOnlyScore)
}

function testScoreTrackWithFeatBonus() {
  const score = scoreTrack(
    { artist: 'Denzel Curry', title: 'LIT EFFECT (feat. BKTHERULA & LAZER DIM 700)' },
    'LIT EFFECT',
    'Denzel Curry feat. BKTHERULA',
  )
  assert.ok(score >= 0.85, `expected strong match score, got ${score}`)
}

function testCompilationStyleTitle() {
  const parsedMeta = parseTitleMetadata("Let's Go Dancing")
  const score = scoreTitleMatch(
    parsedMeta,
    "Let's Go Dancing (from 'Let's Go Dancing' the songs of Kevn Kinney)",
    'Deer Tick',
  )
  assert.equal(score, 1, `expected compilation suffix title to match base, got ${score}`)
}

function testArtistTypoSimilarity() {
  const sim = artistSimilarity('THE WEAKHERTHANS', 'The Weakerthans')
  assert.ok(sim >= 0.85, `expected OCR typo to score high, got ${sim}`)
}

function testNormalizeForSearch() {
  assert.equal(normalizeTitleForSearch("livin' was easy"), 'livin was easy')
  assert.equal(normalizeArtistForSearch("OLD 97'S"), "OLD 97'S")
  assert.equal(normalizeTitleForSearch('R.E.M.'), 'REM')
  assert.equal(normalizeTitleForSearch('The Springtime Reminds Me Of...'), 'The Springtime Reminds Me Of')
}

function testEllipsisTruncationMatch() {
  const parsedMeta = parseTitleMetadata('Whatever Happened To My Rock...')
  const score = scoreTitleMatch(
    parsedMeta,
    "Whatever Happened To My Rock 'N' Roll (Punk Song)",
    'Black Rebel Motorcycle Club',
  )
  assert.ok(score >= 0.85, `expected truncated title prefix match, got ${score}`)
}

function testLivePenaltyWithoutSetlistIndicator() {
  const parsedMeta = parseTitleMetadata('Watch The Sunrise')
  const studioScore = scoreTitleMatch(parsedMeta, 'Watch The Sunrise', 'Big Star')
  const liveScore = scoreTitleMatch(
    parsedMeta,
    "Watch the Sunrise (Live at Lafayette's Music Room, Memphis, TN, January 1973)",
    'Big Star',
  )
  assert.ok(studioScore > liveScore, `expected studio ${studioScore} > live ${liveScore}`)
}

function testMixVariantPreference() {
  const parsedMeta = parseTitleMetadata('Dead Flowers - 2009 Mix')
  const mixScore = scoreTitleMatch(parsedMeta, 'Dead Flowers (2009 Mix)', 'The Rolling Stones')
  const plainScore = scoreTitleMatch(parsedMeta, 'Dead Flowers', 'The Rolling Stones')
  assert.ok(mixScore >= plainScore, `expected mix version to score at least as high, mix=${mixScore} plain=${plainScore}`)
}

function testApostropheTitleMatch() {
  const withApostrophe = parseTitleMetadata("What's Right?")
  const withoutApostrophe = parseTitleMetadata('Whats Right?')
  const tidalTitle = 'What\u2019s Right?'

  assert.ok(
    scoreTitleMatch(withApostrophe, tidalTitle, 'Ratboys') >= 0.95,
    'apostrophe in parsed title should match Tidal title',
  )
  assert.ok(
    scoreTitleMatch(withoutApostrophe, tidalTitle, 'Ratboys') >= 0.95,
    'missing apostrophe in parsed title should still match Tidal title',
  )
}

testParseTitleMetadata()
testScoreTitleMatch()
testScoreTrackWithFeatBonus()
testCompilationStyleTitle()
testArtistTypoSimilarity()
testNormalizeForSearch()
testEllipsisTruncationMatch()
testLivePenaltyWithoutSetlistIndicator()
testMixVariantPreference()
testApostropheTitleMatch()
console.log('match-scoring tests passed')
