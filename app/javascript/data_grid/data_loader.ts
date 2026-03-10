import { apiFetch } from "../services/api_fetch"
import { type DataConfig, type DataColumn, type DataTableRow, columnFieldKey } from "../types/store"
import candleCache from "../data/candle_cache"
import indicatorCache from "../data/indicator_cache"
import { INDICATOR_META } from "../config/indicators"

export type { DataTableRow }

const OHLCV_TYPES = ["open", "high", "low", "close", "volume"] as const

function mapOhlcvToColumnKeys(rows: DataTableRow[], columns: DataColumn[]): void {
  const ohlcvCols = columns.filter(c => OHLCV_TYPES.includes(c.type as typeof OHLCV_TYPES[number]))
  if (!ohlcvCols.length) return
  for (const row of rows) {
    for (const col of ohlcvCols) {
      const rawKey = col.type as keyof DataTableRow
      const val = row[rawKey]
      if (val !== undefined) (row as Record<string, number>)[columnFieldKey(col)] = Number(val)
    }
  }
}

/** True when we need API (change, extra instruments, or server-only indicators). */
function needsServerData(config: DataConfig): boolean {
  if (getInstrumentColumns(config).length > 0) return true
  if (config.columns.some(c => c.type === "change" && c.changePeriod)) return true
  if (config.columns.some(c => c.type === "indicator" && c.indicatorType && !INDICATOR_META[c.indicatorType]?.lib)) return true
  return false
}

function getInstrumentColumns(config: DataConfig): DataColumn[] {
  return config.columns.filter(c => c.type === "instrument" && c.instrumentSymbol && c.instrumentField)
}

export function loadFromCache(config: DataConfig): DataTableRow[] | null {
  if (!config.symbols.length) return null
  const symbol = config.symbols[0]
  const candles = candleCache.getRange(
    symbol, config.timeframe,
    config.startTime, config.endTime,
  )
  if (!candles.length) return null
  return candles.map(c => ({
    time: c.time, open: c.open, high: c.high,
    low: c.low, close: c.close, volume: c.volume,
  }))
}

/** Rows from cache with OHLCV mapped and indicators filled (same source as chart). Use when updating from cache. */
export function getRowsFromCache(config: DataConfig): DataTableRow[] | null {
  const rows = loadFromCache(config)
  if (!rows?.length || !config.symbols[0]) return rows
  mapOhlcvToColumnKeys(rows, config.columns)
  fillIndicatorsFromCache(rows, config.columns, config.symbols[0], config.timeframe)
  return rows
}

async function fetchInstrumentData(
  symbol: string,
  timeframe: string,
  startTime?: number,
  endTime?: number,
): Promise<Map<number, Record<string, number>>> {
  const url = new URL("/api/data_table", window.location.origin)
  url.searchParams.set("symbol", symbol)
  url.searchParams.set("timeframe", timeframe)
  if (startTime) url.searchParams.set("start_time", new Date(startTime * 1000).toISOString())
  if (endTime) url.searchParams.set("end_time", new Date(endTime * 1000).toISOString())

  try {
    const response = await apiFetch(url)
    if (!response?.ok) return new Map()
    const rows: Array<Record<string, number>> = await response.json()
    const byTime = new Map<number, Record<string, number>>()
    for (const row of rows) byTime.set(row.time, row)
    return byTime
  } catch {
    return new Map()
  }
}

function mergeInstrumentData(
  rows: DataTableRow[],
  instrumentCols: DataColumn[],
  instrumentData: Map<string, Map<number, Record<string, number>>>,
): void {
  for (const row of rows) {
    for (const col of instrumentCols) {
      const data = instrumentData.get(col.instrumentSymbol!)
      if (!data) continue
      const instRow = data.get(row.time)
      const fieldKey = col.label
      ;(row as any)[fieldKey] = instRow ? instRow[col.instrumentField!] ?? null : null
    }
  }
}

/** One indicator series point: { time, ...fieldKeys }. */
type IndicatorPoint = Record<string, number>

function sourceDataFromRows(rows: DataTableRow[]): Array<{ time: number; open: number; high: number; low: number; close: number; volume: number; value: number }> {
  return rows.map(r => ({
    time: r.time,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    value: r.close,
  }))
}

/** Compute one indicator from OHLCV rows; returns array of { time, ...fieldKeys } or null. */
function computeOneIndicator(
  rows: DataTableRow[],
  col: DataColumn & { type: "indicator"; indicatorType: string },
): IndicatorPoint[] | null {
  const meta = INDICATOR_META[col.indicatorType]
  if (!meta?.lib || !rows.length) return null
  try {
    const sourceData = sourceDataFromRows(rows)
    const params = (col.indicatorParams || {}) as Record<string, number>
    const input = meta.lib.input(sourceData, params)
    const result = meta.lib.fn(input)
    if (!Array.isArray(result) || !result.length) return null
    const offset = sourceData.length - result.length
    return result.map((val: unknown, i: number) => ({
      time: sourceData[i + offset].time,
      ...meta.lib!.map(val as Record<string, number>),
    }))
  } catch {
    return null
  }
}

/** Merge cached or computed indicator series into rows by time. */
function mergeIndicatorIntoRows(
  rows: DataTableRow[],
  col: DataColumn & { type: "indicator"; indicatorType: string },
  data: IndicatorPoint[],
): void {
  const meta = INDICATOR_META[col.indicatorType]
  const resultKey = meta?.fields[0]?.key
  if (!resultKey) return
  const fieldKey = columnFieldKey(col)
  const byTime = new Map<number, number>()
  for (const point of data) {
    const v = point[resultKey]
    if (v != null) byTime.set(point.time, v)
  }
  for (const row of rows) {
    const v = byTime.get(row.time)
    if (v != null) (row as Record<string, number>)[fieldKey] = v
  }
}

/**
 * Fill indicator columns from the shared indicator cache (same source as chart).
 * On cache miss, compute once and write to cache so chart and data stay in sync.
 */
function fillIndicatorsFromCache(
  rows: DataTableRow[],
  columns: DataColumn[],
  symbol: string,
  timeframe: string,
): void {
  const indicatorCols = columns.filter(
    (c): c is DataColumn & { type: "indicator"; indicatorType: string } =>
      c.type === "indicator" && !!c.indicatorType,
  )
  if (!indicatorCols.length || !rows.length) return

  for (const col of indicatorCols) {
    const params = (col.indicatorParams || {}) as Record<string, unknown>
    let data = indicatorCache.get(symbol, timeframe, col.indicatorType, params)
    if (!data?.length && INDICATOR_META[col.indicatorType]?.lib) {
      const computed = computeOneIndicator(rows, col)
      if (computed?.length) {
        indicatorCache.set(symbol, timeframe, col.indicatorType, params, computed)
        data = computed
      }
    }
    if (data?.length) mergeIndicatorIntoRows(rows, col, data)
  }
}

function buildApiUrl(config: DataConfig): URL {
  const url = new URL("/api/data_table", window.location.origin)
  url.searchParams.set("symbol", config.symbols[0])
  url.searchParams.set("timeframe", config.timeframe)

  if (config.startTime) url.searchParams.set("start_time", new Date(config.startTime * 1000).toISOString())
  if (config.endTime) url.searchParams.set("end_time", new Date(config.endTime * 1000).toISOString())

  const indicatorSpecs = config.columns
    .filter(c => c.type === "indicator" && c.indicatorType)
    .map(c => ({ type: c.indicatorType, params: c.indicatorParams || {} }))
  if (indicatorSpecs.length) url.searchParams.set("indicators", JSON.stringify(indicatorSpecs))

  config.columns
    .filter(c => c.type === "change" && c.changePeriod)
    .forEach(c => { if (c.changePeriod) url.searchParams.append("changes[]", c.changePeriod) })

  return url
}

async function fetchAndMergeInstruments(
  data: DataTableRow[],
  config: DataConfig,
): Promise<void> {
  const instrumentCols = getInstrumentColumns(config)
  if (!instrumentCols.length) return
  const uniqueSymbols = [...new Set(instrumentCols.map(c => c.instrumentSymbol!))]
  const instrumentData = new Map<string, Map<number, Record<string, number>>>()
  await Promise.all(uniqueSymbols.map(async (sym) => {
    instrumentData.set(sym, await fetchInstrumentData(sym, config.timeframe, config.startTime, config.endTime))
  }))
  mergeInstrumentData(data, instrumentCols, instrumentData)
}

export async function loadDataTable(config: DataConfig): Promise<DataTableRow[]> {
  if (!config.symbols.length) return []

  const symbol = config.symbols[0]
  const isLinked = !!config.sourceTabId
  const useCacheOnly = isLinked && !needsServerData(config)

  if (useCacheOnly) {
    const cached = getRowsFromCache(config)
    if (cached?.length) return cached
  }

  const cacheFallback = (): DataTableRow[] => getRowsFromCache(config) ?? []

  try {
    const response = await apiFetch(buildApiUrl(config))
    if (!response || !response.ok) {
      if (response && !response.ok) console.error("[DataGrid] API error:", response.status, response.statusText)
      return cacheFallback()
    }
    const data: DataTableRow[] = await response.json()
    await fetchAndMergeInstruments(data, config)
    mapOhlcvToColumnKeys(data, config.columns)
    return data
  } catch (err) {
    console.error("[DataGrid] Failed to load data:", err)
    return cacheFallback()
  }
}
