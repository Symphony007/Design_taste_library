/**
 * Tunable constants for section-by-section auto-capture.
 */

export const CAPTURE_CONFIG = {
  // Browser viewport dimensions
  VIEWPORT: {
    width: 1440,
    height: 900,
  },

  // Maximum time (ms) to wait for initial page navigation (domcontentloaded)
  NAVIGATION_TIMEOUT_MS: 30000,

  // Maximum time (ms) to wait for network to idle after domcontentloaded
  NETWORK_IDLE_TIMEOUT_MS: 5000,

  // Distance in pixels to scroll per step (matches viewport height for clean section tiling)
  SCROLL_STEP_PX: 900,

  // Pause duration (ms) after scrolling before taking the screenshot
  PAUSE_PER_STEP_MS: 400,

  // Strict cap on total wait time per step (scroll + settle + image decode combined)
  MAX_STEP_WAIT_MS: 2000,

  // Fast check: maximum time (ms) to wait for uncompleted viewport images to decode
  IMAGE_DECODE_MAX_WAIT_MS: 250,

  // Fast check: maximum time (ms) to wait for document scroll to settle
  SETTLE_MAX_WAIT_MS: 350,

  // Minimum height (px) of new content required for a final cropped frame
  NEW_CONTENT_MIN_PX: 150,

  // Consecutive identical frames limit before stopping (handles scroll-locked / virtual-scroll pages)
  CONSECUTIVE_IDENTICAL_LIMIT: 4,

  // Safety limits to prevent infinite-scroll pages from capturing forever
  SAFETY_LIMITS: {
    MAX_TOTAL_STEPS: 200,          // Up to 200 steps
    MAX_CAPTURE_TIME_MS: 300000,   // 5 minutes (300,000 ms)
  },

  // Parameters for downscaled grayscale block difference comparison
  DEDUPLICATION: {
    THUMB_WIDTH: 160,
    THUMB_HEIGHT: 100,
    BLOCK_SIZE_X: 16,
    BLOCK_SIZE_Y: 10,
    // Strict threshold: changes in small text or UI badges register as distinct (> 0.05)
    DIFF_THRESHOLD: 0.05,
  },

  // Compression format for stored sections
  IMAGE_FORMAT: {
    QUALITY: 92,
    EFFORT: 3,
  },
} as const;

export type CaptureConfig = typeof CAPTURE_CONFIG;
