# Taste

A personal design-reference library for UI designers and developers who want to curate websites they love and turn them into structured skills for AI coding agents.

Capture websites as full-page and stepped viewport screenshots, tag and annotate them with design critiques, and export them as a ready-to-use **Claude Agent Skill** folder (`SKILL.md` + reference index + sliced images).

---

## Architecture Overview

Taste is organized as a local-first application with a decoupled backend and frontend:

```text
├── data/                      # Local SQLite DB and screenshot captures (git-ignored)
│   ├── screenshots/<id>/      # Full-page screenshot and ordered step captures
│   └── taste.db               # SQLite database
├── src/                       # Backend (Node.js + Express + TypeScript)
│   ├── capture/               # Playwright headless browser capture engine
│   │   ├── config.ts          # Viewport, scrolling, and timeout configuration
│   │   ├── cookie-dismiss.ts  # Best-effort cookie consent banner dismissal
│   │   ├── index.ts           # Capture pipeline (wheel scrolling + step captures)
│   │   └── url-safety.ts      # SSRF protection and URL validation
│   ├── db/                    # better-sqlite3 database layer
│   │   ├── entries.ts         # Entries CRUD operations
│   │   ├── index.ts           # DB schema initialization
│   │   └── settings.ts        # Designer direction notes & preferences
│   ├── services/
│   │   ├── ai-tagger-service.ts # Anthropic Vision integration for tag/category suggestions
│   │   ├── capture-service.ts   # Concurrency-controlled capture orchestration
│   │   └── export-service.ts    # Claude skill folder generator & image segmenter
│   └── server/                # Express REST API endpoints
├── web/                       # Frontend (React 19 + TypeScript + Vite + Tailwind CSS v4)
│   ├── src/
│   │   ├── api/client.ts      # Centralized API client
│   │   ├── components/        # Feature & common components (AddEntry, Library, Detail, Export)
│   │   ├── hooks/             # TanStack Query hooks (useEntries, useEntry)
│   │   └── pages/             # Route pages: Library (/) and Detail (/entry/:id)
│   └── vite.config.ts         # Vite proxying /api and /screenshots to port 3000
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
   | `ANTHROPIC_API_KEY` | Optional Anthropic API key for AI design suggestions | _None (feature disabled gracefully)_ |
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

- **Build backend**:
  ```bash
  npm run build
  ```
- **Build frontend**:
  ```bash
  cd web
  npm run build
  cd ..
  ```
- **Start compiled server**:
  ```bash
  npm run start
  ```

---

## How Website Capture Works

1. **URL Safety & SSRF Guard** (`src/capture/url-safety.ts`):
   - Only `http://` and `https://` protocols are allowed.
   - Rejects `localhost`, `.local`, loopbacks (`127.0.0.0/8`, `::1`), and RFC-1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`).
2. **Headless Browser Launch**:
   - Opens a Playwright Chromium page at 1440x900 viewport.
3. **Cookie Banner Dismissal**:
   - Attempts best-effort dismissal of common consent modals and overlays without blocking on failure.
4. **Natural Wheel Scrolling**:
   - Uses real mouse wheel events to trigger scroll-driven animations, sticky headers, and lazy-loaded assets.
5. **Dual Image Capture**:
   - Saves viewport-height stepped screenshots in scroll order (`step-000.png`, `step-001.png`, etc.).
   - Captures a complete full-page screenshot (`full.png`).

---

## How Export Works (Claude Skill Format)

Export converts the library into a structured skill directory packaged as a downloadable ZIP (`taste-skill.zip`):

```text
taste-skill/
├── SKILL.md                   # Agent frontmatter & curated instructions
├── references/
│   ├── index.md               # Table of contents grouped by category with tags
│   └── entries/
│       └── <slug>.md          # Individual entry reference, source URL, and notes
└── assets/
    └── <slug>/
        ├── full-segment-01.jpg# Sliced & downscaled full-page segments (~900px height)
        ├── full-segment-02.jpg
        └── step-01.jpg        # Resized viewport steps (1280px max width)
```

### Image Slicing & Downscaling
AI agents struggle with multi-thousand-pixel tall images. The export service:
- Slices full-page screenshots into sequential viewport segments (`full-segment-01.jpg`, `full-segment-02.jpg`).
- Downscales images to a max width of 1280px at 82% JPEG quality.
- Never mutates the original capture files.

### Designer Direction Notes
A library-level direction prompt (e.g. *"Warm, editorial aesthetic. Restrained color palette with intentional accents. Strong typographic hierarchy."*) is stored in SQLite and injected into `SKILL.md` to guide the agent on overarching taste.

---

## How to Install the Exported Skill into an Agent

Once you download `taste-skill.zip`:

1. **Extract the ZIP** into your agent's skills directory:
   - **Google Antigravity / Gemini CLI**:
     ```bash
     mkdir -p ~/.gemini/config/skills/designer-taste-library
     unzip taste-skill.zip -d ~/.gemini/config/skills/designer-taste-library
     ```
     Or inside a project workspace:
     ```bash
     mkdir -p .agents/skills/designer-taste-library
     unzip taste-skill.zip -d .agents/skills/designer-taste-library
     ```
   - **Claude Code**:
     ```bash
     mkdir -p ~/.claude/skills/designer-taste-library
     unzip taste-skill.zip -d ~/.claude/skills/designer-taste-library
     ```
2. **Prompt your agent**:
   > "Use the designer-taste-library skill to study layout, typography, and color references before building the UI for this feature."

---

## AI-Suggested Tags (Optional)

When `ANTHROPIC_API_KEY` is configured in `.env`:
- The detail page enables a **Suggest tags** button.
- Sends resized stepped screenshots to Claude Vision.
- Suggests category (from standard presets), 3–6 aesthetic tags, and a design critique.
- Suggestions **never overwrite automatically**; the designer accepts, edits, or dismisses each individually.
- If no key is configured, the UI disables the feature gracefully without throwing errors.
