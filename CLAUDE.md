# CLAUDE.md — MP3 Transcribe Pro

## Project Overview

MP3 Transcribe Pro is a web-based application that transcribes MP3 audio files, inserts time ticks (timestamps), and offers text summarization. Users authenticate via Google OAuth, upload MP3 files, receive timestamped transcriptions, generate summaries, and export results in multiple formats.

**Repository:** https://github.com/wdroberts/MP3-Subscribe-Pro-.git

## Tech Stack

| Layer          | Technology                                    |
|----------------|-----------------------------------------------|
| Frontend       | React 18 + Vite 6                             |
| Backend        | Node.js + Express 4                           |
| Language       | TypeScript 5.6 (strict mode, both ends)       |
| Authentication | Google OAuth 2.0 (`google-auth-library`)      |
| Transcription  | Google Speech-to-Text (`@google-cloud/speech`) |
| Summarization  | Hugging Face Inference API (`@huggingface/inference`) |
| Audio Processing | ffmpeg via `fluent-ffmpeg`                  |
| File Upload    | Multer                                        |
| Storage        | In-memory job store + temporary local files   |
| Client Testing | Vitest + @testing-library/react               |
| Server Testing | Jest + ts-jest + Supertest                    |
| Linting        | ESLint + @typescript-eslint                   |
| Formatting     | Prettier                                      |

## Directory Structure

```
MP3-Subscribe-Pro-/
├── CLAUDE.md                  # This file — AI assistant guide
├── README.md                  # User-facing documentation
├── package.json               # Root package.json (npm workspaces)
├── package-lock.json
├── .eslintrc.cjs              # ESLint config (TypeScript + Prettier)
├── .prettierrc                # Prettier config
├── .gitignore
├── .env.example               # Template for environment variables
├── client/                    # Frontend (React + Vite)
│   ├── package.json
│   ├── vite.config.ts         # Vite config with API proxy to :3001
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx           # Entry point
│       ├── App.tsx            # Root component (auth-gated routing)
│       ├── App.css
│       ├── components/
│       │   ├── Upload.tsx         # MP3 upload with progress bar
│       │   ├── Transcription.tsx  # Display with clickable timestamps
│       │   ├── Summary.tsx        # Summarization display
│       │   ├── Export.tsx         # Export options (TXT, SRT, JSON, clipboard)
│       │   ├── Login.tsx          # Google OAuth login
│       │   └── ErrorBoundary.tsx  # React error boundary
│       ├── hooks/
│       │   ├── useAuth.ts         # Google OAuth state + token management
│       │   ├── useUpload.ts       # File upload with progress tracking
│       │   ├── useTranscription.ts # Transcription state with polling
│       │   └── useSummarization.ts # Summarization request logic
│       ├── services/
│       │   └── api.ts             # API client (upload, transcribe, summarize, export)
│       ├── types/
│       │   └── index.ts           # Shared frontend type definitions
│       ├── utils/
│       │   ├── formatTime.ts      # Time formatting + file size utilities
│       │   └── formatTime.test.ts # Unit tests for formatters
│       └── test/
│           └── setup.ts           # Vitest test setup
├── server/                    # Backend (Node.js + Express)
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   └── src/
│       ├── index.ts               # Server entry point
│       ├── routes/
│       │   ├── auth.ts            # Google OAuth: /google/url, /google/callback, /verify
│       │   ├── upload.ts          # POST /api/upload (multer)
│       │   ├── transcribe.ts      # POST /api/transcribe, GET /api/transcribe/:id/status
│       │   ├── summarize.ts       # POST /api/summarize
│       │   └── export.ts          # GET /api/export/:id/:format
│       ├── services/
│       │   ├── speechToText.ts        # Google Speech-to-Text integration
│       │   ├── speechToText.test.ts
│       │   ├── summarizer.ts          # Hugging Face BART summarization + chunking
│       │   ├── summarizer.test.ts
│       │   ├── audioProcessor.ts      # ffmpeg MP3 → LINEAR16 WAV conversion
│       │   ├── fileManager.ts         # Upload directory + file lifecycle management
│       │   ├── jobStore.ts            # In-memory Map-based job tracking
│       │   └── jobStore.test.ts
│       ├── middleware/
│       │   ├── auth.ts            # Bearer token verification (Google OAuth)
│       │   ├── errorHandler.ts    # Centralized Express error handler
│       │   └── rateLimiter.ts     # Tiered rate limiting
│       ├── types/
│       │   └── index.ts           # Shared backend type definitions
│       └── utils/
│           ├── formatters.ts      # SRT generation + timestamp formatting
│           ├── formatters.test.ts
│           ├── retry.ts           # Exponential backoff retry utility
│           └── retry.test.ts
```

## Core Features & User Flow

1. **Authentication** — User logs in via Google OAuth 2.0
2. **MP3 Upload** — User uploads an MP3 file via the web interface (with progress bar)
3. **Transcription** — Backend converts MP3 to LINEAR16 WAV via ffmpeg, sends to Google Speech-to-Text, returns timestamped text (async with polling for status)
4. **Time Ticks** — Each sentence/phrase includes a clickable timestamp
5. **Text Output** — Transcribed text displayed in a readable, scrollable format
6. **Summarization** — User can generate a summary via Hugging Face BART (long texts are chunked automatically)
7. **Export** — Download as `.txt`, `.srt`, `.json`, or copy to clipboard

## Development Commands

```bash
# Install dependencies (from root — uses npm workspaces)
npm install

# Start development servers (frontend + backend concurrently)
npm run dev

# Frontend only (Vite dev server on :5173, proxies /api to :3001)
cd client && npm run dev

# Backend only (tsx watch mode on :3001)
cd server && npm run dev

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Format code
npm run format

# Build for production
npm run build

# Type check
npm run typecheck
```

**Note:** The root `package.json` uses npm workspaces (`client` and `server`). The `dev` script uses `concurrently` to run both servers in parallel.

## Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```
# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173

# Google Speech-to-Text
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
GOOGLE_PROJECT_ID=your-project-id

# Hugging Face
HUGGINGFACE_API_KEY=your-api-key

# Server
PORT=3001
NODE_ENV=development

# File storage
UPLOAD_DIR=./tmp/uploads
MAX_FILE_SIZE_MB=100
```

**Never commit `.env` files or API keys.** The `.gitignore` excludes `.env`, `tmp/`, `node_modules/`, and `credentials/`.

## API Endpoints

| Method | Endpoint                     | Auth Required | Description                              |
|--------|------------------------------|---------------|------------------------------------------|
| GET    | `/api/auth/google/url`       | No            | Get Google OAuth login URL               |
| POST   | `/api/auth/google/callback`  | No            | Exchange OAuth code for tokens           |
| GET    | `/api/auth/verify`           | Yes           | Verify current token validity            |
| POST   | `/api/upload`                | Yes           | Upload an MP3 file (multipart/form-data) |
| POST   | `/api/transcribe`            | Yes           | Start async transcription (returns 202)  |
| GET    | `/api/transcribe/:id/status` | Yes           | Poll transcription job progress          |
| POST   | `/api/summarize`             | Yes           | Generate summary from transcription      |
| GET    | `/api/export/:id/:format`    | Yes           | Export as `txt`, `srt`, or `json`        |

## Architecture Notes

### Authentication Flow
1. Frontend calls `GET /api/auth/google/url` to get the OAuth consent URL
2. User is redirected to Google, authenticates, and is redirected back with a code
3. Frontend sends the code to `POST /api/auth/google/callback` to exchange for tokens
4. Tokens are stored in `localStorage` and sent as `Authorization: Bearer <token>` headers
5. Backend middleware (`auth.ts`) verifies the Bearer token on protected routes

### Job Processing
- Transcription and summarization are async operations tracked by an in-memory `Map`-based job store (`jobStore.ts`)
- `POST /api/transcribe` returns HTTP 202 with a job ID; the client polls `GET /api/transcribe/:id/status`
- Jobs and results are **volatile** — they are lost on server restart (no persistent database)

### Audio Pipeline
1. MP3 uploaded via Multer → saved to `UPLOAD_DIR`
2. `audioProcessor.ts` converts MP3 to LINEAR16 WAV using ffmpeg
3. `speechToText.ts` sends WAV to Google Speech-to-Text
4. For audio > 1 minute, `longRunningRecognize` is used (async operation)
5. Word-level timestamps (`word_time_offsets`) are requested for time ticks

### Rate Limiting
- Global: 100 requests per 15 minutes
- Expensive operations (transcribe, summarize): 10 requests per 15 minutes

## Key Conventions

### TypeScript
- Use TypeScript everywhere (both client and server)
- Prefer `interface` over `type` for object shapes
- Use strict mode (`"strict": true` in tsconfig)
- No `any` — use `unknown` and narrow types when dealing with external data

### React (Frontend)
- Functional components only — no class components
- Use React hooks for state management; extract logic into custom hooks
- Keep components small and focused
- Component files use PascalCase: `Upload.tsx`, `Transcription.tsx`
- Utility/hook files use camelCase: `useTranscription.ts`, `formatTime.ts`

### Node.js (Backend)
- Express with async route handlers — always wrap in try/catch or use the centralized error middleware
- Validate all incoming request data at the route level
- Keep route handlers thin; business logic goes in `services/`
- Use proper HTTP status codes (200, 201, 202, 400, 404, 500)

### File Naming
- Components: `PascalCase.tsx`
- Utilities, hooks, services: `camelCase.ts`
- Test files: `*.test.ts` colocated with source
- Config files: lowercase with dots (e.g., `vite.config.ts`, `tsconfig.json`)

### Error Handling
- Backend: centralized error middleware in `errorHandler.ts`; development mode includes stack traces, production does not
- Frontend: `ErrorBoundary.tsx` wraps the app; API errors handled in service layer
- Structured error responses: `{ error: string, details?: string }`

### Testing
- **Client:** Vitest + @testing-library/react (configured in `vite.config.ts`, jsdom environment)
- **Server:** Jest + ts-jest + Supertest (configured in `jest.config.js`)
- Test files live next to the code they test (`foo.ts` → `foo.test.ts`)
- Minimum coverage target: 80%

### Prettier Config
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

### Git Conventions
- Branch naming: `feature/description`, `fix/description`, `chore/description`
- Commit messages: imperative mood, concise ("Add upload endpoint", "Fix timestamp parsing")
- Keep commits atomic — one logical change per commit
- Never commit secrets, `.env` files, or large binary files

## External API Integration Notes

### Google Speech-to-Text
- Client library: `@google-cloud/speech` v6.7
- For files > 1 minute, use `longRunningRecognize` (async operation)
- Request `word_time_offsets` to get per-word timestamps for time ticks
- Audio encoding: MP3 is converted to LINEAR16 WAV via ffmpeg before sending
- Handle quota limits with the `retry.ts` exponential backoff utility

### Hugging Face Transformers
- Client library: `@huggingface/inference` v2.8
- Model for summarization: `facebook/bart-large-cnn`
- Long transcriptions are automatically chunked and summarized in segments
- Respect token limits per model (typically 1024 tokens input for BART)

### Audio Processing
- Uses `ffmpeg` via the `fluent-ffmpeg` npm package
- Converts MP3 to LINEAR16 WAV (mono, 16kHz) for Google Speech-to-Text
- Validates uploaded files are actual MP3s (check MIME type)
- Temporary files cleaned up after processing or after TTL expires

## SRT Export Format

```
1
00:00:01,000 --> 00:00:04,500
First sentence of the transcription.

2
00:00:04,500 --> 00:00:08,200
Second sentence of the transcription.
```

## Security Considerations

- Google OAuth 2.0 required for all data endpoints
- Bearer token verification on protected routes via auth middleware
- Validate and sanitize all file uploads (type, size)
- `MAX_FILE_SIZE_MB` enforced by Multer configuration
- `helmet` middleware for Express security headers
- Tiered rate limiting via `express-rate-limit`
- CORS configured for cross-origin requests
- Temporary files cleaned up on schedule
- API keys never exposed to the frontend — all external API calls go through the backend
- `.gitignore` excludes `.env`, `credentials/`, and `tmp/`

## Shared Types

Both client and server define these core interfaces in their respective `types/index.ts`:

```typescript
interface UploadResult { id: string; filename: string; size: number; duration?: number; }
interface TranscriptionSegment { text: string; startTime: number; endTime: number; }
interface TranscriptionResult { id: string; segments: TranscriptionSegment[]; fullText: string; }
interface SummarizationResult { id: string; summary: string; }
interface ApiErrorResponse { error: string; details?: string; }
```

## Known Limitations

- **No persistent storage:** Job state and transcription results are stored in-memory and lost on server restart
- **No database:** There is no database layer; all state is ephemeral
- **No CI/CD:** No GitHub Actions workflows or automated deployment pipelines exist
- **No E2E tests:** Only unit/integration tests exist; no Playwright or Cypress tests are configured
- **Single-process:** The in-memory job store does not support horizontal scaling
