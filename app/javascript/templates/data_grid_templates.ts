import { escapeHTML } from "../utils/dom"
import type { DataColumn, Condition, ConditionRule, ConditionAction } from "../types/store"
import type { IndicatorInfo } from "../data_grid/sidebar_renderer"

const COLUMN_TYPES: Array<{ value: string; label: string }> = [
  { value: "indicator", label: "Indicator" },
  { value: "change", label: "Change %" },
  { value: "formula", label: "Formula" },
  { value: "instrument", label: "Instrument" },
]

const CHANGE_PERIODS = ["1m", "5m", "15m", "1h", "4h", "1d"]

const OPERATORS: Array<{ value: ConditionRule["type"]; label: string; hint: string }> = [
  { value: "value_gt", label: "> greater than", hint: "Column value > threshold" },
  { value: "value_lt", label: "< less than", hint: "Column value < threshold" },
  { value: "change_gt", label: "Change > %", hint: "Column change > %" },
  { value: "change_lt", label: "Change < %", hint: "Column change < %" },
  { value: "cross_above", label: "Crosses above column", hint: "Column crosses above another column" },
  { value: "cross_below", label: "Crosses below column", hint: "Column crosses below another column" },
  { value: "between", label: "Between", hint: "Value between threshold and column" },
  { value: "expression", label: "Expression", hint: "Custom formula expression" },
]

const ACTION_TYPES = [
  { value: "rowHighlight", label: "Highlight row" },
  { value: "chartMarker", label: "Chart marker" },
  { value: "chartColorZone", label: "Chart color zone" },
]

const DEFAULT_COLORS = ["#ef5350", "#26a69a", "#ff9800", "#42a5f5", "#ab47bc", "#fdd835"]
export { DEFAULT_COLORS }

// --- Data Sidebar Templates ---

export function symbolSelectHTML(ctrl: string, selected: string[], available: string[]): string {
  return `
    <label class="flex flex-col gap-1 text-sm text-gray-400">
      Instrument
      <select data-field="dataSymbol"
              data-action="change->${ctrl}#updateDataSymbol"
              class="px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
        <option value="">Select...</option>
        ${available.map(s =>
          `<option value="${s}" ${selected.includes(s) ? "selected" : ""}>${escapeHTML(s)}</option>`
        ).join("")}
      </select>
    </label>
  `
}

export function timeframeSelectHTML(ctrl: string, timeframes: string[], current: string): string {
  return `
    <label class="flex flex-col gap-1 text-sm text-gray-400">
      Timeframe
      <select data-field="dataTimeframe"
              data-action="change->${ctrl}#updateDataTimeframe"
              class="px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
        ${timeframes.map(tf =>
          `<option value="${tf}" ${tf === current ? "selected" : ""}>${tf}</option>`
        ).join("")}
      </select>
    </label>
  `
}

export function dateRangeHTML(ctrl: string, startVal: string, endVal: string): string {
  return `
    <div class="flex flex-col gap-1 text-sm text-gray-400">
      <span>Date Range (UTC)</span>
      <div class="flex gap-2">
        <input type="datetime-local" data-field="dataStartTime" value="${startVal}"
               data-action="change->${ctrl}#updateDataDateRange"
               class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
        <input type="datetime-local" data-field="dataEndTime" value="${endVal}"
               data-action="change->${ctrl}#updateDataDateRange"
               class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
      </div>
    </div>
  `
}

export function indicatorParamsHTML(indicators: IndicatorInfo[]): string {
  if (!indicators.length) {
    return `<span class="text-xs text-gray-500 italic">Loading indicators from server...</span>`
  }
  const options = indicators.map(ind =>
    `<option value="${ind.key}">${escapeHTML(ind.name)} (${ind.key})</option>`
  ).join("")
  return `
    <select data-field="indicatorType"
            class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
      ${options}
    </select>
    <input type="number" data-field="indicatorPeriod" placeholder="Period (e.g. 20)" value="20"
           class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
  `
}

export function changeParamsHTML(): string {
  return `
    <select data-field="changePeriod"
            class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded">
      ${CHANGE_PERIODS.map(p => `<option value="${p}">${p}</option>`).join("")}
    </select>
  `
}

export function formulaParamsHTML(): string {
  const helpLines = [
    "<b>Fields:</b> open high low close volume",
    "<b>Indicators:</b> sma_20, ema_10, rsi_14 …",
    "<b>Changes:</b> change_5m, change_1h …",
    "<b>Instruments:</b> btcusd_close …",
    "<b>Ops:</b> + - * / ( ) &gt; &lt; == !=",
    "<b>Fn:</b> abs sqrt min max pow log",
    "",
    "(close - open) / open * 100",
    "sma_20 - ema_10",
    "abs(close - sma_20) / sma_20 * 100",
  ]
  const helpHTML = helpLines.join("<br>")
  return `
    <div class="flex items-center gap-1">
      <input type="text" data-field="formulaLabel" placeholder="Column name"
             class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
      <span class="relative group cursor-help shrink-0">
        <span class="w-5 h-5 inline-flex items-center justify-center rounded-full text-xs text-gray-500 border border-gray-600 hover:text-blue-300 hover:border-blue-400">?</span>
        <div class="hidden group-hover:block absolute right-0 bottom-full mb-1 z-50 p-2.5 text-xs text-gray-300 bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg shadow-xl font-mono leading-relaxed pointer-events-none" style="width:max-content;max-width:20rem">${helpHTML}</div>
      </span>
    </div>
    <input type="text" data-field="formulaExpression" placeholder="(close - open) / open * 100"
           class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400 font-mono">
  `
}

export function instrumentParamsHTML(symbols: string[]): string {
  const FIELDS = ["close", "open", "high", "low", "volume"]
  const opts = symbols.map(s => `<option value="${s}">${escapeHTML(s)}</option>`).join("")
  const fieldOpts = FIELDS.map(f => `<option value="${f}">${f}</option>`).join("")
  return `
    <div class="flex gap-2">
      <select data-field="instrumentSymbol"
              class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
        <option value="">Symbol...</option>
        ${opts}
      </select>
      <select data-field="instrumentField"
              class="w-24 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded">
        ${fieldOpts}
      </select>
    </div>
  `
}

export function columnListHTML(ctrl: string, columns: DataColumn[]): string {
  return columns.map(col => {
    const isEditable = col.type === "formula"
    const exprHint = isEditable && col.expression ? ` title="${escapeHTML(col.expression)}"` : ""
    const editBtn = isEditable
      ? `<button data-action="click->${ctrl}#editFormulaColumn"
                 data-column-id="${col.id}"
                 class="hidden group-hover:inline-flex w-5 h-5 items-center justify-center rounded text-gray-500 hover:text-blue-300 text-xs cursor-pointer"
                 title="Edit formula">&#9998;</button>`
      : ""
    return `
    <div class="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-[#2a2a3e] group" data-column-id="${col.id}">
      <span class="text-sm text-gray-300 truncate"${exprHint}>${escapeHTML(col.label)}</span>
      <span class="flex items-center gap-1">
        <span class="text-xs text-gray-500">${col.type}</span>
        ${editBtn}
        <button data-action="click->${ctrl}#removeColumn"
                data-column-id="${col.id}"
                class="hidden group-hover:inline-flex w-5 h-5 items-center justify-center rounded text-gray-500 hover:text-red-300 text-xs cursor-pointer"
        >&times;</button>
      </span>
    </div>`
  }).join("")
}

export function addColumnFormHTML(ctrl: string, defaultParamsHTML: string): string {
  return `
    <div data-add-column-form class="hidden flex flex-col gap-2 p-2 bg-[#22223a] rounded border border-[#3a3a4e]">
      <select data-field="newColumnType"
              data-action="change->${ctrl}#onNewColumnTypeChange"
              class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded">
        ${COLUMN_TYPES.map(ct => `<option value="${ct.value}">${ct.label}</option>`).join("")}
      </select>
      <div data-column-params>
        ${defaultParamsHTML}
      </div>
      <div class="flex gap-2">
        <button data-action="click->${ctrl}#addColumn"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer">Add</button>
        <button data-action="click->${ctrl}#hideAddColumn"
                class="flex-1 px-2 py-1.5 text-sm text-gray-400 bg-[#2a2a3e] hover:bg-[#3a3a4e] rounded cursor-pointer">Cancel</button>
      </div>
    </div>
  `
}

export function conditionSummary(cond: Condition): string {
  const r = cond.rule
  const opMap: Record<string, string> = {
    value_gt: ">", value_lt: "<", change_gt: "Δ>", change_lt: "Δ<",
    cross_above: "↗", cross_below: "↘", between: "∈", expression: "ƒ",
    correlation_gt: "ρ>",
  }
  const op = opMap[r.type] || r.type
  if (r.type === "expression") return `ƒ ${r.expression?.slice(0, 30) || ""}`
  const compare = r.compareColumn ? ` ${r.compareColumn}` : ""
  return `${r.column} ${op} ${r.value}${compare}`
}

export function conditionItemHTML(ctrl: string, cond: Condition): string {
  const summary = conditionSummary(cond)
  const actionBadge = cond.action.rowHighlight
    ? `<span class="w-3 h-3 rounded-sm inline-block" style="background:${cond.action.rowHighlight}"></span>`
    : cond.action.chartMarker
      ? `<span class="text-xs" style="color:${cond.action.chartMarker.color}">&#9679;</span>`
      : cond.action.chartColorZone
        ? `<span class="text-xs" style="color:${cond.action.chartColorZone.color}">&#9632;</span>`
        : ""
  return `
    <div class="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-[#2a2a3e] group" data-condition-id="${cond.id}">
      <label class="flex items-center gap-2 text-sm text-gray-300 truncate cursor-pointer min-w-0">
        <input type="checkbox" ${cond.enabled ? "checked" : ""}
               data-action="change->${ctrl}#toggleCondition"
               data-condition-id="${cond.id}"
               class="rounded shrink-0">
        ${actionBadge}
        <span data-action="click->${ctrl}#editCondition"
              data-condition-id="${cond.id}"
              class="cursor-pointer hover:text-blue-300 truncate" title="${escapeHTML(summary)}">
          <span class="text-gray-300">${escapeHTML(cond.name)}</span>
          <span class="text-gray-500 text-xs ml-1">${escapeHTML(summary)}</span>
        </span>
      </label>
      <button data-action="click->${ctrl}#removeConditionBtn"
              data-condition-id="${cond.id}"
              class="hidden group-hover:inline-flex w-5 h-5 items-center justify-center rounded text-gray-500 hover:text-red-300 text-xs cursor-pointer shrink-0"
      >&times;</button>
    </div>`
}

export function chartLinkItemHTML(ctrl: string, link: { chartTabId: string; panelId: string }, idx: number): string {
  return `
    <div class="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-[#2a2a3e] group">
      <span class="text-sm text-gray-300 truncate">
        <span class="text-blue-400 text-xs mr-1">&#9636;</span>${escapeHTML(link.chartTabId)} / ${escapeHTML(link.panelId)}
      </span>
      <button data-action="click->${ctrl}#removeChartLink"
              data-link-index="${idx}"
              class="hidden group-hover:inline-flex w-5 h-5 items-center justify-center rounded text-gray-500 hover:text-red-300 text-xs cursor-pointer"
      >&times;</button>
    </div>
  `
}

export function settingsHTML(ctrl: string): string {
  return `
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-500 uppercase tracking-wide">Settings</span>
    </div>
    <label class="flex items-center justify-between text-sm text-gray-400">
      <span>Price precision</span>
      <input type="number" data-field="pricePrecision" value="2" min="0" max="8" step="1"
             data-action="change->${ctrl}#updateGridSettings"
             class="w-16 px-2 py-1 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded text-right">
    </label>
    <label class="flex items-center justify-between text-sm text-gray-400">
      <span>Date format</span>
      <select data-field="dateFormat"
              data-action="change->${ctrl}#updateGridSettings"
              class="px-2 py-1 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded">
        <option value="locale">Local</option>
        <option value="iso">ISO 8601</option>
        <option value="unix">Unix</option>
      </select>
    </label>
  `
}

export function actionsHTML(ctrl: string): string {
  return `
    <button data-action="click->${ctrl}#loadDataGrid"
            class="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer">
      Load Data
    </button>
    <button data-action="click->${ctrl}#exportCsv"
            class="w-full px-3 py-2 text-sm font-medium text-gray-300 bg-[#2a2a3e] hover:bg-[#3a3a4e] rounded cursor-pointer">
      Export CSV
    </button>
  `
}

export function formulaEditHTML(ctrl: string, colId: string, label: string, expression: string): string {
  return `
    <div data-formula-edit class="flex flex-col gap-2 p-2 bg-[#22223a] rounded border border-blue-500/40">
      <div class="text-xs text-gray-400">Edit formula column</div>
      <input type="text" data-field="editFormulaLabel" value="${escapeHTML(label)}"
             class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
      <input type="text" data-field="editFormulaExpression" value="${escapeHTML(expression)}"
             class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400 font-mono">
      <div class="flex gap-2">
        <button data-action="click->${ctrl}#saveFormulaColumn" data-column-id="${colId}"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer">Save</button>
        <button data-action="click->${ctrl}#cancelFormulaEdit"
                class="flex-1 px-2 py-1.5 text-sm text-gray-400 bg-[#2a2a3e] hover:bg-[#3a3a4e] rounded cursor-pointer">Cancel</button>
      </div>
    </div>
  `
}

// --- Condition Builder ---

function buildColumnOpts(columns: DataColumn[]): Array<{ id: string; label: string }> {
  return [
    { id: "close", label: "close" },
    { id: "open", label: "open" },
    { id: "high", label: "high" },
    { id: "low", label: "low" },
    { id: "volume", label: "volume" },
    ...columns
      .filter(c => ["indicator", "change", "formula", "instrument"].includes(c.type))
      .map(c => ({ id: columnFieldKey(c), label: c.label })),
  ]
}

export function conditionBuilderHTML(ctrl: string, columns: DataColumn[], editing?: Condition): string {
  const columnOpts = buildColumnOpts(columns)
  const isEditing = !!editing
  const title = isEditing ? "Edit Condition" : "New Condition"
  const submitLabel = isEditing ? "Save" : "Add"
  const submitAction = isEditing ? "confirmEditCondition" : "confirmAddCondition"

  const name = editing?.name ?? "Condition"
  const selCol = editing?.rule?.column ?? "close"
  const selOp = editing?.rule?.type ?? "value_gt"
  const val = editing?.rule?.value ?? ""
  const compCol = editing?.rule?.compareColumn ?? ""
  const expr = editing?.rule?.expression ?? ""

  const actionType = editing?.action
    ? (editing.action.rowHighlight ? "rowHighlight" : editing.action.chartMarker ? "chartMarker" : "chartColorZone")
    : "rowHighlight"
  const color = editing?.action?.rowHighlight ?? editing?.action?.chartMarker?.color ?? editing?.action?.chartColorZone?.color ?? DEFAULT_COLORS[0]
  const text = editing?.action?.chartMarker?.text ?? ""

  const isCross = ["cross_above", "cross_below"].includes(selOp)
  const showCompare = isCross || selOp === "between"
  const showValue = !isCross && selOp !== "expression"
  const showExpr = selOp === "expression"
  const showText = actionType === "chartMarker"

  const exprColNames = columnOpts.map(c => c.id).join(", ")
  const exprPlaceholder = `close > sma_20 * 1.05`

  return `
    <div data-condition-builder class="flex flex-col gap-3 p-3 bg-[#22223a] rounded border border-[#3a3a4e]">
      <div class="text-sm text-gray-400 font-medium">${title}</div>

      <input type="text" data-field="conditionName" placeholder="Condition name"
             value="${escapeHTML(String(name))}"
             class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">

      <div class="flex gap-2">
        <select data-field="condColumn"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded">
          ${columnOpts.map(c => `<option value="${c.id}" ${c.id === selCol ? "selected" : ""}>${escapeHTML(c.id)}</option>`).join("")}
        </select>

        <select data-field="condOperator"
                data-action="change->${ctrl}#onCondOperatorChange"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded">
          ${OPERATORS.map(o => `<option value="${o.value}" ${o.value === selOp ? "selected" : ""} title="${escapeHTML(o.hint)}">${o.label}</option>`).join("")}
        </select>
      </div>

      <div data-field-value-row class="flex gap-2 ${showValue ? "" : "hidden"}">
        <input type="number" data-field="condValue" placeholder="Value" step="any"
               value="${val}"
               class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400">
        <select data-field="condCompareColumn"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded ${selOp === "between" ? "" : "hidden"}">
          ${columnOpts.map(c => `<option value="${c.id}" ${c.id === compCol ? "selected" : ""}>${escapeHTML(c.id)}</option>`).join("")}
        </select>
      </div>

      <div data-field-cross-row class="flex gap-2 items-center ${isCross ? "" : "hidden"}">
        <span class="text-xs text-gray-500 shrink-0">${selOp === "cross_below" ? "↘" : "↗"}</span>
        <select data-field="condCrossColumn"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded">
          ${columnOpts.map(c => `<option value="${c.id}" ${c.id === compCol ? "selected" : ""}>${escapeHTML(c.id)}</option>`).join("")}
        </select>
      </div>

      <div data-field-expr-row class="${showExpr ? "" : "hidden"}">
        <input type="text" data-field="condExpression" placeholder="${escapeHTML(exprPlaceholder)}"
               value="${escapeHTML(String(expr))}"
               class="w-full px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400 font-mono">
        <div class="text-xs text-gray-600 mt-1">Columns: ${escapeHTML(exprColNames)}</div>
      </div>

      <div class="flex gap-2 items-center">
        <select data-field="condActionType"
                data-action="change->${ctrl}#onCondActionTypeChange"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded">
          ${ACTION_TYPES.map(a => `<option value="${a.value}" ${a.value === actionType ? "selected" : ""}>${a.label}</option>`).join("")}
        </select>

        <input type="color" data-field="condColor" value="${color}"
               class="w-8 h-8 rounded border border-[#3a3a4e] cursor-pointer bg-transparent">
      </div>

      <input type="text" data-field="condText" placeholder="Marker text (optional)"
             value="${escapeHTML(String(text))}"
             class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400 ${showText ? "" : "hidden"}">

      <div class="flex gap-2">
        <button data-action="click->${ctrl}#${submitAction}"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer">${submitLabel}</button>
        <button data-action="click->${ctrl}#cancelAddCondition"
                class="flex-1 px-2 py-1.5 text-sm text-gray-400 bg-[#2a2a3e] hover:bg-[#3a3a4e] rounded cursor-pointer">Cancel</button>
      </div>
    </div>
  `
}

export function parseConditionFromBuilder(container: HTMLElement): Omit<Condition, "id"> | null {
  const name = (container.querySelector("[data-field='conditionName']") as HTMLInputElement)?.value?.trim() || "Condition"
  const column = (container.querySelector("[data-field='condColumn']") as HTMLSelectElement)?.value || "close"
  const operator = (container.querySelector("[data-field='condOperator']") as HTMLSelectElement)?.value as ConditionRule["type"]
  const value = parseFloat((container.querySelector("[data-field='condValue']") as HTMLInputElement)?.value || "0")
  const expression = (container.querySelector("[data-field='condExpression']") as HTMLInputElement)?.value?.trim() || undefined
  const actionType = (container.querySelector("[data-field='condActionType']") as HTMLSelectElement)?.value
  const color = (container.querySelector("[data-field='condColor']") as HTMLInputElement)?.value || DEFAULT_COLORS[0]
  const text = (container.querySelector("[data-field='condText']") as HTMLInputElement)?.value?.trim() || undefined

  const isCross = ["cross_above", "cross_below"].includes(operator)
  let compareColumn: string | undefined
  if (isCross) {
    compareColumn = (container.querySelector("[data-field='condCrossColumn']") as HTMLSelectElement)?.value || undefined
  } else {
    compareColumn = (container.querySelector("[data-field='condCompareColumn']") as HTMLSelectElement)?.value || undefined
  }

  if (operator === "expression") {
    if (!expression) return null
  } else if (!Number.isFinite(value) && !isCross) {
    return null
  }

  const rule: ConditionRule = {
    type: operator,
    column,
    value: Number.isFinite(value) ? value : 0,
    compareColumn: isCross || operator === "between" ? compareColumn : undefined,
    expression: operator === "expression" ? expression : undefined,
  }

  const action: ConditionAction = {}
  switch (actionType) {
    case "rowHighlight":
      action.rowHighlight = color
      break
    case "chartMarker":
      action.chartMarker = { color, text }
      break
    case "chartColorZone":
      action.chartColorZone = { color }
      break
  }

  return { name, enabled: true, rule, action }
}

function columnFieldKey(col: DataColumn): string {
  if (col.type === "change") return `change_${col.changePeriod || "5m"}`
  if (col.type === "indicator" && col.indicatorType) {
    const params = col.indicatorParams || {}
    const suffix = Object.values(params)[0]
    return suffix ? `${col.indicatorType}_${suffix}` : col.indicatorType
  }
  if (col.type === "formula") return col.label
  if (col.type === "instrument") return col.label
  return col.label
}
