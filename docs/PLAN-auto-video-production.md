# PLAN - Auto Video Production System

## Overview
This project builds an automated video production system on macOS M1. The system allows users to enter a product name and URL, automatically scrapes the product data, writes a video script, generates voiceover (ElevenLabs), generates images/videos (Nano banana & Veo 3/Omni), and compiles them into a final video file using FFmpeg. Additionally, users can upload a competitor's video (or provide a link), and the system will transcribe and analyze it using Gemini 3.1 Flash Lite to suggest a similar successful content direction.

## Project Type
- **WEB** (Next.js web app running locally on M1 macOS, executing background worker scripts for heavy media operations)

## Success Criteria
- Fully automated pipeline from product name/link to a rendered MP4 file.
- Competitor video processing: extraction of script, hook, and format from uploaded video or link.
- Modern local dashboard (Next.js) for input, status tracking, previewing kịch bản (scripts), and editing media assets before the final compilation.
- Successful video assembly with synchronized voiceover and visuals using FFmpeg.

## Tech Stack
- **Frontend / Core Dashboard:** Next.js (App Router, vanilla CSS) running on `localhost:3000`.
- **Backend / Workers:** Node.js (Next.js API routes) + Python/Node.js helper scripts.
- **Scraper:** Playwright (headless browser) to handle anti-bot and dynamically loaded product pages.
- **AI Models:**
  - Content Scraping, Transcription, Analysis, and Script Writing: **Gemini 3.1 Flash Lite**
  - Image Generation: **Nano banana** (Imagen API wrapper)
  - Video Clip Generation: **Veo 3 / Omni**
  - TTS/Voiceover: **ElevenLabs API**
- **Video Processing Engine:** **FFmpeg** (installed locally via Homebrew)
- **Downloader:** **yt-dlp** (for fetching competitor videos from links)

## File Structure
```
/Users/lechsangphai/Auto-Video-Production/
├── .grapuco/                   # Grapuco configuration
├── .agent/                     # Antigravity Kit (workflows, skills)
├── docs/
│   └── PLAN-auto-video-production.md  # This plan file
├── src/
│   ├── app/                    # Next.js pages & dashboard
│   │   ├── page.tsx            # Main Dashboard UI
│   │   └── api/                # API Endpoints
│   │       ├── analyze/        # Scrape and analyze product or competitor video
│   │       ├── generate/       # Invoke ElevenLabs, Nano Banana, Veo 3
│   │       └── compile/        # Call FFmpeg to render video
│   ├── components/             # Reusable UI components
│   │   ├── Dashboard.tsx       # Dashboard layout
│   │   ├── PipelineStatus.tsx  # Step-by-step progress component
│   │   └── ScriptEditor.tsx    # Preview and edit generated script
│   └── services/               # Core services
│       ├── scraper.ts          # Playwright scraper logic
│       ├── gemini.ts           # Gemini 3.1 Flash Lite API wrapper
│       ├── media.ts            # ElevenLabs, Nano Banana, Veo 3 integration
│       └── ffmpeg.ts           # FFmpeg video compiler executor
├── public/                     # Output videos and cached media assets
└── package.json                # Dependencies and npm run dev scripts
```

## Task Breakdown

### Phase 1: Foundation & Setup
#### `[x]` Task 1: Initialize Next.js App
- **Agent:** `frontend-specialist`
- **Skills:** `clean-code`, `app-builder`
- **Priority:** P0
- **Dependencies:** None
- **INPUT:** Empty workspace
- **OUTPUT:** Functional Next.js boilerplate with standard folder structure and packages installed (`@google/genai`, `playwright`, `fluent-ffmpeg`, etc.)
- **VERIFY:** Run `npm run dev` and confirm server starts on `localhost:3000`.

#### `[x]` Task 2: Environment Configuration & API Wrappers
- **Agent:** `backend-specialist`
- **Skills:** `clean-code`, `api-patterns`
- **Priority:** P0
- **Dependencies:** Task 1
- **INPUT:** `.env` file templates
- **OUTPUT:** Environment variables configuration and modular API clients for Gemini 3.1 Flash Lite (using `@google/genai`), ElevenLabs, and Omni/Veo.
- **VERIFY:** Run a quick scratch test script (`scratch/test-gemini.js`) to query Gemini 3.1 Flash Lite.

---

### Phase 2: Core Scraping & Audio/Video Analysis
#### `[x]` Task 3: Product Data Scraper (Playwright)
- **Agent:** `backend-specialist`
- **Skills:** `clean-code`
- **Priority:** P1
- **Dependencies:** Task 2
- **INPUT:** Product URL (e.g., Shopee, Amazon, or standard landing page)
- **OUTPUT:** Service that launches Playwright, extracts title, specs, and reviews, and formats it for Gemini.
- **VERIFY:** Run a test scraping command on a dummy product URL and check output JSON format.

#### `[x]` Task 4: Competitor Video / Link Processor (yt-dlp & FFmpeg)
- **Agent:** `backend-specialist`
- **Skills:** `clean-code`
- **Priority:** P1
- **Dependencies:** Task 2
- **INPUT:** Competitor video upload or URL link
- **OUTPUT:** Handler that downloads the video using `yt-dlp` (if url), extracts audio track using FFmpeg as a lightweight MP3.
- **VERIFY:** Test with a sample link/video and verify the generated `.mp3` is successfully saved under `public/temp/`.

#### `[x]` Task 5: AI Script Writer & Analysis (Gemini 3.1 Flash Lite)
- **Agent:** `backend-specialist`
- **Skills:** `clean-code`
- **Priority:** P1
- **Dependencies:** Task 3, Task 4
- **INPUT:** Product scraped data, competitor script analysis (if uploaded)
- **OUTPUT:** Prompts and wrapper to make Gemini 3.1 Flash Lite analyze competitor audio, extract kịch bản structure, and write a new optimized Vietnamese script with timestamps.
- **VERIFY:** Validate output JSON contains correct fields: `title`, `hook`, `scenes` (with scene script and visual prompt).

---

### Phase 3: Media Asset Generation & Compiling
#### `[x]` Task 6: Voiceover Generation (ElevenLabs)
- **Agent:** `backend-specialist`
- **Skills:** `clean-code`
- **Priority:** P2
- **Dependencies:** Task 5
- **INPUT:** Text script scenes
- **OUTPUT:** Generation of MP3 voiceover files using ElevenLabs TTS, returning audio path and audio duration.
- **VERIFY:** Check if generated MP3 files exist and play correctly with valid audio content.

#### `[x]` Task 7: Visual Generation (Nano Banana & Veo 3 / Omni)
- **Agent:** `backend-specialist`
- **Skills:** `clean-code`
- **Priority:** P2
- **Dependencies:** Task 5
- **INPUT:** Image and video prompts from Gemini
- **OUTPUT:** Code to call Imagen (Nano banana) for high-quality static frames, and Veo 3 / Omni for short video clips, saving them locally.
- **VERIFY:** Verify the generated assets are saved in `public/assets/` and can be opened as images/videos.

#### `[x]` Task 8: Video Compilation Engine (FFmpeg)
- **Agent:** `backend-specialist`
- **Skills:** `clean-code`
- **Priority:** P2
- **Dependencies:** Task 6, Task 7
- **INPUT:** Audio files, images, videos, and scene timestamps
- **OUTPUT:** FFmpeg command generator that stitches images, video clips, and audio tracks together, overlays subtitle captions, and exports a final `.mp4`.
- **VERIFY:** Execute compiler and verify output video plays successfully with synchronous audio and video transitions.

---

### Phase 4: UI Dashboard & Frontend Integration
#### `[x]` Task 9: Premium Dashboard Interface
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`
- **Priority:** P3
- **Dependencies:** Task 1, Task 8
- **INPUT:** Figma-like design concept (minimal dark mode, glassmorphism, responsive grid)
- **OUTPUT:** A beautiful React page with input form (link/name), competitor file upload, pipeline stage tracker, and interactive script/image editor before final rendering.
- **VERIFY:** Verify visual quality and compliance with design guidelines (no default browser styling, smooth animations).

#### `[x]` Task 10: API Integration & E2E Flow
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `clean-code`
- **Priority:** P3
- **Dependencies:** Task 9
- **INPUT:** Next.js pages and API endpoints
- **OUTPUT:** Full hookup of frontend inputs to backend pipeline endpoints, with real-time websocket/SSE progress updates.
- **VERIFY:** Input a test product link, watch the pipeline run, modify the kịch bản in the preview editor, and compile a final video.

---

## Phase X: Final Verification

```bash
# 1. Run all checks
python .agent/scripts/verify_all.py . --url http://localhost:3000

# 2. Build Check
npm run build

# 3. Accessibility & UX Audit
python .agent/skills/frontend-design/scripts/ux_audit.py .
```

- [ ] No purple/violet hex codes used in styling.
- [ ] No generic layouts or bootstrap-like UI templates.
- [ ] All features (scraping, competitor upload, voice, video gen, FFmpeg compile) fully verified on macOS M1.

---
## ✅ PHASE X COMPLETE
- Lint: ✅ Pass
- Security: ✅ Pass
- Build: ✅ Pass
- Date: 2026-05-27
