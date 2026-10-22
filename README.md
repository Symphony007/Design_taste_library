# Taste

A personal design-reference library for UI designers and developers who want to curate websites they love and turn them into structured skills for AI coding agents.

Capture websites as full-page and stepped viewport screenshots, tag and annotate them with design critiques, and export them as a ready-to-use **Claude Agent Skill** folder (`SKILL.md` + reference index + sliced images).

---

## Architecture Overview

Taste is built as a local-first application with a decoupled backend and React frontend:

```text
├── data/                          # Local SQLite DB and screenshot captures (git-ignored)
│   ├── screenshots/<id>/          # Full-page screenshot and ordered step captures
│   └── taste.db                   # SQLite database (better-sqlite3)
├── src/                           # Backend (Node.js + Express + TypeScript)
│   ├── capture/                   # Playwright headless browser capture engine
│   │   ├── config.ts              # Viewport, scrolling, and timeout configuration
│   │   ├── cookie-dismiss.ts      # Best-effort cookie consent banner dismissal
│   │   ├── index.ts               # Capture pipeline (wheel scrolling + step captures)
│   │   ├── cli.ts                 # Direct CLI runner (npm run capture -- <url>)
│   │   ├── url-safety.ts          # SSRF protection and URL validation
│   │   └── verify-playwright.ts   # Playwright Chromium diagnostic check
│   ├── db/                        # Database layer
│   │   ├── entries.ts             # Entries CRUD operations
│   │   ├── index.ts               # DB schema auto-initialization
│   │   └── settings.ts            # Designer direction notes & preferences
│   ├── services/
│   │   ├── ai-tagger-service.ts   # Anthropic Vision integration for tag/category suggestions
│   │   ├── capture-service.ts     # Concurrency-controlled capture orchestration
│   │   └── export-service.ts      # Claude skill folder generator & image segmenter
│   └── server/                    # Express REST API endpoints
├── web/                           # Frontend (React 19 + TypeScript + Vite + Tailwind CSS v4)
│   ├── src/
│   │   ├── api/client.ts          # Centralized API client
│   │   ├── components/            # Feature components (AddEntry, Library, Detail, Export)
│   │   ├── hooks/                 # TanStack Query hooks (useEntries, useEntry)
│   │   ├── pages/                 # Route pages: Library (/) and Detail (/entry/:id)
│   │   └── index.css              # Warm archival theme tokens & Tailwind styles
│   └── vite.config.ts             # Vite dev server proxying /api and /screenshots to Express
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
   | `ANTHROPIC_API_KEY` | Optional Anthropic API key for AI design suggestions | _None (gracefully disabled)_ |
   | `ANTHROPIC_MODEL` | Vision model used for design critique | `claude-3-5-sonnet-20241022` |

---

## Running the Servers

Start both servers concurrently during development:

1. **Backend Server** (runs on `http://localhost:3000`):
   ```bash
   npm run dev
   ```

2. **Frontend App** (runs on `http://localhost:5173`):
   ```bash
   cd web
   npm run dev
   ```

Open **`http://localhost:5173`** in your browser. All API requests and screenshot media are automatically proxied to the backend.

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

### 1. Website Capture & URL Safety
- **SSRF Protection** (`src/capture/url-safety.ts`): Strictly allows `http://` and `https://` protocols while rejecting `localhost`, loopbacks (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`), and private RFC-1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- **Simulated Wheel Scrolling**: Emulates mouse-wheel scrolling so scroll-driven animations, sticky elements, and lazy images load naturally.
- **Cookie Banner Dismissal**: Best-effort suppression of cookie banners and consent overlays.
- **Dual Screen Recording**: Saves both a full-page stitched capture and an ordered sequence of viewport steps (`step-000.png`, `step-001.png`, etc.).

### 2. Multi-Select & Filter Bar
- Filter entries instantly by category and tag chips.
- Hover over any card to select multiple references with checkboxes.
- A docked bottom toolbar displays the selection count, with quick actions to **Select all**, **Clear**, or **Export Skill** for the selected items.

### 3. Detail Page & In-Place Metadata Editor
- Toggle between **Full Page** view and **Steps** view (vertical sequence).
- Edit **Category** (with quick-select standard chips: *portfolio, SaaS/product landing, e-commerce, editorial/blog, agency, dashboard/product UI, personal site, experimental*).
- Add and remove tags with instant keyboard shortcuts (`Enter`).
- Rich notes textarea for architectural and typographic observations, with auto-save and clear visual feedback (*Saving...* / *Saved*).
- Safe deletion with confirmation modal that removes database records and disk images.

### 4. Claude Agent Skill Export
Turn your curated references into a ZIP bundle (`taste-skill.zip`) designed specifically for AI coding agents:

```text
taste-skill/
├── SKILL.md                     # Agent frontmatter & curated instructions
├── references/
│   ├── index.md                 # Category-grouped table of contents with tags
│   └── entries/
│       └── <slug>.md            # Individual entry design critiques, source URL, notes
└── assets/
    └── <slug>/
        ├── full-segment-01.jpg  # Sliced & downscaled full-page segments (~900px height)
        ├── full-segment-02.jpg
        └── step-01.jpg          # Resized viewport steps (1280px max width)
```

- **Image Slicing**: Full-page captures are sliced into sequential viewport segments (`full-segment-01.jpg`, etc.) so coding agents do not choke on massive images.
- **Downscaling**: Images are converted to web-optimized JPEGs with a 1280px max width limit.
- **Designer Direction Notes**: Injects your high-level taste criteria (e.g. *"Warm, editorial aesthetic. Restrained color palette. Strong typographic hierarchy."*) into `SKILL.md`.
- **Flexible Scope**: Export all entries, filtered entries, or selected entries.

### 5. AI-Suggested Tags & Visual Critique (Optional)
When `ANTHROPIC_API_KEY` is provided:
- The detail page offers a **Suggest tags** button using Claude Vision.
- Analyzes entry screenshots and proposes categories, 3–6 aesthetic tags, and a succinct design critique.
- **Non-destructive**: Suggestions never overwrite metadata automatically; designers accept, edit, or dismiss each suggestion individually.

---

## Installing the Exported Skill into an Agent

After downloading `taste-skill.zip`:

1. **Extract the ZIP** into your AI agent's skills directory:
   - **Google Antigravity / Gemini CLI**:
     ```bash
     mkdir -p ~/.gemini/config/skills/designer-taste-library
     unzip taste-skill.zip -d ~/.gemini/config/skills/designer-taste-library
     ```
     Or project-level:
     ```bash
     mkdir -p .agents/skills/designer-taste-library
     unzip taste-skill.zip -d .agents/skills/designer-taste-library
     ```
   - **Claude Code**:
     ```bash
     mkdir -p ~/.claude/skills/designer-taste-library
     unzip taste-skill.zip -d ~/.claude/skills/designer-taste-library
     ```

2. **Invoke in your coding prompt**:
   > "Use the designer-taste-library skill to study layout, typography, and color references before building the UI for this feature."

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check endpoint (`{ ok: true }`) |
| `GET` | `/api/entries` | List all entries (supports `?category=` and `?tag=` query params) |
| `POST` | `/api/entries` | Capture and save a new entry (`{ url: string, force?: boolean }`) |
| `GET` | `/api/entries/:id` | Fetch single entry with ordered step image URLs |
| `PATCH` | `/api/entries/:id` | Update entry metadata (`{ category?: string, tags?: string[], notes?: string }`) |
| `DELETE` | `/api/entries/:id` | Delete entry from database and remove its screenshot folder from disk |
| `POST` | `/api/export` | Generate and download Claude skill ZIP (`{ scope, category?, tag?, entryIds?, directionNotes? }`) |
| `GET` | `/api/settings/direction-notes` | Fetch global designer direction notes |
| `PATCH` | `/api/settings/direction-notes` | Update global designer direction notes |
| `GET` | `/api/ai/status` | Check if Anthropic Vision integration is configured |
| `POST` | `/api/entries/:id/ai-suggest` | Generate AI category, style tags, and critique for an entry |
| `GET` | `/screenshots/*` | Serve captured screenshot assets statically |
