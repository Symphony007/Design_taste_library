# Taste

A personal design-reference library. Paste a URL and capture the full website as screenshots, then tag, classify, and organize your inspirations.

## Project Structure

```text
├── data/
│   ├── screenshots/       # Captured screenshots directory (git-ignored)
│   └── taste.db           # SQLite database file (git-ignored)
├── public/
│   └── index.html         # Frontend static entry point
├── src/
│   ├── capture/           # Website capture orchestration (Playwright)
│   │   ├── config.ts      # Tunable capture constants (viewports, timeouts, limits)
│   │   ├── cookie-dismiss.ts # Best-effort consent banner dismissal
│   │   ├── index.ts       # Core captureUrl pipeline
│   │   ├── cli.ts         # Direct CLI runner
│   │   └── verify-playwright.ts # One-off Chromium check script
│   ├── db/
│   │   └── index.ts       # SQLite setup & auto-migration (better-sqlite3)
│   └── server/
│       └── index.ts       # Express server & API routes
├── package.json
├── tsconfig.json
└── README.md
```

## Prerequisites

- Node.js (v20+ recommended)
- npm

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Playwright's Chromium browser:
   ```bash
   npx playwright install chromium
   ```

## Running the App

- **Development server** (hot reload with `tsx`):
  ```bash
  npm run dev
  ```
  The server starts at `http://localhost:3000`.

- **Build**:
  ```bash
  npm run build
  ```

- **Production start** (runs compiled build):
  ```bash
  npm run start
  ```

- **Capture a website via CLI**:
  ```bash
  npm run capture -- https://example.com
  ```
  Saves ordered step screenshots in `data/screenshots/<id>/steps/` and full page capture in `data/screenshots/<id>/full.png`.

- **Verify Playwright browser launch**:
  ```bash
  npm run check:playwright
  ```

## API Endpoints

- `GET /api/health` - Health check returning `{ ok: true }`
- Static files served from `public/` at `/`

## Database

Uses SQLite via `better-sqlite3`. On first run, it automatically ensures `data/taste.db` exists with the `entries` table schema.
