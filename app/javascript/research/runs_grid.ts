import { createGrid, type ColDef, type GridApi, type IRowNode, AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { agGridDarkTheme } from "../config/ag_grid_theme"
import type { ProcessedResearchRun } from "./types"

ModuleRegistry.registerModules([AllCommunityModule])

type RunRow = {
  idx: number
  paramValue: number
  netProfit: number
  netProfitPercent: number
  totalTrades: number
  winRate: number
  profitFactor: number
  maxDrawdownPercent: number
  sharpeRatio: number
}

export class RunsGridView {
  private selectedIndex: number

  constructor(
    private api: GridApi<RunRow>,
    selectedIndex: number,
    private setCurrentSelectedIndex: (index: number) => void,
  ) {
    this.selectedIndex = selectedIndex
  }

  setSelectedIndex(index: number): void {
    this.selectedIndex = index
    this.setCurrentSelectedIndex(index)
    this.api.redrawRows()
    this.api.forEachNode(node => {
      if (!node.data) return
      node.setSelected?.(node.data.idx === index)
    })
  }

  destroy(): void {
    this.api.destroy?.()
  }
}

export function renderRunsGrid(
  el: HTMLElement,
  runs: ProcessedResearchRun[],
  selectedIndex: number,
  paramKey: string,
  paramLabel: string,
  onSelect: (index: number) => void,
): RunsGridView {
  let currentSelectedIndex = selectedIndex
  const rowData: RunRow[] = runs.map((run, idx) => ({
    idx,
    paramValue: Number(run.params[paramKey] ?? 0),
    netProfit: run.stats.netProfit,
    netProfitPercent: run.stats.netProfitPercent,
    totalTrades: run.stats.totalTrades,
    winRate: run.stats.winRate,
    profitFactor: run.stats.profitFactor,
    maxDrawdownPercent: run.stats.maxDrawdownPercent,
    sharpeRatio: run.stats.sharpeRatio,
  })).sort((a, b) => a.paramValue - b.paramValue)

  const colDefs: ColDef<RunRow>[] = [
    { headerName: paramLabel, field: "paramValue", width: 96, suppressSizeToFit: true, sort: "asc" },
    { headerName: "Net", field: "netProfit", width: 96, valueFormatter: p => fmt(p.value) },
    { headerName: "Net %", field: "netProfitPercent", width: 92, valueFormatter: p => fmt(p.value) },
    { headerName: "Trades", field: "totalTrades", width: 84, suppressSizeToFit: true },
    { headerName: "Win %", field: "winRate", width: 86, valueFormatter: p => fmt(p.value, 2) },
    { headerName: "PF", field: "profitFactor", width: 86, valueFormatter: p => fmt(p.value, 3) },
    { headerName: "DD %", field: "maxDrawdownPercent", width: 88, valueFormatter: p => fmt(p.value, 2) },
    { headerName: "Sharpe", field: "sharpeRatio", width: 92, valueFormatter: p => fmt(p.value, 3) },
  ]

  const api = createGrid(el, {
    theme: agGridDarkTheme,
    columnDefs: colDefs,
    rowData,
    defaultColDef: { resizable: true, sortable: true },
    domLayout: "normal",
    rowSelection: { mode: "singleRow", enableClickSelection: true },
    suppressMovableColumns: true,
    getRowStyle: params => params.data?.idx === currentSelectedIndex ? { backgroundColor: "rgba(59,130,246,0.16)" } : undefined,
    onRowClicked: event => {
      const idx = event.data?.idx
      if (typeof idx === "number") onSelect(idx)
    },
    onFirstDataRendered: params => {
      params.api.autoSizeAllColumns(false)
      selectNodeByRunIndex(params.api, currentSelectedIndex)
    },
  })

  return new RunsGridView(api, selectedIndex, (index: number) => {
    currentSelectedIndex = index
  })
}

function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null) return "0"
  if (!Number.isFinite(value)) return "Inf"
  return value.toFixed(digits)
}

function selectNodeByRunIndex(api: GridApi<RunRow>, runIndex: number): void {
  let selectedNode: IRowNode<RunRow> | null = null

  api.forEachNode(node => {
    if (!node.data) return
    const selected = node.data.idx === runIndex
    node.setSelected?.(selected)
    if (selected) selectedNode = node
  })

  ;(selectedNode as IRowNode<RunRow> | null)?.setSelected(true)
}
