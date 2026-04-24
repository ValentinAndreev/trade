import { escapeHTML, isExternalCategory } from "../utils/dom"
import type { DataColumn } from "../types/store"
import { columnFieldKey } from "../types/store"
import type { IndicatorInfo } from "../types/store"

const COLUMN_TYPES: Array<{ value: string; label: string }> = [
  { value: "indicator", label: "Indicator" },
  { value: "macro", label: "Data Source" },
  { value: "change", label: "Change %" },
  { value: "formula", label: "Formula" },
  { value: "instrument", label: "Instrument" },
]

const CHANGE_PERIODS = ["1m", "5m", "15m", "1h", "4h", "1d"]


export const INPUT_CLS = "px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
export const BTN_PRIMARY = "px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
export const BTN_SECONDARY = "px-3 py-1.5 text-sm bg-[#2a2a3e] hover:bg-[#3a3a4e] text-gray-300 rounded"

interface UtcDateRangeOptions {
  ctrl: string
  label?: string
  linked?: boolean
  startDate: string
  startHour: number
  startMinute: number
  endDate: string
  endHour: number
  endMinute: number
  startDateField: string
  startHourField: string
  startMinuteField: string
  endDateField: string
  endHourField: string
  endMinuteField: string
  setAction?: string
  dateAction?: string
  timeAction?: string
}

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

/** Date range with 24h time: startDate, startHour (0–23), startMinute (0–59); same for end when not linked. */
export function dateRangeHTML(
  ctrl: string,
  startDate: string,
  startHour: number,
  startMinute: number,
  endDate: string,
  endHour: number,
  endMinute: number,
  linked: boolean,
): string {
  return utcDateRangeHTML({
    ctrl,
    label: `Date Range (UTC, 24h)${linked ? " — start only" : ""}`,
    linked,
    startDate,
    startHour,
    startMinute,
    endDate,
    endHour,
    endMinute,
    startDateField: "dataStartDate",
    startHourField: "dataStartHour",
    startMinuteField: "dataStartMinute",
    endDateField: "dataEndDate",
    endHourField: "dataEndHour",
    endMinuteField: "dataEndMinute",
    dateAction: `change->${ctrl}#setDataDateRangeAndLoad`,
    timeAction: `keydown.enter->${ctrl}#setDataDateRangeAndLoad`,
  })
}

export function utcDateRangeHTML({
  ctrl,
  label = "Date Range (UTC, 24h)",
  linked = false,
  startDate,
  startHour,
  startMinute,
  endDate,
  endHour,
  endMinute,
  startDateField,
  startHourField,
  startMinuteField,
  endDateField,
  endHourField,
  endMinuteField,
  setAction,
  dateAction,
  timeAction,
}: UtcDateRangeOptions): string {
  const dateActionAttr = dateAction ? ` data-action="${dateAction}"` : ""
  const timeActionAttr = timeAction ? ` data-action="${timeAction}"` : ""
  const endRow = linked
    ? ""
    : `
      <div class="flex gap-2 items-center min-w-0 flex-wrap">
        <input type="date" data-field="${endDateField}" value="${endDate}" class="min-w-0 flex-1 ${INPUT_CLS}"${dateActionAttr}>
        <input type="number" data-field="${endHourField}" min="0" max="23" value="${endHour}" placeholder="HH" title="Hour (0–23)"
               ${timeActionAttr}
               class="w-12 number-no-spinner ${INPUT_CLS} text-center">
        <span class="text-gray-500">:</span>
        <input type="number" data-field="${endMinuteField}" min="0" max="59" value="${endMinute}" placeholder="MM" title="Minute (0–59)"
               ${timeActionAttr}
               class="w-12 number-no-spinner ${INPUT_CLS} text-center">
      </div>`

  const setButton = setAction
    ? `
        <button type="button" data-action="click->${ctrl}#${setAction}"
                class="self-start px-2 py-1.5 text-xs font-medium text-gray-300 bg-[#2a2a3e] hover:bg-[#3a3a4e] rounded cursor-pointer">
          Set
        </button>
      `
    : ""

  return `
    <div class="flex flex-col gap-2 text-sm text-gray-400 min-w-0">
      <span>${label}</span>
      <div class="flex flex-col gap-2 min-w-0">
        <div class="flex gap-2 items-center min-w-0 flex-wrap">
          <input type="date" data-field="${startDateField}" value="${startDate}" class="min-w-0 flex-1 ${INPUT_CLS}"${dateActionAttr}>
          <input type="number" data-field="${startHourField}" min="0" max="23" value="${startHour}" placeholder="HH" title="Hour (0–23)"
                 ${timeActionAttr}
                 class="w-12 number-no-spinner ${INPUT_CLS} text-center">
          <span class="text-gray-500">:</span>
          <input type="number" data-field="${startMinuteField}" min="0" max="59" value="${startMinute}" placeholder="MM" title="Minute (0–59)"
                 ${timeActionAttr}
                 class="w-12 number-no-spinner ${INPUT_CLS} text-center">
        </div>
        ${endRow}
        ${setButton}
      </div>
    </div>
  `
}

export function indicatorParamsHTML(indicators: IndicatorInfo[]): string {
  const techInds = indicators.filter(i => !i.category || i.category === "technical")
  if (!techInds.length) {
    return `<span class="text-xs text-gray-500 italic">Loading indicators from server...</span>`
  }

  const opts = techInds.map(ind =>
    `<option value="${ind.key}">${escapeHTML(ind.name)} (${ind.key})</option>`
  ).join("")

  return `
    <select data-field="indicatorType" class="${INPUT_CLS}">${opts}</select>
    <input type="number" data-field="indicatorPeriod" placeholder="Period (e.g. 20)" value="20"
           class="${INPUT_CLS}">
  `
}

export function macroParamsHTML(indicators: IndicatorInfo[]): string {
  const macroInds = indicators.filter(i => isExternalCategory(i.category))
  if (!macroInds.length) {
    return `<span class="text-xs text-gray-500 italic">No data sources configured</span>`
  }

  const opts = macroInds.map(ind =>
    `<option value="${ind.key}">${escapeHTML(ind.name)} (${ind.key})</option>`
  ).join("")

  return `<select data-field="macroType" class="${INPUT_CLS}">${opts}</select>`
}

export function changeParamsHTML(): string {
  return `
    <select data-field="changePeriod"
            class="${INPUT_CLS}">
      ${CHANGE_PERIODS.map(p => `<option value="${p}">${p}</option>`).join("")}
    </select>
  `
}

export function formulaParamsHTML(indicators: IndicatorInfo[] = []): string {
  const macroKeys = indicators.filter(i => isExternalCategory(i.category)).map(i => i.key).join(', ')
  const helpLines = [
    "<b>Fields:</b> open high low close volume",
    macroKeys ? `<b>External:</b> ${escapeHTML(macroKeys)}` : null,
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
  const helpHTML = helpLines.filter(Boolean).join("<br>")
  return `
    <div class="flex items-center gap-1">
      <input type="text" data-field="formulaLabel" placeholder="Column name"
             class="flex-1 ${INPUT_CLS}">
      <span class="relative group cursor-help shrink-0">
        <span class="w-5 h-5 inline-flex items-center justify-center rounded-full text-xs text-gray-500 border border-gray-600 hover:text-blue-300 hover:border-blue-400">?</span>
        <div class="hidden group-hover:block absolute right-0 bottom-full mb-1 z-50 p-2.5 text-xs text-gray-300 bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg shadow-xl font-mono leading-relaxed pointer-events-none" style="width:max-content;max-width:20rem">${helpHTML}</div>
      </span>
    </div>
    <input type="text" data-field="formulaExpression" placeholder="(btcusd_close - btcusd_open) / btcusd_open * 100"
           class="${INPUT_CLS} font-mono">
    <div data-formula-error class="hidden text-xs text-red-400 mt-1"></div>
  `
}

export function instrumentParamsHTML(symbols: string[]): string {
  const FIELDS = ["close", "open", "high", "low", "volume"]
  const opts = symbols.map(s => `<option value="${s}">${escapeHTML(s)}</option>`).join("")
  const fieldOpts = FIELDS.map(f => `<option value="${f}">${f}</option>`).join("")
  return `
    <div class="flex gap-2">
      <select data-field="instrumentSymbol"
              class="flex-1 ${INPUT_CLS}">
        <option value="">Symbol...</option>
        ${opts}
      </select>
      <select data-field="instrumentField"
              class="w-24 ${INPUT_CLS}">
        ${fieldOpts}
      </select>
    </div>
    <p class="text-xs text-yellow-500/80 mt-1">
      For live updates, add a chart tab with this instrument.
    </p>
  `
}

export function columnListHTML(ctrl: string, columns: DataColumn[]): string {
  return columns.map(col => {
    const isEditable = col.type === "formula"
    const exprHint = isEditable && col.expression ? ` title="${escapeHTML(col.expression)}"` : ""
    const editBtn = isEditable
      ? `<button data-action="click->${ctrl}#editFormulaColumn"
                 data-column-id="${col.id}"
                 class="inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-blue-300 hover:bg-blue-500/10 text-sm shrink-0 cursor-pointer"
                 title="Edit formula">&#9998;</button>`
      : ""
    const visible = col.visible !== false
    const visibilityClass = visible ? "bg-emerald-400" : "bg-gray-600"
    const visibilityTitle = visible ? "Visible" : "Hidden"
    return `
    <div class="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-[#2a2a3e] group" data-column-id="${col.id}">
      <span class="text-sm text-gray-300 truncate min-w-0 flex-1"${exprHint}>${escapeHTML(col.label)}</span>
      <span class="flex items-center gap-0 shrink-0">
        <span class="text-xs shrink-0 ${col.type === 'macro' ? 'text-teal-400' : 'text-gray-500'}">${col.type === 'macro' ? '⬡ data' : col.type}</span>
        <button type="button"
                data-action="click->${ctrl}#toggleColumnVisibility"
                data-column-id="${col.id}"
                class="inline-flex w-6 h-6 items-center justify-center rounded hover:bg-[#3a3a4e] cursor-pointer shrink-0"
                title="${visibilityTitle}"
                aria-label="${visibilityTitle}">
          <span class="w-2.5 h-2.5 rounded-full ${visibilityClass}" aria-hidden="true"></span>
        </button>
        ${editBtn}
        <button data-action="click->${ctrl}#removeColumn"
                data-column-id="${col.id}"
                class="inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm shrink-0 cursor-pointer"
                title="Remove column">&times;</button>
      </span>
    </div>`
  }).join("")
}

export function addColumnFormHTML(ctrl: string, defaultParamsHTML: string): string {
  return `
    <div data-add-column-form class="hidden flex flex-col gap-2 p-2 bg-[#22223a] rounded border border-[#3a3a4e]">
      <select data-field="newColumnType"
              data-action="change->${ctrl}#onNewColumnTypeChange"
              class="${INPUT_CLS}">
        ${COLUMN_TYPES.map(ct => `<option value="${ct.value}">${ct.label}</option>`).join("")}
      </select>
      <div data-column-params class="flex flex-col gap-2">
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

export function chartLinkItemHTML(ctrl: string, link: { chartTabId: string; panelId: string }, idx: number, chartLabel?: string): string {
  const label = chartLabel || `${link.chartTabId} / ${link.panelId}`
  return `
    <div class="flex flex-col gap-1.5 py-1 px-2 rounded bg-[#22223a] border border-blue-500/20">
      <div class="flex items-center gap-2">
        <span class="text-blue-400 text-sm">&#9636;</span>
        <span class="text-sm text-gray-200 truncate flex-1">${escapeHTML(label)}</span>
      </div>
      <div class="flex gap-2">
        <button data-action="click->${ctrl}#showAddChartLink"
                class="flex-1 px-2 py-1.5 text-xs text-gray-300 bg-[#2a2a3e] hover:bg-[#3a3a4e] rounded cursor-pointer flex items-center justify-center gap-1">
          <span>&#8635;</span> Change
        </button>
        <button data-action="click->${ctrl}#removeChartLink"
                data-link-index="${idx}"
                class="flex-1 px-2 py-1.5 text-xs text-red-400 bg-[#2a2a3e] hover:bg-red-500/15 rounded cursor-pointer flex items-center justify-center gap-1">
          <span>&times;</span> Unlink
        </button>
      </div>
    </div>
  `
}

export function chartLinkSelectorHTML(ctrl: string, chartOptions: Array<{ id: string; label: string }>): string {
  if (!chartOptions.length) {
    return `<span class="text-xs text-gray-500 italic px-2">No chart tabs available</span>`
  }
  const opts = chartOptions.map(c => `<option value="${c.id}">${escapeHTML(c.label)}</option>`).join("")
  return `
    <div data-chart-link-selector class="flex flex-col gap-2 p-2 bg-[#22223a] rounded border border-[#3a3a4e]">
      <select data-field="linkChartTabId" class="${INPUT_CLS}">
        ${opts}
      </select>
      <div class="flex gap-2">
        <button data-action="click->${ctrl}#confirmAddChartLink"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer">Link</button>
        <button data-action="click->${ctrl}#cancelAddChartLink"
                class="flex-1 px-2 py-1.5 text-sm text-gray-400 bg-[#2a2a3e] hover:bg-[#3a3a4e] rounded cursor-pointer">Cancel</button>
      </div>
    </div>
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
             class="${INPUT_CLS}">
      <input type="text" data-field="editFormulaExpression" value="${escapeHTML(expression)}"
             class="${INPUT_CLS} font-mono">
      <div data-formula-error class="hidden text-xs text-red-400 mt-1"></div>
      <div class="flex gap-2">
        <button data-action="click->${ctrl}#saveFormulaColumn" data-column-id="${colId}"
                class="flex-1 px-2 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer">Save</button>
        <button data-action="click->${ctrl}#cancelFormulaEdit"
                class="flex-1 px-2 py-1.5 text-sm text-gray-400 bg-[#2a2a3e] hover:bg-[#3a3a4e] rounded cursor-pointer">Cancel</button>
      </div>
    </div>
  `
}
