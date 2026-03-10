export type TabType = "chart" | "data"

export interface Tab {
  id: string;
  name: string | null;
  type: TabType;
  panels: Panel[];
  dataConfig?: DataConfig;
}

export interface DataConfig {
  symbols: string[];
  timeframe: string;
  columns: DataColumn[];
  conditions: Condition[];
  chartLinks: ChartLink[];
  sourceTabId?: string;
  startTime?: number;
  endTime?: number;
}

export interface DataColumn {
  id: string;
  type: "datetime" | "open" | "high" | "low" | "close" | "volume"
      | "indicator" | "change" | "custom" | "formula" | "instrument";
  label: string;
  width?: number;
  /** When false, column is hidden in the grid. Default true. */
  visible?: boolean;
  indicatorType?: string;
  indicatorParams?: Record<string, number | string>;
  changePeriod?: string;
  expression?: string;
  instrumentSymbol?: string;
  instrumentField?: string;
}

export function columnFieldKey(col: DataColumn): string {
  if (col.type === "change") return `change_${col.changePeriod || "5m"}`
  if (col.type === "indicator" && col.indicatorType) {
    const params = col.indicatorParams || {}
    const suffix = Object.values(params)[0]
    return suffix ? `${col.indicatorType}_${suffix}` : col.indicatorType
  }
  return col.label
}

export interface Condition {
  id: string;
  name: string;
  enabled: boolean;
  rule: ConditionRule;
  action: ConditionAction;
}

export interface ConditionRule {
  type: "change_gt" | "change_lt" | "value_gt" | "value_lt"
      | "cross_above" | "cross_below" | "between" | "expression";
  column: string;
  value: number;
  compareColumn?: string;
  params?: Record<string, number | string>;
  expression?: string;
}

export interface ConditionAction {
  rowHighlight?: string;
  chartMarker?: { color: string; text?: string };
  chartColorZone?: { color: string };
}

export interface ChartLink {
  chartTabId: string;
  panelId: string;
}

export interface Panel {
  id: string;
  timeframe: string;
  overlays: Overlay[];
  labels?: DrawingItem[];
  lines?: DrawingItem[];
  hlines?: DrawingItem[];
  vlines?: DrawingItem[];
  volumeProfile?: { enabled: boolean; opacity: number };
  [key: string]: unknown;
}

export interface Overlay {
  id: string;
  symbol: string | null;
  mode: "price" | "volume" | "indicator";
  chartType: string;
  visible: boolean;
  colorScheme: number;
  opacity: number;
  indicatorType: string | null;
  indicatorParams: Record<string, number | string> | null;
  indicatorSource?: string | null;
  pinnedTo: string | null;
}

export interface DrawingItem {
  id: string;
  [key: string]: unknown;
}

export type DrawingKind = "labels" | "lines" | "hlines" | "vlines";

export interface ColorScheme {
  up: string;
  down: string;
  line: string;
}

// --- Controller interfaces (replace `any` across the codebase) ---

export type DataTableRow = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  [key: string]: number | null | undefined
}

export interface LabelMarkerInput {
  id?: string
  time: number
  text: string
  color?: string
  position?: string
  price?: number
  overlayId?: string
  fontSize?: number
}

export interface ChartControllerAPI {
  chart?: { timeScale(): unknown; subscribeCrosshairMove(fn: unknown): void; unsubscribeCrosshairMove(fn: unknown): void }
  hasOverlay(id: string): boolean
  addOverlay(config: OverlayConfig): void
  removeOverlay(id: string): void
  showMode(id: string, mode: string): void
  switchChartType(id: string, chartType: string): void
  setSelectedOverlayScale(id: string | null): void
  setOverlayVisibility(id: string, visible: boolean): void
  setOverlayColorScheme(id: string, colorScheme: number | string): void
  setOverlayOpacity(id: string, opacity: number | string): void
  updateIndicator(id: string, type: string, params: Record<string, number>, pinnedTo: string | null, source: string): void
  hasIndicatorSeries(id: string): boolean
  setPinnedTo(id: string, pinnedTo: string | null): void
  enterLabelMode(): void
  exitLabelMode(): void
  setLabels(labels: LabelMarkerInput[]): void
  setConditionLabels(labels: LabelMarkerInput[]): void
  scrollToLabel(time: number): void
  enterLineMode(): void
  exitLineMode(): void
  setLines(lines: DrawingItem[]): void
  scrollToLine(time: number): void
  enterHLineMode(): void
  exitHLineMode(): void
  setHLines(hlines: DrawingItem[]): void
  enterVLineMode(): void
  exitVLineMode(): void
  setVLines(vlines: DrawingItem[]): void
  vpEnabled: boolean
  enableVolumeProfile(opacity: number): void
  disableVolumeProfile(): void
  setVolumeProfileOpacity(opacity: number): void
  applyColorZones?(zones: Array<{ time: number; color: string }>): void
  _navigateToTime?(ts: number): Promise<void>
}

export interface OverlayConfig {
  id: string
  symbol: string | null
  mode?: string
  chartType?: string
  visible?: boolean
  colorScheme?: number
  opacity?: number
  indicatorType?: string | null
  indicatorParams?: Record<string, number | string> | null
  indicatorSource?: string | null
  pinnedTo?: string | null
}

export interface DataGridControllerAPI {
  loadWithConfig(config: DataConfig): Promise<void>
  loadData(): Promise<void>
  getData(): DataTableRow[]
  applyConfigOnly(config: DataConfig): void
  applyColumnDefsOnly(config: DataConfig): void
  applyConditions(): void
  getConditionMatches(): Map<number, unknown>
  getRowByTime(time: number): DataTableRow | undefined
  scrollToTime(time: number): void
}

export interface StimulusApp {
  getControllerForElementAndIdentifier(el: Element, id: string): unknown
}
