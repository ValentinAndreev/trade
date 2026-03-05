import type { CandleWithValue } from "./candle";

export interface IndicatorField {
  key: string;
  label: string;
  seriesType?: string;
}

export interface IndicatorLib {
  /** technicalindicators has complex input types - use `any` for interop */
  fn: (input: any) => any[];
  input: (data: CandleWithValue[], params: Record<string, number>) => unknown;
  /** technicalindicators returns objects with varying shapes - use `any` for interop */
  map: (result: any) => Record<string, number | null>;
}

export interface IndicatorMeta {
  label: string;
  requires?: string;
  overlay?: boolean;
  fields: IndicatorField[];
  defaults: Record<string, number>;
  paramLabels: Record<string, string>;
  lib?: IndicatorLib;
}
