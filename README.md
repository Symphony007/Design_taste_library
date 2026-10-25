# Taste

A local tool for UI designers to collect websites they admire as clean section screenshots plus notes, and export the library as a ready-to-use **Claude Agent Skill** so coding agents generate tasteful, distinctive interfaces instead of generic templates.

---

## What It Is

When AI coding agents design web interfaces, they often fall back on generic templates, harsh gradients, or cliché card layouts. **Taste** allows you to:
1. **Curate reference websites**: Capture sites automatically section-by-section, or bring your own screenshots via drag-and-drop, clipboard paste, or file upload.
2. **Annotate with design rationale**: Write short notes highlighting what makes each design exceptional (typography, spacing, layout, color palette).
3. **Export as an AI agent skill**: Generate a structured `designer-taste-library` folder in Claude skill format that any AI coding agent can read to guide its UI generation.

---

## Setup & Prerequisites

- **Node.js** v20+
- **npm** v10+

### Installation

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

3. **Install Chromium for Playwright**:
   ```bash
   npx playwright install chromium
   ```

---

## Running the Application

Start both the backend API and the frontend application with a single command:

```bash
npm run dev:all
```

- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3000](http://localhost:3000)

---

## How It Works

### 1. Section-by-Section Auto-Capture

Auto-capture produces clean, separate images—one per section—rather than a single giant image:
- **Headless Chromium at 1440×900**: Opens the page, settles network activity, and dismisses cookie consent dialogs.
- **Natural mouse-wheel scrolling**: Scrolls down in viewport-height steps (900px), with a brief pause for lazy content to decode and scroll animations to settle (wait capped at 2s per step; never stalls on looping canvas or video).
- **Distance-based end-of-page detection**: After capturing a section at scroll position `s`, the engine computes the remaining new content: `min(viewportHeight, docHeight - (s + viewportHeight))`.
  - If `< 150px`: Capture stops immediately.
  - If `>= 150px` and `< 900px`: The final bottom frame is captured and cropped strictly to the new content region with Sharp, ensuring zero duplicate content.
- **Scroll-lock & virtual-scroll support**: For sites where `scrollY` does not change, consecutive identical frame deduplication stops capture cleanly once the page stops updating.
- **Safety limits**: Generous limits of 200 steps and 5 minutes prevent infinite-scrolling pages from running indefinitely. If hit, the entry notes `"Stopped early after N sections; the page continued."` (or `"to avoid an endless page"` if document height kept expanding).

### 2. Bring Your Own Screenshots

Bring your own screenshots via:
- **Clipboard paste**: Press `Ctrl+V` anywhere on the page to paste captured screenshots.
- **Drag and drop**: Drop one or more image files directly onto the input zone.
- **File picker**: Click "Upload" to select multiple PNG, JPEG, or WebP files.
- **URL optional**: You can provide an optional source URL alongside uploaded screenshots.
- **Integrity verification**: All uploaded files are decoded and verified using Sharp before storage. Server-generated filenames prevent collision and path traversal.

### 3. Entry Management

- **Detail view**: View all section screenshots in order vertically.
- **Quick notes**: A focused notes panel that automatically saves on blur with a "Saved" indicator.
- **Editable title**: Click the title to edit inline; press `Enter` to save.
- **Append / Delete**: Add additional screenshots to an existing entry or delete individual section images with automatic position compaction.

### 4. Claude Agent Skill Export

Click **Export Skill** in the header or selection toolbar to package your library:
- **Scope**: Export the entire library or only selected entries.
- **Designer direction notes**: Optional high-level aesthetic notes injected directly into `SKILL.md`.
- **Image optimization**: Images are converted to max-width 1280px JPEG (quality 88, 4:4:4 chroma for crisp typography) without vertical slicing.
- **Directory structure**:
  ```text
  designer-taste-library/
  ├── SKILL.md                 # Agent instructions & optional direction notes
  ├── references/
  │   ├── index.md             # Alphabetical reference index with URLs and note snippets
  │   └── entries/
  │       └── <slug>.md        # Individual entry notes & image references
  └── assets/
      └── <slug>/
          ├── 01.jpg
          ├── 02.jpg
          └── ...
  ```

### Installing the Exported Skill

- **Claude Code**: Unzip the archive directly into your skills directory:
  ```bash
  unzip designer-taste-library.zip -d ~/.claude/skills/
  ```
  Resulting structure:
  ```text
  ~/.claude/skills/designer-taste-library/
    SKILL.md
    references/
    assets/
  ```
- **Claude App**: Add the downloaded ZIP in the application's skills settings.
