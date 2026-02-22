export default class Scrollbar {
  constructor(container, { getVisibleRange, setVisibleRange, getTotalBars }) {
    this.getVisibleRange = getVisibleRange
    this.setVisibleRange = setVisibleRange
    this.getTotalBars = getTotalBars
    this.dragging = false

    this.el = document.createElement("div")
    Object.assign(this.el.style, {
      height: "12px",
      flexShrink: "0",
      background: "#1a1a2e",
      borderTop: "1px solid #2a2a3e",
      position: "relative",
      cursor: "pointer",
    })
    container.appendChild(this.el)

    this.thumb = document.createElement("div")
    Object.assign(this.thumb.style, {
      position: "absolute",
      top: "2px",
      height: "8px",
      background: "#4a4a6e",
      borderRadius: "4px",
      minWidth: "20px",
      cursor: "grab",
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
  }

  destroy() {
    document.removeEventListener("mousemove", this._onMouseMove)
    document.removeEventListener("mouseup", this._onMouseUp)
    this.el.remove()
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
