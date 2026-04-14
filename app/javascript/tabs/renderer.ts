import SidebarRenderer from "./sidebar_renderer"
import DataSidebarRenderer from "../data_grid/sidebar_renderer"
import ResearchSidebarRenderer from "../research/sidebar_renderer"
import type { ResearchCatalogEntry, ResearchValidatedSystem } from "../research/dsl"
import PanelRenderer from "./panel_renderer"
import { tabButtonHTML, addTabButtonHTML } from "../templates/panel_templates"
import { assistantEmptyStateHTML, sidebarShellHTML } from "../templates/sidebar_shell_templates"
import type { Tab, Panel, SidebarPane } from "../types/store"
import type { IndicatorInfo } from "../data_grid/sidebar_renderer"

export interface ChartTabOption {
  id: string
  label: string
  primarySymbol: string | null
}

export interface TabRenderOpts {
  tabs: Tab[]
  activeTabId: string | null
  selectedPanelId: string | null
  selectedOverlayId: string | null
  symbols: string[]
  timeframes: string[]
  labelFn?: (tab: Tab) => string
  indicators: IndicatorInfo[]
  labelModeActive: boolean
  lineModeActive: boolean
  vpEnabled: boolean
  vpOpacity: number
  hlModeActive: boolean
  vlModeActive: boolean
  chartTabOptions?: ChartTabOption[]
  researchCatalog?: ResearchCatalogEntry[]
  researchDirectories?: string[]
  researchFilePickerOpen?: boolean
  researchFilePickerQuery?: string
  researchFilePickerDirectoryPath?: string
  researchFilePickerSelectedPath?: string | null
  researchValidationSystem?: ResearchValidatedSystem | null
  activeSidebarPane: SidebarPane
}

type WorkspaceAssistantKind = "chart" | "data" | "research"
type WorkspaceRenderer = (activeTab: Tab | undefined, opts: TabRenderOpts) => void

const WORKSPACE_ASSISTANT_EMPTY_STATES: Record<WorkspaceAssistantKind, { title: string; body: string; bullets: string[] }> = {
  chart: {
    title: "Chart assistant",
    body: "The assistant tab will orchestrate chart setup through internal tools instead of free-form analysis.",
    bullets: [
      "Build chart layouts, overlays, indicators, and labels.",
      "Create linked data tabs from the active chart context.",
      "Propose changes through preview and apply.",
    ],
  },
  data: {
    title: "Data assistant",
    body: "The shared assistant shell is ready. Next step is wiring tools for data tabs so it can build selections, add modules, and draft filters without mutating state silently.",
    bullets: [
      "Context will come from the active data tab and linked chart tabs.",
      "Changes should flow through draft, preview, and apply.",
      "Research artifacts and project context will attach here later.",
    ],
  },
  research: {
    title: "Research assistant",
    body: "This tab will use the LLM primarily for run analysis, comparisons, and artifact handling rather than replacing the DSL editor.",
    bullets: [
      "Analyze runs and summarize differences.",
      "Trigger research tools and attach resulting artifacts.",
      "Reuse project context without carrying the whole chat log.",
    ],
  },
}

export default class TabRenderer {
  tabBarEl: HTMLElement
  ctrl: string
  sidebarEl: HTMLElement
  panels: PanelRenderer
  sidebar: SidebarRenderer
  dataSidebar: DataSidebarRenderer
  researchSidebar: ResearchSidebarRenderer

  constructor(tabBarEl: HTMLElement, panelsEl: HTMLElement, sidebarEl: HTMLElement, { controllerName }: { controllerName: string }) {
    this.tabBarEl = tabBarEl
    this.ctrl = controllerName
    this.sidebarEl = sidebarEl
    this.panels = new PanelRenderer(panelsEl, controllerName)
    this.sidebar = new SidebarRenderer(sidebarEl, controllerName)
    this.dataSidebar = new DataSidebarRenderer(sidebarEl, controllerName)
    this.researchSidebar = new ResearchSidebarRenderer(sidebarEl, controllerName)
  }

  render(opts: TabRenderOpts): void {
    const { tabs, activeTabId, labelFn } = opts

    this._renderTabBar(tabs, activeTabId, labelFn)

    const activeTab = tabs.find(t => t.id === activeTabId)
    this._sidebarRendererFor(activeTab?.type)(activeTab, opts)
  }

  private _renderSidebarShell(activeTab: Tab, activePane: SidebarPane, subtitle: string): void {
    this.sidebarEl.hidden = false
    this.sidebarEl.innerHTML = sidebarShellHTML({
      ctrl: this.ctrl,
      tabType: activeTab.type,
      title: activeTab.name || this._defaultTitle(activeTab),
      subtitle,
      activePane,
    })
  }

  private _settingsPane(): HTMLElement | null {
    return this.sidebarEl.querySelector<HTMLElement>("[data-sidebar-pane='settings']")
  }

  private _llmPane(): HTMLElement | null {
    return this.sidebarEl.querySelector<HTMLElement>("[data-sidebar-pane='llm']")
  }

  private _sidebarRendererFor(tabType: Tab["type"] | null | undefined): WorkspaceRenderer {
    switch (tabType) {
    case "data":
      return this._renderDataWorkspace.bind(this)
    case "research":
      return this._renderResearchWorkspace.bind(this)
    case "system_editor":
    case "system_stats":
      return this._renderTabWithoutSharedSidebar.bind(this)
    case "chart":
    default:
      return this._renderChartWorkspace.bind(this)
    }
  }

  private _renderDataWorkspace(activeTab: Tab | undefined, opts: TabRenderOpts): void {
    if (!activeTab || activeTab.type !== "data") return

    this._renderSidebarShell(activeTab, opts.activeSidebarPane, this._sidebarSubtitle(activeTab))
    this.panels.renderDataTab(opts.tabs, opts.activeTabId)

    const settingsPane = this._settingsPane()
    const llmPane = this._llmPane()
    if (!settingsPane || !llmPane) return

    if (activeTab.dataConfig) {
      this.dataSidebar.sidebarEl = settingsPane
      this.dataSidebar.setColumns(activeTab.dataConfig.columns)
      this.dataSidebar.setConditions(activeTab.dataConfig.conditions)
      this.dataSidebar.setSystems(activeTab.dataConfig.systems ?? [])
    }
    this.dataSidebar.render(activeTab, opts.symbols, opts.timeframes, opts.chartTabOptions || [])
    this._renderAssistantPlaceholder(llmPane, "data")
  }

  private _renderResearchWorkspace(activeTab: Tab | undefined, opts: TabRenderOpts): void {
    if (!activeTab || activeTab.type !== "research") return

    this._renderSidebarShell(activeTab, opts.activeSidebarPane, this._sidebarSubtitle(activeTab))
    this.panels.renderDataTab(opts.tabs, opts.activeTabId)

    const settingsPane = this._settingsPane()
    const llmPane = this._llmPane()
    if (!settingsPane || !llmPane) return

    if (activeTab.researchConfig) {
      this.researchSidebar.setSidebarEl(settingsPane)
      this.researchSidebar.render(
        activeTab.researchConfig,
        opts.symbols,
        opts.timeframes,
        opts.researchCatalog || [],
        opts.researchDirectories || [],
        opts.researchFilePickerOpen || false,
        opts.researchFilePickerQuery || "",
        opts.researchFilePickerDirectoryPath || "",
        opts.researchFilePickerSelectedPath || activeTab.researchConfig.systemPath || null,
        opts.researchValidationSystem || null,
      )
    } else {
      settingsPane.innerHTML = ""
    }
    this._renderAssistantPlaceholder(llmPane, "research")
  }

  private _renderChartWorkspace(activeTab: Tab | undefined, opts: TabRenderOpts): void {
    if (activeTab) this._renderSidebarShell(activeTab, opts.activeSidebarPane, this._sidebarSubtitle(activeTab))
    this.panels.render(opts.tabs, opts.activeTabId, opts.selectedPanelId)
    const hasLinkedData = opts.tabs.some(t => t.type === "data" && t.dataConfig?.chartLinks?.length)
    if (hasLinkedData) this.panels.renderDataTab(opts.tabs, opts.activeTabId)

    const settingsPane = this._settingsPane()
    const llmPane = this._llmPane()
    if (!settingsPane || !llmPane) return

    let panel: Panel | null = null
    for (const tab of opts.tabs) {
      panel = tab.panels.find(p => p.id === opts.selectedPanelId) ?? null
      if (panel) break
    }
    this.sidebar.sidebarEl = settingsPane
    this.sidebar.setLinkedSystems(opts.activeTabId ?? "", opts.tabs)
    this.sidebar.render(
      panel,
      opts.selectedOverlayId,
      opts.symbols,
      opts.timeframes,
      opts.indicators,
      opts.labelModeActive,
      opts.lineModeActive,
      opts.vpEnabled,
      opts.vpOpacity,
      opts.hlModeActive,
      opts.vlModeActive,
    )
    this._renderAssistantPlaceholder(llmPane, "chart")
  }

  // ARCH DEBT: system_editor and system_stats bypass the shared sidebar shell entirely.
  // Their sidebar is embedded in panel HTML and managed by system_editor_controller.
  // See tabs_controller._tabSupportsGlobalSidebar for the full explanation.
  private _renderTabWithoutSharedSidebar(_activeTab: Tab | undefined, opts: TabRenderOpts): void {
    this.sidebarEl.innerHTML = ""
    this.panels.renderDataTab(opts.tabs, opts.activeTabId)
  }

  private _renderAssistantPlaceholder(target: HTMLElement, kind: WorkspaceAssistantKind): void {
    target.innerHTML = assistantEmptyStateHTML(WORKSPACE_ASSISTANT_EMPTY_STATES[kind])
  }

  private _defaultTitle(tab: Tab): string {
    if (tab.type === "research") return "Test/Optimization"
    if (tab.type === "data") return "Data"
    if (tab.type === "system_editor") return "System editor"
    if (tab.type === "system_stats") return "Stats"
    return "Chart"
  }

  private _sidebarSubtitle(tab: Tab): string {
    if (tab.type === "research") {
      const config = tab.researchConfig
      return [config?.symbol, config?.timeframe, config?.systemId || "No system"].filter(Boolean).join(" / ")
    }
    if (tab.type === "data") {
      const config = tab.dataConfig
      const parts = [
        config?.symbols?.[0] || "No symbol",
        config?.timeframe || "",
        `${config?.columns?.length || 0} columns`,
      ].filter(Boolean)
      return parts.join(" / ")
    }
    if (tab.type === "chart") {
      const symbol = tab.panels[0]?.overlays[0]?.symbol || "No symbol"
      const timeframe = tab.panels[0]?.timeframe || ""
      return [symbol, timeframe].filter(Boolean).join(" / ")
    }
    return ""
  }

  _renderTabBar(tabs: Tab[], activeTabId: string | null, labelFn?: (tab: Tab) => string): void {
    const parts: string[] = []
    let i = 0

    while (i < tabs.length) {
      const tab = tabs[i]
      if (tab.type === "chart") {
        const group: Tab[] = [tab]
        let j = i + 1
        while (j < tabs.length) {
          const next = tabs[j]
          const isLinkedData = next.type === "data" && next.dataConfig?.chartLinks?.some(l => l.chartTabId === tab.id)
          const isLinkedStats = next.type === "system_stats" && next.systemStatsConfig?.dataTabId !== undefined &&
            tabs.find(t => t.id === next.systemStatsConfig!.dataTabId)?.dataConfig?.chartLinks?.some(l => l.chartTabId === tab.id)
          if (!isLinkedData && !isLinkedStats) break
          group.push(next)
          j++
        }
        if (group.length > 1) {
          const inner = group.map(t =>
            tabButtonHTML(this.ctrl, t.id, labelFn ? labelFn(t) : "New", t.id === activeTabId, tabs.length > 1, t.type || "chart", true)
          ).join("")
          const chartId = tab.id
          const groupHandle = `<span class="tab-drag-handle inline-flex items-center justify-center w-5 h-5 rounded cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 hover:bg-white/10 shrink-0" draggable="true" data-action="click->${this.ctrl}#tabDragHandleClick dragstart->${this.ctrl}#tabDragStart dragend->${this.ctrl}#tabDragEnd" title="Drag to reorder">&#8942;</span>`
          parts.push(`<div data-tab-id="${chartId}" data-drag-tab-id="${chartId}" data-action="dragover->${this.ctrl}#tabDragOver dragleave->${this.ctrl}#tabDragLeave drop->${this.ctrl}#tabDrop" class="inline-flex items-stretch border border-blue-400/40 rounded-lg bg-blue-500/5">${groupHandle}${inner}</div>`)
          i = j
          continue
        }
      }

      // Standalone system_stats tab (unlinked from chart)
      if (tab.type === "data") {
        const statsGroup: Tab[] = [tab]
        let j = i + 1
        while (j < tabs.length && tabs[j].type === "system_stats" && tabs[j].systemStatsConfig?.dataTabId === tab.id) {
          statsGroup.push(tabs[j])
          j++
        }
        if (statsGroup.length > 1) {
          const inner = statsGroup.map(t =>
            tabButtonHTML(this.ctrl, t.id, labelFn ? labelFn(t) : "New", t.id === activeTabId, tabs.length > 1, t.type || "data", true)
          ).join("")
          parts.push(`<div class="inline-flex items-stretch border border-blue-400/40 rounded-lg bg-blue-500/5">${inner}</div>`)
          i = j
          continue
        }
      }

      parts.push(tabButtonHTML(this.ctrl, tab.id, labelFn ? labelFn(tab) : "New", tab.id === activeTabId, tabs.length > 1, tab.type || "chart"))
      i++
    }

    const scrollBtnClass = "shrink-0 w-8 h-8 mt-0.5 flex items-center justify-center rounded border border-[#2a2a3e] text-gray-400 hover:text-white hover:bg-[#1a1a2e] cursor-pointer transition-opacity"

    this.tabBarEl.innerHTML = `
      <div class="flex items-center gap-2 min-w-0 w-full">
        <button
          type="button"
          data-tab-scroll-left
          data-action="click->${this.ctrl}#scrollTabsLeft"
          class="${scrollBtnClass}"
          title="Scroll tabs left"
        >&larr;</button>
        <div data-tab-scroll-area class="flex-1 min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar">
          <div data-tab-scroll-content class="flex items-center gap-1 w-max min-w-full">
            ${parts.join("")}
          </div>
        </div>
        <button
          type="button"
          data-tab-scroll-right
          data-action="click->${this.ctrl}#scrollTabsRight"
          class="${scrollBtnClass}"
          title="Scroll tabs right"
        >&rarr;</button>
        ${addTabButtonHTML(this.ctrl)}
      </div>
    `
  }
}
