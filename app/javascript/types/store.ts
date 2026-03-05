export interface Tab {
  id: string;
  name: string | null;
  panels: Panel[];
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
