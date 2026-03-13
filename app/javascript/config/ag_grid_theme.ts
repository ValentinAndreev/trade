import { themeQuartz } from "ag-grid-community"
import { BG_PRIMARY, BG_SECONDARY, BG_HOVER, BORDER_COLOR, ACCENT_COLOR } from "./theme"

/**
 * Shared AG Grid dark theme used across data_grid_controller and system_stats_controller.
 */
export const agGridDarkTheme = themeQuartz.withParams({
  backgroundColor: BG_PRIMARY,
  foregroundColor: "#d1d4dc",
  headerBackgroundColor: BG_SECONDARY,
  headerTextColor: "#9ca3af",
  rowHoverColor: BG_HOVER,
  borderColor: BORDER_COLOR,
  accentColor: ACCENT_COLOR,
  chromeBackgroundColor: BG_PRIMARY,
  oddRowBackgroundColor: "#1e1e32",
  fontSize: 13,
  headerFontSize: 13,
})
