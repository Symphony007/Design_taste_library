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

  // Pause duration (ms) at each step to allow scroll effects to trigger
  PAUSE_PER_STEP_MS: 600,

  // Maximum time to wait for viewport images to complete loading and decoding
  IMAGE_DECODE_MAX_WAIT_MS: 800,

  // Maximum time to wait for scroll and document height to become stationary
  SETTLE_MAX_WAIT_MS: 1000,

  // Consecutive identical frames limit before stopping (handles scroll-locked / virtual-scroll pages)
  CONSECUTIVE_IDENTICAL_LIMIT: 4,

  // Moderate safety limits to prevent runaway capture on infinite-scroll pages
  SAFETY_LIMITS: {
    MAX_TOTAL_STEPS: 60,
    MAX_CAPTURE_TIME_MS: 75000, // 75 seconds
  },

  // Extra bottom frame is captured only if lastScrollY + viewportHeight < documentScrollHeight - 150
  BOTTOM_FRAME_THRESHOLD_PX: 150,

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
    QUALITY: 82,
    EFFORT: 4,
  },
} as const;

export type CaptureConfig = typeof CAPTURE_CONFIG;
