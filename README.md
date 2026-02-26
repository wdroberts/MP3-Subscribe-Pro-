# MP3 Transcribe Pro

A web application that converts MP3 audio files into timestamped text
transcriptions with AI-powered analysis.

Upload an MP3 file, get a full transcription with clickable timestamps, extract
key points, action items, and people mentioned, and export the results.

## Features

- **MP3 Upload** with real-time progress bar
- **Speech-to-Text** transcription powered by Google Cloud
- **Clickable Timestamps** on every sentence
- **Live Progress** showing "X of Y chunks completed" during transcription
- **AI Analysis** extracts key points, action items, and people mentioned using OpenAI
- **Export** as `.txt`, `.srt` (subtitles), or copy to clipboard

## Quick Start

### What you need installed

- [Node.js](https://nodejs.org) version 18 or higher (includes npm)
- [ffmpeg](https://ffmpeg.org) for audio processing

**Install ffmpeg:**

| OS      | Command                        |
|---------|--------------------------------|
| Windows | `winget install ffmpeg`        |
| Mac     | `brew install ffmpeg`          |
| Linux   | `sudo apt install ffmpeg`      |

### 1. Clone the repository

```bash
git clone https://github.com/wdroberts/MP3-Subscribe-Pro-.git
cd MP3-Subscribe-Pro-
```

### 2. Install dependencies

```bash
npm install
```

This installs everything for both the frontend and backend automatically.

### 3. Set up your API keys

Copy the example environment file:

```bash
# Mac/Linux
cp .env.example .env

# Windows (Command Prompt)
copy .env.example .env
```

Open the `.env` file in a text editor and add your keys:

```
# Google Speech-to-Text
# You need a Google Cloud account with the Speech-to-Text API enabled.
# Create a service account and download the JSON key file.
# Learn how: https://cloud.google.com/speech-to-text/docs/before-you-begin
GOOGLE_APPLICATION_CREDENTIALS=path/to/your-service-account-key.json
GOOGLE_PROJECT_ID=your-google-project-id

# OpenAI (for the analysis feature)
# Get a key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-key-here

# You can leave the rest as defaults
PORT=3001
NODE_ENV=development
UPLOAD_DIR=./tmp/uploads
MAX_FILE_SIZE_MB=100
```

> **Note:** If you don't have Google credentials, the app will still run using
> mock transcription data so you can test the UI.

### 4. Start the app

**Windows (easiest):** Double-click `start.bat` — it installs dependencies if
needed, starts both servers, and opens the browser automatically.

**Any OS:**

```bash
npm run dev
```

This starts both servers:
- **Frontend:** http://localhost:5173 (opens automatically)
- **Backend:** http://localhost:3001

### 5. Use it

1. The browser opens automatically (or go to http://localhost:5173/api/go)
2. Click "Upload" and select an MP3 file
3. Wait for the transcription (you'll see "X of Y chunks completed")
4. Read the timestamped transcription
5. Click "Analyze" to extract key points, action items, and people mentioned
6. Click "Export" to download as `.txt` or `.srt`

## Project Structure

The project has two main parts:

```
MP3-Subscribe-Pro-/
├── client/          Frontend (React) — what you see in the browser
├── server/          Backend (Express) — handles uploads, transcription, etc.
├── package.json     Root config that ties both together
└── .env.example     Template for your secret API keys
```

**Frontend (`client/src/`):**

| File/Folder      | What it does                                           |
|------------------|--------------------------------------------------------|
| `App.tsx`        | Main app — controls which screen is shown              |
| `components/`    | UI pieces: Upload, Transcription, Summary, Export      |
| `hooks/`         | `useTranscription` and `useSummarization` — app logic  |
| `services/api.ts`| Functions that call the backend API                    |

**Backend (`server/src/`):**

| File/Folder      | What it does                                           |
|------------------|--------------------------------------------------------|
| `index.ts`       | Starts the server and serves the SPA bootstrapper      |
| `env.ts`         | Loads `.env` into `process.env`                        |
| `routes/`        | Handles HTTP requests (upload, transcribe, etc.)       |
| `services/`      | Core logic: speech-to-text, summarizer, file handling  |
| `middleware/`     | Error handling and rate limiting                       |
| `utils/`         | Export formatters (SRT, timestamped text)               |

## Available Commands

Run these from the project root folder:

| Command              | What it does                                        |
|----------------------|-----------------------------------------------------|
| `npm run dev`        | Start both frontend and backend for development     |
| `npm test`           | Run all tests                                       |
| `npm run typecheck`  | Check TypeScript types (finds errors without running)|
| `npm run lint`       | Check code style                                    |
| `npm run format`     | Auto-fix code formatting                            |
| `npm run build`      | Build for production deployment                     |

## How It Works

Here's what happens when you transcribe a file:

```
You upload an MP3
       |
       v
Backend saves the file
       |
       v
Audio is split into 55-second chunks
       |
       v
Each chunk is sent to Google Speech-to-Text
(up to 5 chunks at the same time for speed)
       |
       v
Frontend polls every 3 seconds:
"3 of 10 chunks completed"
       |
       v
All chunks done — timestamps are assembled
       |
       v
Transcription displayed with clickable timestamps
```

## Troubleshooting

**"ffmpeg not found" error:**
Make sure ffmpeg is installed and available in your PATH. Run `ffmpeg -version`
to check.

**Transcription returns mock/fake data:**
This means Google credentials are not configured. Check your `.env` file and
make sure `GOOGLE_APPLICATION_CREDENTIALS` points to a valid service account
JSON file.

**"Failed to start transcription" error:**
Make sure the backend is running (`npm run dev` should start both servers). Check
the terminal for error messages.

**Upload fails with "File too large":**
The default limit is 100 MB. You can change `MAX_FILE_SIZE_MB` in your `.env`
file.

## API Reference

If you want to call the backend directly (for testing or building other tools):

**Upload (chunked JSON — no multipart):**

| Method | Endpoint               | Body                                          | Returns                            |
|--------|------------------------|-----------------------------------------------|------------------------------------|
| POST   | `/api/process/init`    | `{ name, parts, kind }`                       | `{ sessionId }`                    |
| POST   | `/api/process/chunk`   | `{ sessionId, idx, payload }` (base64)        | `{ idx, done, total }`             |
| POST   | `/api/process/finalize`| `{ sessionId }`                               | `{ id, filename, sizeBytes, ... }` |

**Transcription, summarization, export:**

| Method | Endpoint                      | Body / Params                  | Returns                           |
|--------|-------------------------------|--------------------------------|-----------------------------------|
| POST   | `/api/transcribe`             | `{ "uploadId": "..." }`       | `{ id, status: "pending" }`       |
| POST   | `/api/transcribe/:id/status`  | `{}` (any JSON body)           | `{ status, progress, segments? }` |
| POST   | `/api/summarize`              | `{ "transcriptionId": "..." }`| `{ id, summary }`                 |
| GET    | `/api/export/:id/:format`     | format: `txt`, `srt`, or `json`| File download                    |

## License

This project is private.
