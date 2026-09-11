# Configuration

Reference for self-hosting Distill. See [README](../README.md) for quick start.

## Environment variables

All configuration is via `.env` (copy from `.env.example` or run `pnpm setup`). See `.env.example` for the full list with comments.

Distill-owned variables use the `DST_` prefix. Generic names like `OPENAI_API_KEY` are ignored so shell exports do not leak into the app. Framework vars (`NODE_ENV`, `PORT`, `NUXT_HOST`) are unchanged.

## OAuth redirect URIs

Distill builds redirect URIs from the incoming request origin (`X-Forwarded-Host` / `X-Forwarded-Proto` behind a reverse proxy). Override with `DST_PUBLIC_URL` when the browser-facing URL differs from what the server sees (e.g. a tunnel without forwarded headers):

```
{origin}/api/oauth/callback/tidal
{origin}/api/oauth/callback/spotify
```

Register the exact URL in each provider dashboard.

### Spotify HTTPS (required)

Spotify requires **HTTPS** redirect URIs. `localhost` is not allowed — use a loopback IP (`127.0.0.1`) or a production domain.

**Local HTTPS dev:**

```bash
pnpm dev:https
```

Open `https://127.0.0.1:3000` (accept the self-signed certificate warning) and register:

```
https://127.0.0.1:3000/api/oauth/callback/spotify
```

If you use a non-default port, match the port in the dashboard. Optional: set `DST_PUBLIC_URL=https://127.0.0.1:3000` so OAuth callbacks always use that origin even if the request lacks forwarded headers.

Distill rewrites `localhost` to `127.0.0.1` in Spotify redirect URIs only.

### Tidal

1. Create an app at [developer.tidal.com/dashboard](https://developer.tidal.com/dashboard)
2. Set `DST_TIDAL_CLIENT_ID` in `.env`
3. Register redirect URI(s) for each environment you use
4. Scopes: `playlists.read playlists.write search.read`
5. User OAuth uses PKCE — no client secret required for Connect

`DST_TIDAL_CLIENT_SECRET` is only for CLI eval scripts (client credentials grant).

### Spotify

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Set `DST_SPOTIFY_CLIENT_ID` in `.env`
3. Register redirect URI(s)
4. Scopes: `playlist-modify-public playlist-modify-private`

#### Development mode user allowlist

New Spotify apps start in **Development mode**. OAuth only works for accounts listed under **Settings → User Management** in the Spotify Developer Dashboard.

| Role | Registers developer app? | Allowlist? |
|------|-------------------------|------------|
| Operator (you) | Yes | Add your Spotify email to test locally |
| End user | No — logs into personal account | In dev mode, operator must add each user's email |

For a public instance, request **Extended Quota Mode** or complete Spotify app review so any user can sign in.

## Local dev port

Default dev URL is `http://localhost:3000`. To use another port locally (e.g. `3002`), set in your **gitignored** `.env` only:

| Variable | Example | Purpose |
|----------|---------|---------|
| `PORT` | `3002` | Nuxt dev server port |
| `NUXT_HOST` | `::` | Dual-stack bind (see below) |
| `DST_DEV_URL` | `http://localhost:3002` | CLI helpers (`print-refresh-token`, etc.) |
| `DST_HTTPS` | _(unset)_ | Set to `1` for local HTTPS (`pnpm dev:https`) |
| `DST_PUBLIC_URL` | _(unset)_ | Force OAuth callback origin, e.g. `https://127.0.0.1:3000` |

Register OAuth redirect URIs for the port you use. Tidal example: `http://localhost:3002/api/oauth/callback/tidal`. Spotify example: `https://127.0.0.1:3002/api/oauth/callback/spotify` (with `pnpm dev:https`).

**Firefox / Chrome / IPv4 vs IPv6:** Nuxt’s default dev bind listens on IPv6 only (`::1`). Firefox often uses IPv4 for `localhost` (`127.0.0.1`); Chrome may use IPv6. A mismatched stack returns `426 Upgrade Required`. Set `NUXT_HOST=::` in `.env` (dual-stack) and restart the dev server. `NUXT_HOST=127.0.0.1` fixes Firefox but can break Chrome; avoid it unless you only use IPv4.

Do not commit personal port overrides; defaults in docs and `.env.example` stay at `3000`.

## Production deployment

- Set `NODE_ENV=production`
- **HTTPS required** — session cookies use `secure: true`
- Configure reverse proxy to forward `X-Forwarded-Host` and `X-Forwarded-Proto`
- Set a stable `DST_SESSION_PASSWORD` (same value across all replicas)
- Dev routes (`/api/dev/*`), parse `debug` mode, and the Dev HUD are disabled in production

### Example: Caddy

```
distill.example.com {
  reverse_proxy localhost:3000
}
```

Caddy sets forwarded headers automatically. Register `https://distill.example.com/api/oauth/callback/tidal` in the Tidal dashboard.

## LLM

Operators can configure LLM keys in server `.env`, or leave them unset and let each user bring their own key in the browser on the connect screen.

- Server path: set `DST_OPENAI_API_KEY` and/or `DST_GEMINI_API_KEY` in `.env`
- Browser path: user picks OpenAI or Gemini, enters a key, and Distill verifies it before continuing
- Image parsing uses vision models — billable per request
- Max 5 images per parse request
- `DST_LLM_PROVIDER` env locks the provider and overrides the UI picker
- `DST_OPENAI_BASE_URL` / `DST_GEMINI_BASE_URL` support proxies or alternate endpoints

Browser keys are stored in the user's browser only and sent to your Distill instance when parsing. They are not persisted in server `.env` or a database.

### LLM prompts

Override system prompts via env (use `\n` for line breaks in a single-line value):

| Variable | Used for |
|----------|----------|
| `DST_LLM_EXTRACT_SYSTEM_PROMPT` | Song extraction from text/images |
| `DST_LLM_PLAYLIST_METADATA_SYSTEM_PROMPT` | Playlist name and description suggestion |

Defaults match `.env.example` comments and the **LLM prompts** section in [README](../README.md). Keep the JSON shape in each prompt — the server parses fixed fields (`songs`, `name`, `description`).

## Privacy

- User text and images are sent to the configured LLM provider for song extraction
- OAuth tokens are stored in encrypted HTTP-only cookies on your server (not in a database)
- Operators are responsible for complying with Tidal, Spotify, and LLM provider terms of service

## Provider differences

| | Tidal | Spotify |
|---|-------|---------|
| Matching | Search + artist/album browse | Search only |
| Rate limits | `DST_TIDAL_MAX_CONCURRENT`, `DST_TIDAL_MIN_INTERVAL_MS`, `DST_TIDAL_MAX_RETRIES` | Built-in client throttle |
| Playlists | User's Tidal library | Created as private |
| Catalog region | `DST_TIDAL_COUNTRY_CODE` (default `US`) | Account market |

## CLI-only variables

| Variable | Purpose |
|----------|---------|
| `DST_TIDAL_CLIENT_SECRET` | Client credentials for `pnpm eval:matches` |
| `DST_TIDAL_REFRESH_TOKEN` | User token for `pnpm export-fixtures` |
| `DST_DEV_URL` | Dev server URL for `pnpm print-refresh-token` |
