import { OVERLAY_COLORS } from "../chart/theme"

export default class PanelRenderer {
  constructor(panelsEl, controllerName) {
    this.panelsEl = panelsEl
    this.controllerName = controllerName
  }

  render(tabs, activeTabId, selectedPanelId) {
    // Remove tab wrappers for deleted tabs
    this.panelsEl.querySelectorAll("[data-tab-wrapper]").forEach(wrapper => {
      const tabId = wrapper.dataset.tabWrapper
      if (!tabs.find(t => t.id === tabId)) wrapper.remove()
    })

    tabs.forEach(tab => {
      const isActive = tab.id === activeTabId
      let wrapper = this.panelsEl.querySelector(`[data-tab-wrapper="${tab.id}"]`)

      if (!wrapper) {
        wrapper = document.createElement("div")
        wrapper.dataset.tabWrapper = tab.id
        wrapper.className = "flex flex-col h-full"
        this.panelsEl.appendChild(wrapper)
      }

      wrapper.classList.toggle("hidden", !isActive)
      if (!isActive) return

      this._syncPanels(wrapper, tab.panels, selectedPanelId)
    })
  }

  _syncPanels(wrapper, panels, selectedPanelId) {
    const existing = new Map()
    wrapper.querySelectorAll(":scope > [data-panel-id]").forEach(el => {
      existing.set(el.dataset.panelId, el)
    })

    const savedFlex = new Map()
    for (const [id, el] of existing) {
      if (el.style.flex) savedFlex.set(id, el.style.flex)
    }

    let removed = false
    for (const [id, el] of existing) {
      if (!panels.find(p => p.id === id)) {
        el.remove()
        existing.delete(id)
        savedFlex.delete(id)
        removed = true
      }
    }

    // After removing panels, normalize flex on survivors so they fill the space
    if (removed && savedFlex.size > 0) {
      let total = 0
      for (const flex of savedFlex.values()) {
        const num = parseFloat(flex)
        if (Number.isFinite(num) && num > 0) total += num
      }
      if (total > 0 && total !== 1) {
        for (const [id, flex] of savedFlex) {
          const num = parseFloat(flex)
          if (Number.isFinite(num) && num > 0) {
            const normalized = `${num / total}`
            savedFlex.set(id, normalized)
            const el = existing.get(id)
            if (el) el.style.flex = normalized
          }
        }
      }
    }

    panels.forEach(panel => {
      const el = existing.get(panel.id)
      const overlaysJson = this._overlaysJson(panel)
      const hasSymbols = panel.overlays.some(o => o.symbol)

      if (el) {
        const chartEl = el.querySelector("[data-controller='chart']")
        const hasChart = !!chartEl
        const needsChart = hasSymbols

        const settingsChanged = hasChart && needsChart && (
          chartEl.dataset.chartTimeframeValue !== panel.timeframe ||
          chartEl.dataset.chartOverlaysValue !== overlaysJson
        )

        if (settingsChanged || hasChart !== needsChart) {
          const placeholder = document.createElement("template")
          placeholder.innerHTML = this._panelHTML(panel, selectedPanelId)
          const newEl = placeholder.content.firstElementChild
          if (savedFlex.has(panel.id)) newEl.style.flex = savedFlex.get(panel.id)
          el.replaceWith(newEl)
          existing.delete(panel.id)
        } else {
          this._updatePanelBorder(el, panel.id === selectedPanelId)
        }
        return
      }

      wrapper.insertAdjacentHTML("beforeend", this._panelHTML(panel, selectedPanelId))
    })

    // Sync dividers between panels
    const panelEls = [...wrapper.querySelectorAll(":scope > [data-panel-id]")]
    const expectedPairs = []
    for (let i = 0; i < panelEls.length - 1; i++) {
      expectedPairs.push({ above: panelEls[i].dataset.panelId, below: panelEls[i + 1].dataset.panelId })
    }

    const existingDividers = [...wrapper.querySelectorAll(":scope > [data-divider]")]
    const needsRebuild = existingDividers.length !== expectedPairs.length ||
      existingDividers.some((d, i) => d.dataset.above !== expectedPairs[i].above || d.dataset.below !== expectedPairs[i].below)

    if (needsRebuild) {
      existingDividers.forEach(d => d.remove())
      for (let i = 0; i < panelEls.length - 1; i++) {
        const divider = document.createElement("div")
        divider.dataset.divider = ""
        divider.dataset.above = panelEls[i].dataset.panelId
        divider.dataset.below = panelEls[i + 1].dataset.panelId
        divider.className = "h-1.5 shrink-0 cursor-row-resize bg-[#2a2a3e] hover:bg-[#5a5a7e] transition-colors"
        divider.dataset.action = `mousedown->${this.controllerName}#startResize`
        panelEls[i].after(divider)
      }
    }
  }

  _updatePanelBorder(panel, selected) {
    panel.classList.toggle("border-blue-500/50", selected)
    panel.classList.toggle("border-[#2a2a3e]", !selected)
  }

  _overlaysJson(panel) {
    return JSON.stringify(panel.overlays.filter(o => o.symbol).map(o => {
      const base = { id: o.id, symbol: o.symbol, mode: o.mode, chartType: o.chartType }
      if (o.mode === "indicator") {
        base.indicatorType = o.indicatorType
        base.indicatorParams = o.indicatorParams
        base.pinnedTo = o.pinnedTo
      }
      return base
    }))
  }

  _panelLegendHTML(panel) {
    const timeframe = panel.timeframe || "1m"
    const lines = panel.overlays
      .filter(o => o.symbol)
      .map(o => {
        const colors = OVERLAY_COLORS[o.colorScheme] || OVERLAY_COLORS[0]
        const swatches = `<span class="inline-flex items-center gap-0.5 shrink-0"><span class="w-3 h-3 rounded-sm border border-black/20" style="background:${colors.up}"></span><span class="w-3 h-3 rounded-sm border border-black/20" style="background:${colors.down}"></span></span>`
        let modeLabel
        if (o.mode === "indicator" && o.indicatorType) {
          const sourceOverlay = o.pinnedTo ? panel.overlays.find(s => s.id === o.pinnedTo) : null
          const sourceSymbol = this._escapeHTML(sourceOverlay ? sourceOverlay.symbol : o.symbol)
          const sourceMode = sourceOverlay ? (sourceOverlay.mode === "volume" ? "Volume" : "Price") : "Price"
          const paramsStr = o.indicatorParams
            ? Object.values(o.indicatorParams).join(",")
            : ""
          modeLabel = `${(o.indicatorType || "").toUpperCase()}${paramsStr ? `(${paramsStr})` : ""}`
          return `<div class="flex items-center gap-1.5 truncate">${swatches} ${sourceSymbol} ${sourceMode} ${modeLabel} ${timeframe}</div>`
        }
        const symbol = this._escapeHTML(o.symbol)
        modeLabel = o.mode === "volume" ? "Volume" : "Price"
        return `<div class="flex items-center gap-1.5 truncate">${swatches} ${symbol} ${modeLabel} ${timeframe}</div>`
      })
      .join("")

    if (!lines) return ""

    return `
      <div class="absolute top-2 left-3 z-10 max-w-[72%] pointer-events-none flex flex-col gap-0.5 text-base font-medium text-gray-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]">
        ${lines}
      </div>
    `
  }

  _panelHTML(panel, selectedPanelId) {
    const selected = panel.id === selectedPanelId
    const borderClass = selected ? "border-blue-500/50" : "border-[#2a2a3e]"
    const hasSymbols = panel.overlays.some(o => o.symbol)

    const closeBtn = `
      <div class="absolute top-1 right-1 z-10">
        <button
          data-close-panel="${panel.id}"
          data-action="click->${this.controllerName}#removePanel"
          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-300 bg-[#1a1a2e]/85 hover:bg-[#2a2a3e] rounded text-base cursor-pointer"
          title="Remove panel"
        >&times;</button>
      </div>
    `

    if (!hasSymbols) {
      return `
        <div data-panel-id="${panel.id}"
             data-action="click->${this.controllerName}#selectPanel"
             class="relative flex-1 min-h-0 border ${borderClass} flex items-center justify-center cursor-pointer">
          ${closeBtn}
          <span class="text-gray-500 text-base">Select a symbol</span>
        </div>
      `
    }

    const overlaysJson = this._overlaysJson(panel)
    const panelLegend = this._panelLegendHTML(panel)
    return `
      <div data-panel-id="${panel.id}"
           data-action="click->${this.controllerName}#selectPanel"
           class="relative flex-1 min-h-0 border ${borderClass} cursor-pointer">
        ${closeBtn}
        <div
          data-controller="chart"
          data-chart-timeframe-value="${panel.timeframe}"
          data-chart-overlays-value='${overlaysJson.replace(/'/g, "&#39;")}'
          class="absolute inset-0"
        ></div>
        ${panelLegend}
      </div>
    `
  }

  _escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;")
  }
}
