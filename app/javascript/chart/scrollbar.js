import { formatDateShort } from "../utils/format"

export default class Scrollbar {
  constructor(container, { getVisibleRange, setVisibleRange, getTotalBars, getTimeRange, onGoStart, onGoEnd, onGoToDate }) {
    this.getVisibleRange = getVisibleRange
    this.setVisibleRange = setVisibleRange
    this.getTotalBars = getTotalBars
    this.getTimeRange = getTimeRange // () => { first, last } timestamps
    this.onGoStart = onGoStart
    this.onGoEnd = onGoEnd
    this.onGoToDate = onGoToDate
    this.dragging = false

    this.wrapper = document.createElement("div")
    Object.assign(this.wrapper.style, { flexShrink: "0" })
    container.appendChild(this.wrapper)

    // Navigation bar
    this.nav = document.createElement("div")
    Object.assign(this.nav.style, {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      height: "46px", background: "#1a1a2e", borderTop: "1px solid #2a2a3e",
      padding: "0 0px 0 4px", gap: "4px",
    })
    this.wrapper.appendChild(this.nav)

    const btnStyle = {
      background: "#2a2a3e", border: "1px solid #3a3a4e", borderRadius: "4px",
      color: "#ccc", cursor: "pointer", padding: "6px 10px", fontSize: "13px",
      lineHeight: "1.4", whiteSpace: "nowrap", textAlign: "center",
      outline: "none", boxShadow: "none", WebkitAppearance: "none",
    }

    this.btnStart = document.createElement("button")
    Object.assign(this.btnStart.style, btnStyle)
    this.btnStart.title = "Go to start"
    this.nav.appendChild(this.btnStart)

    this.dateInput = document.createElement("input")
    this.dateInput.type = "date"
    Object.assign(this.dateInput.style, {
      background: "#2a2a3e", border: "1px solid #3a3a4e", borderRadius: "3px",
      color: "#ccc", fontSize: "14px", padding: "6px 8px", width: "140px",
      textAlign: "center", outline: "none",
    })
    this.nav.appendChild(this.dateInput)

    this.btnEnd = document.createElement("button")
    Object.assign(this.btnEnd.style, btnStyle)
    this.btnEnd.title = "Go to end"
    this.nav.appendChild(this.btnEnd)

    this._updateButtonLabels()

    this.btnStart.addEventListener("click", () => this.onGoStart?.())
    this.btnEnd.addEventListener("click", () => this.onGoEnd?.())
    this.dateInput.addEventListener("change", () => {
      const val = this.dateInput.value
      if (!val) return
      const ts = Math.floor(new Date(val + "T00:00:00").getTime() / 1000)
      this.onGoToDate?.(ts)
    })

    // Scrollbar track
    this.el = document.createElement("div")
    Object.assign(this.el.style, {
      height: "12px", background: "#1a1a2e",
      borderTop: "1px solid #2a2a3e", position: "relative", cursor: "pointer",
    })
    this.wrapper.appendChild(this.el)

    this.thumb = document.createElement("div")
    Object.assign(this.thumb.style, {
      position: "absolute", top: "2px", height: "8px",
      background: "#4a4a6e", borderRadius: "4px", minWidth: "20px", cursor: "grab",
    })
    this.el.appendChild(this.thumb)

    this._bindEvents()
  }

  update() {
    const total = this.getTotalBars()
    if (total === 0) return
    const range = this.getVisibleRange()
    if (!range) return
    const trackWidth = this.el.clientWidth
    if (trackWidth === 0) return

    const from = Math.max(0, range.from)
    const to = Math.min(total, range.to)
    const thumbLeft = (from / total) * trackWidth
    const thumbWidth = Math.max(20, ((to - from) / total) * trackWidth)

    this.thumb.style.left = `${thumbLeft}px`
    this.thumb.style.width = `${thumbWidth}px`

    this._updateButtonLabels()
  }

  _updateButtonLabels() {
    const tr = this.getTimeRange?.()
    const dateStart = tr?.first ? formatDateShort(tr.first) : "..."
    const dateEnd = tr?.last ? formatDateShort(tr.last) : "..."
    this.btnStart.innerHTML = `<small style="opacity:0.6">Oldest</small><br>${dateStart}`
    this.btnEnd.innerHTML = `<small style="opacity:0.6">Latest</small><br>${dateEnd}`
  }

  destroy() {
    document.removeEventListener("mousemove", this._onMouseMove)
    document.removeEventListener("mouseup", this._onMouseUp)
    this.el.removeEventListener("click", this._onTrackClick)
    this.thumb.removeEventListener("mousedown", this._onThumbDown)
    this.wrapper.remove()
  }

  _bindEvents() {
    this._onThumbDown = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const range = this.getVisibleRange()
      if (!range) return
      this.dragging = true
      this._startX = e.clientX
      this._startFrom = range.from
      this._startTo = range.to
      this.thumb.style.cursor = "grabbing"
      document.body.style.userSelect = "none"
    }

    this._onMouseMove = (e) => {
      if (!this.dragging) return
      const trackWidth = this.el.clientWidth
      if (trackWidth === 0) return
      const total = this.getTotalBars()
      const dx = e.clientX - this._startX
      const barsDelta = (dx / trackWidth) * total
      this.setVisibleRange({
        from: this._startFrom + barsDelta,
        to: this._startTo + barsDelta,
      })
    }

    this._onMouseUp = () => {
      if (!this.dragging) return
      this.dragging = false
      this.thumb.style.cursor = "grab"
      document.body.style.userSelect = ""
    }

    this._onTrackClick = (e) => {
      if (e.target === this.thumb) return
      const rect = this.el.getBoundingClientRect()
      const clickRatio = (e.clientX - rect.left) / rect.width
      const total = this.getTotalBars()
      const range = this.getVisibleRange()
      if (!range) return
      const visible = range.to - range.from
      const center = clickRatio * total
      const from = center - visible / 2
      this.setVisibleRange({ from, to: from + visible })
    }

    this.thumb.addEventListener("mousedown", this._onThumbDown)
    document.addEventListener("mousemove", this._onMouseMove)
    document.addEventListener("mouseup", this._onMouseUp)
    this.el.addEventListener("click", this._onTrackClick)
  }
}
