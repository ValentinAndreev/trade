import { Controller } from "@hotwired/stimulus"
import type { PresetInfo } from "../types/markets"
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
  declare userAreaTarget: HTMLElement
  declare hasUserAreaTarget: boolean

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

    if (auth.isLoggedIn && auth.user) {
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

  async doLogin(e: Event) {
    e.preventDefault()
    const form = (e as SubmitEvent).target as HTMLFormElement
    try {
      await auth.login(form.username.value, form.password.value)
      this.closeModal()
      const user = auth.user
      if (user && "presets" in user && (user as any).presets?.length > 0) {
        this._showPresetPicker((user as any).presets)
      }
    } catch (err) {
      this._showError((err as Error).message)
    }
  }

  async doRegister(e: Event) {
    e.preventDefault()
    const form = (e as SubmitEvent).target as HTMLFormElement
    try {
      await auth.register(form.username.value, form.password.value)
      this.closeModal()
    } catch (err) {
      this._showError((err as Error).message)
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
    this._showModal(presetsMenuHTML(presets as any[], active))
  }

  showSavePreset() {
    const active = getActivePreset()
    this._showModal(savePresetFormHTML(active ? active.name : ""))
  }

  async doSavePreset(e: Event) {
    e.preventDefault()
    const form = (e as SubmitEvent).target as HTMLFormElement
    const name = form.presetName.value.trim()
    if (!name) { this._showError("Name is required"); return }

    try {
      const payload = await collectState()
      const saved = await savePreset(null, name, payload, form.isDefault.checked) as any
      setActivePreset(saved as PresetInfo)
      this._render()
      this.showPresetsMenu()
    } catch (err) {
      this._showError((err as Error).message)
    }
  }

  async applyPreset(e: Event) {
    const id = Number((e.currentTarget as HTMLElement).dataset.presetId)
    try {
      const preset = await loadPreset(id) as any
      setActivePreset({ id: preset.id, name: preset.name })
      this.closeModal()
      await applyState(preset.payload)
    } catch (err) {
      this._showError((err as Error).message)
    }
  }

  async removePreset(e: Event) {
    e.stopPropagation()
    const id = parseInt((e.currentTarget as HTMLElement).dataset.presetId!)
    await deletePreset(id)
    this.showPresetsMenu()
  }

  _showPresetPicker(presets: any[]): void {
    this._showModal(presetPickerHTML(presets))
  }

  _showModal(html: string): void {
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

  _showError(msg: string): void {
    const el = this.element.querySelector("[data-auth-target='error']")
    if (el) {
      el.textContent = msg
      el.classList.remove("hidden")
    }
  }
}
