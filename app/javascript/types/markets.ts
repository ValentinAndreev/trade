export interface TickerData {
  symbol: string;
  last_price: number;
  daily_change_perc: number;
  volume: number;
  high: number;
  low: number;
  close: number;
  sparkline: number[];
  updated_at?: string;
}

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  updated_at?: string;
}

export interface OverlayState {
  series: unknown;
  mode: string;
  chartType: string;
  colorIndex: number;
  colorScheme: number;
  opacity: number;
  colors: { up: string; down: string; line: string };
  visible: boolean;
  basePriceScaleId: string;
  activePriceScaleId: string;
  symbol: string | null;
  loader?: DataLoaderState;
  indicatorType?: string;
  indicatorParams?: Record<string, number | string>;
  indicatorSource?: string;
  pinnedTo?: string | null;
  indicatorSeries?: { series: unknown; fieldKey: string }[];
  _lastSourceKey?: string | null;
}

export interface DataLoaderState {
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
}

export interface PresetInfo {
  id: number;
  name: string;
}

export interface UserInfo {
  id: number;
  username: string;
  default_preset_id?: number | null;
}
