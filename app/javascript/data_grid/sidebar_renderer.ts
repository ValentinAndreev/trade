import candleCache from "../data/candle_cache"
import type { Tab, DataColumn, Condition, DataConfig, TradingSystem } from "../types/store"
import { systemBuilderHTML, systemItemHTML } from "../templates/system_templates"
import {
  symbolSelectHTML,
  timeframeSelectHTML,
  dateRangeHTML,
  indicatorParamsHTML,
  changeParamsHTML,
  formulaParamsHTML,
  instrumentParamsHTML,
  columnListHTML,
  addColumnFormHTML,
  formulaEditHTML,
  chartLinkItemHTML,
  chartLinkSelectorHTML,
  actionsHTML,
} from "../templates/data_grid_form_templates"
import {
  conditionItemHTML,
  conditionBuilderHTML,
} from "../templates/condition_templates"
import type { ChartTabOption } from "../tabs/renderer"

export interface IndicatorInfo {
  key: string
  name: string
  options: string[]
  min_data: number
}

export default class DataSidebarRenderer {
  sidebarEl: HTMLElement
  ctrl: string
  columnsCollapsed = false
  conditionsCollapsed = false
  systemsCollapsed = false
  linksCollapsed = false
  showConditionBuilder = false
  showSystemBuilder = false
  showLinkSelector = false
  editingConditionId: string | null = null
  editingSystemId: string | null = null
  editingFormulaId: string | null = null
  availableIndicators: IndicatorInfo[] = []
  private _activeTabId: string | null = null
  private _builderWasOpen = false

  constructor(sidebarEl: HTMLElement, controllerName: string) {
    this.sidebarEl = sidebarEl
    this.ctrl = controllerName
  }

  render(tab: Tab, symbols: string[], timeframes: string[], chartTabOptions: ChartTabOption[] = []): void {
    if (!tab.dataConfig) {
      this.sidebarEl.innerHTML = ""
      return
    }

    // If the user switched to a different tab, discard any open builder state
    if (this._activeTabId !== tab.id) {
      this.showSystemBuilder = false
      this.showConditionBuilder = false
      this.editingSystemId = null
      this.editingConditionId = null
      this._activeTabId = tab.id
      this._builderWasOpen = false
    }

    // Block re-renders only when a builder was ALREADY open before this call
    // (background updates while user fills in the form).
    // Allow renders when the builder state just changed (opening or closing).
    const builderNowOpen = this.showSystemBuilder || this.showConditionBuilder
    const block = this._builderWasOpen && builderNowOpen
    this._builderWasOpen = builderNowOpen
    if (block) return

    const config = tab.dataConfig
    this._lastColumns = config.columns
    this._lastConfig = config
    this._lastSymbols = symbols
    this._lastChartTabOptions = chartTabOptions
    const isLinked = !!(config.chartLinks?.length || config.sourceTabId)

    const dr = this._resolveDateRange(config)

    this.sidebarEl.innerHTML = `
      <div class="flex flex-col gap-4 text-base">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-500 uppercase tracking-wide">Data Settings</span>
          ${isLinked ? '<span class="text-xs px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300">Linked</span>' : '<span class="text-xs px-1.5 py-0.5 rounded bg-gray-600/20 text-gray-400">Unlinked</span>'}
        </div>

        ${isLinked ? "" : symbolSelectHTML(this.ctrl, config.symbols, symbols)}

        ${timeframeSelectHTML(this.ctrl, timeframes, config.timeframe)}

        ${dateRangeHTML(this.ctrl, dr.startDate, dr.startHour, dr.startMinute, dr.endDate, dr.endHour, dr.endMinute, isLinked)}

        <hr class="border-[#3a3a4e]">

        ${this._columnsSection(config.columns)}

        <hr class="border-[#3a3a4e]">

        ${this._conditionsSection(config.conditions)}

        <hr class="border-[#3a3a4e]">

        ${this._systemsSection(config.systems ?? [])}

        <hr class="border-[#3a3a4e]">

        ${this._chartLinksSection(config.chartLinks || [])}

        <hr class="border-[#3a3a4e]">

        ${actionsHTML(this.ctrl)}
      </div>
    `
  }

  // --- Public helpers used by tabs_controller ---

  indicatorParamsHTML(): string {
    return indicatorParamsHTML(this.availableIndicators)
  }

  changeParamsHTML(): string {
    return changeParamsHTML()
  }

  formulaParamsHTML(): string {
    return formulaParamsHTML()
  }

  instrumentParamsHTML(symbols: string[]): string {
    return instrumentParamsHTML(symbols)
  }

  // --- State ---

  get _editingCondition(): Condition | undefined {
    if (!this.editingConditionId) return undefined
    return this._lastConditions?.find(c => c.id === this.editingConditionId)
  }

  private _lastConditions: Condition[] = []
  private _lastSystems: TradingSystem[] = []
  private _lastColumns: DataColumn[] = []
  private _lastConfig: DataConfig | null = null
  private _lastSymbols: string[] = []
  private _lastChartTabOptions: ChartTabOption[] = []

  get _currentColumns(): DataColumn[] {
    return this._lastColumns || []
  }

  setConditions(conditions: Condition[]): void {
    this._lastConditions = conditions
  }

  setSystems(systems: TradingSystem[]): void {
    this._lastSystems = systems
  }

  setColumns(columns: DataColumn[]): void {
    this._lastColumns = columns
  }

  get _editingSystem(): TradingSystem | undefined {
    if (!this.editingSystemId) return undefined
    return this._lastSystems.find(s => s.id === this.editingSystemId)
  }

  // --- Private sections ---

  private _resolveDateRange(config: DataConfig): {
    startDate: string
    startHour: number
    startMinute: number
    endDate: string
    endHour: number
    endMinute: number
  } {
    const toParts = (t: number) => {
      const d = new Date(t * 1000)
      return {
        date: d.toISOString().slice(0, 10),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
      }
    }
    let start = config.startTime ? toParts(config.startTime) : null
    let end = config.endTime ? toParts(config.endTime) : null
    if ((!start || !end) && config.symbols?.length && config.timeframe) {
      const oldest = candleCache.oldestTime(config.symbols[0], config.timeframe)
      const newest = candleCache.newestTime(config.symbols[0], config.timeframe)
      if (!start && oldest) start = toParts(oldest)
      if (!end && newest) end = toParts(newest)
    }
    return {
      startDate: start?.date ?? "",
      startHour: start?.hour ?? 0,
      startMinute: start?.minute ?? 0,
      endDate: end?.date ?? "",
      endHour: end?.hour ?? 23,
      endMinute: end?.minute ?? 59,
    }
  }

  private _sectionHeader(
    label: string,
    addAction?: string,
    addLabel = "+ Add",
    toggleAction?: string,
  ): string {
    const titleAttr = toggleAction ? `data-action="click->${this.ctrl}#${toggleAction}" class="text-sm text-gray-500 uppercase tracking-wide cursor-pointer"` : `class="text-sm text-gray-500 uppercase tracking-wide"`
    const addBtn = addAction
      ? `<button data-action="click->${this.ctrl}#${addAction}" class="text-sm text-gray-400 hover:text-white cursor-pointer">${addLabel}</button>`
      : ""
    return `<div class="flex items-center justify-between"><span ${titleAttr}>${label}</span>${addBtn}</div>`
  }

  private _columnsSection(columns: DataColumn[]): string {
    const editingCol = this.editingFormulaId ? columns.find(c => c.id === this.editingFormulaId) : null
    const editFormHTML = editingCol
      ? formulaEditHTML(this.ctrl, editingCol.id, editingCol.label, editingCol.expression || "")
      : ""
    return `
      ${this._sectionHeader("Columns", "showAddColumn", "+ Column", "toggleDataColumns")}
      ${this.columnsCollapsed ? "" : `
        <div class="flex flex-col gap-0.5">${columnListHTML(this.ctrl, columns)}</div>
        ${editFormHTML}
        ${addColumnFormHTML(this.ctrl, this.indicatorParamsHTML())}
      `}
    `
  }

  private _conditionsSection(conditions: Condition[]): string {
    const list = conditions.map(cond => conditionItemHTML(this.ctrl, cond, this._currentColumns)).join("")
    return `
      ${this._sectionHeader("Conditions", "showAddCondition", "+ Condition", "toggleDataConditions")}
      ${this.conditionsCollapsed ? "" : `
        <div class="flex flex-col gap-0.5">${list || '<span class="text-sm text-gray-500 italic px-2">No conditions</span>'}</div>
        ${this.showConditionBuilder ? conditionBuilderHTML(this.ctrl, this._currentColumns, this._editingCondition) : ""}
      `}
    `
  }

  private _systemsSection(systems: TradingSystem[]): string {
    return `
      ${this._sectionHeader("Systems", "addSystem", "+ System", "toggleDataSystems")}
      ${this.systemsCollapsed ? "" : `
        ${systems.length
          ? systems.map(s => systemItemHTML(this.ctrl, s, this._currentColumns)).join("")
          : '<span class="text-sm text-gray-500 italic px-2">No systems</span>'}
        ${this.showSystemBuilder ? systemBuilderHTML(this.ctrl, this._currentColumns, this._editingSystem) : ""}
      `}
    `
  }

  private _chartLinksSection(links: Array<{ chartTabId: string; panelId: string }>): string {
    const labelMap = new Map(this._lastChartTabOptions.map(o => [o.id, o.label]))
    const hasLink = links.length > 0
    const list = links.map((link, idx) =>
      chartLinkItemHTML(this.ctrl, link, idx, labelMap.get(link.chartTabId))
    ).join("")
    const dataSymbol = this._lastConfig?.symbols?.[0] || null
    const filteredOptions = dataSymbol
      ? this._lastChartTabOptions.filter(o => o.primarySymbol === dataSymbol)
      : this._lastChartTabOptions
    const selectorHTML = this.showLinkSelector
      ? chartLinkSelectorHTML(this.ctrl, filteredOptions)
      : ""
    const addAction = hasLink ? undefined : "showAddChartLink"
    const addLabel = hasLink ? undefined : "+ Link"
    return `
      ${this._sectionHeader("Chart Links", addAction, addLabel)}
      <div class="flex flex-col gap-1">
        ${list || '<span class="text-sm text-gray-500 italic px-2">No linked charts</span>'}
      </div>
      ${selectorHTML}
    `
  }
}
