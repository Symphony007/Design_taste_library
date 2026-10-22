/**
 * Tunable constants for web capture.
 * Adjust these values to modify capture behavior, timing, and limits.
 */

export const CAPTURE_CONFIG = {
  // Browser viewport dimensions
  VIEWPORT: {
    width: 1440,
    height: 900,
  },

  // Maximum time (ms) to wait for initial page navigation (domcontentloaded)
  NAVIGATION_TIMEOUT_MS: 30000,

  // Maximum time (ms) to wait for network to idle after domcontentloaded.
  // Network idle can hang indefinitely on sites with persistent websockets or telemetry,
  // so we bound it with this timeout.
  NETWORK_IDLE_TIMEOUT_MS: 5000,

  // Distance in pixels to scroll per step (matches viewport height for clean tiling)
  SCROLL_STEP_PX: 900,

  // Pause duration (ms) at each step to allow lazy assets and scroll-reveals to execute
  PAUSE_PER_STEP_MS: 600,

  // Pause duration (ms) after scrolling back to top before taking full-page screenshot
  SETTLE_DELAY_MS: 1200,

  // Maximum total page height in pixels to capture (~18 full viewports at 900px)
  // Pages exceeding this will stop stepping and have their full-page screenshot capped.
  MAX_PAGE_HEIGHT_PX: 16200,

  // Relative path where screenshots are stored
  OUTPUT_DIR: "data/screenshots",
} as const;

export type CaptureConfig = typeof CAPTURE_CONFIG;
