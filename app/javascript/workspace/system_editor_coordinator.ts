import { relativeDirname } from "../research/file_manager"
import { showToast } from "../services/toast"
import type { ResearchDslDiagnostic } from "../research/dsl"
import type { SystemEditorConfig } from "../types/store"
import type { WorkspaceConfig, WorkspaceBaseDeps, RevealActiveTabFn } from "./types"
import type ResearchCoordinator from "./research_coordinator"
import type AssistantCoordinator from "./assistant_coordinator"

const SYSTEM_EDITOR_CONFIG_CHANGED_FIELDS = [
  "systemId",
  "sourceSystemId",
  "sourcePath",
  "directoryPath",
  "systemYaml",
  "searchQuery",
] as const satisfies ReadonlyArray<keyof SystemEditorConfig>

type ActiveResearchEditorConfig = Pick<
  SystemEditorConfig,
  "systemId" | "sourceSystemId" | "sourcePath" | "directoryPath" | "systemYaml"
>

interface SystemEditorCoordinatorDeps extends WorkspaceBaseDeps {
  config: WorkspaceConfig
  research: ResearchCoordinator
  assistant: AssistantCoordinator
  revealActiveTab: RevealActiveTabFn
}

export default class SystemEditorCoordinator {
  private diagnostics = new Map<string, ResearchDslDiagnostic[]>()
  private disconnected = false

  constructor(private deps: SystemEditorCoordinatorDeps) {}

  disconnect(): void {
    this.disconnected = true
  }

  diagnosticsFor(tabId: string): ResearchDslDiagnostic[] {
    return this.diagnostics.get(tabId) || []
  }

  clearDiagnostics(tabId: string): void {
    this.diagnostics.delete(tabId)
  }

  onTabRemoved(tabId: string): void {
    this.clearDiagnostics(tabId)
  }

  addSystemEditorTab(): void {
    this.createSystemEditorTab(this.activeResearchEditorConfig() || {}, true)
  }

  openFromActiveResearch(): void {
    if (this.deps.store.activeTab?.type !== "research") return
    const config = this.activeResearchEditorConfig()
    this.createSystemEditorTab(config || {}, false)
  }

  onConfigChanged(e: Event): void {
    const { tabId, config, diagnostics } = (e as CustomEvent<{
      tabId: string
      config: Record<string, unknown>
      diagnostics?: ResearchDslDiagnostic[]
    }>).detail
    if (!tabId || !config) return
    const currentTab = this.deps.store.tabs.find(item => item.id === tabId && item.type === "system_editor")
    if (!currentTab) {
      this.diagnostics.delete(tabId)
      return
    }

    const configChanged = this.systemEditorConfigChanged(currentTab.systemEditorConfig || null, config)
    let tab = currentTab
    if (configChanged) {
      if (!this.deps.store.updateSystemEditorConfig(tabId, config)) {
        this.diagnostics.delete(tabId)
        return
      }
      const updatedTab = this.deps.store.tabs.find(item => item.id === tabId && item.type === "system_editor")
      if (!updatedTab?.systemEditorConfig) {
        this.diagnostics.delete(tabId)
        return
      }
      tab = updatedTab
    }

    if (tab.systemEditorConfig) {
      this.diagnostics.set(tabId, Array.isArray(diagnostics) ? diagnostics : [])
    } else {
      this.diagnostics.delete(tabId)
    }

    // SystemEditorController owns its visible editing state while it is active.
    // Avoid a parent rerender on every keystroke; only rerender assistant context.
    if (this.deps.store.activeTab?.type === "assistant" && this.deps.assistant.isLinkedToSystemEditor(tabId)) {
      this.deps.renderFn()
    }
  }

  async onCatalogChanged(_e: Event): Promise<void> {
    try {
      await this.deps.research.refreshCatalog()
      if (this.disconnected) return
      this.deps.renderFn()
    } catch (error) {
      console.error("Failed to refresh research catalog", error)
      showToast("Failed to refresh system catalog", "error")
    }
  }

  onOpenResearch(e: Event): void {
    const { systemId, systemPath } = (e as CustomEvent<{ systemId: string; systemPath: string | null }>).detail
    this.deps.research.openFromSystemEditor(systemId, systemPath)
  }

  onOpenAssistant(e: Event): void {
    const { tabId } = (e as CustomEvent<{ tabId: string }>).detail
    this.deps.assistant.openForSystemEditor(tabId)
  }

  onLinkAssistantTarget(e: Event): void {
    const detail = (e as CustomEvent<{ tabId: string }>).detail
    if (!detail?.tabId) return
    this.deps.assistant.linkToSystemEditor(detail.tabId, true)
  }

  private systemEditorConfigChanged(
    current: SystemEditorConfig | null,
    next: Record<string, unknown>,
  ): boolean {
    if (!current) return true

    return SYSTEM_EDITOR_CONFIG_CHANGED_FIELDS.some(field => current[field] !== next[field])
  }

  private activeResearchEditorConfig(): ActiveResearchEditorConfig | null {
    const activeResearch = this.deps.store.activeTab?.type === "research" ? this.deps.store.activeTab : null
    if (!activeResearch) return null

    const systemId = activeResearch?.researchConfig?.systemId
    if (!systemId) return null

    const sourcePath = activeResearch?.researchConfig?.systemPath || null
    return {
      systemId,
      sourceSystemId: systemId,
      sourcePath,
      directoryPath: relativeDirname(sourcePath),
      systemYaml: "",
    }
  }

  private createSystemEditorTab(config: Partial<SystemEditorConfig>, reveal: boolean): void {
    this.deps.store.addSystemEditorTab(config)
    if (reveal) this.deps.revealActiveTab()
    this.deps.renderFn()
  }
}
