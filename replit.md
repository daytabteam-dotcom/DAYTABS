# DayTabs

## Overview

DayTabs is a full-stack AI-powered video analysis web application. Users upload videos (up to 2GB), choose one of 4 analysis modes, and receive AI-powered insights and output. Protected by auth (email/password + Google OAuth). Subscription payments via Paddle.

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
- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, Framer Motion
- **AI**: Replit AI Integrations (OpenAI) — Whisper for transcription, GPT-4o Vision for visuals, GPT-4o for content/SEO/script, TTS for dubbing
- **Video processing**: ffmpeg (system-provided)
- **Payments**: Paddle (live mode)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   ├── daytabs/            # React + Vite frontend (DayTabs core app, /panel/)
│   └── landing/            # React + Vite landing page + auth gateway (/)
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

### Video Upload Flow
- **Single upload path**: multipart POST to `POST /api/analysis/upload` — Multer streams directly to disk at `/tmp/daytabs-uploads/`, never buffering in memory
- **No cloud storage**: Cloudflare R2 has been fully removed. Files live on the local filesystem for the duration of analysis only, then deleted
- **Large file support**: Server timeout set to 1 hour; multer hard cap is 2 GB; XHR on the frontend gives real upload progress
- **Deleted routes**: `GET /api/analysis/presign-upload` and `POST /api/analysis/start` (R2 two-step flow) are gone
- **Frontend**: `use-video-upload.ts` uses `XMLHttpRequest` directly to `/api/analysis/upload` for real `upload.onprogress` events

### Video Analyzer (`video-analyzer`) — sole unified mode
- 8-step pipeline: compress → extract audio → duration check → transcribe (single Whisper call) → quality → editing → publish → short clips
- Accepts `modules[]` (quality, editing, publish, shortClips) and `platforms[]` arrays from the client
- Result: `{ quality, editing, publish: {[platform]: seoData}, shortClips, transcript }`
- Duration limits enforced server-side before transcription
- All uploads count as `video-analyzer` mode — single unified quota per plan

### Dubbing — Coming Soon placeholder
- DubbingTab renders a waiting-list email capture; backend rejects `mode=dubbing` with 403

## Key Files

- `artifacts/api-server/src/routes/analysis/services.ts` — All AI service functions including generateShortClipIdeas, analyzeQuality, analyzeEditing, generatePublishPackage, extractAudio, getMediaDuration
- `artifacts/api-server/src/routes/analysis/pipeline.ts` — runVideoAnalyzer (8-step) + legacy mode pipelines
- `artifacts/api-server/src/routes/analysis/index.ts` — Upload, status, result, export endpoints. Plan limits: free=3, creator=15, pro=40, studio=unlimited. Duration limits: free=5min, creator=15min, pro=30min, studio=60min
- `artifacts/api-server/src/routes/script-planner/index.ts` — Chat limits: free=1 total, creator=15/month, pro=40/month, studio=unlimited. Message limits: 3 for free, 10 for paid. Model: gpt-4o for pro/studio, gpt-4o-mini for free/creator
- `artifacts/api-server/src/routes/paddle/index.ts` — PRICE_TO_PLAN maps to creator/pro/studio. Webhook + checkout-complete endpoints
- `artifacts/daytabs/src/pages/Home.tsx` — 5-tab layout: Home (dashboard), Video Analyzer, Script Planner, Teleprompter, Dubbing
- `artifacts/daytabs/src/pages/tabs/VideoAnalyzerTab.tsx` — NEW: unified video analyzer with platform + module selection
- `artifacts/daytabs/src/pages/tabs/DubbingTab.tsx` — Coming Soon placeholder with email capture
- `artifacts/daytabs/src/hooks/use-plan.ts` — Plan definitions: free/creator/pro/studio. normalizePlan, getModeLimits, getDurationLimitLabel, getFileSizeLimitLabel
- `artifacts/daytabs/src/hooks/use-paddle.ts` — PADDLE_PRICES mapped to creator/pro/studio. openCheckout helper
- `artifacts/daytabs/src/components/PlanPickerModal.tsx` — 3-plan upgrade modal (Creator/Pro/Studio)
- `artifacts/daytabs/src/hooks/use-analysis.ts` — useAnalysisPolling (refetchInterval 2s), useAnalysisResults hooks
- `lib/db/src/schema/analysisJobs.ts` — Analysis jobs table (includes mode, platforms, modules columns)

## API Endpoints

- `POST /api/analysis/upload` — Upload video (multipart/form-data, fields: video, mode, platform, audioLanguage, audioVoice, translateSubtitles, subtitleLanguage)
- `GET /api/analysis/:jobId/status` — Poll analysis status
- `GET /api/analysis/:jobId/result` — Get complete results (shape varies by mode)
- `POST /api/analysis/:jobId/export` — Export processed video (legacy/resolution export)
- `GET /api/analysis/voice-preview/:voice` — Stream AI voice sample audio
- `GET /api/analysis/download/:filename` — Download dubbed video file

## Database Schema

Table: `analysis_jobs`
- `id` (text, PK)
- `status` (text) — queued → extracting_audio → transcribing → analyzing_content → complete / error
- `progress` (real, 0–100)
- `currentStep` (text)
- `mode` (text) — pre-edit | editing | publish | dubbing
- `platform` (text) — youtube_long | youtube_shorts | tiktok | instagram | linkedin | x
- `translateSubtitles` (integer 0/1)
- `subtitleLanguage` (text, nullable)
- `replaceAudio` (integer 0/1)
- `audioLanguage` (text, nullable)
- `result` (jsonb) — mode-specific result JSON
- `videoPath` (text, nullable)
- `error` (text, nullable)
- `createdAt`, `updatedAt` (timestamp)

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit AI proxy URL (auto-provisioned)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI API key (auto-provisioned)
- `JWT_SECRET` — Session token signing
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth
- `SMTP_USER`, `SMTP_PASS`, `CONTACT_EMAIL` — Email sending
- `VITE_PADDLE_CLIENT_TOKEN` — Paddle JS client token
- `VITE_PADDLE_PRICE_PREMIUM` — Paddle price ID for Creator plan ($19/mo)
- `VITE_PADDLE_PRICE_PRO` — Paddle price ID for Pro plan ($39/mo)
- `VITE_PADDLE_PRICE_PROFESSIONAL` — Paddle price ID for Studio plan ($89/mo)
- `PADDLE_API_KEY` — Server-side Paddle API key (webhooks, cancellation, sync)

## Plans

| Plan    | Price | Analyses/mo | File Size | Duration   | Short Clips | Publish |
|---------|-------|-------------|-----------|------------|-------------|---------|
| Free    | $0    | 3           | 200 MB    | 5 min      | No          | No      |
| Creator | $19   | 15          | 500 MB    | 15 min     | Yes         | Yes     |
| Pro     | $39   | 40          | 1 GB      | 30 min     | Yes         | Yes     |
| Studio  | $89   | Unlimited   | 2 GB      | 60 min     | Yes         | Yes     |

DB stores: free / premium (→creator) / professional (→studio) / creator / pro / studio. Always run through `normalizePlan()` before limit checks.

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- Run codegen: `pnpm --filter @workspace/api-spec run codegen`
- Push DB: `pnpm --filter @workspace/db run push`
- Dev API: `pnpm --filter @workspace/api-server run dev`
- Dev frontend: `pnpm --filter @workspace/daytabs run dev`
