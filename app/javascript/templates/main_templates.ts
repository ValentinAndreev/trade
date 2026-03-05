import {
  SPARKLINE_UP_COLOR, SPARKLINE_DOWN_COLOR,
  SPARKLINE_WIDTH, SPARKLINE_HEIGHT, SPARKLINE_PADDING,
} from "../config/constants"
import { formatLocalePrice, formatLocaleNumber, formatTime, formatDateTimeShort } from "../utils/format"

interface TickerData {
  symbol: string;
  last_price: number;
  change_24h: number;
  change_24h_perc: number;
  volume: number;
  high: number;
  low: number;
  sparkline?: number[];
  updated_at?: string;
}

export function tickerTileHTML(t: TickerData): string {
  const price = formatLocalePrice(t.last_price)
  const changePerc = (t.change_24h_perc * 100).toFixed(2)
  const changeAbs = formatLocalePrice(Math.abs(t.change_24h))
  const sign = t.change_24h >= 0 ? "+" : ""
  const colorClass = t.change_24h >= 0 ? "text-green-400" : "text-red-400"
  const vol = formatLocaleNumber(t.volume)
  const high = formatLocaleNumber(t.high)
  const low = formatLocaleNumber(t.low)
  const sparkline = t.sparkline && t.sparkline.length > 1 ? sparklineSVG(t.sparkline, t.change_24h >= 0) : ""
  const updatedAt = t.updated_at ? formatTime(t.updated_at) : ""

  return `
    <div class="relative group bg-[#12122a] border border-[#2a2a3e] rounded-lg p-4 hover:border-blue-500/50 cursor-pointer transition-colors"
         data-action="click->main#openChart"
         data-symbol="${t.symbol}">
      <button class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
              data-action="click->main#removeTile"
              data-symbol="${t.symbol}">&times;</button>
      <div class="flex items-center justify-between gap-3 overflow-hidden">
        <div class="shrink-0">
          <div class="text-gray-400 text-base mb-1">${t.symbol}</div>
          <div class="text-white text-2xl font-semibold mb-1">$${price}</div>
          <div class="${colorClass} text-base">${sign}${changePerc}% (${sign}$${changeAbs})</div>
        </div>
        <div class="shrink-0 h-12 w-[70px]">${sparkline}</div>
        <div class="hidden min-[960px]:block shrink-0 text-gray-500 text-sm leading-relaxed whitespace-nowrap">
          <div>Vol: ${vol}</div>
          <div>H: ${high}</div>
          <div>L: ${low}</div>
          ${updatedAt ? `<div class="text-gray-400">${updatedAt}</div>` : ""}
        </div>
      </div>
    </div>
  `
}

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change?: number;
  change_pct?: number;
  high?: number;
  low?: number;
  updated_at?: string;
}

export function marketTileHTML(q: MarketQuote | null, category: string): string {
  if (!q) return ""
  const isForex = category === "forex"
  const decimals = isForex ? 4 : 2
  const price = formatLocalePrice(q.price, decimals)
  const change = q.change ?? 0
  const changePct = q.change_pct ?? 0
  const sign = change >= 0 ? "+" : ""
  const colorClass = change >= 0 ? "text-green-400" : "text-red-400"
  const prefix = isForex ? "" : "$"
  const high = q.high != null ? formatLocalePrice(q.high, decimals) : null
  const low = q.low != null ? formatLocalePrice(q.low, decimals) : null
  const updatedAt = q.updated_at ? formatDateTimeShort(q.updated_at) : ""

  return `
    <div class="relative group bg-[#12122a] border border-[#2a2a3e] rounded-lg p-3 transition-colors hover:border-[#3a3a5e]">
      <button class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              data-action="click->main#removeMarket"
              data-symbol="${q.symbol}" data-category="${category}">&times;</button>
      <div class="flex items-center justify-between gap-3 overflow-hidden">
        <div class="shrink-0">
          <div class="text-gray-500 text-xs mb-1">${q.name}</div>
          <div class="text-white text-lg font-semibold">${prefix}${price}</div>
          <div class="${colorClass} text-sm">${sign}${changePct.toFixed(2)}% (${sign}${formatLocalePrice(Math.abs(change), decimals)})</div>
        </div>
        <div class="hidden min-[960px]:block shrink-0 text-gray-500 text-xs leading-relaxed whitespace-nowrap text-right">
          ${high != null ? `<div>H: ${prefix}${high}</div>` : ""}
          ${low != null ? `<div>L: ${prefix}${low}</div>` : ""}
          ${updatedAt ? `<div class="text-gray-400">${updatedAt}</div>` : ""}
        </div>
      </div>
    </div>
  `
}

export function sparklineSVG(points: number[], isPositive: boolean): string {
  const w = SPARKLINE_WIDTH, h = SPARKLINE_HEIGHT
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1

  const coords = points.map((val, i) => {
    const x = (i / (points.length - 1)) * w
    const y = h - ((val - min) / range) * (h - SPARKLINE_PADDING) - SPARKLINE_PADDING / 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const color = isPositive ? SPARKLINE_UP_COLOR : SPARKLINE_DOWN_COLOR

  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="w-full h-full">
      <polyline fill="none" stroke="${color}" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"
                points="${coords.join(" ")}" />
    </svg>
  `
}
