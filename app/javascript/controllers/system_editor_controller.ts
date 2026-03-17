import { Controller } from "@hotwired/stimulus"
import {
  createResearchDirectory,
  deleteResearchDirectory,
  deleteResearchSystem,
  fetchResearchCatalog,
  renameResearchDirectory,
  renameResearchSystem,
  saveResearchSystem,
  validateResearchSystem,
  type ResearchCatalogEntry,
  type ResearchDslDiagnostic,
  type ResearchValidationResponse,
} from "../research/dsl"
import {
  findEntry as findResearchEntry,
  isPathInside,
  relativeDirname,
  replacePathPrefix,
  syncFileManagerSelectionState,
  systemIdFromPath,
} from "../research/file_manager"
import { showToast } from "../services/toast"
import {
  buildStarterSystemYaml,
  hydrateSystemEditorState,
} from "../system_editor/state"
import { renderSystemEditorHTML } from "../system_editor/templates"
import type { SystemEditorConfig } from "../types/store"

type EditorSnapshot = {
  field: "yaml" | "search" | null
  selectionStart: number
  selectionEnd: number
  scrollTop: number
  scrollLeft: number
}

export default class extends Controller {
  static values = {
    tabId: String,
    config: String,
  }

  declare tabIdValue: string
  declare configValue: string

  private state: SystemEditorConfig | null = null
  private catalog: ResearchCatalogEntry[] = []
  private directories: string[] = []
  private validation: ResearchValidationResponse | null = null
  private validating = false
  private saving = false
  private validationTimer: ReturnType<typeof setTimeout> | null = null
  private validationRequestId = 0
  private snapshot: EditorSnapshot | null = null
  private filePickerOpen = false
  private filePickerQuery = ""
  private filePickerDirectoryPath = ""
  private filePickerSelectedPath: string | null = null

  async connect() {
    this.element.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500 text-sm animate-pulse">Loading system editor…</div>`
    const snapshot = await fetchResearchCatalog()
    this.catalog = snapshot.systems
    this.directories = snapshot.directories
    this.state = hydrateSystemEditorState(this._storedConfig())
    this._ensureLoadedYaml()
    this._persistState()
    this._renderSafely()
    await this._runValidation(true)
  }

  disconnect() {
    if (this.validationTimer) {
      clearTimeout(this.validationTimer)
      this.validationTimer = null
    }
  }

  configValueChanged() {
    const next = hydrateSystemEditorState(this._storedConfig())
    if (JSON.stringify(this.state) === JSON.stringify(next)) return
    this.state = next
    this._ensureLoadedYaml()
    this._renderSafely()
    void this._runValidation(true)
  }

  openFilePicker() {
    this.filePickerDirectoryPath = this._currentDirectoryPath()
    this.filePickerSelectedPath = this.state?.sourcePath || null
    this.filePickerOpen = true
    this._renderSafely()
  }

  closeFilePicker() {
    this.filePickerOpen = false
    this.filePickerQuery = ""
    this._renderSafely()
  }

  updateFilePickerQuery(e: Event) {
    this.filePickerQuery = (e.currentTarget as HTMLInputElement).value
    this._renderSafely()
  }

  stopFileManagerPropagation(e: Event) {
    e.stopPropagation()
  }

  selectFileManagerEntry(e: Event) {
    const button = e.currentTarget as HTMLElement
    const path = button.dataset.path || null
    const kind = button.dataset.kind || "file"

    this.filePickerSelectedPath = path
    this._syncFileManagerSelection(path, kind)

    if ((e as MouseEvent).detail >= 2 && path) {
      this._openFileManagerPath(path, kind)
    }
  }

  navigateFileManager(e: Event) {
    const button = e.currentTarget as HTMLElement
    const path = button.dataset.path || ""
    this.filePickerDirectoryPath = path
    this.filePickerSelectedPath = path || null
    this._renderSafely()
  }

  openFileManagerEntry(e: Event) {
    const button = e.currentTarget as HTMLElement
    const path = button.dataset.path || ""
    const kind = button.dataset.kind || "file"
    this._openFileManagerPath(path, kind)
  }

  confirmFileSelection() {
    if (!this.filePickerSelectedPath) return
    this._openSystemFile(this.filePickerSelectedPath)
  }

  async createDirectory() {
    const directoryName = window.prompt("New folder name")?.trim()
    if (!directoryName) return

    const response = await createResearchDirectory(this.filePickerDirectoryPath || null, directoryName)
    if (!response?.ok || !response.path) {
      showToast(response?.diagnostics?.[0]?.message || "Folder create failed")
      return
    }

    await this._refreshCatalog()
    this.filePickerDirectoryPath = response.path
    this.filePickerSelectedPath = response.path
    this._dispatchCatalogChanged(null)
    this._renderSafely()
  }

  async createFile() {
    const nextId = window.prompt("New system id", "custom_system")?.trim()
    if (!nextId) return

    const yaml = buildStarterSystemYaml(nextId)
    const response = await saveResearchSystem(yaml, null, this.filePickerDirectoryPath || null)
    if (!response?.ok || !response.system) {
      showToast(response?.diagnostics?.[0]?.message || "File create failed")
      return
    }

    await this._refreshCatalog()
    this.filePickerQuery = ""
    this.filePickerDirectoryPath = relativeDirname(response.system.relative_path)
    this.filePickerSelectedPath = response.system.relative_path
    this._dispatchCatalogChanged(response.system)
    this._renderSafely()
    showToast(`Created ${response.system.relative_path}`)
  }

  async renameFileManagerEntry() {
    const selectedPath = this.filePickerSelectedPath
    if (!selectedPath) return

    const entry = findResearchEntry(this.catalog, selectedPath)
    if (entry) {
      const nextId = window.prompt("New file name", entry.id)?.trim()
      if (!nextId || nextId === entry.id) return

      const response = await renameResearchSystem(selectedPath, nextId, entry.yaml)
      if (!response?.ok || !response.system) {
        showToast(response?.diagnostics?.[0]?.message || "File rename failed")
        return
      }

      await this._refreshCatalog()
      this.filePickerSelectedPath = response.system.relative_path
      this.filePickerDirectoryPath = relativeDirname(response.system.relative_path)

      if (this.state?.sourcePath === selectedPath) {
        this.state.systemId = response.system.id
        this.state.sourceSystemId = response.system.id
        this.state.sourcePath = response.system.relative_path
        this.state.directoryPath = relativeDirname(response.system.relative_path)
        this.state.systemYaml = response.system.yaml
        this._persistState()
      }

      this._dispatchCatalogChanged(response.system)
      this._renderSafely()
      return
    }

    const nextName = window.prompt("New folder name", selectedPath.split("/").pop() || "")?.trim()
    if (!nextName) return

    const response = await renameResearchDirectory(selectedPath, nextName)
    if (!response?.ok || !response.path) {
      showToast(response?.diagnostics?.[0]?.message || "Folder rename failed")
      return
    }

    await this._refreshCatalog()
    this.filePickerSelectedPath = response.path
    this.filePickerDirectoryPath = response.path
    if (this.state?.sourcePath && isPathInside(selectedPath, this.state.sourcePath)) {
      this.state.sourcePath = replacePathPrefix(this.state.sourcePath, selectedPath, response.path)
      this.state.directoryPath = relativeDirname(this.state.sourcePath)
      this.state.sourceSystemId = this.state.sourcePath ? systemIdFromPath(this.state.sourcePath) : null
      this.state.systemId = this.state.sourceSystemId || this.state.systemId
      this._persistState()
    } else if (this.state?.directoryPath && isPathInside(selectedPath, this.state.directoryPath)) {
      this.state.directoryPath = replacePathPrefix(this.state.directoryPath, selectedPath, response.path)
      this._persistState()
    }
    this._dispatchCatalogChanged(null)
    this._renderSafely()
  }

  async deleteFileManagerEntry() {
    const selectedPath = this.filePickerSelectedPath
    if (!selectedPath) return
    if (!window.confirm(`Delete ${selectedPath}?`)) return

    const entry = findResearchEntry(this.catalog, selectedPath)
    if (entry) {
      const response = await deleteResearchSystem(selectedPath)
      if (!response?.ok) {
        showToast(response?.diagnostics?.[0]?.message || "File delete failed")
        return
      }
    } else {
      const response = await deleteResearchDirectory(selectedPath)
      if (!response?.ok) {
        showToast(response?.diagnostics?.[0]?.message || "Folder delete failed")
        return
      }
    }

    await this._refreshCatalog()
    if (this.state?.sourcePath && isPathInside(selectedPath, this.state.sourcePath)) {
      this.state.sourceSystemId = null
      this.state.sourcePath = null
      this.state.directoryPath = relativeDirname(selectedPath)
      this._persistState()
    } else if (this.state?.directoryPath && isPathInside(selectedPath, this.state.directoryPath)) {
      this.state.directoryPath = relativeDirname(selectedPath)
      this._persistState()
    }

    this.filePickerSelectedPath = null
    this.filePickerDirectoryPath = relativeDirname(selectedPath)
    this._dispatchCatalogChanged(null)
    this._renderSafely()
  }

  newSystem() {
    if (!this.state) return

    this.state.systemId = "custom_system"
    this.state.sourceSystemId = null
    this.state.sourcePath = null
    this.state.directoryPath = this._currentDirectoryPath()
    this.state.systemYaml = buildStarterSystemYaml()
    this.validation = null
    this._persistState()
    this._renderSafely()
    void this._runValidation(true)
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
    this._persistState()
    this._renderSafely()
    void this._runValidation(true)
  }

  updateYaml() {
    if (!this.state) return
    const textarea = this._yamlTextarea()
    if (!textarea) return

    this.state.systemYaml = textarea.value
    this._persistState()
    this._renderSafely()
    this.syncEditorScroll()
    void this._runValidation(false)
  }

  syncEditorScroll() {
    const textarea = this._yamlTextarea()
    const gutter = this.element.querySelector<HTMLElement>("[data-system-editor-gutter]")
    if (!textarea || !gutter) return

    gutter.style.transform = `translateY(${-textarea.scrollTop}px)`
  }

  updateSearchQuery() {
    if (!this.state) return
    const input = this._searchInput()
    if (!input) return

    this.state.searchQuery = input.value
    this._persistState()
    this._renderSafely()
  }

  async validateNow() {
    await this._runValidation(true)
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
        this.validation = {
          ok: false,
          diagnostics: response.diagnostics,
          system: null,
        }
        this._renderSafely()
        this._focusDiagnostic(response.diagnostics[0] || null)
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
      this.validation = {
        ok: true,
        diagnostics: [],
        system: saved.metadata,
      }
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
      if (!response) {
        showToast("System rename failed")
        return
      }

      if (!response.ok || !response.system) {
        this.validation = {
          ok: false,
          diagnostics: response.diagnostics,
          system: null,
        }
        this._renderSafely()
        this._focusDiagnostic(response.diagnostics[0] || null)
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
      this.validation = {
        ok: true,
        diagnostics: [],
        system: renamed.metadata,
      }
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
    const confirmed = window.confirm(`Delete ${sourceFileName}?`)
    if (!confirmed) return

    this.saving = true
    this._renderSafely()

    try {
      const response = await deleteResearchSystem(sourcePath)
      if (!response) {
        showToast("System delete failed")
        return
      }

      if (!response.ok) {
        this.validation = {
          ok: false,
          diagnostics: response.diagnostics,
          system: null,
        }
        this._renderSafely()
        this._focusDiagnostic(response.diagnostics[0] || null)
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

  findNext() {
    this._findMatch(1)
  }

  findPrevious() {
    this._findMatch(-1)
  }

  handleSearchKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return
    e.preventDefault()
    this._findMatch(e.shiftKey ? -1 : 1)
  }

  handleEditorKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault()
      void this.saveSystem()
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
      e.preventDefault()
      this._searchInput()?.focus()
      this._searchInput()?.select()
      return
    }

    if (e.key === "F3") {
      e.preventDefault()
      this._findMatch(e.shiftKey ? -1 : 1)
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
      detail: {
        systemId: this.state.sourceSystemId,
        systemPath: this.state.sourcePath,
      },
    }))
  }

  focusDiagnostic(e: Event) {
    const button = e.currentTarget as HTMLElement
    this._focusDiagnostic({
      line: Number(button.dataset.line || 1),
      column: Number(button.dataset.column || 1),
      length: Number(button.dataset.length || 1),
    })
  }

  private _render() {
    if (!this.state) return

    this.element.innerHTML = renderSystemEditorHTML({
      state: this.state,
      catalog: this.catalog,
      validation: this.validation,
      validating: this.validating,
      saving: this.saving,
      sourceFileName: this._currentEntry()?.relative_path || null,
      hasUnsavedChanges: this._hasUnsavedChanges(),
      searchMatchCount: this._searchMatchCount(),
      filePickerOpen: this.filePickerOpen,
      filePickerQuery: this.filePickerQuery,
      filePickerDirectoryPath: this.filePickerDirectoryPath,
      filePickerSelectedPath: this.filePickerSelectedPath,
      directories: this.directories,
    })
  }

  private _renderSafely() {
    this._captureSnapshot()
    try {
      this._render()
    } catch (error) {
      console.error("[SystemEditor] Render failed:", error)
      this.element.innerHTML = `<div class="flex items-center justify-center h-full text-red-300 text-sm px-6 text-center">System editor render failed. Check console for details.</div>`
      showToast("System editor render failed")
    }
    this._restoreSnapshot()
    this.syncEditorScroll()
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

  private async _runValidation(immediate: boolean) {
    if (!this.state) return
    if (this.validationTimer) {
      clearTimeout(this.validationTimer)
      this.validationTimer = null
    }

    const execute = async () => {
      if (!this.state?.systemYaml.trim()) {
        this.validation = null
        this.validating = false
        this._renderSafely()
        return
      }

      const requestId = ++this.validationRequestId
      this.validating = true
      this._renderSafely()

      const validation = await validateResearchSystem(this.state.systemYaml, this.state.systemId || undefined)
      if (requestId !== this.validationRequestId) return

      this.validating = false
      this.validation = validation
      if (validation?.ok && validation.system && this.state) {
        this.state.systemId = validation.system.id
        this._persistState()
      }
      this._renderSafely()
    }

    if (immediate) {
      await execute()
      return
    }

    this.validationTimer = setTimeout(() => {
      this.validationTimer = null
      void execute()
    }, 300)
  }

  private _findMatch(direction: 1 | -1) {
    const textarea = this._yamlTextarea()
    const query = this.state?.searchQuery?.trim()
    if (!textarea || !query) {
      showToast("Enter text to search")
      return
    }

    const haystack = textarea.value.toLowerCase()
    const needle = query.toLowerCase()
    const pivot = direction > 0 ? textarea.selectionEnd : Math.max(0, textarea.selectionStart - 1)

    let index = direction > 0
      ? haystack.indexOf(needle, pivot)
      : haystack.lastIndexOf(needle, pivot)

    if (index === -1) {
      index = direction > 0 ? haystack.indexOf(needle) : haystack.lastIndexOf(needle)
    }

    if (index === -1) {
      showToast("No matches found")
      return
    }

    textarea.focus()
    textarea.setSelectionRange(index, index + query.length)
    textarea.scrollTop = this._scrollTopForIndex(textarea.value, index, textarea)
    this.syncEditorScroll()
  }

  private _scrollTopForIndex(text: string, index: number, textarea: HTMLTextAreaElement): number {
    const before = text.slice(0, index)
    const line = before.split("\n").length - 1
    const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight || "24")
    return Math.max(0, line * lineHeight - textarea.clientHeight / 3)
  }

  private _focusDiagnostic(diagnostic: Pick<ResearchDslDiagnostic, "line" | "column" | "length"> | null) {
    const textarea = this._yamlTextarea()
    if (!textarea || !diagnostic) return

    const start = this._indexForLineColumn(textarea.value, diagnostic.line, diagnostic.column)
    const end = start + Math.max(1, diagnostic.length)
    textarea.focus()
    textarea.setSelectionRange(start, end)
    textarea.scrollTop = this._scrollTopForIndex(textarea.value, start, textarea)
    this.syncEditorScroll()
  }

  private _indexForLineColumn(text: string, line: number, column: number): number {
    const lines = text.split("\n")
    let index = 0
    for (let i = 0; i < Math.max(0, line - 1); i += 1) {
      index += (lines[i]?.length || 0) + 1
    }
    return index + Math.max(0, column - 1)
  }

  private _currentEntry(): ResearchCatalogEntry | null {
    if (!this.state?.sourcePath) return null
    return this.catalog.find(entry => entry.relative_path === this.state?.sourcePath) || null
  }

  private _currentDirectoryPath(): string {
    if (this.state?.directoryPath != null) return this.state.directoryPath
    return relativeDirname(this.state?.sourcePath || "")
  }

  private _openSystemFile(path: string) {
    const entry = findResearchEntry(this.catalog, path)
    if (!entry || !this.state) return

    this.state.systemId = entry.id
    this.state.sourceSystemId = entry.id
    this.state.sourcePath = entry.relative_path
    this.state.directoryPath = relativeDirname(entry.relative_path)
    this.state.systemYaml = entry.yaml
    this.filePickerOpen = false
    this.filePickerQuery = ""
    this.filePickerSelectedPath = null
    this._persistState()
    this._renderSafely()
    void this._runValidation(true)
  }

  private _openFileManagerPath(path: string, kind: string) {
    if (kind === "directory") {
      this.filePickerDirectoryPath = path
      this.filePickerSelectedPath = path || null
      this._renderSafely()
      return
    }

    this._openSystemFile(path)
  }

  private _syncFileManagerSelection(path: string | null, kind: string | null) {
    const modal = this.element.querySelector("[data-file-manager-modal]")
    if (!modal) return
    syncFileManagerSelectionState(modal, path, kind === "file" || kind === "directory" ? kind : null)
  }

  private async _refreshCatalog() {
    const snapshot = await fetchResearchCatalog()
    this.catalog = snapshot.systems
    this.directories = snapshot.directories
  }

  private _mergeCatalogEntry(entry: ResearchCatalogEntry): ResearchCatalogEntry[] {
    const others = this.catalog.filter(item => item.relative_path !== entry.relative_path)
    return [ ...others, entry ].sort((left, right) => left.name.localeCompare(right.name))
  }

  private _replaceCatalogEntry(previousPath: string, entry: ResearchCatalogEntry): ResearchCatalogEntry[] {
    const others = this.catalog.filter(item => item.relative_path !== previousPath && item.relative_path !== entry.relative_path)
    return [ ...others, entry ].sort((left, right) => left.name.localeCompare(right.name))
  }

  private _searchMatchCount(): number {
    const text = this.state?.systemYaml || ""
    const query = this.state?.searchQuery?.trim().toLowerCase() || ""
    if (!query) return 0

    let count = 0
    let index = 0
    const haystack = text.toLowerCase()
    while (index < haystack.length) {
      const match = haystack.indexOf(query, index)
      if (match === -1) break
      count += 1
      index = match + Math.max(1, query.length)
    }
    return count
  }

  private _hasUnsavedChanges(): boolean {
    if (!this.state) return false
    const entry = this._currentEntry()
    if (!entry) return this.state.systemYaml.trim().length > 0
    return entry.yaml !== this.state.systemYaml
  }

  private _persistState() {
    if (!this.state) return
    this.element.dispatchEvent(new CustomEvent("systemeditor:configChanged", {
      bubbles: true,
      detail: {
        tabId: this.tabIdValue,
        config: { ...this.state },
      },
    }))
  }

  private _dispatchCatalogChanged(system: ResearchCatalogEntry | null) {
    this.element.dispatchEvent(new CustomEvent("systemeditor:catalogChanged", {
      bubbles: true,
      detail: {
        system,
      },
    }))
  }

  private _storedConfig(): Partial<SystemEditorConfig> | null {
    if (!this.configValue) return null
    try {
      return JSON.parse(this.configValue) as Partial<SystemEditorConfig>
    } catch {
      return null
    }
  }

  private _captureSnapshot() {
    const activeElement = document.activeElement
    const yaml = this._yamlTextarea()
    const search = this._searchInput()
    if (activeElement === yaml && yaml) {
      this.snapshot = {
        field: "yaml",
        selectionStart: yaml.selectionStart,
        selectionEnd: yaml.selectionEnd,
        scrollTop: yaml.scrollTop,
        scrollLeft: yaml.scrollLeft,
      }
      return
    }

    if (activeElement === search && search) {
      this.snapshot = {
        field: "search",
        selectionStart: search.selectionStart || 0,
        selectionEnd: search.selectionEnd || 0,
        scrollTop: 0,
        scrollLeft: 0,
      }
      return
    }

    this.snapshot = null
  }

  private _restoreSnapshot() {
    if (!this.snapshot) return

    const target = this.snapshot.field === "yaml" ? this._yamlTextarea() : this._searchInput()
    if (!target) return

    target.focus()
    target.setSelectionRange(this.snapshot.selectionStart, this.snapshot.selectionEnd)
    if ("scrollTop" in target) {
      target.scrollTop = this.snapshot.scrollTop
      target.scrollLeft = this.snapshot.scrollLeft
    }
  }

  private _yamlTextarea(): HTMLTextAreaElement | null {
    return this.element.querySelector<HTMLTextAreaElement>("[data-field='systemYaml']")
  }

  private _searchInput(): HTMLInputElement | null {
    return this.element.querySelector<HTMLInputElement>("[data-field='searchQuery']")
  }
}
