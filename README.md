# MP3 Transcribe Pro

A web-based application that transcribes MP3 audio files, inserts time ticks, and offers text summarization.

## Features

- **MP3 Upload** — Upload audio files with a progress bar
- **Transcription** — Automatic transcription via Google Speech-to-Text
- **Time Ticks** — Clickable timestamps for each sentence/phrase
- **Summarization** — Generate long summaries via Hugging Face Transformers
- **Export** — Download as TXT, SRT, or copy to clipboard

## Prerequisites

- Node.js >= 18
- npm >= 9
- ffmpeg installed and available in PATH
- Google Cloud service account with Speech-to-Text API enabled
- Hugging Face API key

## Setup

```bash
# Clone the repository
git clone https://github.com/wdroberts/MP3-Subscribe-Pro-.git
cd MP3-Subscribe-Pro-

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Start development servers
npm run dev
```

The client runs at `http://localhost:5173` and the server at `http://localhost:3001`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both client and server in dev mode |
| `npm run build` | Build both workspaces for production |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Lint all TypeScript files |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Type-check both workspaces |

## Architecture

```
client/   — React + Vite + TypeScript frontend
server/   — Node.js + Express + TypeScript backend
```

The client proxies `/api` requests to the Express server during development. In production, the client build can be served statically from Express.
