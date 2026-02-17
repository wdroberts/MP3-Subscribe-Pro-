# CLAUDE.md — MP3 Transcribe Pro

## Project Overview

MP3 Transcribe Pro is a web-based application that transcribes MP3 audio files, inserts time ticks (timestamps), and offers text summarization. Users upload MP3 files, receive timestamped transcriptions, generate summaries, and export results in multiple formats.

**Repository:** https://github.com/wdroberts/MP3-Subscribe-Pro-.git

## Tech Stack

| Layer        | Technology                              |
|--------------|-----------------------------------------|
| Frontend     | React (Vite)                            |
| Backend      | Node.js with Express                    |
| Transcription| Google Speech-to-Text API               |
| Summarization| OpenAI API (GPT)                        |
| Storage      | Temporary local/cloud storage for MP3s  |
| Testing      | Jest (unit), Playwright or Cypress (e2e)|
| Linting      | ESLint + Prettier                       |

## Directory Structure

```
MP3-Subscribe-Pro-/
├── CLAUDE.md                  # This file — AI assistant guide
├── README.md                  # User-facing documentation
├── package.json               # Root package.json (workspaces or scripts)
├── .gitignore
├── .env.example               # Template for environment variables
├── client/                    # Frontend (React + Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.tsx           # Entry point
│       ├── App.tsx            # Root component
│       ├── components/        # Reusable UI components
│       │   ├── Upload.tsx     # MP3 upload with progress bar
│       │   ├── Transcription.tsx  # Display with clickable timestamps
│       │   ├── Summary.tsx    # Summarization display
│       │   └── Export.tsx     # Export options (TXT, SRT, clipboard)
│       ├── hooks/             # Custom React hooks
│       ├── services/          # API client functions
│       ├── types/             # TypeScript type definitions
│       └── utils/             # Frontend utilities
├── server/                    # Backend (Node.js + Express)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts           # Server entry point
│   │   ├── routes/            # Express route handlers
│   │   │   ├── upload.ts      # POST /api/upload
│   │   │   ├── transcribe.ts  # POST /api/transcribe
│   │   │   ├── summarize.ts   # POST /api/summarize
│   │   │   └── export.ts      # GET /api/export/:id/:format
│   │   ├── services/          # Business logic
│   │   │   ├── speechToText.ts    # Google Speech-to-Text integration
│   │   │   ├── summarizer.ts      # OpenAI GPT integration
│   │   │   └── fileManager.ts     # Temp file handling
│   │   ├── middleware/        # Express middleware
│   │   ├── types/             # Shared type definitions
│   │   └── utils/             # Server utilities
│   └── tests/                 # Backend tests
└── tests/                     # Integration / E2E tests
```

## Core Features & User Flow

1. **MP3 Upload** — User uploads an MP3 file via the web interface (with progress bar)
2. **Transcription** — Backend sends audio to Google Speech-to-Text, returns timestamped text
3. **Time Ticks** — Each sentence/phrase includes a clickable timestamp
4. **Text Output** — Transcribed text displayed in a readable, scrollable format
5. **Summarization** — User can generate a long summary via OpenAI GPT
6. **Export** — Download as `.txt`, `.srt`, or copy to clipboard

## Development Commands

```bash
# Install dependencies (from root)
npm install

# Start development servers (frontend + backend)
npm run dev

# Frontend only
cd client && npm run dev

# Backend only
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

## Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```
# Google Speech-to-Text
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
GOOGLE_PROJECT_ID=your-project-id

# OpenAI
OPENAI_API_KEY=your-api-key

# Server
PORT=3001
NODE_ENV=development

# File storage
UPLOAD_DIR=./tmp/uploads
MAX_FILE_SIZE_MB=100
```

**Never commit `.env` files or API keys.** The `.gitignore` must exclude `.env`, `tmp/`, and `node_modules/`.

## API Endpoints

| Method | Endpoint                     | Description                        |
|--------|------------------------------|------------------------------------|
| POST   | `/api/upload`                | Upload an MP3 file                 |
| POST   | `/api/transcribe`            | Start transcription for an upload  |
| GET    | `/api/transcribe/:id/status` | Poll transcription progress        |
| POST   | `/api/summarize`             | Generate summary from transcription|
| GET    | `/api/export/:id/:format`    | Export as txt, srt, or json        |

## Key Conventions

### TypeScript
- Use TypeScript everywhere (both client and server)
- Prefer `interface` over `type` for object shapes
- Use strict mode (`"strict": true` in tsconfig)
- No `any` — use `unknown` and narrow types when dealing with external data

### React (Frontend)
- Functional components only — no class components
- Use React hooks for state management
- Keep components small and focused; extract logic into custom hooks
- Component files use PascalCase: `Upload.tsx`, `Transcription.tsx`
- Utility/hook files use camelCase: `useTranscription.ts`, `formatTime.ts`

### Node.js (Backend)
- Express with async route handlers — always wrap in try/catch or use an error middleware
- Validate all incoming request data at the route level
- Keep route handlers thin; business logic goes in `services/`
- Use proper HTTP status codes (200, 201, 400, 404, 500)

### File Naming
- Components: `PascalCase.tsx`
- Utilities, hooks, services: `camelCase.ts`
- Test files: `*.test.ts` or `*.spec.ts` colocated with source
- Config files: lowercase with dots (e.g., `vite.config.ts`, `tsconfig.json`)

### Error Handling
- Backend: centralized error middleware in Express; throw typed errors from services
- Frontend: use error boundaries for React; handle API errors in service layer
- Always return structured error responses: `{ error: string, details?: string }`

### Testing
- Unit tests for services and utilities
- Integration tests for API endpoints
- Component tests for React components
- Test files live next to the code they test (`foo.ts` -> `foo.test.ts`)
- Minimum coverage target: 80%

### Git Conventions
- Branch naming: `feature/description`, `fix/description`, `chore/description`
- Commit messages: imperative mood, concise ("Add upload endpoint", "Fix timestamp parsing")
- Keep commits atomic — one logical change per commit
- Never commit secrets, `.env` files, or large binary files

## External API Integration Notes

### Google Speech-to-Text
- Use the `@google-cloud/speech` Node.js client library
- For files > 1 minute, use `longRunningRecognize` (async operation)
- Request `word_time_offsets` to get per-word timestamps for time ticks
- Supported encoding: convert MP3 to LINEAR16 or FLAC before sending (use `ffmpeg`)
- Handle quota limits gracefully with retries and exponential backoff

### OpenAI API
- Use the OpenAI Chat Completions API with `gpt-4o-mini` model
- Call `POST https://api.openai.com/v1/chat/completions` with Bearer token auth
- For long transcriptions, chunk the text and summarize in segments
- `gpt-4o-mini` supports 128k tokens input; current chunk size (3500 chars) is conservative but reliable

### Audio Processing
- Use `ffmpeg` for format conversion (MP3 to LINEAR16/FLAC)
- The `fluent-ffmpeg` npm package provides a clean Node.js wrapper
- Validate uploaded files are actual MP3s (check MIME type and magic bytes)
- Clean up temporary files after processing completes or after a TTL expires

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

- Validate and sanitize all file uploads (type, size, content)
- Set `MAX_FILE_SIZE_MB` to prevent abuse
- Use `helmet` middleware for Express security headers
- Rate-limit API endpoints (use `express-rate-limit`)
- Clean up uploaded files on a schedule (don't store indefinitely)
- Never expose API keys to the frontend — all API calls go through the backend

## Performance Notes

- Use streaming where possible for large file uploads
- Show upload progress with `XMLHttpRequest` or `fetch` with `ReadableStream`
- Transcription is async — use polling or WebSockets for status updates
- Cache summarization results to avoid redundant API calls
- Implement request queuing if multiple transcriptions are submitted simultaneously
