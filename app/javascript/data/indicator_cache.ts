/**
 * Single store for computed indicator series. Chart and data tab use this:
 * chart writes when it computes, data tab reads (or computes once and writes).
 */

import { idbPutIndicator, idbGetIndicator } from "./idb_store"

export type IndicatorSeriesPoint = Record<string, number>

function cacheKey(
  symbol: string,
  timeframe: string,
  indicatorType: string,
  params: Record<string, unknown>,
): string {
  const p = JSON.stringify(params ?? {})
  return `${symbol.toUpperCase()}:${timeframe}:${indicatorType}:${p}`
}

class IndicatorCache {
  private store = new Map<string, IndicatorSeriesPoint[]>()

  get(
    symbol: string,
    timeframe: string,
    indicatorType: string,
    params: Record<string, unknown>,
  ): IndicatorSeriesPoint[] | null {
    const key = cacheKey(symbol, timeframe, indicatorType, params ?? {})
    return this.store.get(key) ?? null
  }

  set(
    symbol: string,
    timeframe: string,
    indicatorType: string,
    params: Record<string, unknown>,
    data: IndicatorSeriesPoint[],
  ): void {
    const key = cacheKey(symbol, timeframe, indicatorType, params ?? {})
    this.store.set(key, data)
    idbPutIndicator(symbol, timeframe, indicatorType, params, data)
  }

  /**
   * Like get(), but falls back to IndexedDB on in-memory miss.
   * Populates the in-memory store on IDB hit so subsequent calls are fast.
   */
  async getOrHydrate(
    symbol: string,
    timeframe: string,
    indicatorType: string,
    params: Record<string, unknown>,
  ): Promise<IndicatorSeriesPoint[] | null> {
    const hot = this.get(symbol, timeframe, indicatorType, params)
    if (hot) return hot

    try {
      const data = await idbGetIndicator(symbol, timeframe, indicatorType, params)
      if (data?.length) {
        const key = cacheKey(symbol, timeframe, indicatorType, params ?? {})
        this.store.set(key, data)
        return data
      }
    } catch {
      // IDB unavailable — silent fallback
    }
    return null
  }
}

const indicatorCache = new IndicatorCache()
export default indicatorCache
