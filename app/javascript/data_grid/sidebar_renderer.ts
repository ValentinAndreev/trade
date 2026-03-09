import candleCache from "../data/candle_cache"
import type { Tab, DataColumn, Condition, DataConfig } from "../types/store"
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
  settingsHTML,
  actionsHTML,
} from "../templates/data_grid_form_templates"
import {
  conditionItemHTML,
  conditionBuilderHTML,
} from "../templates/condition_templates"

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
  linksCollapsed = false
  showConditionBuilder = false
  editingConditionId: string | null = null
  editingFormulaId: string | null = null
  availableIndicators: IndicatorInfo[] = []

  constructor(sidebarEl: HTMLElement, controllerName: string) {
    this.sidebarEl = sidebarEl
    this.ctrl = controllerName
  }

  render(tab: Tab, symbols: string[], timeframes: string[]): void {
    if (!tab.dataConfig) {
      this.sidebarEl.innerHTML = ""
      return
    }

    const config = tab.dataConfig
    this._lastColumns = config.columns
    this._lastConfig = config
    this._lastSymbols = symbols
    const isLinked = !!config.sourceTabId

    const { startVal, endVal } = this._resolveDateRange(config)

    this.sidebarEl.innerHTML = `
      <div class="flex flex-col gap-4 text-base">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-500 uppercase tracking-wide">Data Settings</span>
          ${isLinked ? '<span class="text-xs px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300">Linked</span>' : '<span class="text-xs px-1.5 py-0.5 rounded bg-gray-600/20 text-gray-400">Unlinked</span>'}
        </div>

        ${isLinked ? "" : symbolSelectHTML(this.ctrl, config.symbols, symbols)}

        ${timeframeSelectHTML(this.ctrl, timeframes, config.timeframe)}

        ${dateRangeHTML(this.ctrl, startVal, endVal)}

        <hr class="border-[#3a3a4e]">

        ${this._columnsSection(config.columns)}

        <hr class="border-[#3a3a4e]">

        ${this._conditionsSection(config.conditions)}

        <hr class="border-[#3a3a4e]">

        ${this._chartLinksSection(config.chartLinks || [])}

        <hr class="border-[#3a3a4e]">

        ${settingsHTML(this.ctrl)}

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
  private _lastColumns: DataColumn[] = []
  private _lastConfig: DataConfig | null = null
  private _lastSymbols: string[] = []

  get _currentColumns(): DataColumn[] {
    return this._lastColumns || []
  }

  setConditions(conditions: Condition[]): void {
    this._lastConditions = conditions
  }

  setColumns(columns: DataColumn[]): void {
    this._lastColumns = columns
  }

  // --- Private sections ---

  private _resolveDateRange(config: DataConfig): { startVal: string; endVal: string } {
    let startVal = config.startTime ? new Date(config.startTime * 1000).toISOString().slice(0, 16) : ""
    let endVal = config.endTime ? new Date(config.endTime * 1000).toISOString().slice(0, 16) : ""

    if ((!startVal || !endVal) && config.symbols?.length && config.timeframe) {
      const oldest = candleCache.oldestTime(config.symbols[0], config.timeframe)
      const newest = candleCache.newestTime(config.symbols[0], config.timeframe)
      if (!startVal && oldest) startVal = new Date(oldest * 1000).toISOString().slice(0, 16)
      if (!endVal && newest) endVal = new Date(newest * 1000).toISOString().slice(0, 16)
    }

    return { startVal, endVal }
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
    const list = conditions.map(cond => conditionItemHTML(this.ctrl, cond)).join("")
    return `
      ${this._sectionHeader("Conditions", "showAddCondition", "+ Condition", "toggleDataConditions")}
      ${this.conditionsCollapsed ? "" : `
        <div class="flex flex-col gap-0.5">${list || '<span class="text-sm text-gray-500 italic px-2">No conditions</span>'}</div>
        ${this.showConditionBuilder ? conditionBuilderHTML(this.ctrl, this._currentColumns, this._editingCondition) : ""}
      `}
    `
  }

  private _chartLinksSection(links: Array<{ chartTabId: string; panelId: string }>): string {
    const list = links.map((link, idx) => chartLinkItemHTML(this.ctrl, link, idx)).join("")
    return `
      ${this._sectionHeader("Chart Links", "addChartLink", "+ Link")}
      <div class="flex flex-col gap-0.5">
        ${list || '<span class="text-sm text-gray-500 italic px-2">No linked charts</span>'}
      </div>
    `
  }
}
