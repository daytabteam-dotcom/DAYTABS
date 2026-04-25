# DayTabs

**AI-powered video analysis for content creators.** Upload a video, get instant quality scores, editing suggestions, a publish-ready package (titles, descriptions, tags), and short clip ideas — all powered by GPT-4o and Whisper.

---

## Features

- **Video Analyzer** — Quality check, editing suggestions, publish package (SEO-ready titles/descriptions/tags), and short clip ideas for Long Video & Short Video/Reels formats
- **Script Planner** — AI chat assistant for planning and refining video scripts
- **Teleprompter** — Built-in teleprompter for reading scripts during recording
- **Dubbing** — Coming soon: AI voice dubbing into multiple languages
- **4-tier subscription plans** — Free, Creator ($19/mo), Pro ($39/mo), Studio ($89/mo) via Paddle
- **Auth** — Email/password + Google OAuth, JWT sessions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Runtime | Node.js 24, TypeScript 5.9 |
| API | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4, drizzle-zod |
| Build | esbuild |
| Frontend | React + Vite, Tailwind CSS, shadcn/ui, Framer Motion |
| AI | OpenAI — Whisper (transcription), GPT-4o Vision (quality/editing), GPT-4o (content/SEO), TTS (dubbing) |
| Video | ffmpeg |
| Payments | Paddle (live mode) |
| API codegen | Orval (from OpenAPI spec) |

---

## Project Structure

```
├── artifacts/
│   ├── api-server/       # Express REST API
│   ├── daytabs/          # Main React app  (/panel/)
│   └── landing/          # Landing page + auth gateway  (/)
├── lib/
│   ├── api-spec/         # OpenAPI spec + Orval codegen config
│   ├── api-client-react/ # Generated React Query hooks
│   ├── api-zod/          # Generated Zod schemas
│   └── db/               # Drizzle ORM schema + DB connection
└── scripts/              # Utility scripts
```

---

## Plans

| Plan | Price | Analyses/mo | Max File | Max Duration |
|---|---|---|---|---|
| Free | $0 | 3 | 200 MB | 5 min |
| Creator | $19 | 15 | 1 GB | 40 min |
| Pro | $39 | 40 | 5 GB | 2 hr |
| Studio | $89 | Unlimited | 100 GB | 3 hr |

---

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- PostgreSQL database
- ffmpeg installed on the system
- yt-dlp installed on the system (used for YouTube audio fallback transcription)

### Environment Variables

```env
DATABASE_URL=
JWT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SMTP_USER=
SMTP_PASS=
CONTACT_EMAIL=
OPENAI_API_KEY=
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
YTDLP_COOKIES_PATH=/app/secrets/youtube-cookies.txt
```

### Install & Run

```bash
# Install dependencies
pnpm install

# (Alternative) If you use npm instead of pnpm:
npm install

# Push database schema
pnpm --filter @workspace/db run push

# Start API server (dev)
pnpm --filter @workspace/api-server run dev

# Start frontend (dev)
pnpm --filter @workspace/daytabs run dev

# Start landing page (dev)
pnpm --filter @workspace/landing run dev
```

### YouTube Transcript Fallback Dependencies

Server dependencies needed outside npm:

- yt-dlp
- ffmpeg

Optional: authenticated cookies for yt-dlp (helps with IP-based bot checks)

- Do not commit `youtube-cookies.txt` to Git.

Two supported ways to provide cookies:

1) **Env var (recommended for most hosts)**
   - Set `YTDLP_COOKIES_CONTENT` to the full `cookies.txt` content
   - Set `YTDLP_COOKIES_PATH=/tmp/youtube-cookies.txt`
   - On server startup, the API will write the file and log `yt-dlp cookies file created from env`

2) **File mount (Docker/Kubernetes)**
   - Mount a cookies file (Netscape format) at `YTDLP_COOKIES_PATH` (example: `/app/secrets/youtube-cookies.txt`).
   - In Docker images built from this repo, if you mount the file at `/app/secrets/youtube-cookies.txt`, the server will auto-detect it even if you don't set `YTDLP_COOKIES_PATH`.

For Docker:

```dockerfile
RUN apt-get update && apt-get install -y ffmpeg yt-dlp \\
  && apt-get clean
```

### Codegen

```bash
# Regenerate API client + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

---

## Analysis Pipeline

1. Upload video (`POST /api/upload/*` direct upload path, up to 5 GB for Pro)
2. ffmpeg compresses + extracts audio
3. Whisper transcribes audio
4. GPT-4o analyzes quality, editing, publish package, and short clip ideas in parallel
5. Results streamed back to the client via polling

---

## License

Private — all rights reserved.
