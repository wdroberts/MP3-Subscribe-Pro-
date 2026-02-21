# CLAUDE.md — MP3 Transcribe Pro

This file helps AI assistants (like Claude) understand the project. It is also a
useful reference for any developer working on the codebase.

## What is this project?

MP3 Transcribe Pro is a web app that turns MP3 audio files into text. You upload
an MP3, the app sends it to Google's Speech-to-Text service, and you get back a
timestamped transcription. You can then extract key points, action items, and
people mentioned using OpenAI, and export everything as `.txt`, `.srt`, or copy
to clipboard.

**Repository:** https://github.com/wdroberts/MP3-Subscribe-Pro-.git

## Tech stack (what tools we use)

| What             | Tool                                    | Why                                  |
|------------------|-----------------------------------------|--------------------------------------|
| Frontend (UI)    | React with TypeScript, built by Vite    | Fast, component-based UI framework   |
| Backend (API)    | Node.js with Express and TypeScript     | Lightweight HTTP server              |
| Transcription    | Google Cloud Speech-to-Text API         | Accurate speech recognition          |
| Summarization    | OpenAI API (GPT-4o-mini model)          | AI-powered text summarization        |
| Audio processing | ffmpeg (via fluent-ffmpeg)              | Converts/splits audio files          |
| Server tests     | Jest                                    | Unit and integration testing         |
| Client tests     | Vitest + Testing Library                | Fast Vite-native test runner         |
| Linting          | ESLint + Prettier                       | Code style and formatting            |

## How the app works (step by step)

1. **Upload** — The user picks an MP3 file. The frontend uploads it to the
   backend with a progress bar.
2. **Transcribe** — The backend splits long audio into 3-minute chunks, sends
   each chunk to Google Speech-to-Text (up to 5 at a time for speed), and
   collects the results. The frontend polls the backend every 2 seconds and
   shows "X of Y chunks completed."
3. **Display** — The finished transcription appears as a list of timestamped
   segments. Each timestamp is clickable.
4. **Summarize** — The user can click a button to send the transcription text to
   OpenAI, which returns a summary.
5. **Export** — The user can download the transcription as `.txt`, `.srt`
   (subtitle format), or copy it to the clipboard.

## Project folder structure

```
MP3-Subscribe-Pro-/
├── package.json               # Root config — defines "workspaces" for client + server
├── .env.example               # Template for secret keys (copy to .env)
├── CLAUDE.md                  # This file
├── README.md                  # User-facing getting-started guide
│
├── client/                    # FRONTEND — everything the user sees in the browser
│   ├── src/
│   │   ├── main.tsx           # Entry point — mounts the React app
│   │   ├── App.tsx            # Root component — manages which screen to show
│   │   ├── components/        # UI building blocks
│   │   │   ├── Upload.tsx         # File picker + upload progress bar
│   │   │   ├── Transcription.tsx  # Shows timestamped text + chunk progress
│   │   │   ├── Summary.tsx        # Shows the AI-generated summary
│   │   │   ├── Export.tsx         # Download/copy buttons
│   │   │   └── ErrorBoundary.tsx  # Catches React errors so the app doesn't crash
│   │   ├── hooks/             # Custom React hooks (reusable logic)
│   │   │   ├── useTranscription.ts    # Starts transcription, polls for progress
│   │   │   └── useSummarization.ts    # Requests and tracks summarization
│   │   ├── services/
│   │   │   └── api.ts         # All fetch() calls to the backend
│   │   ├── types/
│   │   │   └── index.ts       # TypeScript interfaces shared across the frontend
│   │   └── utils/
│   │       └── formatTime.ts  # Converts seconds to "MM:SS" display format
│   └── package.json
│
├── server/                    # BACKEND — runs on Node.js, handles API requests
│   ├── src/
│   │   ├── index.ts           # Starts Express, registers routes
│   │   ├── routes/            # HTTP endpoint handlers
│   │   │   ├── upload.ts          # POST /api/upload — saves the MP3 file
│   │   │   ├── transcribe.ts     # POST /api/transcribe + GET status polling
│   │   │   ├── summarize.ts      # POST /api/summarize — calls OpenAI
│   │   │   └── export.ts         # GET /api/export/:id/:format
│   │   ├── services/          # Business logic (the "brains")
│   │   │   ├── speechToText.ts    # Talks to Google Speech-to-Text
│   │   │   ├── summarizer.ts      # Talks to OpenAI
│   │   │   ├── audioProcessor.ts  # Converts MP3 to WAV, validates files
│   │   │   ├── fileManager.ts     # Saves/deletes uploaded files
│   │   │   └── jobStore.ts        # In-memory storage for transcription jobs
│   │   ├── middleware/
│   │   │   ├── errorHandler.ts    # Catches errors and returns clean JSON
│   │   │   └── rateLimiter.ts     # Prevents API abuse
│   │   ├── types/             # TypeScript interfaces for the backend
│   │   └── utils/
│   │       └── retry.ts       # Helper to retry failed API calls
│   └── package.json
```

## How to run the project

### Prerequisites

You need these installed on your computer:
- **Node.js** (version 18 or higher) — download from https://nodejs.org
- **npm** (comes with Node.js)
- **ffmpeg** — needed for audio processing
  - Windows: `winget install ffmpeg` or download from https://ffmpeg.org
  - Mac: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`

### Step 1: Install dependencies

Open a terminal in the project root folder and run:

```bash
npm install
```

This downloads all the packages the project needs. It installs packages for both
the `client/` and `server/` folders automatically (thanks to npm workspaces).

### Step 2: Set up your environment variables

Copy the example file:

```bash
cp .env.example .env
```

Then open `.env` and fill in your API keys:

```
# Google Speech-to-Text — you need a Google Cloud service account
# Option A: point to your JSON key file
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
GOOGLE_PROJECT_ID=your-project-id

# Option B: paste the entire JSON key as one line (no file needed)
# GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}

# OpenAI — get a key from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-key-here

# Server settings (these defaults are fine for development)
PORT=3001
NODE_ENV=development
UPLOAD_DIR=./tmp/uploads
MAX_FILE_SIZE_MB=100
```

**Important:** Never commit `.env` to git. It contains secret keys.

### Step 3: Start the development servers

```bash
npm run dev
```

This starts both the frontend (http://localhost:5173) and the backend
(http://localhost:3001) at the same time. Open http://localhost:5173 in your
browser to use the app.

### Other useful commands

```bash
npm test              # Run all tests (server + client)
npm run typecheck     # Check for TypeScript errors without running the code
npm run lint          # Check code style
npm run format        # Auto-fix code formatting
npm run build         # Build for production
```

## API endpoints

These are the URLs the frontend calls on the backend:

| Method | URL                          | What it does                                      |
|--------|------------------------------|---------------------------------------------------|
| POST   | `/api/upload`                | Accepts an MP3 file upload                        |
| POST   | `/api/transcribe`            | Starts a transcription job (returns a job ID)     |
| GET    | `/api/transcribe/:id/status` | Returns current progress (polled every 2 seconds) |
| POST   | `/api/summarize`             | Sends transcription text to OpenAI for summary    |
| GET    | `/api/export/:id/:format`    | Downloads the transcription as txt, srt, or json  |

## Code conventions

### TypeScript
- TypeScript is used everywhere (both frontend and backend)
- Use `interface` for object shapes (not `type`)
- Strict mode is enabled — no `any` types allowed

### React (frontend)
- Functional components only (no class components)
- Business logic goes in custom hooks (`useTranscription`, `useSummarization`)
- Components just render UI — they call hooks for data and actions
- Component files: `PascalCase.tsx` (e.g., `Upload.tsx`)
- Hook/utility files: `camelCase.ts` (e.g., `useTranscription.ts`)

### Express (backend)
- Route handlers are thin — they validate input and call service functions
- Business logic lives in `services/` (e.g., `speechToText.ts`, `summarizer.ts`)
- All routes use `try/catch` and pass errors to the error handler middleware
- Error responses always look like: `{ error: "message", details?: "extra info" }`

### Testing
- Test files live next to the code they test: `foo.ts` has `foo.test.ts`
- Server uses Jest, client uses Vitest (same syntax, different runner)
- Run `npm test` to run everything

### Git
- Commit messages use imperative mood: "Add upload endpoint" not "Added upload endpoint"
- Never commit `.env` files, API keys, or `node_modules/`

## How the transcription engine works (technical details)

### Google Speech-to-Text
- Uses the `@google-cloud/speech` library
- Short audio (<= 60 seconds): uses `recognize` (synchronous, fast)
- Long audio (> 60 seconds): uses `longRunningRecognize` (async)
- Audio is split into 3-minute chunks for reliability
- Up to 5 chunks are processed concurrently for speed
- Word-level timestamps are requested (`enableWordTimeOffsets: true`)

### OpenAI summarization
- Uses the Chat Completions API with `gpt-4o-mini`
- Long transcriptions are split into ~3500-character chunks
- Each chunk is summarized separately, then results are combined

### Audio processing
- `ffmpeg` converts MP3 to WAV (LINEAR16) when needed
- Files are validated to ensure they are real MP3s (checks MIME type)
- Temporary files are cleaned up after processing

## SRT export format

The `.srt` export looks like this (standard subtitle format):

```
1
00:00:01,000 --> 00:00:04,500
First sentence of the transcription.

2
00:00:04,500 --> 00:00:08,200
Second sentence of the transcription.
```

## Security

- File uploads are validated (type, size, content)
- `MAX_FILE_SIZE_MB` limits upload size (default: 100 MB)
- Express uses `helmet` for security headers
- API endpoints are rate-limited
- Uploaded files are cleaned up on a schedule
- API keys are never sent to the browser — all external API calls go through the backend
