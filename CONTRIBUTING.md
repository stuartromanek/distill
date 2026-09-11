# Contributing

Thanks for your interest in Distill.

## Setup

```bash
pnpm install
pnpm setup
```

Fill in `.env` with OAuth client IDs and an LLM API key. See [README.md](README.md) and [docs/configuration.md](docs/configuration.md).

## Tests

```bash
pnpm test:unit          # Vitest — fast, no external APIs
pnpm test:llm-parse     # LLM JSON parsing (no network)
pnpm test:scoring       # Match scoring helpers
```

Integration tests should mock provider APIs — see [docs/testing.md](docs/testing.md).

## Match eval (optional)

Requires `DST_TIDAL_CLIENT_ID`, `DST_TIDAL_CLIENT_SECRET`, and golden fixtures:

```bash
pnpm eval:matches
```

## Pull requests

- Keep changes focused
- Run `pnpm test:unit` before submitting
- Update docs when changing env vars or OAuth behavior

## Code layout

- `app/` — Nuxt UI and composables
- `server/` — API routes, music providers, LLM adapters
- `shared/types/` — shared TypeScript types
- `scripts/` — CLI eval and setup tools
- `tests/unit/` — Vitest unit tests
