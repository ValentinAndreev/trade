// Generic drawing list renderer for sidebar

import { escapeHTML } from "../utils/dom"

export function drawingListHTML(config) {
  const {
    items, kind, controllerName, collapsed, toggleAction,
    clearAction, headerLabel, subtextFn, timeFn,
    defaultColor, defaultWidth, hasWidthPicker, hasFontSizePicker,
    hasSelect, hasRename,
    nameFn, colorIndicatorFn,
    mt,
  } = config

  if (items.length === 0) return ""

  return `
    <div class="flex flex-col gap-0.5${mt ? " mt-1" : ""}">
      <div class="flex items-center gap-1 px-2.5 select-none">
        <span class="text-blue-400 hover:text-blue-300 text-xs w-4 h-4 flex items-center justify-center cursor-pointer"
              data-action="click->${controllerName}#${toggleAction}">${collapsed ? "&#9656;" : "&#9662;"}</span>
        <span class="text-[13px] text-gray-500 uppercase tracking-wide cursor-pointer flex-1"
              data-action="click->${controllerName}#${toggleAction}">${headerLabel}
          <span class="normal-case tracking-normal">(${items.length})</span>
        </span>
        <button data-action="click->${controllerName}#${clearAction}"
              title="Clear all ${headerLabel.toLowerCase()}"
              class="text-sm px-2 py-1 rounded cursor-pointer text-gray-400 bg-[#2a2a3e] hover:bg-red-500/20 hover:text-red-300">Clear</button>
      </div>
      ${collapsed ? "" : items.map(item => {
        const id = item.id
        const name = nameFn(item)
        const subtext = subtextFn ? subtextFn(item) : ""
        const timeText = timeFn ? timeFn(item) : ""
        const color = item.color || defaultColor
        const width = item.width || defaultWidth
        const fontSize = item.fontSize || 1
        const colorIndicator = colorIndicatorFn
          ? colorIndicatorFn(item, color, width)
          : `<span class="block w-2.5 h-2.5 rounded-full border border-black/20" style="background:${escapeHTML(color)}"></span>`

        const actions = []
        if (hasSelect !== false) actions.push(`click->${controllerName}#selectDrawing`)
        if (hasRename !== false) actions.push(`dblclick->${controllerName}#startDrawingRename`)

        return `
        <div class="group flex items-center gap-2 px-2.5 py-1.5 rounded text-[15px] text-gray-400 hover:bg-[#2a2a3e] cursor-pointer"
             data-action="${actions.join(" ")}"
             data-drawing-kind="${kind}"
             data-drawing-id="${id}">
          <span class="shrink-0 w-4 flex items-center justify-center" title="Color">
            ${colorIndicator}
          </span>
          <div class="flex-1 min-w-0 flex flex-col">
            <span class="truncate" data-drawing-name="${id}">${escapeHTML(name)}</span>
            ${subtext ? `<span class="text-[13px] text-gray-500 truncate">${escapeHTML(subtext)}</span>` : ""}
            ${timeText ? `<span class="text-[13px] text-gray-600 truncate">${escapeHTML(timeText)}</span>` : ""}
          </div>
          <input type="color" value="${escapeHTML(color)}"
                 data-action="change->${controllerName}#changeDrawingColor"
                 data-drawing-kind="${kind}"
                 data-drawing-id="${id}"
                 class="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
                 title="Change color">
          ${hasFontSizePicker ? `
            <select data-action="change->${controllerName}#changeDrawingFontSize"
                    data-drawing-kind="${kind}"
                    data-drawing-id="${id}"
                    class="hidden group-hover:block w-12 text-xs bg-[#2a2a3e] text-gray-300 border border-[#3a3a4e] rounded cursor-pointer shrink-0"
                    title="Font size">
              ${[["1","S"],["2","M"],["3","L"],["4","XL"],["5","XXL"]].map(([v,l]) => `<option value="${v}"${parseInt(v)===fontSize ? " selected" : ""}>${l}</option>`).join("")}
            </select>
          ` : ""}
          ${hasWidthPicker ? `
            <select data-action="change->${controllerName}#changeDrawingWidth"
                    data-drawing-kind="${kind}"
                    data-drawing-id="${id}"
                    class="hidden group-hover:block w-10 text-xs bg-[#2a2a3e] text-gray-300 border border-[#3a3a4e] rounded cursor-pointer shrink-0"
                    title="Line width">
              ${[1,2,3,4,5].map(w => `<option value="${w}"${w === width ? " selected" : ""}>${w}px</option>`).join("")}
            </select>
          ` : ""}
          <span data-action="click->${controllerName}#removeDrawing"
                data-drawing-kind="${kind}"
                data-drawing-id="${id}"
                title="Remove"
                class="hidden group-hover:inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm leading-none">&times;</span>
        </div>
      `}).join("")}
    </div>
  `
}
