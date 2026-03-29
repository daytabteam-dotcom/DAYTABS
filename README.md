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
| Creator | $19 | 15 | 500 MB | 15 min |
| Pro | $39 | 40 | 1 GB | 30 min |
| Studio | $89 | Unlimited | 2 GB | 60 min |

---

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- PostgreSQL database
- ffmpeg installed on the system

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
```

### Install & Run

```bash
# Install dependencies
pnpm install

# Push database schema
pnpm --filter @workspace/db run push

# Start API server (dev)
pnpm --filter @workspace/api-server run dev

# Start frontend (dev)
pnpm --filter @workspace/daytabs run dev

# Start landing page (dev)
pnpm --filter @workspace/landing run dev
```

### Codegen

```bash
# Regenerate API client + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

---

## Analysis Pipeline

1. Upload video (`POST /api/analysis/upload`, up to 2 GB)
2. ffmpeg compresses + extracts audio
3. Whisper transcribes audio
4. GPT-4o analyzes quality, editing, publish package, and short clip ideas in parallel
5. Results streamed back to the client via polling

---

## License

Private — all rights reserved.
