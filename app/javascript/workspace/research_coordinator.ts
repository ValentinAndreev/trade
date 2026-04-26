import { buildDefaultResearchState, syncResearchStateFromInputs } from "../research/state"
import {
  fetchResearchCatalog,
  validateResearchSystem,
  type ResearchCatalogEntry,
  type ResearchValidationResponse,
  type ResearchValidatedSystem,
} from "../research/dsl"
import { DEFAULT_RESEARCH_SYMBOL, DEFAULT_RESEARCH_TIMEFRAME, CLEARED_RESEARCH_SYSTEM_VALUE } from "../config/constants"
import { ResearchFilePicker } from "../research/research_file_picker"
import { hashText } from "../utils/text_hash"
import { showToast } from "../services/toast"
import type { ResearchConfig, ResearchResult, Tab } from "../types/store"
import type { WorkspaceConfig, WorkspaceDomDeps, RevealActiveTabFn, FilePickerState } from "./types"
import { EMPTY_FILE_PICKER_STATE } from "./types"

interface ResearchCoordinatorDeps extends WorkspaceDomDeps {
  config: WorkspaceConfig
  revealActiveTab: RevealActiveTabFn
}

export default class ResearchCoordinator {
  private catalog: ResearchCatalogEntry[] = []
  private directories: string[] = []
  private filePicker: ResearchFilePicker
  private validation = new Map<string, { key: string; result: ResearchValidationResponse | null }>()
  private validationPending = new Map<string, string>()
  private catalogRefreshPromise: Promise<boolean> | null = null

  constructor(private deps: ResearchCoordinatorDeps) {
    this.filePicker = new ResearchFilePicker({
      getCatalog: () => this.catalog,
      getDirectories: () => this.directories,
      setCatalog: (entries, dirs) => {
        this.catalog = entries
        this.directories = dirs
      },
      getTabSystemPath: (tabId) => this.deps.store.tabs.find(t => t.id === tabId)?.researchConfig?.systemPath || null,
      onSystemOpened: (tabId, entry) => this.setResearchSystem(tabId, entry),
      onSystemPathChanged: (tabId, systemPath) => this.syncResearchSystemPath(tabId, systemPath),
      onSystemRemoved: (tabId) => this.clearResearchSystem(tabId),
      onRender: () => this.deps.renderFn(),
      getSidebarElement: () => this.deps.sidebarTarget,
      signal: this.deps.signal,
    })
  }

  disconnect(): void {
    this.validationPending.clear()
  }

  onTabRemoved(tabId: string): void {
    this.clearValidation(tabId)
  }

  setCatalogSnapshot(snapshot: { systems: ResearchCatalogEntry[]; directories: string[] }): void {
    this.catalog = snapshot.systems
    this.directories = snapshot.directories
  }

  async refreshCatalog(errorMessage = "Failed to refresh research catalog"): Promise<boolean> {
    if (this.catalogRefreshPromise) {
      // Second caller's errorMessage is discarded — first caller's toast fires on failure.
      return this.catalogRefreshPromise
    }

    this.catalogRefreshPromise = (async () => {
      try {
        const snapshot = await fetchResearchCatalog(this.deps.signal)
        if (this.deps.signal.aborted) return false
        this.setCatalogSnapshot(snapshot)
        return true
      } catch (error) {
        if (this.deps.signal.aborted) return false
        console.error(errorMessage, error)
        showToast(errorMessage, "error")
        return false
      } finally {
        this.catalogRefreshPromise = null
      }
    })()

    return this.catalogRefreshPromise
  }

  getCatalog(): ResearchCatalogEntry[] {
    return this.catalog
  }

  getDirectories(): string[] {
    return this.directories
  }

  addResearchTab(): void {
    this.deps.store.addResearchTab({ symbol: this.defaultResearchSymbol(), timeframe: this.defaultResearchTimeframe() })
    this.deps.revealActiveTab()
    this.deps.renderFn()
  }

  openFromSystemEditor(systemId: string, systemPath: string | null): void {
    if (!systemId) return

    const tab = this.deps.store.addResearchTab({ symbol: this.defaultResearchSymbol(), timeframe: this.defaultResearchTimeframe() })
    this.deps.revealActiveTab()
    const entry = this.findResearchCatalogEntry(systemPath || null, systemId)
    if (entry) {
      this.setResearchSystem(tab.id, entry)
    } else {
      this.deps.store.updateResearchConfig(tab.id, {
        systemId,
        systemPath: systemPath || "",
        systemYaml: "",
      })
    }
    this.deps.renderFn()
  }

  onConfigChanged(e: Event): void {
    const { tabId, config } = (e as CustomEvent<{ tabId: string; config: Record<string, unknown> }>).detail
    if (!tabId || !config) return
    this.deps.store.updateResearchConfig(tabId, config)
  }

  onResultChanged(e: Event): void {
    const { tabId, result } = (e as CustomEvent<{ tabId: string; result: ResearchResult }>).detail
    if (!tabId || !result) return
    this.deps.store.updateResearchResult(tabId, result)
  }

  updateActiveConfigFromSidebar(_e?: Event): ResearchConfig | null {
    return this.syncActiveResearchConfigFromSidebar()
  }

  async runActive(): Promise<void> {
    const next = this.syncActiveResearchConfigFromSidebar()
    if (!next) return
    const tab = this.deps.store.activeTab
    if (!tab || tab.type !== "research") return

    this.deps.renderFn()
    await this.activeResearchController()?.run(next)
  }

  filePickerState(): FilePickerState {
    const tab = this.activeResearchTab()
    if (!tab) return EMPTY_FILE_PICKER_STATE
    return {
      open: this.filePicker.isOpen(tab.id),
      query: this.filePicker.getQuery(tab.id),
      directoryPath: this.filePicker.getDirectory(tab.id, tab.researchConfig?.systemPath || null),
      selectedPath: this.filePicker.getSelected(tab.id, tab.researchConfig?.systemPath || null),
    }
  }

  openFilePicker(): void {
    this.withActiveResearchTab(tab => {
      this.filePicker.openPicker(tab.id, tab.researchConfig?.systemPath || null)
    })
  }

  closeFilePicker(): void {
    this.withActiveResearchTab(tab => this.filePicker.closePicker(tab.id))
  }

  onFilePickerQueryChanged(e: Event): void {
    this.withActiveResearchTab(tab => {
      const value = (e as CustomEvent<{ value?: string }>).detail?.value || ""
      this.filePicker.updateQuery(tab.id, value)
    })
  }

  onFileManagerEntrySelected(e: Event): void {
    this.withActiveResearchTab(tab => {
      const detail = (e as CustomEvent<{ mouseDetail?: number; path?: string; kind?: string }>).detail
      const path = detail.path || null
      const kind = detail.kind || "file"
      const isDoubleClick = (detail.mouseDetail ?? 1) >= 2
      this.filePicker.selectEntryByPath(tab.id, path, kind, isDoubleClick)
    })
  }

  onFileManagerNavigated(e: Event): void {
    this.withActiveResearchTab(tab => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      this.filePicker.navigate(tab.id, path)
    })
  }

  confirmFileSelection(): void {
    this.withActiveResearchTab(tab => this.filePicker.confirmSelection(tab.id))
  }

  async createDirectory(): Promise<void> {
    const tab = this.activeResearchTab()
    if (!tab) return
    await this.filePicker.createDirectory(tab.id)
  }

  async renameEntry(): Promise<void> {
    const tab = this.activeResearchTab()
    if (!tab) return
    await this.filePicker.renameEntry(tab.id)
  }

  async deleteEntry(): Promise<void> {
    const tab = this.activeResearchTab()
    if (!tab) return
    await this.filePicker.deleteEntry(tab.id)
  }

  prepareActiveRender(): ResearchValidatedSystem | null {
    const activeTab = this.deps.store.activeTab
    if (activeTab?.type !== "research" || !activeTab.researchConfig) return null

    const entry = this.syncResearchSystemFromCatalog(activeTab.id, activeTab.researchConfig)
    if (entry) {
      this.ensureResearchValidation(activeTab.id, entry)
    } else {
      this.clearValidation(activeTab.id)
    }

    return this.validation.get(activeTab.id)?.result?.system || null
  }

  private findResearchCatalogEntry(systemPath: string | null, systemId: string | null): ResearchCatalogEntry | null {
    if (systemPath) {
      const byPath = this.catalog.find(entry => entry.relative_path === systemPath)
      if (byPath) return byPath
    }
    if (systemId) {
      const byId = this.catalog.find(entry => entry.id === systemId)
      if (byId) return byId
    }
    return null
  }

  private setResearchSystem(tabId: string, entry: ResearchCatalogEntry): void {
    this.deps.store.updateResearchConfig(tabId, {
      systemId: entry.id,
      systemPath: entry.relative_path,
      systemYaml: entry.yaml,
    })
    this.clearValidation(tabId)
    this.ensureResearchValidation(tabId, entry)
  }

  private syncResearchSystemPath(tabId: string, systemPath: string): void {
    const entry = this.findResearchCatalogEntry(systemPath, null)
    if (entry) {
      this.setResearchSystem(tabId, entry)
      return
    }

    this.deps.store.updateResearchConfig(tabId, {
      systemPath,
      systemYaml: "",
    })
    this.clearValidation(tabId)
  }

  private clearResearchSystem(tabId: string): void {
    this.deps.store.updateResearchConfig(tabId, {
      systemId: CLEARED_RESEARCH_SYSTEM_VALUE,
      systemPath: CLEARED_RESEARCH_SYSTEM_VALUE,
      systemYaml: CLEARED_RESEARCH_SYSTEM_VALUE,
    })
    this.clearValidation(tabId)
  }

  private syncActiveResearchConfigFromSidebar(): ResearchConfig | null {
    const tab = this.activeResearchTab()
    if (!tab) return null

    const next = {
      ...(tab.researchConfig || buildDefaultResearchState({
        symbols: this.deps.config.symbols,
        timeframes: this.deps.config.timeframes,
        indicators: this.deps.config.indicators,
      })),
    }

    syncResearchStateFromInputs(this.deps.sidebarTarget, next)
    this.deps.store.updateResearchConfig(tab.id, next)
    return next
  }

  private activeResearchController(): { run(state?: ResearchConfig): Promise<void> } | null {
    const tab = this.activeResearchTab()
    if (!tab) return null

    const wrapper = this.deps.panelsTarget.querySelector(`[data-tab-wrapper="${tab.id}"] [data-controller='research']`) as HTMLElement | null
    if (!wrapper) return null

    return this.deps.application.getControllerForElementAndIdentifier(wrapper, "research") as { run(state?: ResearchConfig): Promise<void> } | null
  }

  private activeResearchTab(): (Tab & { type: "research" }) | null {
    const tab = this.deps.store.activeTab
    return tab?.type === "research" ? tab as Tab & { type: "research" } : null
  }

  private defaultResearchTimeframe(): string {
    return this.deps.config.timeframes.includes(DEFAULT_RESEARCH_TIMEFRAME)
      ? DEFAULT_RESEARCH_TIMEFRAME
      : (this.deps.config.timeframes[0] || DEFAULT_RESEARCH_TIMEFRAME)
  }

  private defaultResearchSymbol(): string {
    return this.deps.config.symbols[0] || DEFAULT_RESEARCH_SYMBOL
  }

  private withActiveResearchTab(fn: (tab: Tab & { type: "research" }) => void): void {
    const tab = this.activeResearchTab()
    if (tab) fn(tab)
  }

  private clearValidation(tabId: string): void {
    this.validation.delete(tabId)
    this.validationPending.delete(tabId)
  }

  private syncResearchSystemFromCatalog(tabId: string, config: ResearchConfig): ResearchCatalogEntry | null {
    const entry = this.findResearchCatalogEntry(config.systemPath || null, config.systemId || null)
    if (!entry) return null

    if (
      config.systemId !== entry.id ||
      config.systemPath !== entry.relative_path ||
      config.systemYaml !== entry.yaml
    ) {
      this.deps.store.updateResearchConfig(tabId, {
        systemId: entry.id,
        systemPath: entry.relative_path,
        systemYaml: entry.yaml,
      })
    }

    return entry
  }

  private ensureResearchValidation(tabId: string, entry: ResearchCatalogEntry): void {
    if (this.deps.signal.aborted) return

    const key = `${entry.relative_path}:${hashText(entry.yaml)}`
    if (this.validation.get(tabId)?.key === key) return
    if (this.validationPending.get(tabId) === key) return

    this.validationPending.set(tabId, key)

    void validateResearchSystem(entry.yaml, entry.id, this.deps.signal)
      .then((result) => {
        if (this.deps.signal.aborted) return
        if (this.validationPending.get(tabId) !== key) return

        this.validationPending.delete(tabId)
        this.validation.set(tabId, { key, result })

        const targets = result?.system?.optimization_targets || []
        const currentTarget = this.deps.store.tabs.find(tab => tab.id === tabId && tab.type === "research")?.researchConfig?.optimizationTarget
        const fallbackTarget = targets[0]?.value

        if (fallbackTarget && (!currentTarget || !targets.some(option => option.value === currentTarget))) {
          this.deps.store.updateResearchConfig(tabId, { optimizationTarget: fallbackTarget })
        }

        this.deps.renderFn()
      })
      .catch((error) => {
        console.error("Failed to validate research system", error)
        if (this.validationPending.get(tabId) === key) {
          this.validationPending.delete(tabId)
          this.validation.delete(tabId)
          if (!this.deps.signal.aborted) this.deps.renderFn()
        }
      })
  }
}
