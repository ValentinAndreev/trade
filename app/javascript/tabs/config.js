export async function fetchConfig() {
  try {
    const resp = await fetch("/api/configs")
    const data = await resp.json()
    return {
      symbols: data.symbols || [],
      timeframes: data.timeframes || [],
    }
  } catch {
    return { symbols: [], timeframes: [] }
  }
}
