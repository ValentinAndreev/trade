import { escapeHTML } from "../utils/dom"
import { columnFieldKey } from "../types/store"
import type { DataColumn, Condition, ConditionRule, ConditionAction } from "../types/store"
import { INPUT_CLS } from "./data_grid_form_templates"

export const OPERATORS: Array<{ value: ConditionRule["type"]; label: string; hint: string }> = [
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

export const DEFAULT_COLORS = ["#ef5350", "#26a69a", "#ff9800", "#42a5f5", "#ab47bc", "#fdd835"]

function columnIdToLabel(columns: DataColumn[], id: string): string {
  const col = columns.find(c => columnFieldKey(c) === id)
  return col ? col.label : id
}

export function conditionSummary(cond: Condition, columns?: DataColumn[]): string {
  const r = cond.rule
  const opMap: Record<string, string> = {
    value_gt: ">", value_lt: "<", change_gt: "Δ>", change_lt: "Δ<",
    cross_above: "↗", cross_below: "↘", between: "∈", expression: "ƒ",
  }
  const op = opMap[r.type] || r.type
  if (r.type === "expression") return `ƒ ${r.expression?.slice(0, 30) || ""}`
  const colLabel = columns ? columnIdToLabel(columns, r.column) : r.column
  const compareLabel = r.compareColumn
    ? (columns ? columnIdToLabel(columns, r.compareColumn) : r.compareColumn)
    : ""
  const compare = compareLabel ? ` ${compareLabel}` : ""
  return `${colLabel} ${op} ${r.value}${compare}`
}

export function conditionItemHTML(ctrl: string, cond: Condition, columns?: DataColumn[]): string {
  const summary = conditionSummary(cond, columns)
  const actionBadge = cond.action.rowHighlight
    ? `<span class="w-3 h-3 rounded-sm inline-block" style="background:${cond.action.rowHighlight}"></span>`
    : cond.action.chartMarker
      ? `<span class="text-xs" style="color:${cond.action.chartMarker.color}">&#9679;</span>`
      : cond.action.chartColorZone
        ? `<span class="text-xs" style="color:${cond.action.chartColorZone.color}">&#9632;</span>`
        : ""
  const visibilityClass = cond.enabled ? "bg-emerald-400" : "bg-gray-600"
  const visibilityTitle = cond.enabled ? "Visible" : "Hidden"
  return `
    <div class="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-[#2a2a3e] group" data-condition-id="${cond.id}">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        ${actionBadge}
        <span data-action="click->${ctrl}#editCondition"
              data-condition-id="${cond.id}"
              class="cursor-pointer hover:text-blue-300 truncate text-gray-300 min-w-0" title="${escapeHTML(summary)}">
          <span class="text-gray-300 text-[15px]">${escapeHTML(cond.name)}</span>
          <span class="text-gray-500 text-sm ml-1">${escapeHTML(summary)}</span>
        </span>
      </div>
      <div class="flex items-center gap-0 shrink-0">
        <button type="button"
                data-action="click->${ctrl}#toggleCondition"
                data-condition-id="${cond.id}"
                class="inline-flex w-6 h-6 items-center justify-center rounded hover:bg-[#3a3a4e] cursor-pointer"
                title="${visibilityTitle}"
                aria-label="${visibilityTitle}">
          <span class="w-2.5 h-2.5 rounded-full ${visibilityClass}" aria-hidden="true"></span>
        </button>
        <button data-action="click->${ctrl}#removeConditionBtn"
                data-condition-id="${cond.id}"
                class="inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm cursor-pointer"
                title="Remove condition">&times;</button>
      </div>
    </div>`
}

function buildColumnOpts(columns: DataColumn[]): Array<{ id: string; label: string }> {
  return columns.map(c => ({ id: columnFieldKey(c), label: c.label }))
}

export function conditionBuilderHTML(ctrl: string, columns: DataColumn[], editing?: Condition): string {
  const columnOpts = buildColumnOpts(columns)
  const isEditing = !!editing
  const title = isEditing ? "Edit Condition" : "New Condition"
  const submitLabel = isEditing ? "Save" : "Add"
  const submitAction = isEditing ? "confirmEditCondition" : "confirmAddCondition"

  const name = editing?.name ?? "Condition"
  const firstColId = columnOpts[0]?.id ?? "close"
  const selCol = editing?.rule?.column ?? firstColId
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

  const exprColNames = columnOpts.map(c => c.label).join(", ")
  const exprPlaceholder = columnOpts.length ? `${columnOpts[0].label} > 0` : "col > 0"

  return `
    <div data-condition-builder class="flex flex-col gap-3 p-3 bg-[#22223a] rounded border border-[#3a3a4e]">
      <div class="text-sm text-gray-400 font-medium">${title}</div>

      <input type="text" data-field="conditionName" placeholder="Condition name"
             value="${escapeHTML(String(name))}"
             class="${INPUT_CLS}">

      <div class="flex gap-2">
        <select data-field="condColumn"
                class="flex-1 ${INPUT_CLS}">
          ${columnOpts.map(c => `<option value="${c.id}" ${c.id === selCol ? "selected" : ""}>${escapeHTML(c.label)}</option>`).join("")}
        </select>

        <select data-field="condOperator"
                data-action="change->${ctrl}#onCondOperatorChange"
                class="flex-1 ${INPUT_CLS}">
          ${OPERATORS.map(o => `<option value="${o.value}" ${o.value === selOp ? "selected" : ""} title="${escapeHTML(o.hint)}">${o.label}</option>`).join("")}
        </select>
      </div>

      <div data-field-value-row class="flex gap-2 ${showValue ? "" : "hidden"}">
        <input type="number" data-field="condValue" placeholder="Value" step="any"
               value="${val}"
               class="flex-1 ${INPUT_CLS}">
        <select data-field="condCompareColumn"
                class="flex-1 ${INPUT_CLS} ${selOp === "between" ? "" : "hidden"}">
          ${columnOpts.map(c => `<option value="${c.id}" ${c.id === compCol ? "selected" : ""}>${escapeHTML(c.label)}</option>`).join("")}
        </select>
      </div>

      <div data-field-cross-row class="flex gap-2 items-center ${isCross ? "" : "hidden"}">
        <span class="text-xs text-gray-500 shrink-0">${selOp === "cross_below" ? "↘" : "↗"}</span>
        <select data-field="condCrossColumn"
                class="flex-1 ${INPUT_CLS}">
          ${columnOpts.map(c => `<option value="${c.id}" ${c.id === compCol ? "selected" : ""}>${escapeHTML(c.label)}</option>`).join("")}
        </select>
      </div>

      <div data-field-expr-row class="${showExpr ? "" : "hidden"}">
        <input type="text" data-field="condExpression" placeholder="${escapeHTML(exprPlaceholder)}"
               value="${escapeHTML(String(expr))}"
               class="w-full ${INPUT_CLS} font-mono">
        <div class="text-xs text-gray-600 mt-1">Columns: ${escapeHTML(exprColNames)}</div>
      </div>

      <div class="flex gap-2 items-center">
        <select data-field="condActionType"
                data-action="change->${ctrl}#onCondActionTypeChange"
                class="flex-1 ${INPUT_CLS}">
          ${ACTION_TYPES.map(a => `<option value="${a.value}" ${a.value === actionType ? "selected" : ""}>${a.label}</option>`).join("")}
        </select>

        <input type="color" data-field="condColor" value="${color}"
               class="w-8 h-8 rounded border border-[#3a3a4e] cursor-pointer bg-transparent">
      </div>

      <input type="text" data-field="condText" placeholder="Marker text (optional)"
             value="${escapeHTML(String(text))}"
             class="${INPUT_CLS} ${showText ? "" : "hidden"}">

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
