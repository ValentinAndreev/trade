import { apiFetch } from "../services/api_fetch"
import type { IndicatorInfo } from "../data_grid/sidebar_renderer"

export interface AppConfig {
  symbols: string[]
  timeframes: string[]
  indicators: IndicatorInfo[]
}

export async function fetchConfig(): Promise<AppConfig> {
  try {
    const [configResp, indicatorsResp] = await Promise.all([
      apiFetch("/api/configs", {}, { silent: true }),
      apiFetch("/api/indicators", {}, { silent: true }).catch(() => null),
    ])
    if (!configResp) return { symbols: [], timeframes: [], indicators: [] }
    const data = await configResp.json()
    let indicators = []
    if (indicatorsResp && indicatorsResp.ok) {
      indicators = await indicatorsResp.json()
    }
    return {
      symbols: data.symbols || [],
      timeframes: data.timeframes || [],
      indicators: indicators || [],
    }
  } catch {
    return { symbols: [], timeframes: [], indicators: [] }
  }
}
