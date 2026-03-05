import { Controller } from "@hotwired/stimulus"
import auth from "../services/auth"
import {
  listPresets, loadPreset, savePreset, deletePreset,
  collectState, applyState, resetState, getActivePreset, setActivePreset
} from "../services/presets"
import {
  userAreaHTML, loginButtonHTML, loginFormHTML, registerFormHTML,
  presetsMenuHTML, savePresetFormHTML, presetPickerHTML,
} from "../templates/auth_templates"

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
      this.userAreaTarget.innerHTML = userAreaHTML(auth.user.username, active?.name)
    } else {
      this.userAreaTarget.innerHTML = loginButtonHTML()
    }
  }

  showLoginForm() {
    this._showModal(loginFormHTML())
  }

  showRegisterForm() {
    this._showModal(registerFormHTML())
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
    this._showModal(presetsMenuHTML(presets, active))
  }

  showSavePreset() {
    const active = getActivePreset()
    this._showModal(savePresetFormHTML(active ? active.name : ""))
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
    this._showModal(presetPickerHTML(presets))
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
