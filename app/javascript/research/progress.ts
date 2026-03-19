import { optimizationTargetLabel } from "./catalog"
import type { ResearchProgressSnapshot } from "./progress_subscription"
import type { ResearchState } from "./state"

export type ResearchProgressInfo = {
  title: string
  detail: string
  note: string
  statusLabel: string
  elapsedLabel: string
  percent: number
  cancelling?: boolean
}

export function buildResearchProgressInfo(
  state: ResearchState,
  elapsedSeconds: number,
  snapshot: ResearchProgressSnapshot | null = null,
): ResearchProgressInfo {
  const elapsedLabel = formatElapsed(snapshot ? snapshot.elapsedMs / 1000 : elapsedSeconds)

  if (!state.optimizationEnabled) {
    const completedRuns = snapshot?.completedRuns || 0
    const totalRuns = snapshot?.totalRuns || 1

    return {
      title: "Running backtest",
      detail: `${state.symbol} ${state.timeframe} · system ${state.systemId}`,
      note: snapshot?.lastRunMs ? `Last run ${formatRunDuration(snapshot.lastRunMs)}` : "Waiting for server response…",
      statusLabel: `${completedRuns}/${totalRuns}`,
      elapsedLabel,
      percent: progressPercent(completedRuns, totalRuns),
    }
  }

  const totalRuns = snapshot?.totalRuns || estimateOptimizationRuns(state)
  const completedRuns = Math.min(snapshot?.completedRuns || 0, totalRuns)
  const currentValue = snapshot?.currentValue
  const currentTargetLabel = optimizationTargetLabel(state.optimizationTarget)
  const noteParts = [
    currentValue == null ? null : `Current ${currentTargetLabel} ${formatProgressValue(currentValue)}`,
    snapshot?.lastRunMs ? `Last run ${formatRunDuration(snapshot.lastRunMs)}` : null,
    snapshot ? `ETA ${formatEta(snapshot)}` : "Waiting for server progress…",
  ].filter(Boolean)

  return {
    title: "Running optimization",
    detail: `${completedRuns}/${totalRuns} runs · target ${optimizationTargetLabel(state.optimizationTarget)}`,
    note: noteParts.join(" · "),
    statusLabel: `${progressPercent(completedRuns, totalRuns)}%`,
    elapsedLabel,
    percent: progressPercent(completedRuns, totalRuns),
  }
}

export function estimateOptimizationRuns(state: ResearchState): number {
  const from = Number(state.optimizationFrom)
  const to = Number(state.optimizationTo)
  const step = Number(state.optimizationStep)

  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(step) || step <= 0 || from > to) {
    return 0
  }

  return Math.floor(((to - from) / step) + 1 + 1e-9)
}

export function formatElapsed(elapsedSeconds: number): string {
  const total = Math.max(0, Math.trunc(elapsedSeconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function progressPercent(completedRuns: number, totalRuns: number): number {
  if (totalRuns <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((completedRuns / totalRuns) * 100)))
}

function formatRunDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`
}

function formatProgressValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "")
}

function formatEta(snapshot: ResearchProgressSnapshot): string {
  const remainingRuns = Math.max(0, snapshot.totalRuns - snapshot.completedRuns)
  if (remainingRuns <= 0 || snapshot.completedRuns <= 0 || snapshot.elapsedMs <= 0) return "00:00"

  const avgRunMs = snapshot.elapsedMs / snapshot.completedRuns
  return formatElapsed((remainingRuns * avgRunMs) / 1000)
}
