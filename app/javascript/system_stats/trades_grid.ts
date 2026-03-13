import { createGrid, type GridApi } from "ag-grid-community"
import type { ColDef } from "ag-grid-community"
import type { Trade } from "../types/store"
import { agGridDarkTheme } from "../config/ag_grid_theme"

import { UP_COLOR, DOWN_COLOR } from "../config/theme"

function colWidth(header: string, minWidth = 60): number {
  return Math.max(minWidth, Math.min(300, header.length * 10 + 16))
}

type TradeRow = {
  idx: number; dir: string; entryTime: string; entryPrice: string
  exitTime: string; exitPrice: string; pnl: number | null; pnlPct: number | null; bars: number | null
}

function fmtDate(t: number): string {
  return new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ")
}

export function renderTradesGrid(el: HTMLElement, trades: Trade[]): GridApi<TradeRow> {
  const pnlStyle = (p: { value: number | null }) => (p.value ?? 0) >= 0 ? { color: UP_COLOR } : { color: DOWN_COLOR }

  const colDefs: ColDef<TradeRow>[] = [
    { headerName: "#",           field: "idx",        width: colWidth("#", 40),           suppressSizeToFit: true },
    { headerName: "Dir",         field: "dir",        width: colWidth("Dir", 70),          suppressSizeToFit: true },
    { headerName: "Entry time",  field: "entryTime",  width: colWidth("Entry time", 140),  suppressSizeToFit: true },
    { headerName: "Entry price", field: "entryPrice", width: colWidth("Entry price", 100), suppressSizeToFit: true },
    { headerName: "Exit time",   field: "exitTime",   width: colWidth("Exit time", 140),   suppressSizeToFit: true },
    { headerName: "Exit price",  field: "exitPrice",  width: colWidth("Exit price", 100),  suppressSizeToFit: true },
    { headerName: "P&L",   field: "pnl",    width: colWidth("P&L", 90),   suppressSizeToFit: true, cellStyle: pnlStyle },
    { headerName: "P&L %", field: "pnlPct", width: colWidth("P&L %", 80), suppressSizeToFit: true, cellStyle: pnlStyle },
    { headerName: "Bars",  field: "bars",   width: colWidth("Bars", 60),  suppressSizeToFit: true },
  ]

  const rowData: TradeRow[] = trades
    .filter(t => t.exitTime != null)
    .map((t, i) => ({
      idx:        i + 1,
      dir:        t.direction === "long" ? "▲ Long" : "▼ Short",
      entryTime:  fmtDate(t.entryTime),
      entryPrice: t.entryPrice.toFixed(2),
      exitTime:   t.exitTime  ? fmtDate(t.exitTime)  : "—",
      exitPrice:  t.exitPrice != null ? t.exitPrice.toFixed(2) : "—",
      pnl:        t.pnl     != null ? +t.pnl.toFixed(4)       : null,
      pnlPct:     t.pnlPercent != null ? +t.pnlPercent.toFixed(2) : null,
      bars:       t.bars,
    }))

  return createGrid(el, {
    theme: agGridDarkTheme,
    columnDefs: colDefs,
    rowData,
    defaultColDef: { resizable: true, sortable: true },
    domLayout: "normal",
    onFirstDataRendered: (params) => params.api.autoSizeAllColumns(false),
  })
}
