/**
 * Tunable constants for web capture and image stitching.
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

  // Distance in pixels to scroll per step (matches viewport height for clean tiling)
  SCROLL_STEP_PX: 900,

  // Pause duration (ms) at each step to allow lazy assets and scroll-reveals to execute
  PAUSE_PER_STEP_MS: 600,

  // Pause duration (ms) after scrolling back to top before taking full-page screenshot
  SETTLE_DELAY_MS: 1200,

  // Maximum height cap for Chromium native full-page screenshots (in pixels)
  MAX_PAGE_HEIGHT_PX: 16200,

  // Higher height cap for stitched screenshots (~35 full screens at 900px)
  MAX_STITCHED_PAGE_HEIGHT_PX: 32000,

  // Relative path where screenshots are stored
  OUTPUT_DIR: "data/screenshots",

  // Criteria for validating whether Chromium's native full-page capture is trustworthy
  NATIVE_TRUST: {
    // Scroll distance (px) above which the document is confirmed to genuinely scroll
    SCROLL_DETECT_THRESHOLD_PX: 50,
    // Minimum ratio of native screenshot height to measured document scrollHeight
    MIN_DOC_HEIGHT_RATIO: 0.85,
    // Maximum allowable mean grayscale pixel difference between a step region and the native capture
    STEP_REGION_MAX_DIFF: 0.25,
    // Maximum ratio of mismatched step regions before the native capture is declared untrusted
    MAX_MISMATCHED_REGIONS_RATIO: 0.20,
  },

  // Parameters for Sharp-based step frame stitching and duplicate detection
  STITCHING: {
    // Dimensions used for downscaled frame similarity checks
    FRAME_THUMBNAIL_WIDTH: 160,
    FRAME_THUMBNAIL_HEIGHT: 100,
    // Grid block size for max block difference calculation
    BLOCK_SIZE_X: 16,
    BLOCK_SIZE_Y: 10,
    // Maximum block difference threshold to classify a frame as distinct (vs. duplicate)
    MAX_BLOCK_DIFF_THRESHOLD: 0.08,
    // Output dimensions for card thumbnails
    THUMBNAIL_WIDTH: 720,
    THUMBNAIL_HEIGHT: 450,
  },
} as const;

export type CaptureConfig = typeof CAPTURE_CONFIG;
