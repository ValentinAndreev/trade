import { Controller } from "@hotwired/stimulus"
import { createGrid, type GridApi, themeQuartz } from "ag-grid-community"
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { buildGridOptions, buildColDefs, buildRowClassRules, computeSelectionStats, getInitialColumnState, type SelectionStats } from "../data_grid/grid_config"
import { loadDataTable, getRowsFromCache, type DataTableRow } from "../data_grid/data_loader"
import { evaluateConditions, evaluateFormulaExpression, getHighlightStyles, type ConditionMatch } from "../data_grid/condition_engine"
import { injectConditionStyles } from "../utils/dom"
import candleCache from "../data/candle_cache"
import type { Candle } from "../types/candle"
import type { DataConfig } from "../types/store"
import { columnFieldKey } from "../types/store"

ModuleRegistry.registerModules([AllCommunityModule])

const darkTheme = themeQuartz.withParams({
  backgroundColor: "#1a1a2e",
  foregroundColor: "#d1d4dc",
  headerBackgroundColor: "#22223a",
  headerTextColor: "#9ca3af",
  rowHoverColor: "#2a2a3e",
  borderColor: "#3a3a4e",
  accentColor: "#3b82f6",
  chromeBackgroundColor: "#1a1a2e",
  oddRowBackgroundColor: "#1e1e32",
  fontSize: 13,
  headerFontSize: 12,
})

const NUMERIC_FIELDS = ["open", "high", "low", "close", "volume"]

export default class extends Controller {
  static values = {
    config: String,
  }

  declare configValue: string

  private gridApi: GridApi | null = null
  private rows: DataTableRow[] = []
  private currentConfig: DataConfig | null = null
  private prevSymbol: string | null = null
  private prevTimeframe: string | null = null
  private prevServerColsKey: string = ""
  private conditionMatches: Map<number, ConditionMatch> = new Map()
  private cacheUnsub: (() => void) | null = null
  private selectionStatsEl: HTMLElement | null = null
  private isLoadingData = false

  connect() {
    this.parseConfig()
    if (this.currentConfig) {
      this.initGrid()
    }
  }

  /** Fill null instrument-column values from cache when the secondary symbol's cache arrives. */
  private fillInstrumentColFromCache(instSymbol: string) {
    if (!this.currentConfig || !this.gridApi || this.isLoadingData || !this.rows.length) return
    const cols = this.currentConfig.columns.filter(
      c => c.type === "instrument" && c.instrumentSymbol === instSymbol
    )
    if (!cols.length) return
    const candles = candleCache.get(instSymbol, this.currentConfig.timeframe)
    if (!candles?.length) return
    const byTime = new Map(candles.map(c => [c.time, c]))
    const toUpdate: DataTableRow[] = []
    for (let i = 0; i < this.rows.length; i++) {
      const candle = byTime.get(this.rows[i].time)
      if (!candle) continue
      let changed = false
      const updated = { ...this.rows[i] }
      for (const col of cols) {
        const key = columnFieldKey(col)
        const val = (col.instrumentField
          ? (candle as unknown as Record<string, unknown>)[col.instrumentField]
          : candle.close) as unknown
        if (val != null && updated[key] == null) {
          ;(updated as Record<string, unknown>)[key] = val
          changed = true
        }
      }
      if (changed) { this.rows[i] = updated; toUpdate.push(updated) }
    }
    if (toUpdate.length) {
      this.refreshConditionMatches()
      this.gridApi.applyTransaction({ update: toUpdate })
    }
  }

  disconnect() {
    this.teardownCacheSubscriptions()
    this.selectionStatsEl?.remove()
    this.selectionStatsEl = null
    this.gridApi?.destroy()
    this.gridApi = null
  }

  configValueChanged() {
    const oldSymbol = this.prevSymbol
    const oldTimeframe = this.prevTimeframe
    const oldServerCols = this.prevServerColsKey
    this.parseConfig()
    if (!this.currentConfig) return

    const symbolChanged = this.currentConfig.symbols[0] !== oldSymbol
    const timeframeChanged = this.currentConfig.timeframe !== oldTimeframe
    const serverColsChanged = this.prevServerColsKey !== oldServerCols

    if (this.gridApi) {
      if (symbolChanged || timeframeChanged || serverColsChanged) {
        // Data reload path: loadData() will atomically apply columnDefs + rowData.
        // Avoid a separate updateGridOptions({ columnDefs }) here which would briefly
        // show rebuilt columns with no/old row data (the visual flicker).
        this.setupCacheSubscription()
        this.loadData()
      } else {
        // No data reload: apply column/condition config changes immediately.
        this.gridApi.updateGridOptions({
          columnDefs: buildColDefs(this.currentConfig.columns),
          rowClassRules: buildRowClassRules(this.currentConfig.conditions, this.conditionMatches),
        })
        if (this.rows.length) {
          this.refreshConditionMatches()
          this.gridApi.updateGridOptions({ rowData: this.rows })
        }
      }
    } else {
      this.initGrid()
    }
  }

  private parseConfig() {
    try {
      this.currentConfig = JSON.parse(this.configValue)
      this.prevSymbol = this.currentConfig!.symbols[0] ?? null
      this.prevTimeframe = this.currentConfig!.timeframe ?? null
      this.prevServerColsKey = this.serverColsKey(this.currentConfig!)
    } catch (err) {
      console.error("[DataGrid] Failed to parse config:", err)
      this.currentConfig = null
    }
  }

  private serverColsKey(config: DataConfig): string {
    return config.columns
      .filter(c =>
        (c.type === "indicator" && c.indicatorType) ||
        (c.type === "change" && c.changePeriod) ||
        (c.type === "instrument" && c.instrumentSymbol)
      )
      .map(c => {
        if (c.type === "indicator") return `${c.indicatorType}:${JSON.stringify(c.indicatorParams || {})}`
        if (c.type === "instrument") return `inst:${c.instrumentSymbol}:${c.instrumentField}`
        return `change:${c.changePeriod}`
      })
      .sort()
      .join("|")
  }

  private initGrid() {
    if (!this.currentConfig) return

    if (this.gridApi) {
      this.gridApi.destroy()
      this.gridApi = null
    }

    const gridOptions = buildGridOptions(
      this.currentConfig.columns,
      this.currentConfig.conditions,
      this.conditionMatches,
    )
    gridOptions.theme = darkTheme
    gridOptions.rowData = []

    gridOptions.isExternalFilterPresent = () => {
      return (this.currentConfig?.conditions ?? []).some(
        c => c.enabled && c.filterMode && c.filterMode !== "none"
      )
    }

    gridOptions.doesExternalFilterPass = (node: { data?: DataTableRow }) => {
      if (!this.currentConfig || !node.data) return true
      const { conditions } = this.currentConfig
      const time = node.data.time
      const match = this.conditionMatches.get(time)
      const matchedIds = new Set(match?.conditionIds ?? [])

      const showOnlyConds = conditions.filter(c => c.enabled && c.filterMode === "show_only")
      if (showOnlyConds.length && !showOnlyConds.some(c => matchedIds.has(c.id))) return false

      const hideConds = conditions.filter(c => c.enabled && c.filterMode === "hide_matching")
      if (hideConds.some(c => matchedIds.has(c.id))) return false

      return true
    }

    gridOptions.onRowClicked = (event: { data?: DataTableRow }) => {
      const time = event.data?.time
      if (time) {
        this.element.dispatchEvent(new CustomEvent("datagrid:rowclick", {
          bubbles: true,
          detail: { time },
        }))
      }
    }

    gridOptions.onSelectionChanged = () => this.onSelectionChanged()

    const dispatchColumnState = () => {
      setTimeout(() => {
        const tabWrapper = this.element.closest?.("[data-tab-wrapper]") as HTMLElement | null
        const tabId = tabWrapper?.getAttribute?.("data-tab-wrapper")
        if (!tabId) return
        const api = this.gridApi as { getColumnState?: () => Array<{ colId: string; width?: number | null }> } | null
        const state = api?.getColumnState?.()
        if (!state?.length) return
        const columnIds = state.map(c => c.colId).filter(Boolean) as string[]
        const widths: Record<string, number> = {}
        state.forEach(c => { if (c.colId && c.width != null) widths[c.colId] = c.width })
        this.element.dispatchEvent(new CustomEvent("datagrid:columnStateChanged", {
          bubbles: true,
          detail: { tabId, columnIds, widths },
        }))
      }, 0)
    }

    gridOptions.onColumnMoved = (params: { finished?: boolean }) => {
      if (params.finished) dispatchColumnState()
    }

    gridOptions.onColumnResized = (params: { finished?: boolean }) => {
      if (params.finished) dispatchColumnState()
    }

    this.gridApi = createGrid(this.element as HTMLElement, gridOptions)
    if (this.currentConfig?.columns?.length) {
      const state = getInitialColumnState(this.currentConfig.columns)
      this.gridApi.applyColumnState({ state })
    }
    this.ensureStatsEl()
    this.setupCacheSubscription()
    this.loadData()
  }

  private ensureStatsEl() {
    if (this.selectionStatsEl) return
    this.selectionStatsEl = document.createElement("div")
    this.selectionStatsEl.className = "absolute bottom-8 left-0 right-0 z-10 pointer-events-none"
    this.selectionStatsEl.innerHTML = ""
    const parent = this.element.parentElement
    if (parent) {
      parent.style.position = "relative"
      parent.appendChild(this.selectionStatsEl)
    }
  }

  private onSelectionChanged() {
    if (!this.gridApi || !this.selectionStatsEl) return
    const selected = this.gridApi.getSelectedRows()
    if (selected.length < 2) {
      this.selectionStatsEl.innerHTML = ""
      return
    }

    const allFields = [...NUMERIC_FIELDS]
    const formulaCols: Array<{ label: string; expression: string }> = []

    if (this.currentConfig) {
      for (const col of this.currentConfig.columns) {
        if (col.type === "indicator" || col.type === "change") {
          allFields.push(columnFieldKey(col))
        } else if (col.type === "instrument") {
          allFields.push(col.label)
        } else if (col.type === "formula" && col.expression) {
          allFields.push(col.label)
          formulaCols.push({ label: col.label, expression: col.expression })
        }
      }
    }

    const rows: DataTableRow[] = formulaCols.length
      ? selected.map(row => {
          const augmented = { ...row } as Record<string, unknown>
          for (const { label, expression } of formulaCols) {
            augmented[label] = evaluateFormulaExpression(expression, row)
          }
          return augmented as DataTableRow
        })
      : selected

    const stats = computeSelectionStats(rows, allFields)
    if (!stats) {
      this.selectionStatsEl.innerHTML = ""
      return
    }

    const displayFields = allFields.filter(f => stats.fields[f])
    const fieldEntries = displayFields
      .map(f => {
        const v = stats.fields[f]
        const label = f.length > 12 ? f.slice(0, 12) + "…" : f
        return `<span class="text-gray-400">${label}:</span> ${v.min.toFixed(2)} — ${v.max.toFixed(2)} <span class="text-gray-500">avg</span> ${v.avg.toFixed(2)}`
      })
      .join(" | ")

    this.selectionStatsEl.innerHTML = `
      <div class="mx-2 px-3 py-1.5 rounded bg-[#22223a]/95 border border-[#3a3a4e] text-xs text-gray-300 pointer-events-auto flex flex-wrap gap-x-3 gap-y-1">
        <span class="text-blue-400 font-medium">${stats.count} rows</span>
        ${fieldEntries}
      </div>
    `
  }

  private instrumentUnsubs: Array<() => void> = []

  private teardownCacheSubscriptions() {
    this.cacheUnsub?.(); this.cacheUnsub = null
    this.instrumentUnsubs.forEach(u => u()); this.instrumentUnsubs = []
  }

  private setupCacheSubscription() {
    this.teardownCacheSubscriptions()
    if (!this.currentConfig?.sourceTabId) return
    const { symbols, timeframe } = this.currentConfig
    if (!symbols[0]) return

    const instSymbols = [...new Set(
      this.currentConfig.columns.filter(c => c.type === "instrument" && c.instrumentSymbol).map(c => c.instrumentSymbol!)
    )]
    this.instrumentUnsubs = instSymbols.map(sym =>
      candleCache.subscribe(sym, timeframe, () => this.fillInstrumentColFromCache(sym))
    )
    this.cacheUnsub = candleCache.subscribe(symbols[0], timeframe, (candles) => this.onCacheTick(candles))
  }

  private onCacheTick(candles: Candle[]) {
    if (!this.currentConfig?.sourceTabId || !this.gridApi || this.isLoadingData || !candles.length) return
    if (!this.rows.length) { this.populateFromCache(); return }
    this.applyIncrementalCacheUpdate(candles)
  }

  private populateFromCache() {
    const cached = getRowsFromCache(this.currentConfig!)
    if (!cached?.length) return
    this.rows = cached
    this.refreshConditionMatches()
    this.gridApi!.updateGridOptions({ rowData: this.rows })
  }

  private applyIncrementalCacheUpdate(candles: Candle[]) {
    const config = this.currentConfig!
    const hasServerCalcs = config.columns.some(c =>
      (c.type === "indicator" && c.indicatorType) ||
      (c.type === "change" && c.changePeriod) ||
      (c.type === "instrument" && c.instrumentSymbol)
    )
    const freshRows = getRowsFromCache({ ...config, startTime: candles.at(-2)?.time, endTime: undefined })
    if (!freshRows?.length) return

    const byTime = new Map<number, number>()
    for (let i = 0; i < this.rows.length; i++) byTime.set(this.rows[i].time, i)

    const toAdd: DataTableRow[] = []
    const toUpdate: DataTableRow[] = []
    for (const fresh of freshRows) {
      const idx = byTime.get(fresh.time)
      if (idx != null) {
        const merged = hasServerCalcs ? this.mergePreservingNulls(this.rows[idx], fresh) : fresh
        this.rows[idx] = merged; toUpdate.push(merged)
      } else {
        this.rows.push(fresh); toAdd.push(fresh)
      }
    }
    if (!toAdd.length && !toUpdate.length) return
    this.refreshConditionMatches()
    this.gridApi!.applyTransaction({ add: toAdd, update: toUpdate })
  }

  private mergePreservingNulls(existing: DataTableRow, fresh: DataTableRow): DataTableRow {
    const result = { ...existing } as Record<string, unknown>
    for (const [k, v] of Object.entries(fresh)) if (v != null) result[k] = v
    return result as DataTableRow
  }

  async loadData() {
    if (!this.currentConfig || !this.gridApi || this.isLoadingData) return

    this.isLoadingData = true
    try {
      // Snapshot config so we apply the exact column defs that match this data load.
      const config = this.currentConfig
      this.rows = await loadDataTable(config)
      this.refreshConditionMatches()
      // Atomic update: columnDefs + rowClassRules + rowData in one call so AG Grid
      // never renders a state with new columns but empty/old rows (the visual flicker).
      this.gridApi?.updateGridOptions({
        columnDefs: buildColDefs(config.columns),
        rowClassRules: buildRowClassRules(config.conditions, this.conditionMatches),
        rowData: this.rows,
      })
      this.dispatchTimeRange()
      this.element.dispatchEvent(new CustomEvent("datagrid:loaded", { bubbles: true }))
    } catch (err) {
      console.error("[DataGrid] loadData error:", err)
      if (!this.rows.length) {
        this.gridApi?.updateGridOptions({ rowData: [] })
      }
    } finally {
      this.isLoadingData = false
    }
  }

  async loadWithConfig(config: DataConfig): Promise<void> {
    this.currentConfig = config
    this.prevSymbol = config.symbols[0] ?? null
    this.prevTimeframe = config.timeframe ?? null
    this.prevServerColsKey = this.serverColsKey(config)
    if (this.gridApi) {
      // No pre-emptive columnDefs update here — loadData() applies them atomically with rowData.
      this.setupCacheSubscription()
      await this.loadData()
    } else {
      this.initGrid()
    }
  }

  /** Updates only column defs and row class rules; does not reload data. Use for visibility/order changes offline. */
  applyColumnDefsOnly(config: DataConfig): void {
    this.currentConfig = config
    if (this.gridApi) {
      this.gridApi.updateGridOptions({
        columnDefs: buildColDefs(config.columns),
        rowClassRules: buildRowClassRules(config.conditions, this.conditionMatches),
      })
    }
  }

  /** Apply config (columns, subscription) without loading data. Use when unlinking so current rows are kept. */
  applyConfigOnly(config: DataConfig): void {
    this.currentConfig = config
    this.prevSymbol = config.symbols[0] ?? null
    this.prevTimeframe = config.timeframe ?? null
    this.prevServerColsKey = this.serverColsKey(config)
    if (this.gridApi) {
      this.gridApi.updateGridOptions({
        columnDefs: buildColDefs(config.columns),
        rowClassRules: buildRowClassRules(config.conditions, this.conditionMatches),
      })
      this.setupCacheSubscription()
      if (this.rows.length) {
        this.refreshConditionMatches()
        this.gridApi.updateGridOptions({ rowData: this.rows })
      }
    }
  }

  private dispatchTimeRange() {
    if (!this.rows.length) return
    const times = this.rows.map(r => r.time).filter(Boolean).sort((a, b) => a - b)
    if (!times.length) return
    this.element.dispatchEvent(new CustomEvent("datagrid:timerange", {
      bubbles: true,
      detail: { startTime: times[0], endTime: times[times.length - 1] },
    }))
  }

  /**
   * Full conditions refresh: re-evaluates matches AND rebuilds rowClassRules in AG Grid.
   * Use when conditions config changes (new/edited/deleted condition).
   * Mutates conditionMatches in-place so existing closures from prior buildRowClassRules
   * calls stay in sync.
   */
  refreshConditionMatches() {
    if (!this.currentConfig) return
    const newMatches = evaluateConditions(this.rows, this.currentConfig.conditions)
    this.conditionMatches.clear()
    for (const [k, v] of newMatches) this.conditionMatches.set(k, v)
    this.injectConditionStyles()
    this.gridApi?.onFilterChanged()
  }

  private injectConditionStyles() {
    if (!this.currentConfig) return
    injectConditionStyles(getHighlightStyles(this.currentConfig.conditions))
  }

  getConditionMatches(): Map<number, ConditionMatch> {
    return this.conditionMatches
  }

  getRowByTime(time: number): DataTableRow | undefined {
    return this.rows.find(r => r.time === time)
  }

  scrollToTime(time: number): void {
    if (!this.gridApi) return
    const idx = this.rows.findIndex(r => r.time >= time)
    if (idx >= 0) {
      this.gridApi.ensureIndexVisible(idx, "middle")
    }
  }

  getData(): DataTableRow[] {
    return this.rows
  }
}
