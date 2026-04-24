import { computeSystemStats } from "../data_grid/engines"
import type { ResearchResult, ResearchRunPayload } from "../types/store"
import type { ProcessedResearchRun } from "./types"

export function processResearchRuns(runs: ResearchRunPayload[]): ProcessedResearchRun[] {
  return runs.map(run => ({
    ...run,
    stats: computeSystemStats(run.trades),
  }))
}

export function serializeResearchResult(runs: ProcessedResearchRun[], selectedRunIndex: number): ResearchResult {
  const normalizedIndex = clampSelectedRunIndex(runs.length, selectedRunIndex)

  return {
    runs: runs.map(({ stats: _stats, ...run }) => run),
    selectedRunIndex: normalizedIndex,
  }
}

export function hydrateResearchResult(stored: Partial<ResearchResult> | null | undefined): ResearchResult {
  const runs = Array.isArray(stored?.runs) ? stored.runs as ResearchRunPayload[] : []
  return {
    runs,
    selectedRunIndex: clampSelectedRunIndex(runs.length, Number(stored?.selectedRunIndex ?? 0)),
  }
}

function clampSelectedRunIndex(runsCount: number, selectedRunIndex: number): number {
  if (runsCount <= 0) return 0
  if (!Number.isFinite(selectedRunIndex)) return 0
  return Math.max(0, Math.min(runsCount - 1, Math.trunc(selectedRunIndex)))
}
