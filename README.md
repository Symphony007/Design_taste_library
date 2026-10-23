# Taste

A personal design-reference library for UI designers and developers who want to curate websites they love and turn them into structured skills for AI coding agents.

Capture websites as dependable full-page screenshots, annotate them with personal design notes, and export them as a ready-to-use **Claude Agent Skill** folder (`SKILL.md` + reference index + sliced images).

---

## Architecture Overview

Taste is built as a local-first application with a decoupled backend and React frontend:

```text
├── data/                          # Local SQLite DB and screenshot captures (git-ignored)
│   ├── screenshots/<id>/          # full.png and card thumb.png
│   └── taste.db                   # SQLite database (better-sqlite3)
├── src/                           # Backend (Node.js + Express + TypeScript)
│   ├── capture/                   # Playwright capture engine & Sharp stitching
│   │   ├── config.ts              # Viewport, scrolling, trust rules, and height caps
│   │   ├── cookie-dismiss.ts      # Best-effort cookie consent banner dismissal
│   │   ├── index.ts               # Dependable capture pipeline
│   │   ├── cli.ts                 # Direct CLI runner (npm run capture -- <url>)
│   │   ├── url-safety.ts          # SSRF protection and URL validation
│   │   └── verify-playwright.ts   # Playwright Chromium diagnostic check
│   ├── db/                        # Database layer
│   │   ├── entries.ts             # Entries CRUD operations
│   │   ├── index.ts               # DB schema auto-initialization
│   │   └── settings.ts            # Global designer direction notes & preferences
│   ├── services/
│   │   ├── capture-service.ts     # Concurrency-controlled capture & atomic staging swap
│   │   └── export-service.ts      # Claude skill ZIP generator & image segmenter
│   └── server/                    # Express REST API endpoints
├── web/                           # Frontend (React 19 + TypeScript + Vite + Tailwind CSS v4)
│   ├── src/
│   │   ├── api/client.ts          # Centralized API client
│   │   ├── components/            # AddEntry, Library, NotesEditor, ExportModal
│   │   ├── hooks/                 # TanStack Query hooks (useEntries, useEntry)
│   │   ├── pages/                 # Library (/) and Detail (/entry/:id)
│   │   └── index.css              # Warm archival theme tokens & Tailwind styles
│   └── vite.config.ts             # Vite dev server proxying /api and /screenshots to Express
├── scripts/
│   └── recapture-existing.ts      # One-off recapture script for existing entries
├── .env.example                   # Environment variable template
├── package.json
└── README.md
```

---

## Prerequisites

- **Node.js** v20+
- **npm** v10+
- Playwright Chromium browser installed

---

## Installation & Setup

1. **Install backend dependencies**:
   ```bash
   npm install
   ```

2. **Install frontend dependencies**:
   ```bash
   cd web
   npm install
   cd ..
   ```

3. **Install Playwright's Chromium browser**:
   ```bash
   npx playwright install chromium
   ```

4. **Environment Configuration** (optional):
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Available variables:
   | Variable | Description | Default |
   |---|---|---|
   | `PORT` | Backend Express server port | `3000` |

---

## Running the Servers

### Development (Single Command — Recommended)

Run both the Express backend and the Vite frontend concurrently with color-coded, labeled output:

```bash
npm run dev:all
```

- **Backend API**: `http://localhost:3000` (`[api]`)
- **Frontend App**: `http://localhost:5173` (`[web]`)

Pressing `Ctrl+C` will cleanly terminate both servers.

### Alternative (Two-Terminal Fallback)

If you prefer running each server in its own terminal window:

1. **Terminal 1 — Backend**:
   ```bash
   npm run dev
   ```

2. **Terminal 2 — Frontend**:
   ```bash
   cd web
   npm run dev
   ```

Open **`http://localhost:5173`** in your browser.

### Production Build

```bash
# Build backend
npm run build

# Build frontend
cd web
npm run build
cd ..

# Run compiled server (serves web/dist production bundle directly)
npm run start
```

### CLI Capture (Without Frontend)

You can capture any website directly from your terminal:
```bash
npm run capture -- https://example.com
```

---

## Core Features

### 1. Dependable Full-Page Capture
Every website produces exactly one reliable full-page image (`full.png`) and a small top-cropped card thumbnail (`thumb.png`):
- **Smooth-Scroll & Motion Settle**: Emulates real mouse-wheel input and waits for smooth-scroll libraries and animations to settle.
- **Native Trust Evaluation**: Validates the native full-page capture against measured document height and a region-by-region content check.
- **Sharp Stitching Engine**:
  - **Scrolling Sites**: Overlays frames at their recorded scroll offsets, hiding fixed/sticky navigation elements after frame 1 to avoid repeated headers.
  - **Scroll-Locked / Virtual Sites**: Evaluates frame differences with block-level comparison, discards static/duplicate states, and stacks unique views sequentially.
- **Height Caps**: Applies a Chromium native cap (16,200px) and a higher stitched cap (32,000px) so long sites are never truncated.
- **Atomic Swap on Recapture**: Staged captures are verified before swapping in, ensuring a failed capture never corrupts existing screenshots.

### 2. Notes-Only Detail Page
- Focused, distraction-free view showing the full-page capture, source link, captured date, and notes panel.
- Plain textarea titled **Notes** for recording architectural, typographic, or layout observations.
- Auto-saves on blur with subtle visual status feedback (*Saving...* / *Saved*).

### 3. Library Grid & Multi-Select Export
- Responsive card grid displaying card thumbnails, hostname, and short notes preview.
- Multi-select checkboxes for batch-exporting selected references into a custom agent skill.

### 4. Claude Agent Skill Export
Turn your curated references into a ZIP bundle (`taste-skill.zip`) structured specifically for AI coding agents:

```text
taste-skill.zip
└── designer-taste-library/
    ├── SKILL.md                     # Agent frontmatter & instructions
    ├── references/
    │   ├── index.md                 # Flat reference index
    │   └── entries/
    │       └── <slug>.md            # Source URL, designer notes, sliced visuals
    └── assets/
        └── <slug>/
            ├── full-segment-01.jpg  # Sliced full-page segments (~900px height)
            └── full-segment-02.jpg
```

- **Anthropic ZIP Compliance**: All skill files are nested under the required single root folder (`designer-taste-library/`).
- **Image Slicing**: Slices long full-page screenshots into manageable segments for AI vision ingestion.
- **Optional Direction Notes**: Injects high-level design principles into `SKILL.md` (omitted if left empty).

---

## Installing the Exported Skill into an Agent

### Claude Desktop App
1. Ensure code execution and skill capabilities are enabled in your Claude settings.
2. In the Claude Desktop sidebar, open **Customize** (or **Skills**).
3. Click **Upload a skill** and select the downloaded `taste-skill.zip`.
4. Toggle the skill **On** in your skill list.

### Claude Code CLI
Extract directly into your Claude skills directory:
```bash
mkdir -p ~/.claude/skills
unzip taste-skill.zip -d ~/.claude/skills
```

### Google Antigravity / Gemini CLI
Extract to global customizations:
```bash
mkdir -p ~/.gemini/config/skills
unzip taste-skill.zip -d ~/.gemini/config/skills
```
Or project-level:
```bash
mkdir -p .agents/skills
unzip taste-skill.zip -d .agents/skills
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check endpoint (`{ ok: true }`) |
| `GET` | `/api/entries` | List all library entries |
| `POST` | `/api/entries` | Capture and save a new entry (`{ url: string, force?: boolean, notes?: string }`) |
| `GET` | `/api/entries/:id` | Fetch single entry |
| `PATCH` | `/api/entries/:id` | Update entry notes (`{ notes?: string }`) |
| `DELETE` | `/api/entries/:id` | Delete entry from database and remove its screenshot folder |
| `POST` | `/api/export` | Download Claude skill ZIP (`{ scope, entryIds?, directionNotes? }`) |
| `GET` | `/api/settings/direction-notes` | Fetch global designer direction notes |
| `PATCH` | `/api/settings/direction-notes` | Update global designer direction notes |
| `GET` | `/screenshots/*` | Serve captured screenshot assets statically |
