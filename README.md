# MP3 Transcribe Pro

A web application that turns MP3 audio files into text. It adds timestamps so you can see when each sentence was spoken, creates summaries of the content, and lets you download the results.

## What Does This App Do?

Imagine you have a recording of a lecture, podcast, or meeting. This app will:

1. **Upload** your MP3 file through a simple drag-and-drop interface
2. **Transcribe** the audio into written text using Google's speech recognition
3. **Add timestamps** so you can see exactly when each sentence was spoken (e.g., `[00:15]`)
4. **Summarize** the full transcription into a shorter version using AI
5. **Export** the results as a text file, subtitle file, or copy it to your clipboard

## How the App Works (The Big Picture)

This app has two main parts that work together:

```
YOUR BROWSER (Frontend)          YOUR SERVER (Backend)
-----------------------          ----------------------
React app running at             Express server running at
http://localhost:5173             http://localhost:3001

You interact with this    --->   This talks to Google and
part in your browser             Hugging Face APIs for you
```

**Frontend** = what you see and click on in your browser (built with React)
**Backend** = a server running on your computer that does the heavy lifting (built with Node.js/Express)

When you click a button in the browser, it sends a request to the backend server. The server processes your audio file, talks to external AI services, and sends the results back to your browser.

### Step-by-Step User Flow

```
1. SIGN IN
   You click "Sign in with Google" --> App redirects you to Google
   --> You approve --> Google sends you back with a login token

2. UPLOAD
   You drag an MP3 file onto the page --> File gets sent to the server
   --> Server checks it's a valid MP3 --> Stores it temporarily

3. TRANSCRIBE
   Server converts MP3 to WAV format (using ffmpeg)
   --> Sends audio to Google Speech-to-Text API
   --> Gets back text with word-by-word timestamps
   --> Groups words into sentences
   --> Sends results back to your browser
   (Your browser polls the server every 2 seconds to check progress)

4. SUMMARIZE (optional)
   You click "Generate Summary" --> Server sends the text to Hugging Face AI
   --> AI creates a shorter summary --> Sends it back to your browser

5. EXPORT
   You click a download button --> Server formats the transcription
   --> You get a .txt, .srt (subtitle), or .json file
```

## Prerequisites

Before you can run this app, you need these installed on your computer:

### 1. Node.js (version 18 or newer)

Node.js lets you run JavaScript outside of a browser. It powers the backend server.

- **Check if you have it:** Open a terminal and type `node --version`
- **Install it:** Download from [nodejs.org](https://nodejs.org/) (choose the LTS version)

### 2. npm (version 9 or newer)

npm is a package manager that comes with Node.js. It installs libraries your code depends on.

- **Check if you have it:** Type `npm --version` in your terminal
- It's included when you install Node.js

### 3. ffmpeg

ffmpeg is a tool that converts audio/video files between formats. The app uses it to convert MP3 files into a format that Google's speech API can process.

- **Check if you have it:** Type `ffmpeg -version` in your terminal
- **Install on Mac:** `brew install ffmpeg`
- **Install on Ubuntu/Debian:** `sudo apt install ffmpeg`
- **Install on Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html)

### 4. Google Cloud Account (for transcription and login)

The app uses two Google services:
- **Google OAuth** lets users sign in with their Google account
- **Google Speech-to-Text** converts audio to text

You'll need to set up a Google Cloud project and get credentials. See the [Environment Variables](#environment-variables) section below.

### 5. Hugging Face Account (for summarization)

Hugging Face provides the AI model that creates text summaries.

- Create a free account at [huggingface.co](https://huggingface.co/)
- Go to Settings > Access Tokens > Create a new token
- You'll put this token in your `.env` file

## Setup

### 1. Clone the Repository

"Cloning" means downloading a copy of the code to your computer.

```bash
git clone https://github.com/wdroberts/MP3-Subscribe-Pro-.git
cd MP3-Subscribe-Pro-
```

### 2. Install Dependencies

"Dependencies" are libraries (other people's code) that this app uses. This command downloads all of them.

```bash
npm install
```

This installs packages for both the frontend and backend. It may take a minute.

### 3. Set Up Environment Variables

Environment variables are secret settings (like API keys) that shouldn't be shared publicly. They're stored in a `.env` file that is never uploaded to GitHub.

```bash
cp .env.example .env
```

Now open the `.env` file in your text editor and fill in each value:

```bash
# --- Google OAuth (for user login) ---
# Get these from Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client ID
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173

# --- Google Speech-to-Text (for transcription) ---
# Create a service account in Google Cloud Console and download the JSON key file
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
GOOGLE_PROJECT_ID=your-project-id

# --- Hugging Face (for summarization) ---
# Get this from huggingface.co > Settings > Access Tokens
HUGGINGFACE_API_KEY=your-api-key

# --- Server settings ---
PORT=3001
NODE_ENV=development

# --- File storage ---
UPLOAD_DIR=./tmp/uploads
MAX_FILE_SIZE_MB=100
```

### 4. Start the App

This starts both the frontend and backend servers at the same time:

```bash
npm run dev
```

Open your browser and go to **http://localhost:5173**

## Project Structure

Here's what each folder and file does:

```
MP3-Subscribe-Pro-/
│
├── package.json          # Lists project dependencies and available commands
├── .env.example          # Template for your secret environment variables
├── .env                  # Your actual secrets (never committed to Git)
│
├── client/               # FRONTEND - What users see in the browser
│   ├── src/
│   │   ├── main.tsx               # Starting point - mounts the React app
│   │   ├── App.tsx                # Main component - controls what page to show
│   │   │
│   │   ├── components/            # UI building blocks (each is a piece of the page)
│   │   │   ├── Login.tsx          # "Sign in with Google" button and loading state
│   │   │   ├── Upload.tsx         # Drag-and-drop area for MP3 files + progress bar
│   │   │   ├── Transcription.tsx  # Shows the transcribed text with timestamps
│   │   │   ├── Summary.tsx        # Shows the AI-generated summary
│   │   │   ├── Export.tsx         # Download buttons (TXT, SRT, JSON, clipboard)
│   │   │   └── ErrorBoundary.tsx  # Catches errors so the whole app doesn't crash
│   │   │
│   │   ├── hooks/                 # Reusable logic (React hooks)
│   │   │   ├── useAuth.ts         # Handles login, logout, and token storage
│   │   │   ├── useUpload.ts       # Manages file upload state and progress
│   │   │   ├── useTranscription.ts# Starts transcription and polls for status
│   │   │   └── useSummarization.ts# Requests and stores the summary
│   │   │
│   │   ├── services/
│   │   │   └── api.ts             # Functions that send HTTP requests to the backend
│   │   │
│   │   ├── types/
│   │   │   └── index.ts           # TypeScript type definitions (data shapes)
│   │   │
│   │   └── utils/
│   │       └── formatTime.ts      # Helper: converts seconds to "00:15" format
│   │
│   └── vite.config.ts    # Vite build tool config (proxies /api to backend)
│
└── server/               # BACKEND - Processes data and talks to external APIs
    ├── src/
    │   ├── index.ts               # Starting point - sets up Express server
    │   │
    │   ├── routes/                # URL handlers (what happens when browser sends a request)
    │   │   ├── auth.ts            # /api/auth/* - Google login flow
    │   │   ├── upload.ts          # /api/upload - Receives MP3 files
    │   │   ├── transcribe.ts      # /api/transcribe - Starts and tracks transcription
    │   │   ├── summarize.ts       # /api/summarize - Generates summaries
    │   │   └── export.ts          # /api/export - Formats and sends downloads
    │   │
    │   ├── services/              # Business logic (the "brains" of the backend)
    │   │   ├── speechToText.ts    # Talks to Google Speech-to-Text API
    │   │   ├── summarizer.ts      # Talks to Hugging Face API, chunks long text
    │   │   ├── audioProcessor.ts  # Converts MP3 to WAV using ffmpeg
    │   │   ├── fileManager.ts     # Saves, finds, and cleans up uploaded files
    │   │   └── jobStore.ts        # Tracks transcription/summary job status in memory
    │   │
    │   ├── middleware/            # Code that runs before every request
    │   │   ├── auth.ts            # Checks that the user is logged in
    │   │   ├── errorHandler.ts    # Catches errors and sends clean error responses
    │   │   └── rateLimiter.ts     # Prevents abuse (limits requests per time period)
    │   │
    │   ├── types/
    │   │   └── index.ts           # TypeScript type definitions for the backend
    │   │
    │   └── utils/
    │       ├── formatters.ts      # Formats timestamps for TXT and SRT export
    │       └── retry.ts           # Retries failed operations with increasing delays
    │
    └── tests/             # Integration and end-to-end tests
```

## Key Concepts for Beginners

### What is React?

React is a JavaScript library for building user interfaces. Instead of writing one giant HTML file, you break your page into small, reusable pieces called **components**. Each component manages its own piece of the screen.

For example, `Upload.tsx` is a component that only handles the file upload area. `Summary.tsx` only handles showing the summary. `App.tsx` decides which components to show based on the current state (logged in? file uploaded? transcription done?).

### What are Hooks?

Hooks are React functions that let components "hook into" features like state management and side effects. In this app:

- `useAuth()` manages whether the user is logged in and stores their token
- `useTranscription()` manages the transcription process and polls the server for updates
- `useSummarization()` manages requesting and displaying the summary
- `useUpload()` manages file upload state and progress

Hooks keep the logic separate from the visual components, making the code easier to organize and reuse.

### What is Express?

Express is a framework for building web servers in Node.js. It listens for HTTP requests (like when your browser asks for data) and sends back responses.

Each file in `server/src/routes/` defines what happens when the browser sends a request to a specific URL:
- `POST /api/upload` -> `upload.ts` handles it
- `POST /api/transcribe` -> `transcribe.ts` handles it
- And so on...

### What is Middleware?

Middleware is code that runs **before** your route handler. Think of it as a series of checkpoints a request must pass through:

```
Browser sends request
  --> Rate limiter (are they sending too many requests?)
  --> Auth check (are they logged in?)
  --> Route handler (do the actual work)
  --> Error handler (catch any problems)
```

### What is TypeScript?

TypeScript is JavaScript with **types**. Types describe the shape of your data. For example:

```typescript
// This says "an UploadResult must have these fields with these types"
interface UploadResult {
  id: string;           // text
  filename: string;     // text
  size: number;         // number
  duration: number;     // number
}
```

This helps catch bugs early - if you accidentally try to use a field that doesn't exist, TypeScript will warn you before you even run the code.

### What is an API?

An API (Application Programming Interface) is a way for two programs to communicate. In this app:

- The **frontend** talks to the **backend** through a REST API (HTTP requests to URLs like `/api/upload`)
- The **backend** talks to **Google Speech-to-Text** through Google's API
- The **backend** talks to **Hugging Face** through their API

Each API call sends data in a specific format (usually JSON) and gets data back.

## API Endpoints

These are the URLs the frontend uses to communicate with the backend:

| Method | URL | What It Does |
|--------|-----|-------------|
| `GET` | `/api/auth/google/url` | Gets the Google sign-in URL |
| `POST` | `/api/auth/google/callback` | Exchanges Google auth code for a login token |
| `GET` | `/api/auth/verify` | Checks if a saved login token is still valid |
| `POST` | `/api/upload` | Uploads an MP3 file to the server |
| `POST` | `/api/transcribe` | Starts transcribing an uploaded file |
| `GET` | `/api/transcribe/:id/status` | Checks how the transcription is going |
| `POST` | `/api/summarize` | Generates a summary of a transcription |
| `GET` | `/api/export/:id/:format` | Downloads results as txt, srt, or json |

**Note:** Most endpoints require you to be logged in. The server checks for a valid token in the `Authorization` header of each request.

## Available Commands

Run these from the project root directory:

| Command | What It Does |
|---------|-------------|
| `npm run dev` | Starts both frontend and backend for development |
| `npm run build` | Compiles the code for production deployment |
| `npm test` | Runs all automated tests |
| `npm run test:coverage` | Runs tests and shows how much code is tested |
| `npm run lint` | Checks code for style issues and potential bugs |
| `npm run format` | Automatically formats code to be consistent |
| `npm run typecheck` | Checks for TypeScript type errors |

You can also work with just one part:

```bash
# Frontend only
cd client && npm run dev

# Backend only
cd server && npm run dev
```

## Export Formats

When you export your transcription, you can choose from three formats:

### TXT (Plain Text)

A simple text file with timestamps at the start of each line:

```
[00:00] Welcome to today's lecture on computer science.
[00:05] We'll be covering the basics of algorithms.
[00:12] First, let's define what an algorithm is.
```

### SRT (Subtitle File)

A standard subtitle format used by video players. Each entry has a number, time range, and text:

```
1
00:00:00,000 --> 00:00:05,000
Welcome to today's lecture on computer science.

2
00:00:05,000 --> 00:00:12,000
We'll be covering the basics of algorithms.

3
00:00:12,000 --> 00:00:18,000
First, let's define what an algorithm is.
```

### JSON (Structured Data)

A machine-readable format with all metadata included. Useful for other programs:

```json
{
  "id": "abc-123",
  "segments": [
    {
      "index": 0,
      "startTime": 0,
      "endTime": 5,
      "text": "Welcome to today's lecture on computer science."
    }
  ],
  "fullText": "Welcome to today's lecture..."
}
```

## Troubleshooting

### "ffmpeg not found" error

Make sure ffmpeg is installed and accessible from your terminal. Run `ffmpeg -version` to check. If it's installed but the app can't find it, you may need to add it to your system's PATH.

### "Cannot connect to server" or API errors

- Make sure both servers are running (`npm run dev`)
- Check that your `.env` file exists and has valid values
- The frontend runs on port 5173 and the backend on port 3001 by default

### "Authentication failed" or login issues

- Verify your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
- Make sure `GOOGLE_REDIRECT_URI` matches your frontend URL exactly (`http://localhost:5173`)
- Check that you've enabled the Google OAuth API in Google Cloud Console

### Transcription returns empty or fails

- Verify your `GOOGLE_APPLICATION_CREDENTIALS` points to a valid service account JSON file
- Make sure the Speech-to-Text API is enabled in your Google Cloud project
- Check that your audio file is actually an MP3 and contains speech

### Summarization fails

- Verify your `HUGGINGFACE_API_KEY` is valid
- Hugging Face's free tier has rate limits - wait a moment and try again
- Very short transcriptions may not produce useful summaries

## Security

This app includes several security measures:

- **Authentication** - Users must sign in with Google before using the app
- **Token verification** - Every API request checks for a valid login token
- **Rate limiting** - Limits how many requests a user can make (prevents abuse)
- **File validation** - Uploaded files are checked to ensure they're real MP3 files
- **Size limits** - Files larger than 100 MB are rejected (configurable)
- **Auto-cleanup** - Uploaded files are automatically deleted after 2 hours
- **Security headers** - The server sets browser security headers via Helmet.js

**Important:** Never commit your `.env` file or any API keys to Git. The `.gitignore` file is configured to exclude these automatically.
