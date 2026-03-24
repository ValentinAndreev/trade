import {
  createResearchDirectory,
  deleteResearchDirectory,
  deleteResearchSystem,
  fetchResearchCatalog,
  renameResearchDirectory,
  renameResearchSystem,
  saveResearchSystem,
  type ResearchCatalogEntry,
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
import { buildStarterSystemYaml } from "../system_editor/state"
import type { SystemEditorConfig } from "../types/store"

export type FilePickerState = {
  open: boolean
  query: string
  directoryPath: string
  selectedPath: string | null
}

export type FilePickerCallbacks = {
  getState: () => SystemEditorConfig | null
  getCatalog: () => ResearchCatalogEntry[]
  getDirectories: () => string[]
  setCatalog: (entries: ResearchCatalogEntry[], directories: string[]) => void
  updateState: (updater: (s: SystemEditorConfig) => void) => void
  onRender: () => void
  onPersist: () => void
  onCatalogChanged: (system: ResearchCatalogEntry | null) => void
  onOpenSystem: () => void
}

export class FilePickerModule {
  open = false
  query = ""
  directoryPath = ""
  selectedPath: string | null = null

  constructor(
    private element: HTMLElement,
    private cb: FilePickerCallbacks,
  ) {}

  openPicker(currentDirectoryPath: string, sourcePath: string | null): void {
    const catalog = this.cb.getCatalog()
    const directories = this.cb.getDirectories()
    const selectedPath = sourcePath && catalog.some(entry => entry.relative_path === sourcePath)
      ? sourcePath
      : null

    this.directoryPath = this.resolveDirectoryPath(
      directories,
      selectedPath ? relativeDirname(selectedPath) : currentDirectoryPath
    )
    this.selectedPath = selectedPath
    this.open = true
    this.query = ""
    this.cb.onRender()
  }

  closePicker(): void {
    this.open = false
    this.query = ""
    this.cb.onRender()
  }

  updateQuery(value: string): void {
    this.query = value
    this.cb.onRender()
  }

  selectEntry(element: HTMLElement, isDoubleClick: boolean): void {
    const path = element.dataset.path || null
    const kind = element.dataset.kind || "file"
    this.selectedPath = path
    this.syncSelection(path, kind)

    if (isDoubleClick && path) {
      this.openPath(path, kind)
    }
  }

  navigate(path: string): void {
    this.directoryPath = path
    this.selectedPath = path || null
    this.cb.onRender()
  }

  confirmSelection(): void {
    if (!this.selectedPath) return
    this.openSystemFile(this.selectedPath)
  }

  async createDirectory(): Promise<void> {
    const directoryName = window.prompt("New folder name")?.trim()
    if (!directoryName) return

    const response = await createResearchDirectory(this.directoryPath || null, directoryName)
    if (!response?.ok || !response.path) {
      showToast(response?.diagnostics?.[0]?.message || "Folder create failed")
      return
    }

    await this.refreshCatalog()
    this.directoryPath = response.path
    this.selectedPath = response.path
    this.cb.onCatalogChanged(null)
    this.cb.onRender()
  }

  async createFile(): Promise<void> {
    const nextId = window.prompt("New system id", "custom_system")?.trim()
    if (!nextId) return

    const yaml = buildStarterSystemYaml(nextId)
    const response = await saveResearchSystem(yaml, null, this.directoryPath || null)
    if (!response?.ok || !response.system) {
      showToast(response?.diagnostics?.[0]?.message || "File create failed")
      return
    }

    await this.refreshCatalog()
    this.query = ""
    this.directoryPath = relativeDirname(response.system.relative_path)
    this.selectedPath = response.system.relative_path
    this.cb.onCatalogChanged(response.system)
    this.cb.onRender()
    showToast(`Created ${response.system.relative_path}`)
  }

  async renameEntry(): Promise<void> {
    const selectedPath = this.selectedPath
    if (!selectedPath) return

    const catalog = this.cb.getCatalog()
    const entry = findResearchEntry(catalog, selectedPath)
    if (entry) {
      await this.renameFile(entry, selectedPath)
    } else {
      await this.renameDirectory(selectedPath)
    }
  }

  async deleteEntry(): Promise<void> {
    const selectedPath = this.selectedPath
    if (!selectedPath) return

    const catalog = this.cb.getCatalog()
    const entry = findResearchEntry(catalog, selectedPath)

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

    await this.refreshCatalog()
    const state = this.cb.getState()
    if (state?.sourcePath && isPathInside(selectedPath, state.sourcePath)) {
      this.cb.updateState(s => {
        s.sourceSystemId = null
        s.sourcePath = null
        s.directoryPath = relativeDirname(selectedPath)
      })
      this.cb.onPersist()
    } else if (state?.directoryPath && isPathInside(selectedPath, state.directoryPath)) {
      this.cb.updateState(s => { s.directoryPath = relativeDirname(selectedPath) })
      this.cb.onPersist()
    }

    this.selectedPath = null
    this.directoryPath = relativeDirname(selectedPath)
    this.cb.onCatalogChanged(null)
    this.cb.onRender()
  }

  private async renameFile(entry: ResearchCatalogEntry, selectedPath: string): Promise<void> {
    const nextId = window.prompt("New file name", entry.id)?.trim()
    if (!nextId || nextId === entry.id) return

    const response = await renameResearchSystem(selectedPath, nextId, entry.yaml)
    if (!response?.ok || !response.system) {
      showToast(response?.diagnostics?.[0]?.message || "File rename failed")
      return
    }

    await this.refreshCatalog()
    this.selectedPath = response.system.relative_path
    this.directoryPath = relativeDirname(response.system.relative_path)

    const state = this.cb.getState()
    if (state?.sourcePath === selectedPath) {
      this.cb.updateState(s => {
        s.systemId = response.system!.id
        s.sourceSystemId = response.system!.id
        s.sourcePath = response.system!.relative_path
        s.directoryPath = relativeDirname(response.system!.relative_path)
        s.systemYaml = response.system!.yaml
      })
      this.cb.onPersist()
    }

    this.cb.onCatalogChanged(response.system)
    this.cb.onRender()
  }

  private async renameDirectory(selectedPath: string): Promise<void> {
    const nextName = window.prompt("New folder name", selectedPath.split("/").pop() || "")?.trim()
    if (!nextName) return

    const response = await renameResearchDirectory(selectedPath, nextName)
    if (!response?.ok || !response.path) {
      showToast(response?.diagnostics?.[0]?.message || "Folder rename failed")
      return
    }

    await this.refreshCatalog()
    this.selectedPath = response.path
    this.directoryPath = response.path

    const state = this.cb.getState()
    if (state?.sourcePath && isPathInside(selectedPath, state.sourcePath)) {
      this.cb.updateState(s => {
        s.sourcePath = replacePathPrefix(s.sourcePath!, selectedPath, response.path!)
        s.directoryPath = relativeDirname(s.sourcePath!)
        s.sourceSystemId = s.sourcePath ? systemIdFromPath(s.sourcePath) : null
        s.systemId = s.sourceSystemId || s.systemId
      })
      this.cb.onPersist()
    } else if (state?.directoryPath && isPathInside(selectedPath, state.directoryPath)) {
      this.cb.updateState(s => {
        s.directoryPath = replacePathPrefix(s.directoryPath!, selectedPath, response.path!)
      })
      this.cb.onPersist()
    }

    this.cb.onCatalogChanged(null)
    this.cb.onRender()
  }

  openSystemFile(path: string): void {
    const catalog = this.cb.getCatalog()
    const entry = findResearchEntry(catalog, path)
    if (!entry) return

    this.cb.updateState(s => {
      s.systemId = entry.id
      s.sourceSystemId = entry.id
      s.sourcePath = entry.relative_path
      s.directoryPath = relativeDirname(entry.relative_path)
      s.systemYaml = entry.yaml
    })
    this.open = false
    this.query = ""
    this.selectedPath = null
    this.cb.onPersist()
    this.cb.onOpenSystem()
    this.cb.onRender()
  }

  private openPath(path: string, kind: string): void {
    if (kind === "directory") {
      this.directoryPath = path
      this.selectedPath = path || null
      this.cb.onRender()
      return
    }
    this.openSystemFile(path)
  }

  private syncSelection(path: string | null, kind: string | null): void {
    const modal = this.element.querySelector("[data-file-manager-modal]")
    if (!modal) return
    syncFileManagerSelectionState(modal, path, kind === "file" || kind === "directory" ? kind : null)
  }

  private async refreshCatalog() {
    const snapshot = await fetchResearchCatalog()
    this.cb.setCatalog(snapshot.systems, snapshot.directories)
    return snapshot
  }

  private resolveDirectoryPath(directoryPaths: string[], requestedPath: string | null | undefined): string {
    let candidate = (requestedPath || "").trim().replace(/^\/+|\/+$/g, "")
    while (candidate.length > 0) {
      if (directoryPaths.includes(candidate)) return candidate
      candidate = relativeDirname(candidate)
    }
    return ""
  }
}
