import { Controller } from "@hotwired/stimulus"
import auth from "../services/auth"
import {
  listPresets, loadPreset, savePreset, deletePreset,
  collectState, applyState, resetState, getActivePreset, setActivePreset
} from "../services/presets"

export default class extends Controller {
  static targets = ["userArea"]

  connect() {
    window.addEventListener("auth:change", this._onAuthChange)
    auth.init()
  }

  disconnect() {
    window.removeEventListener("auth:change", this._onAuthChange)
  }

  _onAuthChange = () => {
    this._render()
  }

  _render() {
    if (!this.hasUserAreaTarget) return

    if (auth.isLoggedIn) {
      const active = getActivePreset()
      const presetLabel = active ? `<span class="text-blue-400 text-xs">[${active.name}]</span>` : ""
      this.userAreaTarget.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-gray-400 text-sm">${auth.user.username}</span>
          ${presetLabel}
          <button data-action="click->auth#showPresetsMenu" class="text-gray-500 hover:text-white text-sm px-2 py-1 rounded hover:bg-[#2a2a3e] transition-colors">Presets</button>
          <button data-action="click->auth#logout" class="text-gray-500 hover:text-red-400 text-sm px-2 py-1 rounded hover:bg-red-400/10 transition-colors">Logout</button>
        </div>
      `
    } else {
      this.userAreaTarget.innerHTML = `
        <button data-action="click->auth#showLoginForm" class="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-[#2a2a3e] transition-colors">Login</button>
      `
    }
  }

  showLoginForm() {
    this._showModal(`
      <h3 class="text-white text-lg font-semibold mb-4">Login</h3>
      <form data-action="submit->auth#doLogin">
        <input name="username" placeholder="Username" autocomplete="username"
               class="w-full mb-3 px-3 py-2 bg-[#0a0a1e] border border-[#2a2a3e] rounded text-white text-sm focus:outline-none focus:border-blue-500" />
        <input name="password" type="password" placeholder="Password" autocomplete="current-password"
               class="w-full mb-3 px-3 py-2 bg-[#0a0a1e] border border-[#2a2a3e] rounded text-white text-sm focus:outline-none focus:border-blue-500" />
        <div data-auth-target="error" class="text-red-400 text-xs mb-2 hidden"></div>
        <div class="flex gap-2">
          <button type="submit" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors">Login</button>
          <button type="button" data-action="click->auth#showRegisterForm" class="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">Register</button>
          <button type="button" data-action="click->auth#closeModal" class="ml-auto px-4 py-2 text-gray-500 hover:text-white text-sm transition-colors">Cancel</button>
        </div>
      </form>
    `)
  }

  showRegisterForm() {
    this._showModal(`
      <h3 class="text-white text-lg font-semibold mb-4">Register</h3>
      <form data-action="submit->auth#doRegister">
        <input name="username" placeholder="Username" autocomplete="username"
               class="w-full mb-3 px-3 py-2 bg-[#0a0a1e] border border-[#2a2a3e] rounded text-white text-sm focus:outline-none focus:border-blue-500" />
        <input name="password" type="password" placeholder="Password (min 4 chars)" autocomplete="new-password"
               class="w-full mb-3 px-3 py-2 bg-[#0a0a1e] border border-[#2a2a3e] rounded text-white text-sm focus:outline-none focus:border-blue-500" />
        <div data-auth-target="error" class="text-red-400 text-xs mb-2 hidden"></div>
        <div class="flex gap-2">
          <button type="submit" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors">Register</button>
          <button type="button" data-action="click->auth#showLoginForm" class="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">Back to Login</button>
          <button type="button" data-action="click->auth#closeModal" class="ml-auto px-4 py-2 text-gray-500 hover:text-white text-sm transition-colors">Cancel</button>
        </div>
      </form>
    `)
  }

  async doLogin(e) {
    e.preventDefault()
    const form = e.target
    try {
      await auth.login(form.username.value, form.password.value)
      this.closeModal()
      const user = auth.user
      if (user.presets?.length > 0) {
        this._showPresetPicker(user.presets)
      }
    } catch (err) {
      this._showError(err.message)
    }
  }

  async doRegister(e) {
    e.preventDefault()
    const form = e.target
    try {
      await auth.register(form.username.value, form.password.value)
      this.closeModal()
    } catch (err) {
      this._showError(err.message)
    }
  }

  async logout() {
    await resetState()
    await auth.logout()
    window.location.reload()
  }

  async showPresetsMenu() {
    const presets = await listPresets()
    const active = getActivePreset()
    const rows = presets.map(p => {
      const isCurrent = active && active.id === p.id
      const badge = isCurrent ? '<span class="text-green-400 text-xs">(current)</span>'
                   : p.is_default ? '<span class="text-blue-400 text-xs">(default)</span>' : ""
      return `
      <div class="flex items-center justify-between py-2 border-b border-[#2a2a3e] last:border-0">
        <button data-action="click->auth#applyPreset" data-preset-id="${p.id}" data-preset-name="${p.name}"
                class="text-gray-300 hover:text-white text-sm transition-colors text-left flex-1">
          ${p.name} ${badge}
          <span class="text-gray-600 text-xs ml-2">${new Date(p.updated_at).toLocaleDateString()}</span>
        </button>
        <button data-action="click->auth#removePreset" data-preset-id="${p.id}"
                class="text-gray-600 hover:text-red-400 text-xs ml-2 transition-colors">&times;</button>
      </div>
    `}).join("")

    this._showModal(`
      <h3 class="text-white text-lg font-semibold mb-4">Presets</h3>
      <div class="mb-4 max-h-60 overflow-y-auto">${rows || '<div class="text-gray-500 text-sm">No presets yet</div>'}</div>
      <div class="flex gap-2">
        <button data-action="click->auth#showSavePreset" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors">Save Current</button>
        <button data-action="click->auth#closeModal" class="ml-auto px-4 py-2 text-gray-500 hover:text-white text-sm transition-colors">Close</button>
      </div>
    `)
  }

  showSavePreset() {
    const active = getActivePreset()
    const defaultName = active ? active.name : ""

    this._showModal(`
      <h3 class="text-white text-lg font-semibold mb-4">Save Preset</h3>
      <form data-action="submit->auth#doSavePreset">
        <input name="presetName" placeholder="Preset name" value="${defaultName}"
               class="w-full mb-3 px-3 py-2 bg-[#0a0a1e] border border-[#2a2a3e] rounded text-white text-sm focus:outline-none focus:border-blue-500" />
        <label class="flex items-center gap-2 mb-3 text-gray-400 text-sm cursor-pointer">
          <input type="checkbox" name="isDefault" class="accent-blue-500" /> Set as default
        </label>
        <p class="text-gray-600 text-xs mb-3">If a preset with this name exists, it will be overwritten.</p>
        <div data-auth-target="error" class="text-red-400 text-xs mb-2 hidden"></div>
        <div class="flex gap-2">
          <button type="submit" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors">Save</button>
          <button type="button" data-action="click->auth#showPresetsMenu" class="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">Back</button>
          <button type="button" data-action="click->auth#closeModal" class="ml-auto px-4 py-2 text-gray-500 hover:text-white text-sm transition-colors">Cancel</button>
        </div>
      </form>
    `)
  }

  async doSavePreset(e) {
    e.preventDefault()
    const form = e.target
    const name = form.presetName.value.trim()
    if (!name) { this._showError("Name is required"); return }

    try {
      const payload = await collectState()
      const saved = await savePreset(null, name, payload, form.isDefault.checked)
      setActivePreset(saved)
      this._render()
      this.showPresetsMenu()
    } catch (err) {
      this._showError(err.message)
    }
  }

  async applyPreset(e) {
    const id = e.currentTarget.dataset.presetId
    const name = e.currentTarget.dataset.presetName
    try {
      const preset = await loadPreset(id)
      setActivePreset({ id: preset.id, name: preset.name })
      this.closeModal()
      await applyState(preset.payload)
    } catch (err) {
      this._showError(err.message)
    }
  }

  async removePreset(e) {
    e.stopPropagation()
    const id = parseInt(e.currentTarget.dataset.presetId)
    await deletePreset(id)
    this.showPresetsMenu()
  }

  _showPresetPicker(presets) {
    const rows = presets.map(p => `
      <button data-action="click->auth#applyPreset" data-preset-id="${p.id}" data-preset-name="${p.name}"
              class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-500/20 hover:text-white transition-colors rounded">
        ${p.name} ${p.is_default ? '<span class="text-blue-400 text-xs">(default)</span>' : ""}
      </button>
    `).join("")

    this._showModal(`
      <h3 class="text-white text-lg font-semibold mb-4">Load Preset</h3>
      <div class="mb-4">${rows}</div>
      <button data-action="click->auth#closeModal" class="px-4 py-2 text-gray-500 hover:text-white text-sm transition-colors">Skip</button>
    `)
  }

  _showModal(html) {
    let modal = this.element.querySelector("[data-auth-modal]")
    if (!modal) {
      modal = document.createElement("div")
      modal.setAttribute("data-auth-modal", "")
      modal.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      modal.addEventListener("click", (e) => { if (e.target === modal) this.closeModal() })
      this.element.appendChild(modal)
    }
    modal.innerHTML = `<div class="bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg p-6 w-96 max-w-[90vw] shadow-xl">${html}</div>`
    modal.classList.remove("hidden")
  }

  closeModal() {
    const modal = this.element.querySelector("[data-auth-modal]")
    if (modal) modal.remove()
  }

  _showError(msg) {
    const el = this.element.querySelector("[data-auth-target='error']")
    if (el) {
      el.textContent = msg
      el.classList.remove("hidden")
    }
  }
}
