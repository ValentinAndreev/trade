export async function fetchConfig() {
  try {
    const [configResp, indicatorsResp] = await Promise.all([
      fetch("/api/configs"),
      fetch("/api/indicators").catch(() => null),
    ])
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
