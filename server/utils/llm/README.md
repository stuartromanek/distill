# LLM adapter layer

Song extraction (`extractSongs`) uses a provider registry. Each provider implements `LlmProviderDefinition` in `adapters/`.

## Layout

```
llm/
  extract-songs.ts    # orchestrator (validate → content → adapter → parse JSON)
  content.ts          # ParseInput → LlmContentPart[]
  parse-json.ts       # getExtractSystemPrompt, parseJsonFromLlm
  config.ts           # readLlmConfig()
  registry.ts         # registerProvider / getProvider
  resolve.ts          # resolveLlmAdapter()
  adapters/           # one file per provider
  transport/          # shared HTTP (OpenAI chat/completions)
```

## Adding a provider

1. Create `adapters/my-provider.ts` implementing `LlmProviderDefinition`:
   - `capabilities` — `{ vision: boolean, jsonMode: 'native' | 'openai_response_format' | 'prompt_only' }`
   - `validateConfig(config)` — throw `createError` if keys missing
   - `resolveModel(config, { hasImages })` — pick model id
   - `createAdapter(config, ctx)` — return an `LlmAdapter` with `complete(input)`

2. Register in `resolve.ts` inside `ensureProvidersRegistered()`: `registerProvider(myProvider)`

3. Add config namespace in `config.ts` + `server/utils/env.ts` + `.env.example`

4. Document in root `README.md` provider table

Adapters receive provider-agnostic `LlmContentPart[]` (text + base64 images). Map to native API shapes inside the adapter only.

## Current providers

| File | Provider | Vision |
|------|----------|--------|
| `openai.ts` | Vanilla OpenAI | Yes |
| `gemini.ts` | Google Gemini REST | Yes |
| `anthropic.ts` | Stub (501) | Planned |
