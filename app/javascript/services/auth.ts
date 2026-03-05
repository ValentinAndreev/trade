import { csrfToken, jsonHeaders } from "../utils/api_helpers"
import type { UserInfo } from "../types/markets"

const AUTH_EVENT = "auth:change"

class AuthService {
  user: UserInfo | null
  _ready: boolean

  constructor() {
    this.user = null
    this._ready = false
  }

  get isLoggedIn() {
    return !!this.user
  }

  async init(): Promise<void> {
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

  async login(username: string, password: string): Promise<UserInfo> {
    const resp = await fetch("/api/session", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ username, password }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || "Login failed")
    this.user = data.user as UserInfo
    this._emit()
    return this.user
  }

  async register(username: string, password: string): Promise<UserInfo> {
    const resp = await fetch("/api/registration", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ username, password }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.errors?.join(", ") || "Registration failed")
    this.user = data.user as UserInfo
    this._emit()
    return this.user
  }

  async logout(): Promise<void> {
    await fetch("/api/session", {
      method: "DELETE",
      headers: { "X-CSRF-Token": csrfToken() },
    })
    this.user = null
    this._emit()
  }

  _emit() {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { user: this.user } }))
  }
}

const auth = new AuthService()
export default auth
