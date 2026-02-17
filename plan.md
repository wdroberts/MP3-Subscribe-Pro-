# Plan: Replace Hugging Face Summarizer with OpenAI GPT

## Why

Hugging Face Inference Providers requires a corporate-level subscription, making the "Make calls to Inference Providers" token permission unavailable. OpenAI's API is pay-as-you-go with no subscription tier gating.

## Scope

Replace the **summarization provider only** (Hugging Face → OpenAI GPT). Google Speech-to-Text for transcription is unaffected.

## What Changes

### 1. `server/src/services/summarizer.ts` — Rewrite API call layer

**Current state:** 157 lines. Makes raw `fetch()` calls to `https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn` with Bearer token auth. Sends `{ inputs, parameters: { max_length, min_length } }`, receives `[{ summary_text }]`.

**Change to:** Call OpenAI's `POST https://api.openai.com/v1/chat/completions` with `gpt-4o-mini` model (cheapest, fast, excellent at summarization).

**What stays the same (no changes):**
- `chunkText()` function (lines 23-54) — text chunking logic is provider-agnostic, keep as-is
- `extractiveSummarize()` function (lines 81-123) — local fallback, no API dependency
- `summarize()` orchestrator (lines 125-153) — same flow: chunk → summarize each → combine → optional final pass → fallback on error
- Exported interface: `summarize(text: string): Promise<string>` — unchanged
- `chunkText` test export — unchanged

**What changes:**
- Lines 1-2: Remove HF model/URL constants. Add OpenAI API URL constant.
- Lines 4-18: `getApiKey()` — read `OPENAI_API_KEY` env var instead of `HUGGINGFACE_API_KEY`. Same lazy-init pattern.
- Lines 56-78: `summarizeChunk()` — change the `fetch()` call:
  - URL: `https://api.openai.com/v1/chat/completions`
  - Body: `{ model: "gpt-4o-mini", messages: [{ role: "system", content: "..." }, { role: "user", content: text }], max_tokens: 500 }`
  - Response parsing: extract `choices[0].message.content` instead of `[0].summary_text`
- Lines 127, 150: Update console log/warn messages from "HF" / "Hugging Face" to "OpenAI"

**Chunking consideration:** The current `MAX_CHUNK_CHARS = 3500` was sized for BART's ~1024 token input limit. `gpt-4o-mini` supports 128k tokens input, so we _could_ increase the chunk size substantially. However, keeping the existing chunk size is safe, works, and avoids changing tested behavior. We can note it as a future optimization.

### 2. `server/src/services/summarizer.integration.test.ts` — Update mock expectations

**Current state:** 67 lines. Mocks `global.fetch`, sets `HUGGINGFACE_API_KEY` env var, checks calls contain `facebook/bart-large-cnn` in URL, response shape `[{ summary_text }]`.

**Changes:**
- Line 7: Set `OPENAI_API_KEY` instead of `HUGGINGFACE_API_KEY`
- Lines 11-16: `mockFetchResponse()` — return `{ choices: [{ message: { content: summaryText } }] }` instead of `[{ summary_text }]`
- Line 30: Assert URL contains `api.openai.com` instead of `facebook/bart-large-cnn`

### 3. `server/src/services/summarizer.test.ts` — No changes

This file only tests `chunkText()`, which is provider-agnostic. No modifications needed.

### 4. `server/package.json` — Swap dependency

- Remove: `"@huggingface/inference": "^4.13.12"` (it's listed as a dependency but the code actually uses raw `fetch()` instead of the library — so removing it just cleans up an unused dependency)
- Add: Nothing. We'll use raw `fetch()` for OpenAI too, matching the existing pattern. No new runtime dependency needed.

### 5. `.env.example` — Update env var name

- Replace `HUGGINGFACE_API_KEY=your-api-key` with `OPENAI_API_KEY=your-api-key`
- No other env changes

### 6. `README.md` — Update documentation references

- Section "### 5. Hugging Face Account (for summarization)" → Update to describe OpenAI account setup
- Step-by-step flow description mentioning "Hugging Face AI" → Update to "OpenAI"
- Architecture diagram mentioning "Hugging Face APIs" → Update to "OpenAI API"
- Troubleshooting "### Summarization fails" → Update advice for OpenAI
- Env var example block → Update `HUGGINGFACE_API_KEY` to `OPENAI_API_KEY`

### 7. `CLAUDE.md` — Update project documentation

- Tech stack table: Change `Summarization` from `Hugging Face Transformers API` to `OpenAI API (GPT)`
- External API Integration Notes: Replace Hugging Face section with OpenAI section
- Environment Variables: Replace `HUGGINGFACE_API_KEY` with `OPENAI_API_KEY`

## What Does NOT Change

- **`server/src/routes/summarize.ts`** — calls `summarize(text)` and returns the result. Interface unchanged.
- **`client/`** — the frontend calls `POST /api/summarize` and displays the returned `summary` string. No awareness of the backend provider.
- **`server/src/services/speechToText.ts`** — Google Speech-to-Text, completely separate.
- **All other routes, middleware, services, hooks, components** — no touchpoints.
- **Type definitions** — `SummarizationResult` interface is unchanged.
- **`package-lock.json`** — will regenerate automatically after `npm install`.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| OpenAI API key not set | Same fallback behavior: `extractiveSummarize()` runs locally |
| OpenAI API rate limits | Same try/catch → extractive fallback as current HF path |
| Cost | `gpt-4o-mini` is ~$0.15/1M input tokens — a 3500-char chunk is ~1000 tokens, so summarizing costs fractions of a cent |
| Response format different | Tested in integration tests with updated mock |
| Chunk size suboptimal for GPT | Works correctly as-is; larger chunks are a future optimization, not a risk |

## Execution Order

1. Create feature branch `claude/open-mp3-subscribe-pro-5KhG3`
2. Edit `server/src/services/summarizer.ts` (core change)
3. Edit `server/src/services/summarizer.integration.test.ts` (update mocks)
4. Edit `server/package.json` (remove unused `@huggingface/inference`)
5. Edit `.env.example` (swap env var)
6. Edit `README.md` (update docs)
7. Edit `CLAUDE.md` (update project docs)
8. Run `npm install` in server/ to update lock file
9. Run tests to verify nothing breaks
10. Commit and push
