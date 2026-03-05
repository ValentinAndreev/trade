const AUTH_EVENT = "auth:change"

class AuthService {
  constructor() {
    this.user = null
    this._ready = false
  }

  get isLoggedIn() {
    return !!this.user
  }

  async init() {
    try {
      const resp = await fetch("/api/session")
      if (resp.ok) {
        const data = await resp.json()
        this.user = data.user
      }
    } catch { /* offline */ }
    this._ready = true
    this._emit()
  }

  async login(username, password) {
    const resp = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": this._csrf() },
      body: JSON.stringify({ username, password }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || "Login failed")
    this.user = data.user
    this._emit()
    return this.user
  }

  async register(username, password) {
    const resp = await fetch("/api/registration", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": this._csrf() },
      body: JSON.stringify({ username, password }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.errors?.join(", ") || "Registration failed")
    this.user = data.user
    this._emit()
    return this.user
  }

  async logout() {
    await fetch("/api/session", {
      method: "DELETE",
      headers: { "X-CSRF-Token": this._csrf() },
    })
    this.user = null
    this._emit()
  }

  _csrf() {
    return document.querySelector("meta[name='csrf-token']")?.content || ""
  }

  _emit() {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { user: this.user } }))
  }
}

const auth = new AuthService()
export default auth
