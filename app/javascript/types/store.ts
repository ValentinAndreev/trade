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
