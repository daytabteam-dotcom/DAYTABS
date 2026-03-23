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

## 4 Analysis Pipeline Modes

Each uploaded video is processed through ONE of 4 mode-specific pipelines:

### 1. Pre-Edit (`pre-edit`)
- Extract audio → transcribe → extract frames (max 5) → visual analysis → audio analysis → script feedback
- Result: `{ quality: { score, lighting, brightness, … audioClarity, fillerWords, … }, scriptFeedback: { hookSuggestions, weakSections, improvedScript } }`

### 2. Editing (`editing`)
- Extract audio → transcribe → identify editing points (hooks, cuts, short-form segments)
- Result: `{ hooks, removeSections, shortVideos, editingSuggestions, transcript }`

### 3. Publish (`publish`)
- Extract audio → transcribe → generate SEO → generate SRT subtitle file → optional translation
- Result: `{ platform, titles, description, hashtags, timestamps, subtitleFile: { format, language, content } }`

### 4. Dubbing (`dubbing`)
- Extract audio → transcribe → translate → TTS (chunked) → ffmpeg merge → download link
- Result: `{ translatedLanguage, voice, downloadUrl, filename }`

## Key Files

- `artifacts/api-server/src/routes/analysis/services.ts` — Shared service functions (extractAudio, extractFrames, transcribeAudio, analyzeVisuals, analyzeAudio, analyzeScriptFeedback, analyzeEditingPoints, generateSeo, generateSrt, translateSegments, computeQualityScore)
- `artifacts/api-server/src/routes/analysis/pipeline.ts` — Mode dispatcher + 4 sub-pipelines
- `artifacts/api-server/src/routes/analysis/index.ts` — Upload, status, result, export, voice-preview, download endpoints
- `artifacts/daytabs/src/pages/Home.tsx` — 4-tab layout (Pre-Edit, Editing, Publish, Dubbing)
- `artifacts/daytabs/src/pages/tabs/PreEditTab.tsx` — Upload + quality + script feedback results
- `artifacts/daytabs/src/pages/tabs/EditingTab.tsx` — Upload + hooks/cuts/segments results
- `artifacts/daytabs/src/pages/tabs/PublishTab.tsx` — Upload + platform + SEO/SRT results
- `artifacts/daytabs/src/pages/tabs/DubbingTab.tsx` — Upload + language/voice + download
- `artifacts/daytabs/src/components/TabUpload.tsx` — Shared dropzone upload component
- `artifacts/daytabs/src/hooks/use-analysis.ts` — useAnalysisPolling, useAnalysisResults hooks
- `lib/db/src/schema/analysisJobs.ts` — Analysis jobs table (includes `mode` column)

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
- `VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_PRICE_FREE`, `VITE_PADDLE_PRICE_PREMIUM`, `VITE_PADDLE_PRICE_PRO` — Paddle payments

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- Run codegen: `pnpm --filter @workspace/api-spec run codegen`
- Push DB: `pnpm --filter @workspace/db run push`
- Dev API: `pnpm --filter @workspace/api-server run dev`
- Dev frontend: `pnpm --filter @workspace/daytabs run dev`
