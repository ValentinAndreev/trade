import { escapeHTML } from "../utils/dom"
import type { DataColumn, TradingSystem, ConditionRule } from "../types/store"
import { columnFieldKey } from "../types/store"
import { OPERATORS } from "./condition_templates"
import { INPUT_CLS, BTN_PRIMARY, BTN_SECONDARY } from "./data_grid_form_templates"

export const DEFAULT_SYSTEM_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"]

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

function readRule(container: HTMLElement, prefix: string): ConditionRule | null {
  const col = (container.querySelector(`[data-field="${prefix}Column"]`) as HTMLSelectElement | null)?.value
  const op  = (container.querySelector(`[data-field="${prefix}Operator"]`) as HTMLSelectElement | null)?.value as ConditionRule["type"] | undefined
  if (!col || !op) return null

  const val = parseFloat((container.querySelector(`[data-field="${prefix}Value"]`) as HTMLInputElement | null)?.value ?? "")
  const isCross   = ["cross_above", "cross_below"].includes(op)
  const isBetween = op === "between"

  let compareColumn: string | undefined
  if (isCross) {
    compareColumn = (container.querySelector(`[data-field="${prefix}CrossCol"]`) as HTMLSelectElement | null)?.value || undefined
  } else if (isBetween) {
    compareColumn = (container.querySelector(`[data-field="${prefix}BetweenCol"]`) as HTMLSelectElement | null)?.value || undefined
  }

  return { type: op, column: col, value: Number.isFinite(val) ? val : 0, compareColumn }
}

/** Returns parsed system or null. Sets error text on [data-system-error] element on failure. */
export function parseSystemFromBuilder(
  container: HTMLElement,
): Omit<TradingSystem, "id"> | null {
  const errEl = container.querySelector("[data-system-error]") as HTMLElement | null
  const setError = (msg: string) => {
    if (errEl) { errEl.textContent = msg; errEl.classList.remove("hidden") }
    return null
  }
  const clearError = () => { if (errEl) { errEl.textContent = ""; errEl.classList.add("hidden") } }

  const name  = (container.querySelector("[data-field='systemName']") as HTMLInputElement | null)?.value?.trim()
  const longColor  = (container.querySelector("[data-field='longColor']") as HTMLInputElement | null)?.value ?? "#26a69a"
  const shortColor = (container.querySelector("[data-field='shortColor']") as HTMLInputElement | null)?.value ?? "#ef5350"
  const slippageStr = (container.querySelector("[data-field='slippage']") as HTMLInputElement | null)?.value ?? ""
  const slippage = parseFloat(slippageStr)

  if (!name) return setError("System name is required")

  const longSection  = container.querySelector("[data-section-long]")  as HTMLElement | null
  const shortSection = container.querySelector("[data-section-short]") as HTMLElement | null
  const longEnabled  = longSection  && !longSection.classList.contains("hidden")
  const shortEnabled = shortSection && !shortSection.classList.contains("hidden")

  if (!longEnabled && !shortEnabled) return setError("Enable at least one direction (Long or Short)")

  const longEntryRule  = longEnabled  ? (readRule(container, "longEntry")  ?? undefined) : undefined
  const longExitRule   = longEnabled  ? (readRule(container, "longExit")   ?? undefined) : undefined
  const shortEntryRule = shortEnabled ? (readRule(container, "shortEntry") ?? undefined) : undefined
  const shortExitRule  = shortEnabled ? (readRule(container, "shortExit")  ?? undefined) : undefined

  if (longEnabled  && !longEntryRule)  return setError("Long entry rule: select a column")
  if (longEnabled  && !longExitRule)   return setError("Long exit rule: select a column")
  if (shortEnabled && !shortEntryRule) return setError("Short entry rule: select a column")
  if (shortEnabled && !shortExitRule)  return setError("Short exit rule: select a column")

  clearError()
  return {
    name, enabled: true,
    longColor,
    shortColor,
    slippage: Number.isFinite(slippage) ? slippage : 0,
    longEntryRule,
    longExitRule,
    shortEntryRule,
    shortExitRule,
  }
}

// ---------------------------------------------------------------------------
// Rule summary / badges
// ---------------------------------------------------------------------------

export function systemRuleSummary(rule: ConditionRule | undefined, columns?: DataColumn[]): string {
  if (!rule) return "—"
  const opMap: Record<string, string> = {
    value_gt: ">", value_lt: "<", change_gt: "Δ>", change_lt: "Δ<",
    cross_above: "↗", cross_below: "↘", between: "∈",
  }
  const op = opMap[rule.type] || rule.type
  const colLabel = columns
    ? (columns.find(c => columnFieldKey(c) === rule.column)?.label ?? rule.column)
    : rule.column
  const cmpLabel = rule.compareColumn && columns
    ? (columns.find(c => columnFieldKey(c) === rule.compareColumn)?.label ?? rule.compareColumn)
    : rule.compareColumn ?? ""
  const cmp = cmpLabel ? ` ${cmpLabel}` : ""
  return `${colLabel} ${op}${rule.type.startsWith("value") || rule.type.startsWith("change") ? ` ${rule.value}` : ""}${cmp}`
}

export function systemItemHTML(ctrl: string, system: TradingSystem, columns?: DataColumn[]): string {
  const longClr  = system.longColor  ?? "#26a69a"
  const shortClr = system.shortColor ?? "#ef5350"
  const enabledClass  = system.enabled ? "bg-emerald-400" : "bg-gray-600"
  const enabledTitle  = system.enabled ? "Enabled" : "Disabled"

  const hasLong  = !!(system.longEntryRule)
  const hasShort = !!(system.shortEntryRule)
  const badges = [
    hasLong  ? `<span class="text-xs px-1 rounded" style="color:${longClr};border:1px solid ${longClr}">▲ L</span>` : "",
    hasShort ? `<span class="text-xs px-1 rounded" style="color:${shortClr};border:1px solid ${shortClr}">▼ S</span>` : "",
  ].filter(Boolean).join("")

  const summary = [
    hasLong  ? `L: ${systemRuleSummary(system.longEntryRule, columns)}` : "",
    hasShort ? `S: ${systemRuleSummary(system.shortEntryRule, columns)}` : "",
  ].filter(Boolean).join(" / ")

  return `
    <div class="flex flex-col gap-1 py-1 px-2 rounded hover:bg-[#2a2a3e]" data-system-id="${system.id}">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0 flex-1">
          <span class="shrink-0 flex gap-0.5">${badges || '<span class="text-xs text-gray-600">●</span>'}</span>
          <span data-action="click->${ctrl}#editSystem"
                data-system-id="${system.id}"
                class="cursor-pointer hover:text-blue-300 truncate min-w-0"
                title="${escapeHTML(summary)}">
            <span class="text-gray-300 text-[15px]">${escapeHTML(system.name)}</span>
            <span class="text-gray-500 text-xs ml-1">${escapeHTML(summary)}</span>
          </span>
        </div>
        <div class="flex items-center gap-0 shrink-0">
          <button type="button"
                  data-action="click->${ctrl}#toggleSystem"
                  data-system-id="${system.id}"
                  class="inline-flex w-6 h-6 items-center justify-center rounded hover:bg-[#3a3a4e] cursor-pointer"
                  title="${enabledTitle}">
            <span class="w-2.5 h-2.5 rounded-full ${enabledClass}"></span>
          </button>
          <button data-action="click->${ctrl}#removeSystem"
                  data-system-id="${system.id}"
                  class="inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm cursor-pointer"
                  title="Remove system">&times;</button>
        </div>
      </div>
      <button type="button"
              data-action="click->${ctrl}#openSystemStats"
              data-system-id="${system.id}"
              class="flex items-center justify-center gap-1.5 w-full py-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 hover:text-blue-100 text-sm font-medium transition-colors cursor-pointer">
        &#9656; Statistics
      </button>
    </div>`
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function buildRuleHTML(
  ctrl: string,
  prefix: string,
  label: string,
  columns: DataColumn[],
  rule?: ConditionRule,
): string {
  const columnOpts = columns.map(c => ({ id: columnFieldKey(c), label: c.label }))
  // When editing use saved value; when adding new — show placeholder (empty selection)
  const selCol = rule?.column ?? ""
  const selOp  = rule?.type  ?? "value_gt"
  const val    = rule != null ? String(rule.value) : ""
  const cmpCol = rule?.compareColumn ?? ""

  const isCross        = ["cross_above", "cross_below"].includes(selOp)
  const isBetween      = selOp === "between"
  const showValue      = !isCross
  const showCross      = isCross
  const showBetweenCol = isBetween

  const ops = OPERATORS.filter(o => o.value !== "expression")

  const placeholder = `<option value="" disabled ${!selCol ? "selected" : ""} style="color:#6b7280">— select column —</option>`

  return `
    <div class="flex flex-col gap-2">
      <div class="text-sm text-gray-400 font-medium">${label}</div>
      <div class="flex gap-2">
        <select data-field="${prefix}Column" class="flex-1 ${INPUT_CLS}" style="font-size:13px">
          ${placeholder}
          ${columnOpts.map(c => `<option value="${c.id}" ${c.id === selCol ? "selected" : ""}>${escapeHTML(c.label)}</option>`).join("")}
        </select>
        <select data-field="${prefix}Operator"
                data-action="change->${ctrl}#onSystemRuleOperatorChange"
                data-prefix="${prefix}"
                class="flex-1 ${INPUT_CLS}" style="font-size:13px">
          ${ops.map(o => `<option value="${o.value}" ${o.value === selOp ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>
      </div>
      <div data-field="${prefix}ValueRow" class="${showValue ? "" : "hidden"} flex gap-2">
        <input type="number" data-field="${prefix}Value" step="any" value="${val}" placeholder="Threshold"
               class="flex-1 ${INPUT_CLS}" style="font-size:13px">
        <select data-field="${prefix}BetweenCol"
                class="flex-1 ${INPUT_CLS} ${showBetweenCol ? "" : "hidden"}" style="font-size:13px">
          ${columnOpts.map(c => `<option value="${c.id}" ${c.id === cmpCol ? "selected" : ""}>${escapeHTML(c.label)}</option>`).join("")}
        </select>
      </div>
      <div data-field="${prefix}CrossRow" class="${showCross ? "" : "hidden"} flex gap-2 items-center">
        <span class="text-sm text-gray-400 shrink-0">${selOp === "cross_below" ? "↘" : "↗"}</span>
        <select data-field="${prefix}CrossCol" class="flex-1 ${INPUT_CLS}" style="font-size:13px">
          ${columnOpts.map(c => `<option value="${c.id}" ${c.id === cmpCol ? "selected" : ""}>${escapeHTML(c.label)}</option>`).join("")}
        </select>
      </div>
    </div>`
}

function buildDirectionSection(
  ctrl: string,
  direction: "long" | "short",
  columns: DataColumn[],
  entryRule?: ConditionRule,
  exitRule?: ConditionRule,
): string {
  const prefix = direction === "long" ? "long" : "short"
  const label  = direction === "long" ? "▲ Long" : "▼ Short"
  const accent = direction === "long" ? "#26a69a" : "#ef5350"
  return `
    <div data-section="${direction}" class="flex flex-col gap-2 border border-[#3a3a4e] rounded p-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold" style="color:${accent}">${label}</span>
      </div>
      ${buildRuleHTML(ctrl, `${prefix}Entry`, "Entry", columns, entryRule)}
      ${buildRuleHTML(ctrl, `${prefix}Exit`,  "Exit",  columns, exitRule)}
    </div>`
}

export function systemBuilderHTML(
  ctrl: string,
  columns: DataColumn[],
  editing?: TradingSystem,
): string {
  const isEditing = !!editing
  const title = isEditing ? "Edit System" : "New System"
  const submitLabel = isEditing ? "Save" : "Add"
  const submitAction = isEditing ? "confirmEditSystem" : "confirmAddSystem"

  const name  = editing?.name ?? "System"
  const longColor  = editing?.longColor  ?? "#26a69a"
  const shortColor = editing?.shortColor ?? "#ef5350"
  const slippageVal = editing?.slippage ?? 0

  const hasLong  = isEditing ? !!(editing?.longEntryRule)  : true
  const hasShort = isEditing ? !!(editing?.shortEntryRule) : false

  return `
    <div data-system-builder class="flex flex-col gap-3 p-3 bg-[#22223a] rounded border border-[#3a3a4e] max-h-[80vh] overflow-y-auto">
      <div class="text-sm text-gray-400 font-medium">${title}</div>

      <div class="flex gap-2 items-center">
        <input type="text" data-field="systemName" placeholder="System name"
               value="${escapeHTML(name)}"
               class="${INPUT_CLS} flex-1">
      </div>

      <div class="flex items-center gap-3 text-sm">
        <label class="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" data-field="enableLong"
                 ${hasLong ? "checked" : ""}
                 data-action="change->${ctrl}#onSystemDirectionToggle"
                 data-direction="long"
                 class="accent-emerald-400">
          <span style="color:${longColor}">▲ Long</span>
          <input type="color" data-field="longColor" value="${longColor}"
                 class="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0">
        </label>
        <label class="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" data-field="enableShort"
                 ${hasShort ? "checked" : ""}
                 data-action="change->${ctrl}#onSystemDirectionToggle"
                 data-direction="short"
                 class="accent-red-400">
          <span style="color:${shortColor}">▼ Short</span>
          <input type="color" data-field="shortColor" value="${shortColor}"
                 class="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0">
        </label>
        <label class="flex items-center gap-1 text-gray-400 ml-auto" title="Slippage: absolute value added/subtracted on cross conditions">
          Slip
          <input type="number" data-field="slippage" step="any" min="0"
                 value="${slippageVal || ""}"
                 placeholder="0"
                 class="${INPUT_CLS} w-16" style="font-size:12px">
        </label>
      </div>

      <div data-section-long class="${hasLong ? "" : "hidden"}">
        ${buildDirectionSection(ctrl, "long", columns, editing?.longEntryRule, editing?.longExitRule)}
      </div>
      <div data-section-short class="${hasShort ? "" : "hidden"}">
        ${buildDirectionSection(ctrl, "short", columns, editing?.shortEntryRule, editing?.shortExitRule)}
      </div>

      <div data-system-error class="hidden text-sm text-red-400 px-1"></div>

      <div class="flex gap-2 pt-1">
        <button data-action="click->${ctrl}#${submitAction}"
                class="${BTN_PRIMARY} flex-1">${submitLabel}</button>
        <button data-action="click->${ctrl}#cancelSystem"
                class="${BTN_SECONDARY}">Cancel</button>
      </div>
    </div>`
}
