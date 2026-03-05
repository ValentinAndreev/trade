import { OVERLAY_COLORS } from "../config/theme"
import { INDICATOR_META } from "../config/indicators"
import { escapeHTML } from "../utils/dom"

const ACTIVE_BTN = "text-white bg-blue-600"
const INACTIVE_BTN = "text-gray-400 bg-[#2a2a3e] hover:bg-[#3a3a4e]"
const SELECT_CLASS = "px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
const INDICATOR_FILTER_LABELS = { all: "All", client: "\u26A1 Client", server: "\uD83C\uDF10 Server" }

export function collapseBtnHTML(ctrl, action, collapsed) {
  return `<button
    data-action="click->${ctrl}#${action}"
    class="text-blue-400 hover:text-blue-300 text-base cursor-pointer select-none w-6 h-6 flex items-center justify-center"
    title="${collapsed ? "Expand" : "Collapse"}"
  >${collapsed ? "&#9656;" : "&#9662;"}</button>`
}

export function modeBtnHTML(ctrl, mode, label, isActive) {
  return `<button
    data-action="click->${ctrl}#setMode"
    data-mode="${mode}"
    class="flex-1 px-2 py-2 text-sm rounded cursor-pointer ${isActive ? ACTIVE_BTN : INACTIVE_BTN}"
  >${label}</button>`
}

export function toggleBtnHTML(ctrl, action, label, isActive) {
  return `<button data-action="click->${ctrl}#${action}"
    class="text-sm px-2 py-1 rounded cursor-pointer ${isActive ? ACTIVE_BTN : INACTIVE_BTN}">${label}</button>`
}

export function opacitySliderHTML(percent, action, label, dataAttr) {
  return `
    <label class="flex flex-col gap-1 text-sm text-gray-400">
      <span class="flex items-center justify-between">
        <span>${label}</span>
        <span ${dataAttr} class="text-gray-400">${percent}%</span>
      </span>
      <input
        type="range" min="0" max="100" step="1" value="${percent}"
        data-action="input->${action} change->${action}"
        class="w-full accent-blue-500 cursor-pointer"
      >
    </label>
  `
}

export function chartTypeOptsHTML(pairs, selected) {
  return pairs.map(([val, label]) =>
    `<option value="${val}"${val === selected ? " selected" : ""}>${label}</option>`
  ).join("")
}

export function colorSchemeDropdownHTML(ctrl, selected) {
  const selectedScheme = OVERLAY_COLORS[selected] || OVERLAY_COLORS[0]

  const items = OVERLAY_COLORS.map((scheme, idx) => {
    const active = idx === selected
    return `
      <button
        type="button"
        data-color-scheme="${idx}"
        data-action="click->${ctrl}#switchColorScheme"
        class="w-full flex items-center justify-between px-2 py-2 rounded text-sm cursor-pointer
               ${active ? "bg-blue-600/20 text-white" : "text-gray-300 hover:bg-[#2a2a3e]"}"
      >
        ${colorSwatchHTML(scheme.up, "Up")}
        ${colorSwatchHTML(scheme.down, "Down")}
      </button>
    `
  }).join("")

  return `
    <details class="relative">
      <summary class="list-none flex items-center justify-between gap-2 px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded cursor-pointer select-none">
        <span class="inline-flex items-center gap-2">
          ${colorSwatchHTML(selectedScheme.up, "Up", "text-gray-300")}
          ${colorSwatchHTML(selectedScheme.down, "Down", "text-gray-300")}
        </span>
        <span class="text-xs text-gray-400">▼</span>
      </summary>
      <div class="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-[#1a1a2e] border border-[#3a3a4e] rounded p-1">
        ${items}
      </div>
    </details>
  `
}

function colorSwatchHTML(color, label, textClass = "") {
  return `<span class="inline-flex items-center gap-1.5">
    <span class="w-3 h-3 rounded-sm border border-black/20" style="background:${color}"></span>
    <span class="text-xs uppercase tracking-wide ${textClass}">${label}</span>
  </span>`
}

export function comboHTML(ctrl, field, list, current, width) {
  const values = current && !list.includes(current) ? [current, ...list] : list
  const opts = values.map(v => `<option value="${v}"${v === current ? " selected" : ""}>${v}</option>`).join("")
  const inList = !current || list.includes(current)
  const isTimeframe = field === "timeframe"
  const selectTitle = isTimeframe ? "Choose timeframe from list" : "Choose symbol from list"
  const inputTitle = isTimeframe
    ? "Enter timeframe manually, for example: 1m, 5m, 1h, 1D"
    : "Enter symbol manually, for example: BTCUSD"
  const inputPlaceholder = isTimeframe ? "1m, 5m, 1h..." : "BTCUSD"
  const toggleTitle = inList ? "Current mode: list selection" : "Current mode: manual input"
  const toggleLabel = inList ? "List" : "Manual"
  return `
    <span data-combo class="flex items-center gap-1">
      <select
        data-field="${field}"
        data-action="change->${ctrl}#applySettings"
        title="${selectTitle}"
        class="${inList ? "" : "hidden "}${width} ${SELECT_CLASS}"
      >${opts}</select>
      <input
        data-field="${field}"
        data-action="keydown->${ctrl}#applySettingsOnEnter"
        value="${current}"
        title="${inputTitle}"
        placeholder="${inputPlaceholder}"
        class="${inList ? "hidden " : ""}${width} ${SELECT_CLASS}"
      >
      <button
        data-action="click->${ctrl}#toggleCustomInput"
        class="min-w-[72px] px-3 py-2 text-sm font-medium text-blue-200 bg-[#23233d] border border-[#4a4a66] hover:bg-[#2f2f4d] hover:text-white rounded cursor-pointer shrink-0"
        title="${toggleTitle}"
      >${toggleLabel}</button>
    </span>`
}

export function overlayItemHTML(ctrl, o, isSelected, panel) {
  let label, modeLabel
  if (o.mode === "indicator") {
    const sourceOverlay = o.pinnedTo ? panel.overlays.find(s => s.id === o.pinnedTo) : null
    const sourceSymbol = sourceOverlay ? sourceOverlay.symbol : o.symbol
    const sourceMode = sourceOverlay ? (sourceOverlay.mode === "volume" ? "Vol" : "Price") : "Price"
    label = `${sourceSymbol || o.symbol || "Empty"} ${sourceMode}`
    const paramsStr = o.indicatorParams ? Object.values(o.indicatorParams).join(", ") : ""
    const srcIcon = o.indicatorSource === "server" ? "\uD83C\uDF10" : "\u26A1"
    modeLabel = srcIcon + " " + (o.indicatorType || "ind").toUpperCase() + (paramsStr ? ` ${paramsStr}` : "")
  } else {
    label = o.symbol || "Empty"
    modeLabel = !o.symbol ? "" : (o.mode === "volume" ? "Volume" : "Price")
  }
  const visibilityClass = o.visible === false ? "bg-gray-600" : "bg-emerald-400"
  const visibilityTitle = o.visible === false ? "Hidden" : "Visible"

  return `
    <div class="flex items-center gap-2 px-2.5 py-1.5 rounded cursor-pointer text-sm
                ${isSelected ? "bg-blue-600/30 text-white" : "text-gray-400 hover:bg-[#2a2a3e]"}"
         data-overlay-id="${o.id}"
         data-action="click->${ctrl}#selectOverlay">
      <div class="flex-1 min-w-0 flex items-center gap-1.5">
        <span class="truncate">${label}</span>
        ${modeLabel ? `<span class="shrink-0 inline-flex items-center px-2 py-0.5 rounded border text-xs leading-none
                     ${isSelected ? "text-blue-200 border-blue-300/40 bg-blue-500/10" : "text-gray-400 border-gray-500/40 bg-[#2a2a3e]"}">${modeLabel}</span>` : ""}
      </div>
      <button
        type="button"
        data-action="click->${ctrl}#toggleOverlayVisibility"
        data-overlay-id="${o.id}"
        data-toggle-overlay-visibility
        class="inline-flex w-6 h-6 items-center justify-center rounded shrink-0 hover:bg-[#2a2a3e] cursor-pointer"
        title="Toggle visibility"
        aria-label="Toggle visibility"
      >
        <span class="w-2.5 h-2.5 rounded-full ${visibilityClass}" title="${visibilityTitle}" aria-hidden="true"></span>
      </button>
      ${panel.overlays.length > 1 ? `
        <span data-action="click->${ctrl}#removeOverlay"
              data-remove-overlay="${o.id}"
              title="Remove chart"
              class="inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm leading-none">&times;</span>
      ` : ""}
    </div>
  `
}

export function indicatorSettingsHTML(ctrl, indicatorType, indicatorParams, selectedOverlay, panel, indicators, indicatorFilter) {
  const meta = INDICATOR_META[indicatorType]
  const currentSource = selectedOverlay?.indicatorSource || (meta?.lib ? "client" : "server")

  const serverKeys = new Set(indicators.map(i => String(i.key)))
  const clientKeys = new Set(
    Object.keys(INDICATOR_META).filter(k => !!INDICATOR_META[k]?.lib)
  )
  const allEntries = []
  const seen = new Set()

  for (const key of Object.keys(INDICATOR_META)) {
    const hasClient = clientKeys.has(key)
    const hasServer = serverKeys.has(key)
    if (hasClient && hasServer) {
      allEntries.push({ key, source: "client" })
      allEntries.push({ key, source: "server" })
    } else if (hasClient) {
      allEntries.push({ key, source: "client" })
    } else if (hasServer) {
      allEntries.push({ key, source: "server" })
    } else {
      allEntries.push({ key, source: "server" })
    }
    seen.add(key)
  }
  for (const key of serverKeys) {
    if (!seen.has(key)) allEntries.push({ key, source: "server" })
  }

  const filtered = allEntries.filter(({ source }) => {
    if (indicatorFilter === "all") return true
    return indicatorFilter === source
  })

  const indicatorOpts = filtered.map(({ key, source }) => {
    const m = INDICATOR_META[key]
    const label = m?.label || key.toUpperCase()
    const icon = source === "client" ? "\u26A1" : "\uD83C\uDF10"
    const val = `${key}|${source}`
    const selected = key === indicatorType && source === currentSource
    return `<option value="${val}"${selected ? " selected" : ""}>${icon} ${label}</option>`
  }).join("")

  const filterLabel = INDICATOR_FILTER_LABELS[indicatorFilter]

  let paramInputs = ""
  if (meta && meta.defaults) {
    const params = { ...meta.defaults, ...indicatorParams }
    paramInputs = Object.entries(meta.defaults).map(([key, defaultVal]) => {
      const value = params[key] ?? defaultVal
      const label = meta.paramLabels?.[key] || key
      return `
        <label class="flex flex-col gap-1 text-sm text-gray-400">
          ${escapeHTML(label)}
          <input
            type="number"
            data-indicator-param="${key}"
            value="${value}"
            data-action="keydown->${ctrl}#applyIndicatorOnEnter"
            class="${SELECT_CLASS}"
          >
        </label>
      `
    }).join("")
  }

  const pinnedTo = selectedOverlay?.pinnedTo || null
  const requires = meta?.requires || "values"
  const pinTargets = panel.overlays.filter(o => {
    if (o.id === selectedOverlay?.id || !o.symbol) return false
    if (o.mode === "indicator") return false
    if (requires === "values") return true
    return o.mode === "price"
  })
  const sourceOpts = pinTargets.map(o => {
    const modeLabel = o.mode === "volume" ? "Vol" : (o.mode === "indicator" ? (o.indicatorType || "").toUpperCase() : "Price")
    return `<option value="${o.id}"${o.id === pinnedTo ? " selected" : ""}>${escapeHTML(o.symbol)} ${modeLabel}</option>`
  }).join("")

  const sourceHTML = `
    <label class="flex flex-col gap-1 text-sm text-gray-400">
      Source
      <select
        data-field="pinnedTo"
        data-action="change->${ctrl}#changePinnedTo"
        class="${SELECT_CLASS}"
      >${pinTargets.length > 0 ? sourceOpts : '<option value="" disabled selected>No charts on panel</option>'}</select>
    </label>
  `

  return `
    <div class="flex flex-col gap-1 text-sm text-gray-400">
      <span>Indicator</span>
      <div class="flex gap-1 items-stretch">
        <select
          data-field="indicatorType"
          data-action="change->${ctrl}#switchIndicatorType"
          class="flex-1 min-w-0 ${SELECT_CLASS}"
        >${indicatorOpts}</select>
        <button
          data-action="click->${ctrl}#cycleIndicatorFilter"
          class="min-w-[5.5rem] px-2 py-2 text-xs text-gray-300 bg-[#2a2a3e] border border-[#3a3a4e] rounded hover:bg-[#3a3a4e] whitespace-nowrap text-center"
          title="Filter: ${filterLabel}"
        >${filterLabel}</button>
      </div>
    </div>
    ${paramInputs}
    ${sourceHTML}
  `
}
