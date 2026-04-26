import {
  createResearchDirectory,
  deleteResearchDirectory,
  deleteResearchSystem,
  fetchResearchCatalog,
  renameResearchDirectory,
  renameResearchSystem,
  type ResearchCatalogEntry,
} from "./dsl"
import {
  findEntry as findResearchEntry,
  isPathInside,
  relativeDirname,
  replacePathPrefix,
  resolveDirectoryPath,
  syncFileManagerSelectionState,
} from "./file_manager"
import { showToast } from "../services/toast"

export type ResearchFilePickerCallbacks = {
  getCatalog: () => ResearchCatalogEntry[]
  getDirectories: () => string[]
  setCatalog: (entries: ResearchCatalogEntry[], directories: string[]) => void
  getTabSystemPath: (tabId: string) => string | null
  onSystemOpened: (tabId: string, entry: ResearchCatalogEntry) => void
  onSystemPathChanged: (tabId: string, systemPath: string) => void
  onSystemRemoved: (tabId: string) => void
  onRender: () => void
  getSidebarElement: () => Element | null
  signal: AbortSignal
}

export class ResearchFilePicker {
  private open = new Set<string>()
  private query = new Map<string, string>()
  private directory = new Map<string, string>()
  private selected = new Map<string, string | null>()

  constructor(private cb: ResearchFilePickerCallbacks) {}

  // — State accessors (for render) —

  isOpen(tabId: string): boolean {
    return this.open.has(tabId)
  }

  getQuery(tabId: string): string {
    return this.query.get(tabId) || ""
  }

  getDirectory(tabId: string, systemPath: string | null): string {
    return this.directory.get(tabId) || relativeDirname(systemPath || "")
  }

  getSelected(tabId: string, systemPath: string | null): string | null {
    return this.selected.get(tabId) ?? systemPath ?? null
  }

  // — Actions —

  openPicker(tabId: string, systemPath: string | null): void {
    const catalog = this.cb.getCatalog()
    const directories = this.cb.getDirectories()
    const selectedPath = systemPath && catalog.some(entry => entry.relative_path === systemPath)
      ? systemPath
      : null

    this.open.add(tabId)
    this.directory.set(
      tabId,
      resolveDirectoryPath(directories, selectedPath ? relativeDirname(selectedPath) : relativeDirname(systemPath || ""))
    )
    this.selected.set(tabId, selectedPath)
    this.query.set(tabId, "")
    this.cb.onRender()
  }

  closePicker(tabId: string): void {
    this.open.delete(tabId)
    this.query.delete(tabId)
    this.directory.delete(tabId)
    this.selected.delete(tabId)
    this.cb.onRender()
  }

  updateQuery(tabId: string, value: string): void {
    this.query.set(tabId, value)
    this.cb.onRender()
  }

  selectEntry(tabId: string, element: HTMLElement, isDoubleClick: boolean): void {
    const path = element.dataset.path || null
    const kind = element.dataset.kind || "file"
    this.selectEntryByPath(tabId, path, kind, isDoubleClick)
  }

  selectEntryByPath(tabId: string, path: string | null, kind: string, isDoubleClick: boolean): void {
    this.selected.set(tabId, path)
    this.syncSelection(path, kind)

    if (isDoubleClick && path) {
      this.openPath(tabId, path, kind)
    }
  }

  navigate(tabId: string, path: string): void {
    this.directory.set(tabId, path)
    this.selected.set(tabId, path || null)
    this.cb.onRender()
  }

  confirmSelection(tabId: string): void {
    const selectedPath = this.selected.get(tabId) || null
    if (!selectedPath) return
    const catalog = this.cb.getCatalog()
    const kind = findResearchEntry(catalog, selectedPath) ? "file" : "directory"
    this.openPath(tabId, selectedPath, kind)
  }

  async createDirectory(tabId: string): Promise<void> {
    const directoryName = window.prompt("New folder name")?.trim()
    if (!directoryName) return

    const parentPath = this.directory.get(tabId) || ""
    const response = await createResearchDirectory(parentPath || null, directoryName, this.cb.signal)
    if (this.cb.signal.aborted) return
    if (!response?.ok || !response.path) {
      showToast(response?.diagnostics?.[0]?.message || "Folder create failed")
      return
    }

    await this.refreshCatalog()
    if (this.cb.signal.aborted) return
    this.directory.set(tabId, response.path)
    this.selected.set(tabId, response.path)
    this.cb.onRender()
  }

  async renameEntry(tabId: string): Promise<void> {
    const selectedPath = this.selected.get(tabId) || null
    if (!selectedPath) return

    const catalog = this.cb.getCatalog()
    const entry = findResearchEntry(catalog, selectedPath)

    if (entry) {
      await this.renameFile(tabId, entry, selectedPath)
    } else {
      await this.renameDirectory(tabId, selectedPath)
    }
  }

  async deleteEntry(tabId: string): Promise<void> {
    const selectedPath = this.selected.get(tabId) || null
    if (!selectedPath) return
    if (!window.confirm(`Delete ${selectedPath}?`)) return

    const catalog = this.cb.getCatalog()
    const entry = findResearchEntry(catalog, selectedPath)

    if (entry) {
      const response = await deleteResearchSystem(selectedPath, this.cb.signal)
      if (this.cb.signal.aborted) return
      if (!response?.ok) {
        showToast(response?.diagnostics?.[0]?.message || "File delete failed")
        return
      }
    } else {
      const response = await deleteResearchDirectory(selectedPath, this.cb.signal)
      if (this.cb.signal.aborted) return
      if (!response?.ok) {
        showToast(response?.diagnostics?.[0]?.message || "Folder delete failed")
        return
      }
    }

    const currentSystemPath = this.cb.getTabSystemPath(tabId)
    await this.refreshCatalog()
    if (this.cb.signal.aborted) return
    this.selected.set(tabId, null)
    this.directory.set(tabId, relativeDirname(selectedPath))
    if (currentSystemPath && isPathInside(selectedPath, currentSystemPath)) {
      this.cb.onSystemRemoved(tabId)
    }
    this.cb.onRender()
  }

  // — Private helpers —

  private openFile(tabId: string, path: string): void {
    const catalog = this.cb.getCatalog()
    const entry = findResearchEntry(catalog, path)
    if (!entry) return

    this.cb.onSystemOpened(tabId, entry)
    this.open.delete(tabId)
    this.query.delete(tabId)
    this.directory.delete(tabId)
    this.selected.delete(tabId)
    this.cb.onRender()
  }

  private openPath(tabId: string, path: string, kind: string): void {
    if (kind === "directory") {
      this.directory.set(tabId, path)
      this.selected.set(tabId, path || null)
      this.cb.onRender()
      return
    }
    this.openFile(tabId, path)
  }

  private async renameFile(tabId: string, entry: ResearchCatalogEntry, selectedPath: string): Promise<void> {
    const nextId = window.prompt("New file name", entry.id)?.trim()
    if (!nextId || nextId === entry.id) return

    const response = await renameResearchSystem(selectedPath, nextId, entry.yaml, this.cb.signal)
    if (this.cb.signal.aborted) return
    if (!response?.ok || !response.system) {
      showToast(response?.diagnostics?.[0]?.message || "File rename failed")
      return
    }

    await this.refreshCatalog()
    if (this.cb.signal.aborted) return
    this.selected.set(tabId, response.system.relative_path)
    this.directory.set(tabId, relativeDirname(response.system.relative_path))
    this.cb.onSystemPathChanged(tabId, response.system.relative_path)
    this.cb.onRender()
  }

  private async renameDirectory(tabId: string, selectedPath: string): Promise<void> {
    const nextName = window.prompt("New folder name", selectedPath.split("/").pop() || "")?.trim()
    if (!nextName) return

    const response = await renameResearchDirectory(selectedPath, nextName, this.cb.signal)
    if (this.cb.signal.aborted) return
    if (!response?.ok || !response.path) {
      showToast(response?.diagnostics?.[0]?.message || "Folder rename failed")
      return
    }

    await this.refreshCatalog()
    if (this.cb.signal.aborted) return
    const currentSystemPath = this.cb.getTabSystemPath(tabId)
    this.selected.set(tabId, response.path)
    this.directory.set(tabId, response.path)

    if (currentSystemPath && isPathInside(selectedPath, currentSystemPath)) {
      const nextSystemPath = replacePathPrefix(currentSystemPath, selectedPath, response.path)
      if (nextSystemPath) {
        this.cb.onSystemPathChanged(tabId, nextSystemPath)
      }
    }
    this.cb.onRender()
  }

  private syncSelection(path: string | null, kind: string | null): void {
    const modal = this.cb.getSidebarElement()?.querySelector("[data-file-manager-modal]") ?? null
    if (!modal) return
    syncFileManagerSelectionState(modal, path, kind === "file" || kind === "directory" ? kind : null)
  }

  private async refreshCatalog() {
    const snapshot = await fetchResearchCatalog(this.cb.signal)
    if (this.cb.signal.aborted) return
    this.cb.setCatalog(snapshot.systems, snapshot.directories)
  }
}
