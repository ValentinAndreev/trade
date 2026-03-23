import { Controller } from "@hotwired/stimulus"
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
import { setHighlightConfig } from "../system_editor/yaml_highlighter"
import { YamlAutocomplete } from "../system_editor/autocomplete"
import { relativeDirname } from "../research/file_manager"
import { showToast } from "../services/toast"
import { hydrateSystemEditorState } from "../system_editor/state"
import {
  currentFileNameHTML,
  diagnosticsHTML,
  renderSystemEditorHTML,
  statusLabel,
} from "../system_editor/templates"
import { EditorCore } from "../system_editor/editor_core"
import monitor from "../services/connection_monitor"
import { ValidationModule } from "../system_editor/validation"
import { FilePickerModule } from "../system_editor/file_picker"
import {
  collectConditionExpressionDiagnostics,
  setConditionExpressionMetadata,
} from "../system_editor/condition_expression"
import type { SystemEditorConfig } from "../types/store"
import { buildStarterSystemYaml } from "../system_editor/state"

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

  private editor!: EditorCore
  private validator!: ValidationModule
  private filePicker!: FilePickerModule
  private autocomplete!: YamlAutocomplete

  private _onConnectionChange = () => { this._renderSafely() }

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
      if (!this._refreshDynamicView()) {
        this._renderSafely()
      }
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

    this.element.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500 text-sm animate-pulse">Loading system editor…</div>`
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
    await this.validator.run(this.state, true)
  }

  disconnect() {
    this.validator.cancel()
    this.autocomplete.destroy()
    window.removeEventListener("connection:change", this._onConnectionChange)
  }

  configValueChanged() {
    if (!this.editor) return
    const next = hydrateSystemEditorState(this._storedConfig())
    if (JSON.stringify(this.state) === JSON.stringify(next)) return
    this.state = next
    this._ensureLoadedYaml()
    this._refreshLocalDiagnostics()
    this._renderSafely()
    void this.validator.run(this.state, true)
  }

  // — File picker actions —

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

  async deleteFileManagerEntry() {
    await this.filePicker.deleteEntry()
  }

  // — System actions —

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
    if (!this._refreshDynamicView()) {
      this._renderSafely()
    }
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
    if (!this._refreshDynamicView()) {
      this._renderSafely()
    }
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
      if (!response) { showToast("System save failed"); return }

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
      showToast(`Saved ${saved.relative_path}`)
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
      if (!response) { showToast("System rename failed"); return }

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
      showToast(`Renamed to ${renamed.relative_path}`)
    } finally {
      this.saving = false
      this._renderSafely()
    }
  }

  async deleteSystem() {
    if (!this.state?.sourcePath || !this.state?.sourceSystemId) return

    const sourcePath = this.state.sourcePath
    const sourceFileName = this._currentEntry()?.relative_path || sourcePath
    if (!window.confirm(`Delete ${sourceFileName}?`)) return

    this.saving = true
    this._renderSafely()

    try {
      const response = await deleteResearchSystem(sourcePath)
      if (!response) { showToast("System delete failed"); return }

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
      showToast(`Deleted ${sourceFileName}`)
    } finally {
      this.saving = false
      this._renderSafely()
    }
  }

  // — Editor keyboard/search actions —

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

    // Tab — accept autocomplete when visible, otherwise keep the existing 2-space indent
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

    // Enter — always prevent raw newline; auto-indent when autocomplete is closed
    if (e.key === "Enter") {
      e.preventDefault()
      if (!this.autocomplete.isVisible) {
        const ta = this.editor.yamlTextarea()
        if (ta) {
          editorInsert(ta, "\n" + currentLineIndent(ta))
          this.editor.ensureSelectionVisible()
        }
      }
      // When visible the autocomplete's keydown listener handles completion
      return
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

  // — Private helpers —

  private _render() {
    if (!this.state) return
    this.element.innerHTML = renderSystemEditorHTML({
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
    })
  }

  private _renderSafely() {
    this.editor.captureSnapshot()
    try {
      this._render()
    } catch (error) {
      console.error("[SystemEditor] Render failed:", error)
      this.element.innerHTML = `<div class="flex items-center justify-center h-full text-red-300 text-sm px-6 text-center">System editor render failed. Check console for details.</div>`
      showToast("System editor render failed")
    }
    this.editor.restoreSnapshot()
    this.editor.syncScroll()
    this.autocomplete.sync(this.editor.yamlTextarea())
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
    this._setRoleHTML("current-file-card-name", currentFileNameHTML(sourceFileName, "mt-2 text-sm text-left"))

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

    const currentSystemId = this._role<HTMLElement>("current-system-id")
    if (currentSystemId) {
      currentSystemId.textContent = this.state.systemId || "No id detected yet"
    }

    const validateButton = this._role<HTMLButtonElement>("validate-button")
    if (validateButton) {
      validateButton.disabled = !monitor.isOnline || this.validating
      validateButton.textContent = this.validating ? "Validating…" : "Validate"
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
    return [ ...others, entry ].sort((l, r) => l.name.localeCompare(r.name))
  }

  private _replaceCatalogEntry(previousPath: string, entry: ResearchCatalogEntry): ResearchCatalogEntry[] {
    const others = this.catalog.filter(item => item.relative_path !== previousPath && item.relative_path !== entry.relative_path)
    return [ ...others, entry ].sort((l, r) => l.name.localeCompare(r.name))
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
    if (element) {
      element.innerHTML = html
    }
  }
}

// --- Module-level editor helpers ---

/** Insert `text` at the textarea cursor, update cursor position, and fire input. */
function editorInsert(ta: HTMLTextAreaElement, text: string): void {
  ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end")
  ta.dispatchEvent(new Event("input", { bubbles: true }))
}

/** Return the leading whitespace of the line the cursor is currently on. */
function currentLineIndent(ta: HTMLTextAreaElement): string {
  const before    = ta.value.slice(0, ta.selectionStart)
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

  return [ ...localDiagnostics, ...serverDiagnostics ].filter(diagnostic => {
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
