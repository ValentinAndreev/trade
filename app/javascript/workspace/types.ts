import type TabStore from "../tabs/store"
import type DataTabActions from "../tabs/data_actions"
import type { IndicatorInfo, StimulusApp } from "../types/store"

export interface WorkspaceConfig {
  symbols: string[]
  timeframes: string[]
  indicators: IndicatorInfo[]
}

export interface WorkspaceBaseDeps {
  store: TabStore
  renderFn: () => void
}

export interface WorkspaceDomDeps extends WorkspaceBaseDeps {
  sidebarTarget: HTMLElement
  panelsTarget: HTMLElement
  application: StimulusApp
}

export type RevealActiveTabFn = () => void

export interface LinkedDataDeps extends Omit<WorkspaceDomDeps, "sidebarTarget"> {
  dataActions: DataTabActions
}
