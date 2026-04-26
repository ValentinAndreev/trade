import type TabStore from "../tabs/store"
import type DataTabActions from "../tabs/data_actions"
import type { DataGridControllerAPI, IndicatorInfo, StimulusApp, SystemStats, Trade } from "../types/store"

export interface WorkspaceConfig {
  symbols: string[]
  timeframes: string[]
  indicators: IndicatorInfo[]
}

export interface WorkspaceBaseDeps {
  store: TabStore
  renderFn: () => void
  signal: AbortSignal
}

export interface WorkspaceDomDeps extends WorkspaceBaseDeps {
  sidebarTarget: HTMLElement
  panelsTarget: HTMLElement
  application: StimulusApp
}

export type RevealActiveTabFn = () => void

export interface LinkedDataDeps extends Omit<WorkspaceDomDeps, "sidebarTarget"> {
  dataActions: DataTabActions
  getDataGridController: (tabId: string) => DataGridControllerAPI | null
  getSystemStatsController: (systemId: string) => SystemStatsControllerLookup | null
}

export interface SystemStatsControllerLookup {
  setStats(stats: SystemStats | null, trades: Trade[]): void
}

export interface FilePickerState {
  open: boolean
  query: string
  directoryPath: string
  selectedPath: string | null
}

export const EMPTY_FILE_PICKER_STATE: FilePickerState = {
  open: false,
  query: "",
  directoryPath: "",
  selectedPath: null,
}
