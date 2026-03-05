import { apiFetch } from "../services/api_fetch"

export async function fetchConfig() {
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
