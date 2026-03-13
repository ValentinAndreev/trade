import type { SystemStats } from "../types/store"
import { BG_HOVER } from "../config/theme"

export function renderMetrics(el: HTMLElement, stats: SystemStats): void {
  const sign     = (v: number) => v >= 0 ? "+" : ""
  const pnlColor = (v: number) => v >= 0 ? "text-emerald-400" : "text-red-400"
  const fmt      = (v: number, d = 2) => v.toFixed(d)

  const rows: Array<[string, string, string?]> = [
    ["Net profit",         `${sign(stats.netProfit)}${fmt(stats.netProfit)} (${sign(stats.netProfitPercent)}${fmt(stats.netProfitPercent)}%)`, pnlColor(stats.netProfit)],
    ["Win rate",           `${fmt(stats.winRate)}%`],
    ["Total trades",       String(stats.totalTrades)],
    ["Winners / Losers",   `${stats.winningTrades} / ${stats.losingTrades}`],
    ["Profit factor",      fmt(stats.profitFactor, 3)],
    ["Gross profit",       `+${fmt(stats.grossProfit)}`, "text-emerald-400"],
    ["Gross loss",         `-${fmt(stats.grossLoss)}`, "text-red-400"],
    ["Avg win",            `+${fmt(stats.avgWin)} (+${fmt(stats.avgWinPercent)}%)`, "text-emerald-400"],
    ["Avg loss",           `-${fmt(stats.avgLoss)} (-${fmt(stats.avgLossPercent)}%)`, "text-red-400"],
    ["Expectancy",         `${sign(stats.expectancy)}${fmt(stats.expectancy)}`],
    ["Max drawdown",       `-${fmt(stats.maxDrawdown)} (-${fmt(stats.maxDrawdownPercent)}%)`, "text-red-400"],
    ["Sharpe ratio",       fmt(stats.sharpeRatio, 3)],
    ["Sortino ratio",      fmt(stats.sortinoRatio, 3)],
    ["Calmar ratio",       fmt(stats.calmarRatio, 3)],
    ["Recovery factor",    fmt(stats.recoveryFactor, 3)],
    ["Avg bars in trade",  fmt(stats.avgBarsInTrade, 1)],
    ["Max consec. wins",   String(stats.maxConsecutiveWins)],
    ["Max consec. losses", String(stats.maxConsecutiveLosses)],
    ["Best trade",         `+${fmt(stats.bestTrade)}`, "text-emerald-400"],
    ["Worst trade",        `${fmt(stats.worstTrade)}`, "text-red-400"],
  ]

  el.innerHTML = rows.map(([label, value, cls = "text-white"]) => `
    <div class="flex justify-between gap-2 py-0.5 border-b border-[${BG_HOVER}] last:border-0">
      <span class="text-gray-400 text-sm">${label}</span>
      <span class="text-sm font-mono ${cls} text-right">${value}</span>
    </div>`
  ).join("")
}
