# Tidal Playlist

Turn text and images into a Tidal playlist.

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill in `.env`:

- `NUXT_TIDAL_CLIENT_ID` / `NUXT_TIDAL_CLIENT_SECRET` from [Tidal Developer Dashboard](https://developer.tidal.com/dashboard)
- `NUXT_TIDAL_REDIRECT_URI` — must match Tidal dashboard exactly (default: `http://localhost:3000/api/oauth/callback/tidal`)
- `NUXT_SESSION_PASSWORD` — random string, 16+ characters

### Song extraction (LLM)

Parsing uses a pluggable adapter layer in [`server/utils/llm/`](server/utils/llm/). Set `NUXT_LLM_PROVIDER` to choose a provider.

| Provider | `NUXT_LLM_PROVIDER` | Text | Images | Notes |
|----------|---------------------|------|--------|-------|
| Cursor | `cursor` (default) | Yes | Fallback only | Requires [cursor-api-proxy](https://github.com/anyrobert/cursor-api-proxy) + local `agent` CLI |
| OpenAI | `openai` | Yes | Yes | Direct API; vision model e.g. `gpt-4o-mini` |
| Gemini | `gemini` | Yes | Yes | Native vision + JSON via [Google AI Studio](https://aistudio.google.com/apikey) key |
| Anthropic | `anthropic` | — | — | Coming soon (stub registered) |

#### Cursor (default)

1. **Get a Cursor API key** from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) and set `NUXT_CURSOR_API_KEY` in `.env`.

2. **Install the Cursor agent CLI** (if you have not already):

   ```bash
   curl https://cursor.com/install -fsS | bash
   agent login   # skip if using NUXT_CURSOR_API_KEY only
   agent --list-models
   ```

3. **Start the proxy** (in a separate terminal):

   ```bash
   pnpm cursor-proxy
   ```

   Default URL: `http://127.0.0.1:8765/v1` (matches `NUXT_CURSOR_PROXY_URL`).

#### Gemini

```bash
NUXT_LLM_PROVIDER=gemini
NUXT_GEMINI_API_KEY=...          # from Google AI Studio
NUXT_GEMINI_MODEL=gemini-2.5-flash
```

Gemini supports image uploads natively — no Cursor proxy or OpenAI fallback needed.

#### OpenAI

```bash
NUXT_LLM_PROVIDER=openai
NUXT_OPENAI_API_KEY=sk-...
NUXT_OPENAI_MODEL=gpt-4o-mini    # use a vision model for images
```

**Image input with Cursor:** the Cursor proxy does **not** pass image bytes to the model. If `NUXT_OPENAI_API_KEY` is set, image requests auto-fallback to OpenAI; otherwise paste the setlist as text or switch provider to `gemini` / `openai`.

Optional env:

| Variable | Default | Purpose |
|----------|---------|---------|
| `NUXT_LLM_PROVIDER` | `cursor` | `cursor`, `openai`, `gemini`, or `anthropic` (stub) |
| `NUXT_OPENAI_MODEL` | `auto` | Model hint for Cursor/OpenAI |
| `NUXT_CURSOR_PROXY_URL` | `http://127.0.0.1:8765` | Proxy base URL (no `/v1` suffix) |
| `NUXT_GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model id |

See [`server/utils/llm/README.md`](server/utils/llm/README.md) for adding new providers.

4. **Run the app**:

   ```bash
   pnpm dev
   ```

## Dev

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Flow

1. Connect Tidal (reconnect after updates if prompted — OAuth includes `playlists.read` for fixture export)
2. Paste text or upload images
3. Review matched tracks (edit, reorder, add more)
4. Create playlist

### Correcting matches in review

Expand a track row to access correction tools:

- Pick an alternative from the dropdown
- Run a manual search
- **Paste a Tidal track URL** (e.g. `https://tidal.com/browse/track/12345`) and click **Use**

When you pick a track different from the auto-match, the app records feedback in the browser. Use **Download match feedback (N)** at the bottom of the review step to export JSONL for tuning.

## Match eval (golden fixtures)

Measure matching quality against a reference Tidal playlist.

### 1. Build fixtures

Parse your test setlist (dev server running):

```bash
curl -s localhost:3000/api/parse \
  -H 'Content-Type: application/json' \
  -d '{"text":"Artist - Title\n..."}' > fixtures/parsed.json
```

Export golden cases by pairing parsed songs with a reference playlist:

```bash
pnpm export-fixtures \
  --playlist https://tidal.com/browse/playlist/{uuid} \
  --parsed fixtures/parsed.json \
  --out fixtures/match-cases.json
```

`fixtures/match-cases.json` is gitignored (local golden set). See `fixtures/match-cases.example.json` for format.

**TIDAL_REFRESH_TOKEN** (one-time): with `pnpm dev` running and Tidal connected in the app, open in your browser:

```
http://localhost:3000/api/dev/tidal-refresh-token
```

Copy `refreshToken` into `.env` as `TIDAL_REFRESH_TOKEN=...`

If you changed `NUXT_SESSION_PASSWORD` after logging in, log out and reconnect Tidal first — old cookies won't decrypt.

Cookie fallback (dev server must be running):

```bash
pnpm print-refresh-token -- '<full tidal_session cookie value>'
```

### 2. Run eval

Uses client credentials from `.env` (no user session):

```bash
pnpm eval:matches
pnpm eval:matches --fixtures path/to/fixtures.json
pnpm eval:matches --verbose   # log each failure with top-5
```

Reports **top-1 accuracy** and **top-5 recall**. Exits with code `1` if any top-1 miss (CI-ready).

## Debug image parse

Inspect what the LLM returns from image (or text) input **before** Tidal matching.

### CLI (no dev server)

Drop a setlist screenshot in `fixtures/images/`, then:

```bash
pnpm debug:parse --image fixtures/images/setlist.jpg
pnpm debug:parse --image a.jpg --image b.jpg --text "optional context"
pnpm debug:parse --image setlist.png --verbose --out fixtures/last-parse.json
```

Prints extracted songs plus model, duration, and sanitized input summary. `--verbose` dumps raw LLM JSON; `--allow-empty` exits 0 when no songs found.

### Dev server + curl

With `pnpm dev` running:

```bash
curl -s localhost:3000/api/parse \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --rawfile img fixtures/images/setlist.jpg '{ images: ["data:image/jpeg;base64," + ($img | @base64)], debug: true }')"
```

Response includes `{ songs, debug }` with `rawContent`, `parsedJson`, and `userContentSummary` (image data URLs are never logged — only mime + byte size).

### In-app (DevRequestHud)

After submitting images in the UI, press **\`** to open the dev HUD. The **Last parse** section shows recent parse results; click a row to expand the raw LLM response. Requires `NODE_ENV !== production`.

See [docs/design-system.md](docs/design-system.md) for UI tokens.

## Tidal login error 11102

The redirect URI in `.env` must match the Tidal Developer Dashboard **exactly** (including path and http/https).

Default callback route: `http://localhost:3000/api/oauth/callback/tidal`
