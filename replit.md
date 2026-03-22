# DayTabs

## Overview

DayTabs is a full-stack AI-powered video analysis web application. Users upload videos (up to 1 hour/2GB), select a target platform, and receive comprehensive analysis covering video quality, content strategy, SEO metadata, and subtitles.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, Recharts, Framer Motion
- **AI**: Replit AI Integrations (OpenAI) — Whisper for transcription, GPT-5.2 Vision for visuals, GPT-5.2 for content/SEO analysis
- **Video processing**: ffmpeg (system-provided)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   ├── daytabs/            # React + Vite frontend (DayTabs core app)
│   └── landing/            # React + Vite landing page + auth gateway
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Analysis Pipeline

The backend runs a 10-step pipeline for each uploaded video:

1. **Extract audio** — ffmpeg extracts audio as MP3
2. **Extract frames** — ffmpeg extracts 1 frame per 3 seconds (max 5 frames)
3. **Transcribe** — OpenAI Whisper API (gpt-4o-mini-transcribe equivalent) — STOPS if fails
4. **Visual analysis** — OpenAI Vision (GPT-5.2) analyzes lighting, brightness, contrast, sharpness, stability, color balance, background, framing
5. **Audio analysis** — Analyzes volume, clarity (Whisper confidence), background noise, filler words
6. **Content analysis** — GPT-5.2 analyzes hooks, weak sections, improvements per platform
7. **SEO generation** — GPT-5.2 generates titles, description, hashtags, timestamps
8. **Subtitle generation** — Full transcript from Whisper with timestamps
9. **Translation** (optional) — Translates subtitles to target language
10. **Quality score** — Computed from all metrics (0-100)

## Key Files

- `artifacts/api-server/src/routes/analysis/pipeline.ts` — Main analysis pipeline
- `artifacts/api-server/src/routes/analysis/index.ts` — Upload, status, result, export endpoints
- `artifacts/daytabs/src/pages/Home.tsx` — Main page
- `artifacts/daytabs/src/hooks/use-analysis.ts` — Analysis state management
- `lib/db/src/schema/analysisJobs.ts` — Analysis jobs table

## API Endpoints

- `POST /api/analysis/upload` — Upload video (multipart/form-data)
- `GET /api/analysis/:jobId/status` — Poll analysis status
- `GET /api/analysis/:jobId/result` — Get complete results
- `POST /api/analysis/:jobId/export` — Export processed video

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit AI proxy URL (auto-provisioned)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI API key (auto-provisioned)

## Platforms Supported

- YouTube Long (`youtube_long`)
- YouTube Shorts (`youtube_shorts`)
- TikTok (`tiktok`)
- Instagram (`instagram`)
- LinkedIn (`linkedin`)
- X/Twitter (`x`)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- Run codegen: `pnpm --filter @workspace/api-spec run codegen`
- Push DB: `pnpm --filter @workspace/db run push`
- Dev API: `pnpm --filter @workspace/api-server run dev`
- Dev frontend: `pnpm --filter @workspace/daytabs run dev`
