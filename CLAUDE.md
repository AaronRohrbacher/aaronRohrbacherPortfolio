# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev       # Start Next.js dev server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint

# Infrastructure (requires AWS credentials)
npx sst deploy               # Deploy to AWS (dev stage)
npx sst deploy --stage production  # Deploy to production
```

## Architecture

This is a **Next.js App Router** portfolio site deployed to **AWS via SST** (Serverless Stack).

### Routing
All pages live under `src/app/` using the Next.js App Router:
- Pages: `home`, `about`, `portfolio`, `resume`, `contact`, `admin`
- API routes: `api/contact` (Resend email), `api/ask` (OpenAI GPT-4o-mini streaming, edge runtime)
- All pages except `/admin` are wrapped in `BaseLayout`

### Key Configuration Files
- **`src/info/Info.jsx`** — Single source of truth for all personal data: name, bio, socials, skills, portfolio projects, and CSS accent colors. This is the primary file to edit for content changes.
- **`src/styles/_variables.scss`** — SCSS variables and CSS custom properties (`--accent-1`, `--accent-2`, etc.) used across components. Colors are exposed as both SCSS vars and CSS custom properties.
- **`jsconfig.json`** — Path alias `@/*` → `./src/*`

### Dark Mode
Dark mode state is managed in `BaseLayout.jsx` using `cookies-next`. It checks cookies first, falls back to `prefers-color-scheme`, and applies `darkMode`/`lightMode` CSS classes to the root container. Theme toggle is surfaced through the Navbar's Toggler component.

### AI Features
- **Floating chat (site-wide)** — `ChatAgent.jsx` + Web Worker `src/workers/ai.worker.js` (Transformers.js, ONNX instruct model in-browser). Optional API routes `api/ask` and `api/resume-ai` exist but are not wired to this chat. See **`docs/ai-chat.md`** for flow and where to edit prompts vs. canned shortcuts.

### Amazon Connect
Live chat/voice/video via AWS Connect. `AmazonConnectLoader` in root layout bootstraps the widget script. `AmazonConnect.jsx` manages the widget instance. The "Let's Chat!" button on the Home page triggers it.

### Admin Panel
`/admin` is password-protected and allows editing portfolio items. Changes persist to `localStorage`. No `BaseLayout` wrapper — it has its own layout.

### Styling Approach
Components use **SCSS Modules** (`.module.scss`) for scoped styles. Global styles and Tailwind directives are in `src/styles/globals.scss`. Material UI Grid handles responsive layout. Tailwind utilities supplement where needed. Framer Motion is used for animations on the Resume page.

### Music Section
The `/music` route (also accessible via `music.aaronrohrbacher.com` subdomain) is a music streaming/download section:
- **Subdomain routing**: `middleware.js` rewrites `music.*` requests to `/music/*` routes
- **S3 integration**: `src/lib/s3.js` connects to the `musicsforyou` bucket (us-east-2) to list and stream audio files (WAV, AIFF, MP3)
- **Track metadata**: `src/lib/trackStore.js` persists track metadata (name, description, artists, published status) to `.data/tracks.json`
- **API routes**: `/api/music/tracks` (GET/PUT), `/api/music/stream` (presigned URL redirect), `/api/music/contact` (Resend email)
- **Admin**: `/music/admin` — password-protected panel to publish/unpublish tracks, edit titles/descriptions/artists, reorder tracks
- **Public playlist**: `/music` — shows published tracks with waveform audio player (WaveSurfer.js), playlist queue, download links
- **Environment vars**: `AWS_ACCESS_KEY_ID_MUSIC`, `AWS_SECRET_ACCESS_KEY_MUSIC` for S3 access

### Deployment
SST deploys the Next.js app as an AWS Lambda function. The `sst.config.ts` sets production resources to `retain` on removal. Non-production stages are fully removed on `sst remove`.
