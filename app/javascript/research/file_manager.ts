import { BORDER_COLOR, BG_MODAL, BG_SURFACE, BG_TOOLBAR, BG_INPUT, BG_PANEL, MODAL_GLASS_STYLE } from "../config/theme"
import type { ResearchCatalogEntry } from "./dsl"
import { escapeHTML } from "../utils/dom"

type DirectoryNode = {
  kind: "directory"
  name: string
  path: string
  directories: DirectoryNode[]
  files: ResearchCatalogEntry[]
}

type FileManagerModalArgs = {
  ctrl: string
  title: string
  catalog: ResearchCatalogEntry[]
  directories: string[]
  currentDirectoryPath: string
  selectedPath: string | null
  searchQuery: string
  closeAction: string
  navigateAction: string
  selectAction: string
  openAction: string
  confirmAction: string
  searchAction: string
  createDirectoryAction?: string
  createFileAction?: string
  renameAction?: string
  deleteAction?: string
  confirmLabel?: string
}

type FileManagerSelectionKind = "file" | "directory" | null

export function renderFileManagerModal({
  ctrl,
  title,
  catalog,
  directories,
  currentDirectoryPath,
  selectedPath,
  searchQuery,
  closeAction,
  navigateAction,
  selectAction,
  openAction,
  confirmAction,
  searchAction,
  createDirectoryAction,
  createFileAction,
  renameAction,
  deleteAction,
  confirmLabel = "Open",
}: FileManagerModalArgs): string {
  const root = buildDirectoryTree(catalog, directories)
  const currentDirectory = findDirectory(root, currentDirectoryPath) || root
  const selectedEntry = findEntry(catalog, selectedPath)
  const selectedDirectory = selectedPath ? findDirectory(root, selectedPath) : null
  const selectedKind = selectedEntry ? "file" : (selectedDirectory ? "directory" : null)
  const listing = listDirectory(currentDirectory, searchQuery)

  return `
    <div
      class="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 px-4 py-6"
      data-action="click->${ctrl}#${extractMethod(closeAction)}"
    >
      <div
        data-file-manager-modal="true"
        class="flex h-[min(85vh,820px)] w-[min(1100px,96vw)] min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[${BORDER_COLOR}] bg-[${BG_MODAL}] shadow-[0_20px_80px_rgba(0,0,0,0.55)]"
        style="${MODAL_GLASS_STYLE}"
        data-action="click->${ctrl}#stopFileManagerPropagation"
      >
        <div class="flex items-center gap-3 border-b border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] px-5 py-4">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-white">${escapeHTML(title)}</div>
            <div class="mt-1 text-xs text-gray-400 font-mono">${escapeHTML(displayDirectoryPath(currentDirectory.path))}</div>
          </div>
          ${actionButton("New folder", createDirectoryAction)}
          ${actionButton("New file", createFileAction)}
          ${actionButton("Rename", renameAction, !selectedKind, "", "rename")}
          ${actionButton("Delete", deleteAction, !selectedKind, "border-red-500/30 text-red-200 hover:bg-red-500/10 hover:text-red-100", "delete")}
          ${actionButton(confirmLabel, confirmAction, !selectedEntry, "", "confirm")}
          <button
            type="button"
            data-action="${closeAction}"
            class="h-10 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-gray-300 hover:text-white cursor-pointer"
          >Close</button>
        </div>

        <div class="flex items-center gap-3 border-b border-[${BORDER_COLOR}] bg-[${BG_TOOLBAR}] px-5 py-3">
          <div class="min-w-0 flex-1 overflow-x-auto">
            <div class="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
              ${breadcrumbsHTML(currentDirectory.path, navigateAction)}
            </div>
          </div>
          <input
            type="search"
            value="${escapeHTML(searchQuery)}"
            placeholder="Search in current directory"
            data-action="${searchAction}"
            class="h-10 w-72 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-white"
          >
        </div>

        <div class="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
          <aside class="min-h-0 overflow-auto border-r border-[${BORDER_COLOR}] bg-[${BG_PANEL}] px-3 py-3">
            <div class="mb-2 px-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">Directories</div>
            <div class="flex flex-col gap-0.5">
              ${directoryTreeHTML(root, currentDirectory.path, navigateAction)}
            </div>
          </aside>

          <section class="min-h-0 overflow-auto px-4 py-4">
            <div class="mb-3 text-[11px] uppercase tracking-[0.18em] text-gray-500">Entries</div>
            <div class="overflow-hidden rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_PANEL}]">
              ${listing.length ? listing.map(item => listItemHTML(item.kind, item.path, item.label, item.meta, selectedPath, selectAction)).join("") : `
                <div class="px-4 py-8 text-sm text-gray-500">This directory is empty.</div>
              `}
            </div>
          </section>
        </div>
      </div>
    </div>
  `
}

export function buildDirectoryTree(catalog: ResearchCatalogEntry[], directoryPaths: string[] = []): DirectoryNode {
  const root: DirectoryNode = {
    kind: "directory",
    name: "systems",
    path: "",
    directories: [],
    files: [],
  }

  for (const directoryPath of directoryPaths) {
    ensureDirectoryPath(root, directoryPath)
  }

  for (const entry of catalog) {
    const parts = entry.relative_path.split("/").filter(Boolean)
    const node = ensureDirectoryPath(root, parts.slice(0, -1).join("/"))

    node.files.push(entry)
    node.files.sort((left, right) => left.file_name.localeCompare(right.file_name))
  }

  return root
}

export function syncFileManagerSelectionState(
  root: ParentNode,
  selectedPath: string | null,
  selectedKind: FileManagerSelectionKind,
) {
  const normalizedPath = selectedPath || ""
  root.querySelectorAll<HTMLElement>("[data-file-manager-entry]").forEach(element => {
    const selected = element.dataset.path === normalizedPath
    element.classList.toggle("bg-blue-500/10", selected)
    element.classList.toggle("hover:bg-white/5", !selected)
  })

  const renameButton = root.querySelector<HTMLButtonElement>('[data-file-manager-button="rename"]')
  const deleteButton = root.querySelector<HTMLButtonElement>('[data-file-manager-button="delete"]')
  const confirmButton = root.querySelector<HTMLButtonElement>('[data-file-manager-button="confirm"]')

  if (renameButton) renameButton.disabled = !selectedKind
  if (deleteButton) deleteButton.disabled = !selectedKind
  if (confirmButton) confirmButton.disabled = selectedKind !== "file"
}

export function findDirectory(root: DirectoryNode, path: string | null | undefined): DirectoryNode | null {
  const normalized = normalizeDirectoryPath(path)
  if (!normalized) return root

  const parts = normalized.split("/").filter(Boolean)
  let node: DirectoryNode | null = root
  for (const part of parts) {
    node = node.directories.find(item => item.name === part) || null
    if (!node) return null
  }

  return node
}

export function findEntry(catalog: ResearchCatalogEntry[], path: string | null | undefined): ResearchCatalogEntry | null {
  if (!path) return null
  return catalog.find(entry => entry.relative_path === path) || null
}

export function relativeDirname(path: string | null | undefined): string {
  const normalized = normalizeFilePath(path)
  if (!normalized || !normalized.includes("/")) return ""
  return normalized.slice(0, normalized.lastIndexOf("/"))
}

export function relativeBasename(path: string | null | undefined): string {
  const normalized = normalizeFilePath(path)
  if (!normalized) return ""
  const slashIndex = normalized.lastIndexOf("/")
  return slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1)
}

export function systemIdFromPath(path: string | null | undefined): string {
  return relativeBasename(path).replace(/\.yml$/i, "")
}

export function isPathInside(parentPath: string | null | undefined, candidatePath: string | null | undefined): boolean {
  const parent = normalizeFilePath(parentPath)
  const candidate = normalizeFilePath(candidatePath)
  if (!parent || !candidate) return false
  return candidate === parent || candidate.startsWith(`${parent}/`)
}

export function replacePathPrefix(path: string | null | undefined, sourcePrefix: string, targetPrefix: string): string | null {
  const normalized = normalizeFilePath(path)
  if (!normalized) return null
  if (normalized === sourcePrefix) return targetPrefix
  if (!normalized.startsWith(`${sourcePrefix}/`)) return normalized
  return `${targetPrefix}${normalized.slice(sourcePrefix.length)}`
}

function normalizeDirectoryPath(path: string | null | undefined): string {
  return (path || "").trim().replace(/^\/+|\/+$/g, "")
}

function normalizeFilePath(path: string | null | undefined): string {
  return (path || "").trim().replace(/^\/+/, "").replace(/\/+$/g, "")
}

function ensureDirectoryPath(root: DirectoryNode, directoryPath: string): DirectoryNode {
  const normalized = normalizeDirectoryPath(directoryPath)
  if (!normalized) return root

  let node = root
  for (const segment of normalized.split("/").filter(Boolean)) {
    let next = node.directories.find(item => item.name === segment)
    if (!next) {
      next = {
        kind: "directory",
        name: segment,
        path: node.path ? `${node.path}/${segment}` : segment,
        directories: [],
        files: [],
      }
      node.directories.push(next)
      node.directories.sort((left, right) => left.name.localeCompare(right.name))
    }
    node = next
  }

  return node
}

function listDirectory(directory: DirectoryNode, searchQuery: string) {
  const query = searchQuery.trim().toLowerCase()
  const directories = directory.directories
    .filter(item => !query || item.name.toLowerCase().includes(query))
    .map(item => ({
      kind: "directory" as const,
      path: item.path,
      label: item.name,
      meta: `${item.directories.length} dirs · ${item.files.length} files`,
    }))
  const files = directory.files
    .filter(item => !query || [item.file_name, item.name, item.id].join("\n").toLowerCase().includes(query))
    .map(item => ({
      kind: "file" as const,
      path: item.relative_path,
      label: item.file_name,
      meta: item.name,
    }))

  return [ ...directories, ...files ]
}

function breadcrumbsHTML(path: string, navigateAction: string): string {
  const parts = path ? path.split("/") : []
  const crumbs = [
    { label: "systems", path: "" },
    ...parts.map((_part, index) => ({
      label: parts[index],
      path: parts.slice(0, index + 1).join("/"),
    })),
  ]

  return crumbs.map((crumb, index) => `
    <button
      type="button"
      data-path="${escapeHTML(crumb.path)}"
      data-kind="directory"
      data-action="${navigateAction}"
      class="rounded px-2 py-1 hover:bg-white/5 cursor-pointer ${index === crumbs.length - 1 ? "text-white bg-white/5" : "text-gray-400 hover:text-white"}"
    >${escapeHTML(crumb.label)}</button>
  `).join(`<span class="text-gray-600">/</span>`)
}

function directoryTreeHTML(node: DirectoryNode, currentPath: string, navigateAction: string, depth = 0): string {
  const selected = node.path === currentPath
  const padding = 8 + depth * 14

  return `
    <div>
      <button
        type="button"
        data-path="${escapeHTML(node.path)}"
        data-kind="directory"
        data-action="${navigateAction}"
        class="flex w-full items-center rounded px-2 py-1.5 text-left text-sm cursor-pointer ${selected ? "bg-blue-500/15 text-blue-100" : "text-gray-300 hover:bg-white/5 hover:text-white"}"
        style="padding-left:${padding}px"
      >
        <span class="mr-2 text-xs text-gray-500">dir</span>
        <span class="truncate">${escapeHTML(node.name)}</span>
      </button>
      ${node.directories.map(directory => directoryTreeHTML(directory, currentPath, navigateAction, depth + 1)).join("")}
    </div>
  `
}

function displayDirectoryPath(path: string): string {
  return path ? `systems/${path}` : "systems"
}

function listItemHTML(
  kind: "directory" | "file",
  path: string,
  label: string,
  meta: string,
  selectedPath: string | null,
  selectAction: string,
): string {
  const selected = selectedPath === path

  return `
    <button
      type="button"
      data-file-manager-entry="true"
      data-path="${escapeHTML(path)}"
      data-kind="${kind}"
      data-action="${selectAction}"
      class="flex w-full items-center gap-3 border-b border-[${BORDER_COLOR}] px-4 py-3 text-left cursor-pointer ${selected ? "bg-blue-500/10" : "hover:bg-white/5"}"
    >
      <div class="w-12 shrink-0 text-[11px] uppercase tracking-[0.16em] ${kind === "directory" ? "text-amber-300" : "text-sky-300"}">${kind === "directory" ? "dir" : "yml"}</div>
      <div class="min-w-0 flex-1">
        <div class="truncate font-mono text-sm text-white">${escapeHTML(label)}</div>
        <div class="mt-1 truncate text-xs text-gray-400">${escapeHTML(meta)}</div>
      </div>
    </button>
  `
}

function actionButton(label: string, action?: string, disabled = false, extraClass = "", buttonKey?: string): string {
  if (!action) return ""

  return `
    <button
      type="button"
      ${buttonKey ? `data-file-manager-button="${escapeHTML(buttonKey)}"` : ""}
      data-action="${action}"
      class="h-10 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-gray-200 hover:bg-white/5 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${extraClass}"
      ${disabled ? "disabled" : ""}
    >${escapeHTML(label)}</button>
  `
}

function extractMethod(action: string): string {
  const match = action.match(/->[^#]+#([a-zA-Z0-9_]+)/)
  return match?.[1] || ""
}
