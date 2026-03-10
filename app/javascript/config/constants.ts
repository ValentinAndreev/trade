// Data loading
export const CANDLE_LIMIT = 1500
export const HISTORY_LOAD_LIMIT = 500
export const LOAD_MORE_THRESHOLD = 50
export const DEFAULT_VISIBLE_BARS = 100

// Timing
export const RECOMPUTE_DEBOUNCE_MS = 500
export const RECONNECT_DELAY_MS = 3000
export const TOAST_DURATION_MS = 3000
export const TOAST_FADE_MS = 300
export const TICKER_POLL_INTERVAL_MS = 60000
export const PING_INTERVAL_MS = 5000
export const PING_TIMEOUT_MS = 3000
export const LABEL_BLUR_DELAY_MS = 150

// Volume profile
export const VP_DEFAULT_OPACITY = 0.3
export const VP_DEFAULT_ROWS = 50
export const VP_BASE_COLOR = "#2962FF"
export const VP_DEFAULT_BIN_PX = 4
export const VP_BAR_WIDTH_RATIO = 0.25

// Chart scale
export const CHART_SCALE_MARGIN = 0.05

// Drawing defaults
export const DEFAULT_LINE_COLOR = "#2196f3"
export const DEFAULT_GUIDE_COLOR = "#ff9800"
export const DEFAULT_LABEL_COLOR = "#ffffff"
export const DEFAULT_TREND_WIDTH = 2
export const ENDPOINT_RADIUS = 3
export const TREND_PREVIEW_DASH = [5, 4] as const

// Panel
export const PANEL_MIN_HEIGHT_PX = 40

// Sparkline
export const SPARKLINE_UP_COLOR = "#4ade80"
export const SPARKLINE_DOWN_COLOR = "#f87171"
export const SPARKLINE_WIDTH = 80
export const SPARKLINE_HEIGHT = 48
export const SPARKLINE_PADDING = 4

// Connection status
export const CONNECTION_ONLINE_COLOR = "#22c55e"
export const CONNECTION_OFFLINE_COLOR = "#ef4444"
export const CONNECTION_EXCHANGE_OFFLINE_COLOR = "#f59e0b"

// Label font sizes (index 1–5)
export const LABEL_FONT_SIZES = [0, 10, 13, 16, 20, 24] as const
export const LABEL_MARKER_RADIUS = 3
export const LABEL_TEXT_OFFSET = 6
