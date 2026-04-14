import { Controller } from "@hotwired/stimulus"
import {
  checkLlmConnection,
  createAssistantChat,
  deleteAssistantChat,
  fetchAssistantChat,
  fetchAssistantChats,
  fetchLlmSettings,
  renameAssistantChat,
  saveLlmSettings,
  sendAssistantMessage,
  type AssistantChatMessage,
  type AssistantChatPayload,
  type AssistantChatSummary,
  type AssistantDraftPayload,
  type LlmConnectionCheckPayload,
  type LlmSettingsDraft,
  type LlmSettingsPayload,
} from "../system_editor/assistant_api"
import {
  deleteResearchSystem,
  fetchResearchCatalog,
  fetchResearchEditorMetadata,
  renameResearchSystem,
  saveResearchSystem,
  type ResearchCatalogEntry,
  type ResearchDslDiagnostic,
  type ResearchValidationResponse,
} from "../research/dsl"
import { relativeDirname } from "../research/file_manager"
import monitor from "../services/connection_monitor"
import { showToast } from "../services/toast"
import {
  buildStarterSystemYaml,
  hydrateSystemEditorState,
  SYSTEM_EDITOR_DEFAULT_SIDEBAR_WIDTH_PX,
} from "../system_editor/state"
import { clampSidebarWidth } from "../tabs/sidebar_prefs"
import { AssistantChatSubscription } from "../system_editor/chat_subscription"
import {
  currentFileNameHTML,
  diagnosticsHTML,
  renderSystemEditorHTML,
  statusLabel,
} from "../system_editor/templates"
import {
  collectConditionExpressionDiagnostics,
  setConditionExpressionMetadata,
} from "../system_editor/condition_expression"
import { YamlAutocomplete } from "../system_editor/autocomplete"
import { EditorCore } from "../system_editor/editor_core"
import { FilePickerModule } from "../system_editor/file_picker"
import { ValidationModule } from "../system_editor/validation"
import { setHighlightConfig } from "../system_editor/yaml_highlighter"
import type { SystemEditorConfig } from "../types/store"

type ConfirmDialogState = {
  action: "delete-system" | "delete-chat" | "delete-file-entry" | "apply-draft-overwrite"
  tone: "danger" | "warning"
  title: string
  body: string
  confirmLabel: string
}

type RenameDialogState = {
  title: string
  body: string
  confirmLabel: string
  value: string
}

export default class extends Controller {
  static values = { tabId: String, config: String }

  declare tabIdValue: string
  declare configValue: string

  private state: SystemEditorConfig | null = null
  private catalog: ResearchCatalogEntry[] = []
  private directories: string[] = []
  private validation: ResearchValidationResponse | null = null
  private localDiagnostics: ResearchDslDiagnostic[] = []
  private validating = false
  private saving = false

  private assistantChats: AssistantChatSummary[] = []
  private assistantCurrentChat: AssistantChatSummary | null = null
  private assistantMessages: AssistantChatMessage[] = []
  private assistantDraft: AssistantDraftPayload | null = null
  private assistantInput = ""
  private assistantLoading = false
  private assistantChatsLoading = false
  private assistantError: string | null = null
  private assistantSettings: LlmSettingsPayload | null = null
  private assistantSettingsDraft: LlmSettingsDraft | null = null
  private assistantSettingsOpen = false
  private assistantSettingsSaving = false
  private assistantSettingsChecking = false
  private assistantSettingsCheck: LlmConnectionCheckPayload | null = null
  private assistantScrollToBottomPending = false
  private assistantScrollSnapshot: { top: number; pinnedToBottom: boolean } | null = null
  private assistantChatSubscription: AssistantChatSubscription | null = null
  private assistantSubscribedChatId: number | null = null
  private assistantExpandedReasoningIds = new Set<number>()
  private renameDialog: RenameDialogState | null = null
  private confirmDialog: ConfirmDialogState | null = null

  private editor!: EditorCore
  private validator!: ValidationModule
  private filePicker!: FilePickerModule
  private autocomplete!: YamlAutocomplete

  private _onConnectionChange = () => {
    this._renderSafely()
    if (monitor.isOnline) {
      void this._loadAssistantSettings()
      void this._loadAssistantChats()
    }
  }

  async connect() {
    window.addEventListener("connection:change", this._onConnectionChange)
    this.autocomplete = new YamlAutocomplete()
    this.editor = new EditorCore(this.element as HTMLElement)
    this.validator = new ValidationModule((result, validating, updatedId) => {
      this.validating = validating
      if (result !== undefined) this.validation = result
      if (updatedId && this.state) {
        this.state.systemId = updatedId
        this._persistState()
      }
      if (!this._refreshDynamicView()) this._renderSafely()
    })
    this.filePicker = new FilePickerModule(this.element as HTMLElement, {
      getState: () => this.state,
      getCatalog: () => this.catalog,
      getDirectories: () => this.directories,
      setCatalog: (entries, dirs) => { this.catalog = entries; this.directories = dirs },
      updateState: updater => { if (this.state) updater(this.state) },
      onRender: () => this._renderSafely(),
      onPersist: () => this._persistState(),
      onCatalogChanged: system => this._dispatchCatalogChanged(system),
      onOpenSystem: () => this._revalidateOpenedSystem(),
    })

    this.element.innerHTML = `<div class="flex h-full items-center justify-center text-sm text-gray-500 animate-pulse">Loading system editor...</div>`

    const [snapshot, editorMetadata] = await Promise.all([fetchResearchCatalog(), fetchResearchEditorMetadata()])
    const config = editorMetadata
      ? { keywords: new Set(editorMetadata.highlight.keywords), values: new Set(editorMetadata.highlight.values) }
      : { keywords: new Set<string>(), values: new Set<string>() }

    setHighlightConfig(config)
    this.autocomplete.setConfig(config)
    setConditionExpressionMetadata(editorMetadata?.condition_expression ?? null)
    this.catalog = snapshot.systems
    this.directories = snapshot.directories
    this.state = hydrateSystemEditorState(this._storedConfig())
    this._ensureLoadedYaml()
    this._refreshLocalDiagnostics()
    this._persistState()
    this._renderSafely()

    await Promise.allSettled([
      this.validator.run(this.state, true),
      this._loadAssistantSettings(),
      this._loadAssistantChats(),
    ])
  }

  disconnect() {
    this.validator.cancel()
    this.autocomplete.destroy()
    this._disconnectAssistantChatSubscription()
    window.removeEventListener("connection:change", this._onConnectionChange)
  }

  configValueChanged() {
    if (!this.editor) return

    const previousState = this.state
    const next = hydrateSystemEditorState(this._storedConfig())
    if (JSON.stringify(previousState) === JSON.stringify(next)) return

    this.state = next
    this._ensureLoadedYaml()
    this._refreshLocalDiagnostics()
    this._renderSafely()
    void this.validator.run(this.state, true)

    if (previousState?.assistantChatId !== next.assistantChatId && next.assistantChatId) {
      void this._loadAssistantChat(next.assistantChatId)
    }
  }

  // File picker actions

  openFilePicker() {
    this.filePicker.openPicker(this._currentDirectoryPath(), this.state?.sourcePath || null)
  }

  closeFilePicker() {
    this.filePicker.closePicker()
  }

  updateFilePickerQuery(e: Event) {
    this.filePicker.updateQuery((e.currentTarget as HTMLInputElement).value)
  }

  stopFileManagerPropagation(e: Event) {
    e.stopPropagation()
  }

  selectFileManagerEntry(e: Event) {
    this.filePicker.selectEntry(e.currentTarget as HTMLElement, (e as MouseEvent).detail >= 2)
  }

  navigateFileManager(e: Event) {
    this.filePicker.navigate((e.currentTarget as HTMLElement).dataset.path || "")
  }

  openFileManagerEntry(e: Event) {
    const el = e.currentTarget as HTMLElement
    this.filePicker.openSystemFile.call(this.filePicker, el.dataset.path || "")
  }

  confirmFileSelection() {
    this.filePicker.confirmSelection()
  }

  async createDirectory() {
    await this.filePicker.createDirectory()
  }

  async createFile() {
    await this.filePicker.createFile()
  }

  async renameFileManagerEntry() {
    await this.filePicker.renameEntry()
  }

  deleteFileManagerEntry() {
    const selectedPath = this.filePicker.selectedPath
    if (!selectedPath) return

    this.confirmDialog = {
      action: "delete-file-entry",
      tone: "danger",
      title: "Delete selected item?",
      body: `${selectedPath} will be removed from the research systems directory. This action cannot be undone.`,
      confirmLabel: "Delete item",
    }
    this._renderSafely()
  }

  // System actions

  newSystem() {
    if (!this.state) return

    this.state.systemId = "custom_system"
    this.state.sourceSystemId = null
    this.state.sourcePath = null
    this.state.directoryPath = this._currentDirectoryPath()
    this.state.systemYaml = buildStarterSystemYaml()
    this.validation = null
    this._refreshLocalDiagnostics()
    this._persistState()
    this._renderSafely()
    void this.validator.run(this.state, true)
  }

  resetSystem() {
    if (!this.state?.sourceSystemId) return
    const entry = this.catalog.find(item => item.relative_path === this.state?.sourcePath)
      || this.catalog.find(item => item.id === this.state?.sourceSystemId)
    if (!entry) return

    this.state.systemId = entry.id
    this.state.sourceSystemId = entry.id
    this.state.sourcePath = entry.relative_path
    this.state.directoryPath = relativeDirname(entry.relative_path)
    this.state.systemYaml = entry.yaml
    this._refreshLocalDiagnostics()
    this._persistState()
    this._renderSafely()
    void this.validator.run(this.state, true)
  }

  updateYaml() {
    if (!this.state) return
    const textarea = this.editor.yamlTextarea()
    if (!textarea) return

    this.state.systemYaml = textarea.value
    this._refreshLocalDiagnostics()
    this._persistState()
    this.autocomplete.handleInput(textarea)
    if (!this._refreshDynamicView()) this._renderSafely()
    void this.validator.run(this.state, false)
  }

  syncEditorScroll() {
    this.editor.syncScroll()
  }

  updateSearchQuery() {
    if (!this.state) return
    const input = this.editor.searchInput()
    if (!input) return
    this.state.searchQuery = input.value
    this._persistState()
    if (!this._refreshDynamicView()) this._renderSafely()
  }

  async validateNow() {
    await this.validator.run(this.state, true)
  }

  async saveSystem() {
    if (!this.state) return

    this.saving = true
    this._renderSafely()

    try {
      const response = await saveResearchSystem(this.state.systemYaml, this.state.sourcePath, this.state.directoryPath)
      if (!response) {
        showToast("System save failed")
        return
      }

      if (!response.ok || !response.system) {
        this.validation = { ok: false, diagnostics: response.diagnostics, system: null }
        this._renderSafely()
        this.editor.focusDiagnostic(response.diagnostics[0] || null)
        showToast(response.diagnostics[0]?.message || "System save failed")
        return
      }

      const saved = response.system
      this.catalog = this._mergeCatalogEntry(saved)
      this.state.systemId = saved.id
      this.state.sourceSystemId = saved.id
      this.state.sourcePath = saved.relative_path
      this.state.directoryPath = relativeDirname(saved.relative_path)
      this.state.systemYaml = saved.yaml
      this.validation = { ok: true, diagnostics: [], system: saved.metadata }
      this._refreshLocalDiagnostics()
      this._persistState()
      this._renderSafely()
      this._dispatchCatalogChanged(saved)
      showToast(`Saved ${saved.relative_path}`, "success")
    } finally {
      this.saving = false
      this._renderSafely()
    }
  }

  async renameSystem() {
    if (!this.state?.sourcePath || !this.state?.sourceSystemId) return

    const nextId = window.prompt("New system id", this.state.sourceSystemId)?.trim()
    if (!nextId || nextId === this.state.sourceSystemId) return

    this.saving = true
    this._renderSafely()

    try {
      const response = await renameResearchSystem(this.state.sourcePath, nextId, this.state.systemYaml)
      if (!response) {
        showToast("System rename failed")
        return
      }

      if (!response.ok || !response.system) {
        this.validation = { ok: false, diagnostics: response.diagnostics, system: null }
        this._renderSafely()
        this.editor.focusDiagnostic(response.diagnostics[0] || null)
        showToast(response.diagnostics[0]?.message || "System rename failed")
        return
      }

      const renamed = response.system
      this.catalog = this._replaceCatalogEntry(this.state.sourcePath, renamed)
      this.state.systemId = renamed.id
      this.state.sourceSystemId = renamed.id
      this.state.sourcePath = renamed.relative_path
      this.state.directoryPath = relativeDirname(renamed.relative_path)
      this.state.systemYaml = renamed.yaml
      this.validation = { ok: true, diagnostics: [], system: renamed.metadata }
      this._refreshLocalDiagnostics()
      this._persistState()
      this._renderSafely()
      this._dispatchCatalogChanged(renamed)
      showToast(`Renamed to ${renamed.relative_path}`, "success")
    } finally {
      this.saving = false
      this._renderSafely()
    }
  }

  deleteSystem() {
    if (!this.state?.sourcePath || !this.state?.sourceSystemId) return

    const sourceFileName = this._currentEntry()?.relative_path || this.state.sourcePath
    this.confirmDialog = {
      action: "delete-system",
      tone: "danger",
      title: "Delete system file?",
      body: `${sourceFileName} will be removed from the research systems directory. This action cannot be undone.`,
      confirmLabel: "Delete system",
    }
    this._renderSafely()
  }

  // Editor keyboard/search actions

  findNext() {
    this.editor.findMatch(1, this.state)
  }

  findPrevious() {
    this.editor.findMatch(-1, this.state)
  }

  handleSearchKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return
    e.preventDefault()
    this.editor.findMatch(e.shiftKey ? -1 : 1, this.state)
  }

  handleEditorKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault()
      void this.saveSystem()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
      e.preventDefault()
      this.editor.searchInput()?.focus()
      this.editor.searchInput()?.select()
      return
    }
    if (e.key === "F3") {
      e.preventDefault()
      this.editor.findMatch(e.shiftKey ? -1 : 1, this.state)
      return
    }
    if (isUndoShortcut(e)) {
      e.preventDefault()
      const ta = this.editor.yamlTextarea()
      if (ta) {
        applyNativeHistory(ta, "undo")
        requestAnimationFrame(() => {
          if (this.state?.systemYaml !== ta.value) this.updateYaml()
        })
      }
      return
    }
    if (isRedoShortcut(e)) {
      e.preventDefault()
      const ta = this.editor.yamlTextarea()
      if (ta) {
        applyNativeHistory(ta, "redo")
        requestAnimationFrame(() => {
          if (this.state?.systemYaml !== ta.value) this.updateYaml()
        })
      }
      return
    }

    if (e.key === "Tab") {
      e.preventDefault()
      if (this.autocomplete.acceptSelection()) {
        e.stopImmediatePropagation()
        return
      }
      const ta = this.editor.yamlTextarea()
      if (ta) {
        editorInsert(ta, "  ")
        this.editor.ensureSelectionVisible()
      }
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      if (!this.autocomplete.isVisible) {
        const ta = this.editor.yamlTextarea()
        if (ta) {
          editorInsert(ta, `\n${currentLineIndent(ta)}`)
          this.editor.ensureSelectionVisible()
        }
      }
    }
  }

  openInTest() {
    if (!this.state?.sourceSystemId) return
    if (this._hasUnsavedChanges()) {
      showToast("Save the YAML file before using it in Test/Optimization")
      return
    }
    this.element.dispatchEvent(new CustomEvent("systemeditor:openResearch", {
      bubbles: true,
      detail: { systemId: this.state.sourceSystemId, systemPath: this.state.sourcePath },
    }))
  }

  focusDiagnostic(e: Event) {
    const button = e.currentTarget as HTMLElement
    this.editor.focusDiagnostic({
      line: Number(button.dataset.line || 1),
      column: Number(button.dataset.column || 1),
      length: Number(button.dataset.length || 1),
    })
  }

  switchSidebarPane(e: Event) {
    if (!this.state) return

    const pane = (e.currentTarget as HTMLElement).dataset.sidebarPaneValue
    if (pane !== "settings" && pane !== "llm") return
    if (this.state.sidebarPane === pane) return

    this.state.sidebarPane = pane
    this._persistState()
    this._renderSafely()
  }

  toggleSidebarCollapse() {
    if (!this.state || this.state.sidebarCollapsed) return

    this.state.sidebarCollapsed = true
    this._persistState()
    this._applySidebarLayout()
  }

  reopenSidebar() {
    if (!this.state || !this.state.sidebarCollapsed) return

    this.state.sidebarCollapsed = false
    this.state.sidebarWidth = this._clampSidebarWidth(this.state.sidebarWidth || SYSTEM_EDITOR_DEFAULT_SIDEBAR_WIDTH_PX)
    this._persistState()
    this._applySidebarLayout()
  }

  startSidebarResize(e: Event) {
    const mouseEvent = e as MouseEvent
    if (!this.state || mouseEvent.button !== 0 || this.state.sidebarCollapsed) return
    this._startSidebarResizeDrag(mouseEvent, this.state.sidebarWidth || SYSTEM_EDITOR_DEFAULT_SIDEBAR_WIDTH_PX)
  }

  startSidebarReopenResize(e: Event) {
    const mouseEvent = e as MouseEvent
    if (!this.state || mouseEvent.button !== 0) return

    const width = this._clampSidebarWidth(this.state.sidebarWidth || SYSTEM_EDITOR_DEFAULT_SIDEBAR_WIDTH_PX)
    if (this.state.sidebarCollapsed) {
      this.state.sidebarCollapsed = false
      this.state.sidebarWidth = width
      this._applySidebarLayout()
    }

    this._startSidebarResizeDrag(mouseEvent, width)
  }

  // Assistant actions

  openAssistantSettings() {
    this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    this.assistantSettingsCheck = null
    this.assistantSettingsOpen = true
    this._renderSafely()
  }

  closeAssistantSettings() {
    this.assistantSettingsOpen = false
    this._renderSafely()
  }

  closeConfirmDialog() {
    this.confirmDialog = null
    this._renderSafely()
  }

  closeRenameDialog() {
    this.renameDialog = null
    this._renderSafely()
  }

  stopAssistantSettingsPropagation(e: Event) {
    e.stopPropagation()
  }

  stopConfirmDialogPropagation(e: Event) {
    e.stopPropagation()
  }

  stopRenameDialogPropagation(e: Event) {
    e.stopPropagation()
  }

  async confirmDialogAction() {
    if (!this.confirmDialog) return

    const action = this.confirmDialog.action
    this.confirmDialog = null
    this._renderSafely()

    if (action === "delete-system") {
      await this._performDeleteSystem()
      return
    }

    if (action === "delete-chat") {
      await this._performDeleteAssistantChat()
      return
    }

    if (action === "delete-file-entry") {
      await this._performDeleteFileManagerEntry()
      return
    }

    if (action === "apply-draft-overwrite") {
      this._commitAssistantDraft()
    }
  }

  updateAssistantSettingsField(e: Event) {
    if (!this.assistantSettingsDraft) {
      this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    }
    this.assistantSettingsCheck = null

    const target = e.currentTarget as HTMLInputElement | HTMLSelectElement
    const field = target.dataset.field || ""
    const value = target.value

    switch (field) {
    case "assistantSettings.provider":
      if (this.state) {
        this.state.assistantSettingsProvider = value || null
        this._persistState()
      }
      this.assistantSettingsDraft = this._assistantSettingsDraftValue(value)
      this._renderSafely()
      break
    case "assistantSettings.model":
      this.assistantSettingsDraft.model = value
      break
    case "assistantSettings.apiKey":
      this.assistantSettingsDraft.api_key = value
      break
    case "assistantSettings.apiBase":
      this.assistantSettingsDraft.api_base = value
      break
    case "assistantSettings.temperature":
      this.assistantSettingsDraft.temperature = value
      break
    case "assistantSettings.maxOutputTokens":
      this.assistantSettingsDraft.max_output_tokens = value
      break
    default:
      break
    }
  }

  async saveAssistantSettings() {
    if (!this.assistantSettingsDraft) {
      this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    }

    this.assistantSettingsSaving = true
    this._renderSafely()

    try {
      const result = await saveLlmSettings(this.assistantSettingsDraft)
      if (!result.ok || !result.data) {
        this.assistantError = result.error || "Settings save failed"
        showToast(this.assistantError)
        return
      }

      this.assistantSettings = result.data
      if (this.state) {
        this.state.assistantSettingsProvider = result.data.setting.provider || null
        this._persistState()
      }
      this.assistantSettingsDraft = this._assistantSettingsDraftValue(result.data.setting.provider)
      this.assistantSettingsOpen = false
      this.assistantSettingsCheck = null
      this.assistantError = null
      this._renderSafely()
      showToast("Assistant settings saved", "success")
    } finally {
      this.assistantSettingsSaving = false
      this._renderSafely()
    }
  }

  async checkAssistantConnection() {
    if (!this.assistantSettingsDraft || this.assistantSettingsChecking) {
      if (!this.assistantSettingsDraft) this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    }
    if (!this.assistantSettingsDraft) return

    this.assistantSettingsChecking = true
    this.assistantSettingsCheck = null
    this._renderSafely()

    try {
      const result = await checkLlmConnection(this.assistantSettingsDraft)
      if (!result.ok || !result.data) {
        this.assistantSettingsCheck = result.data
          || {
            ok: false,
            message: result.error || "Connection check failed",
            normalized_api_base: this.assistantSettingsDraft.api_base || null,
            checked_url: null,
            models: [],
          }
        return
      }

      this.assistantSettingsCheck = result.data
    } finally {
      this.assistantSettingsChecking = false
      this._renderSafely()
    }
  }

  updateAssistantInput(e: Event) {
    this.assistantInput = (e.currentTarget as HTMLTextAreaElement).value
    this._syncAssistantSendButton()
  }

  handleAssistantInputKeydown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return
    e.preventDefault()
    void this.sendAssistantMessage()
  }

  async createAssistantChat() {
    if (!this._assistantConfigured()) {
      this.openAssistantSettings()
      return
    }

    const chat = await this._createAssistantChat()
    if (!chat) return

    this._applyAssistantChatPayload(chat)
    this._renderSafely()
  }

  async selectAssistantChat(e: Event) {
    const chatId = Number((e.currentTarget as HTMLSelectElement).value)
    if (!chatId) {
      this._clearAssistantSelection()
      this._renderSafely()
      return
    }

    await this._loadAssistantChat(chatId)
  }

  async renameAssistantChat() {
    if (!this.assistantCurrentChat) return

    this.renameDialog = {
      title: "Rename saved chat",
      body: "Update the title for this conversation.",
      confirmLabel: "Save title",
      value: this.assistantCurrentChat.title,
    }
    this._renderSafely()
  }

  deleteAssistantChat() {
    if (!this.assistantCurrentChat) return

    this.confirmDialog = {
      action: "delete-chat",
      tone: "danger",
      title: "Delete saved chat?",
      body: `The chat "${this.assistantCurrentChat.title}" will be removed from local history. This action cannot be undone.`,
      confirmLabel: "Delete chat",
    }
    this._renderSafely()
  }

  toggleAssistantReasoning(e: Event) {
    const details = e.currentTarget as HTMLDetailsElement
    const messageId = Number(details.dataset.messageId)
    if (!messageId) return

    if (details.open) {
      this.assistantExpandedReasoningIds.add(messageId)
    } else {
      this.assistantExpandedReasoningIds.delete(messageId)
    }
  }

  updateRenameDialogValue(e: Event) {
    if (!this.renameDialog) return

    this.renameDialog.value = (e.currentTarget as HTMLInputElement).value
    this._renderSafely()
  }

  handleRenameDialogKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return

    e.preventDefault()
    void this.submitRenameDialog()
  }

  async submitRenameDialog() {
    if (!this.assistantCurrentChat || !this.renameDialog) return

    const nextTitle = this.renameDialog.value.trim()
    const currentTitle = this.assistantCurrentChat.title
    this.renameDialog = null
    this._renderSafely()

    if (!nextTitle || nextTitle === currentTitle) return

    const result = await renameAssistantChat(this.assistantCurrentChat.id, nextTitle)
    if (!result.ok || !result.data) {
      this.assistantError = result.error || "Chat rename failed"
      showToast(this.assistantError)
      this._renderSafely()
      return
    }

    this._applyAssistantChatPayload(result.data)
    this._renderSafely()
    showToast("Chat renamed", "success")
  }

  async sendAssistantMessage() {
    if (!this.state || this.assistantLoading) return

    const content = this.assistantInput.trim()
    if (!content) return

    if (!this._assistantConfigured()) {
      this.openAssistantSettings()
      return
    }

    const currentChat = this.assistantCurrentChat
    const chatPayload = currentChat ? null : await this._createAssistantChat()
    const chatId = currentChat?.id || chatPayload?.chat.id
    if (!chatId) return

    if (chatPayload) {
      this._applyAssistantChatPayload(chatPayload)
    }

    this.assistantInput = ""
    this._appendOptimisticUserMessage(content)
    this.assistantLoading = true
    this.assistantError = null
    this.assistantScrollToBottomPending = true
    this._renderSafely()
    await this._ensureAssistantChatSubscription(chatId)

    try {
      const result = await sendAssistantMessage(chatId, {
        provider: this._selectedAssistantProvider(),
        content,
        editor_context: this._assistantEditorContext(),
      })

      if (!result.ok || !result.data) {
        this._dropOptimisticUserMessages()
        this.assistantInput = content
        this.assistantError = result.error || "Assistant request failed"
        showToast(this.assistantError)
        return
      }

      this._applyAssistantChatPayload(result.data)
      this._renderSafely()
    } finally {
      this.assistantLoading = false
      this._renderSafely()
    }
  }

  applyAssistantDraft() {
    if (!this.state || !this.assistantDraft) return

    const currentHash = hashText(this.state.systemYaml)
    const sourceHash = this.assistantDraft.source_yaml_hash
    if (sourceHash && sourceHash !== currentHash) {
      this.confirmDialog = {
        action: "apply-draft-overwrite",
        tone: "warning",
        title: "Overwrite current YAML with assistant draft?",
        body: "The editor changed after the assistant generated this draft. Applying it now will replace your current YAML buffer.",
        confirmLabel: "Apply draft",
      }
      this._renderSafely()
      return
    }

    this._commitAssistantDraft()
  }

  applyAssistantMessageDraft(e: Event) {
    const messageId = Number((e.currentTarget as HTMLElement).dataset.messageId)
    if (!messageId) return

    const message = this.assistantMessages.find(item => item.id === messageId)
    const draft = this._assistantDraftFromMetadata(message?.metadata)
    if (!draft) return

    this.assistantDraft = draft
    this.applyAssistantDraft()
  }

  applyAssistantYamlSnippet(e: Event) {
    const encodedYaml = (e.currentTarget as HTMLElement).dataset.yaml
    if (!encodedYaml) return

    const yaml = decodeURIComponent(encodedYaml)
    this.assistantDraft = {
      yaml,
      source_yaml_hash: null,
      validation: {
        ok: false,
        diagnostics: [],
        system: null,
      },
    }
    this.applyAssistantDraft()
  }

  private _commitAssistantDraft() {
    if (!this.state || !this.assistantDraft) return

    this.state.systemYaml = this.assistantDraft.yaml
    this._refreshLocalDiagnostics()
    this._persistState()
    this._renderSafely()
    showToast("Assistant draft applied to editor", "success")
    void this.validator.run(this.state, true)
  }

  // Private helpers

  private async _performDeleteSystem() {
    if (!this.state?.sourcePath || !this.state?.sourceSystemId) return

    const sourcePath = this.state.sourcePath
    const sourceFileName = this._currentEntry()?.relative_path || sourcePath

    this.saving = true
    this._renderSafely()

    try {
      const response = await deleteResearchSystem(sourcePath)
      if (!response) {
        showToast("System delete failed")
        return
      }

      if (!response.ok) {
        this.validation = { ok: false, diagnostics: response.diagnostics, system: null }
        this._renderSafely()
        this.editor.focusDiagnostic(response.diagnostics[0] || null)
        showToast(response.diagnostics[0]?.message || "System delete failed")
        return
      }

      this.catalog = this.catalog.filter(entry => entry.relative_path !== sourcePath)
      this.state.sourceSystemId = null
      this.state.sourcePath = null
      this.state.directoryPath = relativeDirname(sourcePath)
      this.validation = null
      this._persistState()
      this._renderSafely()
      this._dispatchCatalogChanged(null)
      showToast(`Deleted ${sourceFileName}`, "success")
    } finally {
      this.saving = false
      this._renderSafely()
    }
  }

  private async _performDeleteAssistantChat() {
    if (!this.assistantCurrentChat) return

    const deletingId = this.assistantCurrentChat.id
    const result = await deleteAssistantChat(deletingId)
    if (!result.ok) {
      this.assistantError = result.error || "Chat delete failed"
      showToast(this.assistantError)
      this._renderSafely()
      return
    }

    this.assistantChats = this.assistantChats.filter(chat => chat.id !== deletingId)
    this._clearAssistantSelection()
    this._renderSafely()
    showToast("Chat deleted", "success")
  }

  private async _performDeleteFileManagerEntry() {
    await this.filePicker.deleteEntry()
  }

  private _render() {
    if (!this.state) return

    this.element.innerHTML = renderSystemEditorHTML({
      tabId: this.tabIdValue,
      state: this.state,
      catalog: this.catalog,
      validation: this._displayValidation(),
      validating: this.validating,
      saving: this.saving,
      sourceFileName: this._currentEntry()?.relative_path || null,
      hasUnsavedChanges: this._hasUnsavedChanges(),
      searchMatchCount: this.editor.searchMatchCount(this.state),
      filePickerOpen: this.filePicker.open,
      filePickerQuery: this.filePicker.query,
      filePickerDirectoryPath: this.filePicker.directoryPath,
      filePickerSelectedPath: this.filePicker.selectedPath,
      directories: this.directories,
      isOnline: monitor.isOnline,
      assistantChats: this.assistantChats,
      assistantMessages: this.assistantMessages,
      assistantCurrentChat: this.assistantCurrentChat,
      assistantInput: this.assistantInput,
      assistantLoading: this.assistantLoading,
      assistantChatsLoading: this.assistantChatsLoading,
      assistantError: this.assistantError,
      assistantSettings: this.assistantSettings,
      assistantSettingsDraft: this.assistantSettingsDraft,
      assistantSettingsOpen: this.assistantSettingsOpen,
      assistantSettingsSaving: this.assistantSettingsSaving,
      assistantSettingsChecking: this.assistantSettingsChecking,
      assistantSettingsCheck: this.assistantSettingsCheck,
      assistantExpandedReasoningIds: Array.from(this.assistantExpandedReasoningIds),
      renameDialog: this.renameDialog,
      confirmDialog: this.confirmDialog,
    })
  }

  private _renderSafely() {
    this._captureAssistantScrollSnapshot()
    this.editor.captureSnapshot()

    try {
      this._render()
    } catch (error) {
      console.error("[SystemEditor] Render failed:", error)
      this.element.innerHTML = `<div class="flex h-full items-center justify-center px-6 text-center text-sm text-red-300">System editor render failed. Check console for details.</div>`
      showToast("System editor render failed")
    }

    this._applySidebarLayout()
    this.editor.restoreSnapshot()
    this.editor.syncScroll()
    this.autocomplete.sync(this.editor.yamlTextarea())
    this._restoreAssistantScroll()
  }

  private _refreshDynamicView(): boolean {
    if (!this.state) return false

    const textarea = this.editor.yamlTextarea()
    if (!textarea) return false

    const validation = this._displayValidation()
    const diagnostics = validation?.diagnostics || []
    const sourceFileName = this._currentEntry()?.relative_path || null
    const hasUnsavedChanges = this._hasUnsavedChanges()
    const searchQuery = this.state.searchQuery.trim()

    this.editor.renderYaml(this.state.systemYaml, diagnostics)
    this._setRoleHTML("current-file-name", currentFileNameHTML(sourceFileName))

    const saveState = this._role<HTMLElement>("save-state")
    if (saveState) {
      saveState.className = hasUnsavedChanges ? "text-amber-300" : "text-emerald-300"
      saveState.textContent = hasUnsavedChanges ? "Unsaved changes" : "Saved"
    }

    const searchMatchCount = this._role<HTMLElement>("search-match-count")
    if (searchMatchCount) {
      searchMatchCount.textContent = `${this.editor.searchMatchCount(this.state)} matches`
    }

    const validationStatus = this._role<HTMLElement>("validation-status")
    if (validationStatus) {
      validationStatus.className = this.validating && !diagnostics.length
        ? "text-gray-400"
        : validation?.ok
          ? "text-emerald-300"
          : diagnostics.length
            ? "text-red-300"
            : "text-gray-400"
      validationStatus.textContent = statusLabel(validation, this.validating)
    }

    const diagnosticsList = this._role<HTMLElement>("diagnostics-list")
    if (diagnosticsList) {
      diagnosticsList.innerHTML = diagnosticsHTML(diagnostics)
    }

    const validateButton = this._role<HTMLButtonElement>("validate-button")
    if (validateButton) {
      validateButton.disabled = !monitor.isOnline || this.validating
      validateButton.textContent = this.validating ? "Validating..." : "Validate"
    }

    const openInTestButton = this._role<HTMLButtonElement>("open-in-test-button")
    if (openInTestButton) {
      openInTestButton.disabled = !monitor.isOnline || !sourceFileName || hasUnsavedChanges
    }

    const searchPrevButton = this._role<HTMLButtonElement>("search-prev-button")
    if (searchPrevButton) {
      searchPrevButton.disabled = !searchQuery
    }

    const searchNextButton = this._role<HTMLButtonElement>("search-next-button")
    if (searchNextButton) {
      searchNextButton.disabled = !searchQuery
    }

    return true
  }

  private _restoreAssistantScroll() {
    const messages = this._role<HTMLElement>("assistant-messages")
    if (!messages) return

    if (this.assistantScrollToBottomPending) {
      messages.scrollTop = messages.scrollHeight
      this.assistantScrollToBottomPending = false
      this.assistantScrollSnapshot = null
      return
    }

    if (!this.assistantScrollSnapshot) return

    if (this.assistantScrollSnapshot.pinnedToBottom) {
      messages.scrollTop = messages.scrollHeight
    } else {
      messages.scrollTop = this.assistantScrollSnapshot.top
    }

    this.assistantScrollSnapshot = null
  }

  private _syncAssistantSendButton() {
    const button = this._role<HTMLButtonElement>("assistant-send-button")
    if (!button) return

    button.disabled = this.assistantLoading || !this._assistantConfigured() || !this.assistantInput.trim()
  }

  private _captureAssistantScrollSnapshot() {
    const messages = this._role<HTMLElement>("assistant-messages")
    if (!messages) {
      this.assistantScrollSnapshot = null
      return
    }

    const distanceFromBottom = messages.scrollHeight - messages.clientHeight - messages.scrollTop
    this.assistantScrollSnapshot = {
      top: messages.scrollTop,
      pinnedToBottom: distanceFromBottom <= 24,
    }
  }

  private _ensureLoadedYaml() {
    if (!this.state) return
    if (this.state.systemYaml.trim()) return

    const state = this.state
    const entry = this.catalog.find(item => item.relative_path === state.sourcePath)
      || this.catalog.find(item => item.id === (state.sourceSystemId || state.systemId))
    if (!entry) return

    state.systemId = entry.id
    state.sourceSystemId = entry.id
    state.sourcePath = entry.relative_path
    state.directoryPath = relativeDirname(entry.relative_path)
    state.systemYaml = entry.yaml
  }

  private _assistantSettingsDraftValue(provider = this._selectedAssistantProvider()): LlmSettingsDraft {
    const saved = this._settingForProvider(provider)
    const defaultModel = saved?.model
      || this._modelSuggestionsFor(provider)[0]
      || this._defaultModelForProvider(provider)

    return {
      provider,
      model: defaultModel,
      api_key: "",
      api_base: saved?.api_base || "",
      temperature: String(saved?.temperature ?? 0.2),
      max_output_tokens: String(saved?.max_output_tokens ?? 4000),
    }
  }

  private _modelSuggestionsFor(provider: string): string[] {
    return this.assistantSettings?.model_suggestions_by_provider?.[provider] || []
  }

  private _settingForProvider(provider: string) {
    return this.assistantSettings?.settings_by_provider?.[provider] || null
  }

  private _defaultModelForProvider(provider: string): string {
    return provider === "ollama" ? "" : "gemini-3-flash-preview"
  }

  private _providerRequiresApiKey(provider: string, apiBase?: string | null): boolean {
    if (provider === "ollama") return false
    if (provider === "openai" && apiBase?.trim()) return false
    return true
  }

  private _assistantConfigured(): boolean {
    const setting = this._settingForProvider(this._selectedAssistantProvider())
    if (!setting?.model?.trim()) return false
    return !this._providerRequiresApiKey(this._selectedAssistantProvider(), setting.api_base) || Boolean(setting.api_key_present)
  }

  private _assistantEditorContext() {
    const validation = this._displayValidation()

    return {
      system_yaml: this.state?.systemYaml || "",
      system_id: this.state?.systemId || null,
      source_path: this.state?.sourcePath || null,
      yaml_hash: hashText(this.state?.systemYaml || ""),
      diagnostics: validation?.diagnostics || [],
    }
  }

  private async _loadAssistantSettings() {
    const result = await fetchLlmSettings(this.state?.assistantSettingsProvider)
    if (!result.ok || !result.data) {
      this.assistantSettings = null
      if (result.error && result.error !== "Unauthorized") {
        this.assistantError = this.assistantError || result.error
      }
      this._renderSafely()
      return
    }

    this.assistantSettings = result.data
    this.assistantError = this.assistantError === "Unauthorized" ? null : this.assistantError
    if (this.state && !this.state.assistantSettingsProvider) {
      this.state.assistantSettingsProvider = result.data.setting.provider || null
      this._persistState()
    }
    if (!this.assistantSettingsDraft) {
      this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    }
    this._renderSafely()
  }

  private _selectedAssistantProvider(): string {
    return this.state?.assistantSettingsProvider
      || this.assistantSettingsDraft?.provider
      || this.assistantSettings?.setting.provider
      || "gemini"
  }

  private async _ensureAssistantChatSubscription(chatId: number) {
    if (!chatId) return
    if (this.assistantSubscribedChatId === chatId && this.assistantChatSubscription) return

    this._disconnectAssistantChatSubscription()

    const subscription = new AssistantChatSubscription(chatId, payload => {
      const activeChatId = this.assistantCurrentChat?.id || this.state?.assistantChatId || null
      if (payload.chat.id !== activeChatId) return

      this._applyAssistantChatPayload(payload, "auto")
      this._renderSafely()
    })

    this.assistantChatSubscription = subscription
    this.assistantSubscribedChatId = chatId
    await subscription.connect()
  }

  private _disconnectAssistantChatSubscription() {
    this.assistantChatSubscription?.disconnect()
    this.assistantChatSubscription = null
    this.assistantSubscribedChatId = null
  }

  private async _loadAssistantChats() {
    if (!this.state) return

    this.assistantChatsLoading = true
    this._renderSafely()

    try {
      const result = await fetchAssistantChats(null)
      if (!result.ok || !result.data) {
        if (result.error && result.error !== "Unauthorized") {
          this.assistantError = this.assistantError || result.error
        }
        return
      }

      this.assistantChats = result.data.chats
      const selectedChatId = this.state.assistantChatId || this.assistantCurrentChat?.id || null

      if (selectedChatId && this.assistantChats.some(chat => chat.id === selectedChatId)) {
        if (this.assistantCurrentChat?.id !== selectedChatId) {
          await this._loadAssistantChat(selectedChatId, false, "force_bottom")
        } else {
          this.assistantCurrentChat = this.assistantChats.find(chat => chat.id === selectedChatId) || this.assistantCurrentChat
          this._renderSafely()
        }
        return
      }

      this._renderSafely()
    } finally {
      this.assistantChatsLoading = false
      this._renderSafely()
    }
  }

  private async _loadAssistantChat(chatId: number, setLoading = true, scrollMode: "auto" | "force_bottom" | "preserve" = "force_bottom") {
    if (setLoading) {
      this.assistantChatsLoading = true
      this._renderSafely()
    }

    try {
      const result = await fetchAssistantChat(chatId)
      if (!result.ok || !result.data) {
        this.assistantError = result.error || "Failed to load chat"
        this._clearAssistantSelection()
        this._renderSafely()
        return
      }

      this._applyAssistantChatPayload(result.data, scrollMode)
      this._renderSafely()
    } finally {
      if (setLoading) {
        this.assistantChatsLoading = false
        this._renderSafely()
      }
    }
  }

  private async _createAssistantChat(): Promise<AssistantChatPayload | null> {
    if (!this.state) return null

    const result = await createAssistantChat({
      source_path: this.state.sourcePath,
      system_id: this.state.systemId || null,
    })

    if (!result.ok || !result.data) {
      this.assistantError = result.error || "Chat create failed"
      showToast(this.assistantError)
      this._renderSafely()
      return null
    }

    return result.data
  }

  private _applyAssistantChatPayload(payload: AssistantChatPayload, scrollMode: "auto" | "force_bottom" | "preserve" = "auto") {
    if (!this.state) return

    const shouldScrollToBottom = this._shouldScrollAssistantToBottom(payload, scrollMode)

    this.assistantCurrentChat = payload.chat
    this.assistantMessages = payload.messages
    this.assistantDraft = null
    this.assistantError = null
    this.assistantScrollToBottomPending = shouldScrollToBottom
    this.assistantExpandedReasoningIds = new Set(
      Array.from(this.assistantExpandedReasoningIds).filter(id => payload.messages.some(message => message.id === id)),
    )
    this._mergeAssistantChatSummary(payload.chat)
    this.state.assistantChatId = payload.chat.id
    this._persistState()
    void this._ensureAssistantChatSubscription(payload.chat.id)
  }

  private _appendOptimisticUserMessage(content: string) {
    this.assistantMessages = [
      ...this.assistantMessages,
      {
        id: -Date.now(),
        role: "user",
        content,
        created_at: new Date().toISOString(),
        thinking_text: null,
        metadata: {},
      },
    ]
  }

  private _dropOptimisticUserMessages() {
    this.assistantMessages = this.assistantMessages.filter(message => message.id > 0)
  }

  private _assistantDraftFromMetadata(metadata: Record<string, unknown> | null | undefined): AssistantDraftPayload | null {
    const draft = metadata?.draft
    if (!draft || typeof draft !== "object") return null

    const payload = draft as Record<string, unknown>
    if (typeof payload.yaml !== "string") return null

    return {
      yaml: payload.yaml,
      source_yaml_hash: typeof payload.source_yaml_hash === "string" ? payload.source_yaml_hash : null,
      validation: {
        ok: Boolean((payload.validation as Record<string, unknown> | undefined)?.ok),
        diagnostics: Array.isArray((payload.validation as Record<string, unknown> | undefined)?.diagnostics)
          ? ((payload.validation as Record<string, unknown>).diagnostics as ResearchDslDiagnostic[])
          : [],
        system: ((payload.validation as Record<string, unknown> | undefined)?.system as Record<string, unknown> | null) || null,
      },
    }
  }

  private _mergeAssistantChatSummary(chat: AssistantChatSummary) {
    this.assistantChats = [
      chat,
      ...this.assistantChats.filter(item => item.id !== chat.id),
    ].sort((left, right) => {
      const rightTime = Date.parse(right.updated_at)
      const leftTime = Date.parse(left.updated_at)
      return rightTime - leftTime
    })
  }

  private _clearAssistantSelection() {
    if (this.state) {
      this.state.assistantChatId = null
      this._persistState()
    }
    this.assistantCurrentChat = null
    this.assistantMessages = []
    this.assistantDraft = null
    this.assistantExpandedReasoningIds.clear()
    this._disconnectAssistantChatSubscription()
  }

  private _currentEntry(): ResearchCatalogEntry | null {
    if (!this.state?.sourcePath) return null
    return this.catalog.find(entry => entry.relative_path === this.state?.sourcePath) || null
  }

  private _currentDirectoryPath(): string {
    if (this.state?.directoryPath != null) return this.state.directoryPath
    return relativeDirname(this.state?.sourcePath || "")
  }

  private _hasUnsavedChanges(): boolean {
    if (!this.state) return false
    const entry = this._currentEntry()
    if (!entry) return this.state.systemYaml.trim().length > 0
    return entry.yaml !== this.state.systemYaml
  }

  private _mergeCatalogEntry(entry: ResearchCatalogEntry): ResearchCatalogEntry[] {
    const others = this.catalog.filter(item => item.relative_path !== entry.relative_path)
    return [...others, entry].sort((l, r) => l.name.localeCompare(r.name))
  }

  private _replaceCatalogEntry(previousPath: string, entry: ResearchCatalogEntry): ResearchCatalogEntry[] {
    const others = this.catalog.filter(item => item.relative_path !== previousPath && item.relative_path !== entry.relative_path)
    return [...others, entry].sort((l, r) => l.name.localeCompare(r.name))
  }

  private _applySidebarLayout() {
    if (!this.state) return

    const frame = this._role<HTMLElement>("sidebar-frame")
    const handle = this._role<HTMLElement>("sidebar-resize-handle")
    const rail = this._role<HTMLElement>("sidebar-reopen-rail")
    if (!frame || !handle || !rail) return

    this.state.sidebarWidth = this._clampSidebarWidth(this.state.sidebarWidth || SYSTEM_EDITOR_DEFAULT_SIDEBAR_WIDTH_PX)
    frame.style.width = `${this.state.sidebarWidth}px`

    if (this.state.sidebarCollapsed) {
      frame.classList.add("hidden")
      handle.classList.add("hidden")
      rail.classList.remove("hidden")
      return
    }

    frame.classList.remove("hidden")
    handle.classList.remove("hidden")
    rail.classList.add("hidden")
  }

  private _clampSidebarWidth(width: number): number {
    const viewportWidth = this.element.clientWidth || window.innerWidth || SYSTEM_EDITOR_DEFAULT_SIDEBAR_WIDTH_PX
    return clampSidebarWidth(width, viewportWidth)
  }

  private _startSidebarResizeDrag(event: MouseEvent, initialWidth: number) {
    if (!this.state || event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = this._clampSidebarWidth(initialWidth)
    const body = document.body
    const previousCursor = body.style.cursor
    const previousUserSelect = body.style.userSelect

    body.style.cursor = "col-resize"
    body.style.userSelect = "none"

    const onMove = (moveEvent: MouseEvent) => {
      if (!this.state) return
      this.state.sidebarCollapsed = false
      this.state.sidebarWidth = this._clampSidebarWidth(startWidth + (startX - moveEvent.clientX))
      this._applySidebarLayout()
    }

    const finish = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", finish)
      body.style.cursor = previousCursor
      body.style.userSelect = previousUserSelect
      this._persistState()
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", finish)
  }

  private _persistState() {
    if (!this.state) return
    this.element.dispatchEvent(new CustomEvent("systemeditor:configChanged", {
      bubbles: true,
      detail: { tabId: this.tabIdValue, config: { ...this.state } },
    }))
  }

  private _dispatchCatalogChanged(system: ResearchCatalogEntry | null) {
    this.element.dispatchEvent(new CustomEvent("systemeditor:catalogChanged", {
      bubbles: true,
      detail: { system },
    }))
  }

  private _revalidateOpenedSystem() {
    this.validation = null
    this.validating = false
    this._refreshLocalDiagnostics()
    this._renderSafely()
    void this.validator.run(this.state, true)
  }

  private _shouldScrollAssistantToBottom(
    payload: AssistantChatPayload,
    scrollMode: "auto" | "force_bottom" | "preserve",
  ): boolean {
    if (scrollMode === "force_bottom") return true
    if (scrollMode === "preserve") return false
    if (!this._assistantIsPinnedToBottom()) return false

    const previousLast = this._assistantMessageSignature(this.assistantMessages[this.assistantMessages.length - 1] || null)
    const nextLast = this._assistantMessageSignature(payload.messages[payload.messages.length - 1] || null)

    return previousLast !== nextLast || this.assistantMessages.length !== payload.messages.length
  }

  private _assistantIsPinnedToBottom(): boolean {
    const messages = this._role<HTMLElement>("assistant-messages")
    if (!messages) return true

    const distanceFromBottom = messages.scrollHeight - messages.clientHeight - messages.scrollTop
    return distanceFromBottom <= 24
  }

  private _assistantMessageSignature(message: AssistantChatMessage | null): string {
    if (!message) return ""

    const draft = this._assistantDraftFromMetadata(message.metadata)
    return [
      message.id,
      message.content || "",
      message.thinking_text || "",
      draft?.yaml || "",
    ].join("::")
  }

  private _refreshLocalDiagnostics() {
    this.localDiagnostics = collectConditionExpressionDiagnostics(this.state?.systemYaml || "")
  }

  private _displayValidation(): ResearchValidationResponse | null {
    if (!this.localDiagnostics.length) return this.validation

    const diagnostics = mergeDiagnostics(this.localDiagnostics, this.validation?.diagnostics || [])
    return { ok: false, diagnostics, system: null }
  }

  private _storedConfig(): Partial<SystemEditorConfig> | null {
    if (!this.configValue) return null

    try {
      return JSON.parse(this.configValue) as Partial<SystemEditorConfig>
    } catch {
      return null
    }
  }

  private _role<T extends Element>(role: string): T | null {
    return this.element.querySelector<T>(`[data-role='${role}']`)
  }

  private _setRoleHTML(role: string, html: string) {
    const element = this._role<HTMLElement>(role)
    if (element) element.innerHTML = html
  }
}

function editorInsert(ta: HTMLTextAreaElement, text: string): void {
  ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end")
  ta.dispatchEvent(new Event("input", { bubbles: true }))
}

function currentLineIndent(ta: HTMLTextAreaElement): string {
  const before = ta.value.slice(0, ta.selectionStart)
  const lineStart = before.lastIndexOf("\n") + 1
  return before.slice(lineStart).match(/^(\s*)/)?.[1] ?? ""
}

function isUndoShortcut(e: KeyboardEvent): boolean {
  return !e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z"
}

function isRedoShortcut(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase()
  return (e.metaKey || e.ctrlKey) && e.shiftKey && key === "z"
}

function applyNativeHistory(ta: HTMLTextAreaElement, command: "undo" | "redo"): void {
  ta.focus()
  document.execCommand(command)
}

function mergeDiagnostics(
  localDiagnostics: ResearchDslDiagnostic[],
  serverDiagnostics: ResearchDslDiagnostic[],
): ResearchDslDiagnostic[] {
  const seen = new Set<string>()

  return [...localDiagnostics, ...serverDiagnostics].filter(diagnostic => {
    const key = [
      diagnostic.line,
      diagnostic.column,
      diagnostic.length,
      diagnostic.code,
      diagnostic.message,
    ].join(":")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hashText(value: string): string {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}
