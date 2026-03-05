export function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(0)
  if (price >= 1) return price.toFixed(2)
  return price.toPrecision(4)
}

export function formatDateTime(ts: number | null): string {
  if (!ts) return ""
  const d = new Date(ts * 1000)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const hours = String(d.getHours()).padStart(2, "0")
  const minutes = String(d.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function formatDateShort(ts: number): string {
  const d = new Date(ts * 1000)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yy = String(d.getFullYear()).slice(2)
  return `${dd}.${mm}.${yy}`
}

export function formatLocalePrice(n: number | null | undefined, decimals?: number): string {
  if (n == null) return "—"
  const d = decimals ?? 2
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function formatLocaleNumber(n: number | null | undefined): string {
  if (n == null) return "—"
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

export function formatDateTimeShort(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, "0")
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${dd}.${mo} ${hh}:${mm}`
}
