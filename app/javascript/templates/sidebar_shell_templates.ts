import { escapeHTML } from "../utils/dom"
import type { SidebarPane, TabType } from "../types/store"

type SidebarShellArgs = {
  ctrl: string
  tabType: TabType
  title: string
  subtitle: string
  activePane: SidebarPane
  settingsContent?: string
  llmContent?: string
  settingsPaneClassName?: string
  llmPaneClassName?: string
}

type AssistantEmptyArgs = {
  title: string
  body: string
  bullets?: string[]
}

export function sidebarShellHTML({
  ctrl,
  tabType,
  title,
  subtitle,
  activePane,
  settingsContent = "",
  llmContent = "",
  settingsPaneClassName = "overflow-auto p-4",
  llmPaneClassName = "",
}: SidebarShellArgs): string {
  const settingsPaneClasses = [
    activePane === "settings" ? "flex h-full min-h-0 flex-col" : "hidden h-full min-h-0 flex-col",
    settingsPaneClassName,
  ].filter(Boolean).join(" ")
  const llmPaneClasses = [
    activePane === "llm" ? "flex h-full min-h-0 flex-col" : "hidden h-full min-h-0 flex-col",
    llmPaneClassName,
  ].filter(Boolean).join(" ")

  return `
    <div class="flex h-full min-h-0 flex-col text-white">
      <div class="sticky top-0 z-10 border-b border-[#2a2a3e] bg-[#12122a] px-4 py-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[11px] uppercase tracking-[0.18em] text-gray-500">${escapeHTML(tabTypeLabel(tabType))}</div>
            <div class="mt-1 text-sm font-medium text-white">${escapeHTML(title)}</div>
            <div class="mt-1 text-xs text-gray-400 truncate">${escapeHTML(subtitle)}</div>
          </div>
          <button
            type="button"
            data-action="click->${ctrl}#toggleSidebarCollapse"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#2a2a3e] text-gray-400 hover:bg-[#1a1a2e] hover:text-white cursor-pointer"
            title="Collapse sidebar"
          >&lt;&lt;</button>
        </div>

        <div class="mt-3 inline-flex rounded-lg border border-[#2a2a3e] bg-[#0f1020] p-1">
          ${sidebarPaneButtonHTML(ctrl, "settings", "Settings", activePane === "settings")}
          ${sidebarPaneButtonHTML(ctrl, "llm", "LLM", activePane === "llm")}
        </div>
      </div>

      <div class="min-h-0 flex-1">
        <section
          data-sidebar-pane="settings"
          class="${settingsPaneClasses}"
        >${settingsContent}</section>
        <section
          data-sidebar-pane="llm"
          class="${llmPaneClasses}"
        >${llmContent}</section>
      </div>
    </div>
  `
}

export function assistantEmptyStateHTML({ title, body, bullets = [] }: AssistantEmptyArgs): string {
  return `
    <div class="flex h-full min-h-0 flex-col p-4">
      <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
        <div class="text-sm font-medium text-white">${escapeHTML(title)}</div>
        <div class="mt-2 text-sm leading-6 text-gray-400">${escapeHTML(body)}</div>
        ${bullets.length ? `
          <div class="mt-4 space-y-2 text-xs leading-5 text-gray-500">
            ${bullets.map(item => `<div>- ${escapeHTML(item)}</div>`).join("")}
          </div>
        ` : ""}
      </div>
    </div>
  `
}

function sidebarPaneButtonHTML(ctrl: string, pane: SidebarPane, label: string, active: boolean): string {
  return `
    <button
      type="button"
      data-sidebar-pane-value="${pane}"
      data-action="click->${ctrl}#switchSidebarPane"
      class="h-9 rounded-md px-3 text-sm ${active ? "bg-blue-500/15 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"} cursor-pointer"
    >${escapeHTML(label)}</button>
  `
}

function tabTypeLabel(tabType: TabType): string {
  switch (tabType) {
  case "chart": return "Chart"
  case "data": return "Data"
  case "research": return "Research"
  case "system_editor": return "System editor"
  case "system_stats": return "Stats"
  default: return "Sidebar"
  }
}
