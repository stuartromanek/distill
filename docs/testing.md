# Testing

The first automated suite focuses on the generic music adapter contract. These
tests should stay fast, deterministic, and free of real Tidal or Spotify calls.

## Current Unit Scope

Run the Vitest unit suite with:

```bash
pnpm test:unit
```

The current tests cover:

- OAuth URL construction and request-derived callback URLs.
- Tidal and Spotify track URL parsing.
- Tidal and Spotify response mapping through fake HTTP clients.
- Provider-agnostic matching through fake `MusicSearchClient` instances.
- Search-client session boundaries for the secretless OAuth flow.

The existing script-style tests are still available:

```bash
pnpm test:scoring
pnpm test:llm-parse
```

## Next Integration Layer

After the unit suite is stable, add `@nuxt/test-utils` and cover the generic
server routes with mocked provider fetches:

- `/api/auth/[provider]/login` resolves providers and redirects to OAuth.
- `/api/oauth/callback/[provider]` validates state and sets provider sessions.
- `/api/music/[provider]/search` requires a connected session and returns matches.
- `/api/music/[provider]/playlist` creates provider-specific playlists.

These tests should not call third-party APIs. Mock token exchange and provider
catalog/playlist requests.

## Later UI Smoke Layer

Add Playwright only for a small wiring check once the API route layer is covered:

- Select Tidal or Spotify in the service UI.
- Simulate auth completion.
- Confirm provider-specific search and playlist endpoints are used.
- Confirm provider copy and buttons update for the selected service.

Avoid real OAuth in browser tests; popup flows and external providers make the
suite slow and brittle.
