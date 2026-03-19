import type { ResearchResult, ResearchRunPayload, SystemStats } from "../types/store"

export type { ResearchResult, ResearchRunPayload }

export interface ResearchSystemPayload {
  type: string | null
  params: Record<string, number | string | boolean>
}

export interface ResearchModulePayload {
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
  module: ResearchModulePayload
  modules: Record<string, Record<string, number | string | boolean>>
  dataset: ResearchDatasetPayload
  optimization: ResearchOptimizationPayload
  runs: ResearchRunPayload[]
}

export interface ProcessedResearchRun extends ResearchRunPayload {
  stats: SystemStats
}
