# Plan: Simple "X of Y chunks completed" status display

## Problem

The progress bar and status text are not visibly rendering during transcription. The data pipeline (server → job store → status endpoint → client poll → React state → component) looks architecturally correct, but something is preventing the UI from showing updates.

## Root cause candidates

1. **CSS invisibility** — The progress bar fills to `width: 0%` initially, and the surrounding elements may have no visible styling (no background, no border, no min-height), making the entire progress section invisible even though it's in the DOM.
2. **Poll timing** — The first poll returns progress but `chunksTotal`/`chunksCompleted` aren't set yet (they're set later when chunking starts), so the chunk display falls back to just `"0%"` — easy to miss.
3. **State never reaches the component** — Less likely given the code, but possible with a subtle race condition.

## Solution: 3 targeted changes

### Change 1: Server — log progress on every status poll (diagnostic)

**File:** `server/src/routes/transcribe.ts` (GET `/:id/status` handler, ~line 65)

Add a `console.log` before `res.json(...)` for non-completed jobs so we can confirm in the server terminal that progress data is being returned:

```
console.log(`[status] job=${job.id} status=${job.status} progress=${JSON.stringify(job.progress)}`);
```

This is temporary — once we confirm the pipeline works, we can remove it.

### Change 2: Client hook — log what the poll actually receives (diagnostic)

**File:** `client/src/hooks/useTranscription.ts` (~line 73, inside the `poll` function)

Add a `console.log` right after `const result = await pollTranscriptionStatus(id)`:

```
console.log('[poll] result:', { status: result.status, progress: result.progress });
```

This tells us whether the browser is actually receiving progress data. Temporary, like Change 1.

### Change 3: Client component — simple, CSS-independent chunk counter

**File:** `client/src/components/Transcription.tsx`

Replace the progress bar section with a simple, highly visible text display that doesn't depend on CSS progress bar styling:

**Before** (lines 29-48 — the conditional `{progress ? ...}` block):
```tsx
{progress ? (
  <div className="transcription-progress">
    <div className="transcription-progress-bar">
      <div className="transcription-progress-fill" style={{ width: `${progress.percent}%` }} />
    </div>
    <p className="transcription-progress-label">
      {progress.currentStep}
      <span className="transcription-progress-percent">
        {progress.chunksTotal != null && progress.chunksTotal > 0
          ? `Chunk ${progress.chunksCompleted ?? 0} / ${progress.chunksTotal} · ${progress.percent}%`
          : `${progress.percent}%`}
      </span>
    </p>
    {elapsedSeconds > 0 && (
      <p className="transcription-elapsed">Elapsed: {formatElapsed(elapsedSeconds)}</p>
    )}
  </div>
) : (
  <p>{status === 'pending' ? 'Starting transcription...' : 'Transcribing audio...'}</p>
)}
```

**After:**
```tsx
{progress ? (
  <div className="transcription-progress">
    <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.5rem 0' }}>
      {progress.chunksTotal != null && progress.chunksTotal > 0
        ? `${progress.chunksCompleted ?? 0} of ${progress.chunksTotal} chunks completed`
        : progress.currentStep}
    </p>
    <div className="transcription-progress-bar">
      <div className="transcription-progress-fill" style={{ width: `${progress.percent}%` }} />
    </div>
    <p className="transcription-progress-label">
      {progress.currentStep} — {progress.percent}%
    </p>
    {elapsedSeconds > 0 && (
      <p className="transcription-elapsed">Elapsed: {formatElapsed(elapsedSeconds)}</p>
    )}
  </div>
) : (
  <p>{status === 'pending' ? 'Starting transcription...' : 'Transcribing audio...'}</p>
)}
```

Key differences:
- **Big bold "X of Y chunks completed" text** at the top — uses inline styles so it can't be hidden by CSS
- Progress bar kept as a secondary visual beneath it
- `currentStep — percent%` as a simple label below the bar
- Falls back to just `currentStep` before chunk counts are available

## Files changed

| File | Type of change |
|------|---------------|
| `server/src/routes/transcribe.ts` | Add 1 diagnostic log line |
| `client/src/hooks/useTranscription.ts` | Add 1 diagnostic log line |
| `client/src/components/Transcription.tsx` | Rewrite progress display section |

## What this does NOT change

- Server progress reporting logic (already correct — sends `chunksTotal`/`chunksCompleted`)
- Polling interval or timing
- Job store structure
- API response shape

## Expected result

During transcription, the user sees:

```
⟳ 0 of 12 chunks completed
[========                    ]
Transcribing audio... — 15%
Elapsed: 23s
```

...updating live as each chunk finishes:

```
⟳ 7 of 12 chunks completed
[====================        ]
Transcribing audio... — 62%
Elapsed: 1m 45s
```

The diagnostic logs let us verify in browser DevTools console and server terminal that data is flowing correctly.
