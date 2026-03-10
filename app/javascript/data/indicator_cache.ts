/**
 * Single store for computed indicator series. Chart and data tab use this:
 * chart writes when it computes, data tab reads (or computes once and writes).
 */

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
    const data = this.store.get(key)
    return data ?? null
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
  }
}

const indicatorCache = new IndicatorCache()
export default indicatorCache
