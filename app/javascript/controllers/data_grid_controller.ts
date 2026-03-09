import { Controller } from "@hotwired/stimulus"
import { createGrid, type GridApi, themeQuartz } from "ag-grid-community"
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { buildGridOptions, buildColDefs, buildRowClassRules, computeSelectionStats, type SelectionStats } from "../data_grid/grid_config"
import { loadDataTable, loadFromCache, type DataTableRow } from "../data_grid/data_loader"
import { evaluateConditions, getHighlightStyles, type ConditionMatch } from "../data_grid/condition_engine"
import { injectConditionStyles } from "../utils/dom"
import candleCache from "../data/candle_cache"
import type { DataConfig } from "../types/store"

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

  connect() {
    this.parseConfig()
    if (this.currentConfig) {
      this.initGrid()
    }
  }

  disconnect() {
    this.cacheUnsub?.()
    this.cacheUnsub = null
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
      this.gridApi.updateGridOptions({
        columnDefs: buildColDefs(this.currentConfig.columns),
        rowClassRules: buildRowClassRules(this.currentConfig.conditions),
      })

      if (symbolChanged || timeframeChanged || serverColsChanged) {
        this.setupCacheSubscription()
        this.loadData()
      } else if (this.rows.length) {
        this.applyConditions()
        this.gridApi.updateGridOptions({ rowData: this.rows })
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
    )
    gridOptions.theme = darkTheme
    gridOptions.rowData = []

    gridOptions.onRowClicked = (event: any) => {
      const time = event.data?.time
      if (time) {
        this.element.dispatchEvent(new CustomEvent("datagrid:rowclick", {
          bubbles: true,
          detail: { time },
        }))
      }
    }

    gridOptions.onSelectionChanged = () => this.onSelectionChanged()

    this.gridApi = createGrid(this.element as HTMLElement, gridOptions)
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
    if (this.currentConfig) {
      for (const col of this.currentConfig.columns) {
        if (col.type === "indicator" && col.indicatorType) {
          const params = col.indicatorParams || {}
          const suffix = Object.values(params)[0]
          allFields.push(suffix ? `${col.indicatorType}_${suffix}` : col.indicatorType)
        } else if (col.type === "change" && col.changePeriod) {
          allFields.push(`change_${col.changePeriod}`)
        }
      }
    }

    const stats = computeSelectionStats(selected, allFields)
    if (!stats) {
      this.selectionStatsEl.innerHTML = ""
      return
    }

    const fieldEntries = Object.entries(stats.fields)
      .filter(([k]) => ["close", "high", "low", "volume"].includes(k) || !NUMERIC_FIELDS.includes(k))
      .slice(0, 6)
      .map(([k, v]) => {
        const label = k.length > 10 ? k.slice(0, 10) + "…" : k
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

  private setupCacheSubscription() {
    this.cacheUnsub?.()
    this.cacheUnsub = null

    if (!this.currentConfig?.sourceTabId) return
    const symbol = this.currentConfig.symbols[0]
    if (!symbol) return

    const hasServerCalcs = this.currentConfig.columns.some(c =>
      (c.type === "indicator" && c.indicatorType) ||
      (c.type === "change" && c.changePeriod) ||
      (c.type === "instrument" && c.instrumentSymbol)
    )

    this.cacheUnsub = candleCache.subscribe(symbol, this.currentConfig.timeframe, () => {
      if (!this.currentConfig?.sourceTabId || !this.gridApi) return

      if (hasServerCalcs) {
        if (!this.rows.length) {
          this.loadData()
        }
        return
      }

      const cached = loadFromCache(this.currentConfig)
      if (cached && cached.length > this.rows.length) {
        this.rows = cached
        this.applyConditions()
        this.gridApi.updateGridOptions({ rowData: this.rows })
      }
    })
  }

  async loadData() {
    if (!this.currentConfig || !this.gridApi) return

    try {
      this.rows = await loadDataTable(this.currentConfig)
      this.applyConditions()
      this.gridApi?.updateGridOptions({ rowData: this.rows })
      this.dispatchTimeRange()
      this.element.dispatchEvent(new CustomEvent("datagrid:loaded", { bubbles: true }))
    } catch (err) {
      console.error("[DataGrid] loadData error:", err)
      if (!this.rows.length) {
        this.gridApi?.updateGridOptions({ rowData: [] })
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

  private applyConditions() {
    if (!this.currentConfig) return
    this.conditionMatches = evaluateConditions(this.rows, this.currentConfig.conditions)
    this.injectConditionStyles()
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
