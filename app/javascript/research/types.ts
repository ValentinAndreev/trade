import type { ResearchResult, ResearchRunPayload, SystemStats } from "../types/store"

export type { ResearchResult, ResearchRunPayload }
export interface ResearchModuleConfigPayload {
  type: string
  [key: string]: number | string | boolean
}

export interface ResearchSystemPayload {
  id: string | null
  name: string | null
  params: Record<string, number | string | boolean>
}

export interface ResearchDatasetPayload {
  symbol: string
  timeframe: string
  start_time: string
  end_time: string
}

export interface ResearchOptimizationPayload {
  enabled: boolean
  param: string | null
  from: number | null
  to: number | null
  step: number | null
}

export interface ResearchApiResponse {
  strategy: string
  system: ResearchSystemPayload
  modules: Record<string, ResearchModuleConfigPayload>
  dataset: ResearchDatasetPayload
  optimization: ResearchOptimizationPayload
  runs: ResearchRunPayload[]
}

export interface ProcessedResearchRun extends ResearchRunPayload {
  stats: SystemStats
}
