import { Controller } from "@hotwired/stimulus"

const NAV_PAGE_KEY = "nav-active-page"

export default class extends Controller {
  static targets = ["mainPage", "graphPage", "mainBtn", "graphBtn"]

  connect() {
    const saved = localStorage.getItem(NAV_PAGE_KEY)
    if (saved === "graph") {
      this.showGraph()
    } else {
      this.showMain()
    }

    window.addEventListener("nav:openChart", this._boundOpenChart = (e) => {
      this.showGraph()
      // Forward to tabs controller to create a new tab
      const tabsEl = this.graphPageTarget.querySelector("[data-controller='tabs']")
      if (tabsEl) {
        tabsEl.dispatchEvent(new CustomEvent("tabs:openSymbol", { detail: e.detail }))
      }
    })
  }

  disconnect() {
    window.removeEventListener("nav:openChart", this._boundOpenChart)
  }

  showMain() {
    this.mainPageTarget.classList.remove("hidden")
    this.graphPageTarget.classList.add("hidden")
    this._setActive(this.mainBtnTarget, this.graphBtnTarget)
    localStorage.setItem(NAV_PAGE_KEY, "main")
  }

  showGraph() {
    this.mainPageTarget.classList.add("hidden")
    this.graphPageTarget.classList.remove("hidden")
    this._setActive(this.graphBtnTarget, this.mainBtnTarget)
    localStorage.setItem(NAV_PAGE_KEY, "graph")
  }

  _setActive(active, inactive) {
    const activeClasses = ["text-white", "bg-blue-600"]
    const inactiveClasses = ["text-gray-400", "hover:text-white"]

    active.classList.add(...activeClasses)
    active.classList.remove(...inactiveClasses)

    inactive.classList.remove(...activeClasses)
    inactive.classList.add(...inactiveClasses)
  }
}
