import { hydrateWorkspaceAssistantState } from "../assistant/state"
import { relativeDirname } from "../research/file_manager"
import { loadWorkspaceAssistantState, saveWorkspaceAssistantState } from "../tabs/persistence"
import { showToast } from "../services/toast"
import { hashText } from "../utils/text_hash"
import { DEFAULT_CUSTOM_SYSTEM_ID } from "../config/constants"
import type { ResearchDslDiagnostic } from "../research/dsl"
import type {
  AssistantTarget,
  SystemEditorConfig,
  AssistantWorkspaceSnapshot,
  WorkspaceAssistantState,
} from "../types/store"
import type { RevealActiveTabFn, WorkspaceBaseDeps } from "./types"

interface AssistantCoordinatorDeps extends WorkspaceBaseDeps {
  revealActiveTab: RevealActiveTabFn
  getSystemEditorDiagnostics: (tabId: string) => ResearchDslDiagnostic[]
  clearSystemEditorDiagnostics: (tabId: string) => void
}

interface AssistantLinkedTargetContext {
  system_yaml: string
  system_id: string | null
  source_path: string | null
  yaml_hash: string
  diagnostics: ResearchDslDiagnostic[]
}

export default class AssistantCoordinator {
  private state: WorkspaceAssistantState = hydrateWorkspaceAssistantState(loadWorkspaceAssistantState())
  private disconnected = false

  constructor(private deps: AssistantCoordinatorDeps) {}

  disconnect(): void {
    this.disconnected = true
  }

  stateJson(): string {
    return JSON.stringify(this.state)
  }

  workspaceSnapshotJson(): string {
    return JSON.stringify(this.workspaceSnapshot())
  }

  linkedTargetContextJson(): string {
    return JSON.stringify(this.linkedTargetContext())
  }

  private ensureAssistantTab(): void {
    this.deps.store.addAssistantTab()
  }

  addAssistantTab(): void {
    this.ensureAssistantTab()
    this.deps.revealActiveTab()
    this.deps.renderFn()
  }

  reconcileLinkedTarget(): void {
    const target = this.state.linkedTarget
    if (!target) return

    const tab = this.deps.store.tabs.find(item => item.id === target.tabId && item.type === "system_editor")
    if (!tab?.systemEditorConfig) {
      this.state.linkedTarget = null
      this.persist()
      return
    }

    this.state.linkedTarget = { type: "system_editor", tabId: tab.id }
  }

  onTabRemoved(_tabId: string): void {
    this.reconcileLinkedTarget()
  }

  isLinkedToSystemEditor(tabId: string): boolean {
    return this.state.linkedTarget?.type === "system_editor" && this.state.linkedTarget.tabId === tabId
  }

  openForSystemEditor(tabId: string): void {
    this.ensureAssistantTab()
    if (this.linkToSystemEditor(tabId, false, false)) {
      this.deps.revealActiveTab()
    }
    this.deps.renderFn()
  }

  linkToSystemEditor(tabId: string, toast = true, render = true): boolean {
    if (!this.deps.store.tabs.some(tab => tab.id === tabId && tab.type === "system_editor")) return false

    const previousTabId = this.state.linkedTarget?.tabId ?? null
    this.state.linkedTarget = { type: "system_editor", tabId }
    if (previousTabId !== tabId) {
      // Switching editors clears the active chat so old context is not sent accidentally.
      this.state.currentChatId = null
    }
    this.persist()
    if (render) this.deps.renderFn()
    if (toast) showToast("Assistant linked to this system editor", "success")
    return previousTabId !== tabId
  }

  onStateChanged(e: Event): void {
    const detail = (e as CustomEvent<{ state: WorkspaceAssistantState }>).detail
    if (!detail?.state) return

    this.state = hydrateWorkspaceAssistantState(detail.state)
    this.reconcileLinkedTarget()
    this.persist()
    this.deps.renderFn()
  }

  openDraftInSystemEditor(e: Event): void {
    const detail = (e as CustomEvent<{
      yaml: string
      suggestedSystemId?: string | null
      sourcePath?: string | null
    }>).detail
    if (!detail?.yaml) return

    const sourcePath = detail.sourcePath || null
    const suggestedSystemId = detail.suggestedSystemId || DEFAULT_CUSTOM_SYSTEM_ID
    const tab = this.deps.store.addSystemEditorTab({
      systemId: suggestedSystemId,
      sourceSystemId: sourcePath ? suggestedSystemId : null,
      sourcePath,
      directoryPath: relativeDirname(sourcePath),
      systemYaml: detail.yaml,
    })

    this.linkToSystemEditor(tab.id, false, false)
    this.deps.clearSystemEditorDiagnostics(tab.id)
    this.deps.revealActiveTab()
    this.deps.renderFn()
    showToast("Draft opened in System editor", "success")
  }

  applyDraftToLinkedEditor(e: Event): void {
    const detail = (e as CustomEvent<{
      yaml: string
      target: AssistantTarget
      suggestedSystemId?: string | null
      sourcePath?: string | null
    }>).detail
    if (!detail?.yaml || detail.target?.type !== "system_editor") return

    const tab = this.deps.store.tabs.find(item => item.id === detail.target?.tabId && item.type === "system_editor")
    if (!tab?.systemEditorConfig) return

    const updates: Partial<SystemEditorConfig> = {
      systemYaml: detail.yaml,
    }

    if (detail.suggestedSystemId && !tab.systemEditorConfig.sourcePath) {
      updates.systemId = detail.suggestedSystemId
    }
    if (detail.sourcePath && !tab.systemEditorConfig.sourcePath) {
      updates.sourcePath = detail.sourcePath
      updates.directoryPath = relativeDirname(detail.sourcePath)
      updates.sourceSystemId = detail.suggestedSystemId || tab.systemEditorConfig.sourceSystemId
    }

    this.deps.store.updateSystemEditorConfig(tab.id, updates)
    this.linkToSystemEditor(tab.id, false, false)
    this.deps.clearSystemEditorDiagnostics(tab.id)
    this.deps.renderFn()
    showToast("Assistant draft applied to linked editor", "success")
  }

  private workspaceSnapshot(): AssistantWorkspaceSnapshot {
    return {
      activeTabId: this.deps.store.activeTabId,
      tabs: this.deps.store.tabs.map(tab => ({
        id: tab.id,
        type: tab.type,
        label: this.deps.store.tabLabel(tab),
        sourcePath: tab.type === "system_editor" ? tab.systemEditorConfig?.sourcePath || null : null,
        systemId: tab.type === "system_editor" ? tab.systemEditorConfig?.systemId || null : null,
      })),
    }
  }

  private linkedTargetContext(): AssistantLinkedTargetContext | null {
    const target = this.state.linkedTarget
    if (!target || target.type !== "system_editor") return null

    const tab = this.deps.store.tabs.find(item => item.id === target.tabId && item.type === "system_editor")
    const config = tab?.systemEditorConfig
    if (!config) return null

    return {
      system_yaml: config.systemYaml || "",
      system_id: config.systemId || null,
      source_path: config.sourcePath || null,
      yaml_hash: hashText(config.systemYaml || ""),
      diagnostics: this.deps.getSystemEditorDiagnostics(tab.id),
    }
  }

  private persist(): void {
    if (this.disconnected) return
    saveWorkspaceAssistantState(this.state)
  }
}
