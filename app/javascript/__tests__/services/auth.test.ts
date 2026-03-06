import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../utils/api_helpers", () => ({
  csrfToken: () => "test-csrf",
  jsonHeaders: () => ({ "Content-Type": "application/json", "X-CSRF-Token": "test-csrf" }),
}))

describe("AuthService", () => {
  let auth: any

  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.stubGlobal("fetch", vi.fn())
    const mod = await import("../../services/auth")
    auth = mod.default
    auth.user = null
    auth._ready = false
  })

  describe("init", () => {
    it("sets user from /api/session when ok", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ user: { id: 1, username: "alice" } }), { status: 200 })
      )

      await auth.init()
      expect(auth.user).toEqual({ id: 1, username: "alice" })
      expect(auth._ready).toBe(true)
    })

    it("stays null when fetch fails", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("offline"))

      await auth.init()
      expect(auth.user).toBeNull()
      expect(auth._ready).toBe(true)
    })

    it("stays null when response not ok", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 401 }))

      await auth.init()
      expect(auth.user).toBeNull()
      expect(auth._ready).toBe(true)
    })
  })

  describe("login", () => {
    it("sets user and dispatches event on success", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ user: { id: 2, username: "bob" } }), { status: 200 })
      )
      const eventSpy = vi.fn()
      window.addEventListener("auth:change", eventSpy)

      const user = await auth.login("bob", "pass123")
      expect(user).toEqual({ id: 2, username: "bob" })
      expect(auth.user).toEqual({ id: 2, username: "bob" })
      expect(eventSpy).toHaveBeenCalled()

      window.removeEventListener("auth:change", eventSpy)
    })

    it("throws on failure", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 })
      )
      await expect(auth.login("bad", "wrong")).rejects.toThrow("Invalid credentials")
    })
  })

  describe("register", () => {
    it("sets user on success", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ user: { id: 3, username: "carol" } }), { status: 201 })
      )

      const user = await auth.register("carol", "secret")
      expect(user).toEqual({ id: 3, username: "carol" })
      expect(auth.user).toEqual({ id: 3, username: "carol" })
    })

    it("throws with joined errors on failure", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ errors: ["too short", "taken"] }), { status: 422 })
      )
      await expect(auth.register("x", "y")).rejects.toThrow("too short, taken")
    })
  })

  describe("logout", () => {
    it("clears user and dispatches event", async () => {
      auth.user = { id: 1, username: "alice" }
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }))
      const eventSpy = vi.fn()
      window.addEventListener("auth:change", eventSpy)

      await auth.logout()
      expect(auth.user).toBeNull()
      expect(eventSpy).toHaveBeenCalled()

      window.removeEventListener("auth:change", eventSpy)
    })
  })

  describe("isLoggedIn", () => {
    it("returns false when user is null", () => {
      expect(auth.isLoggedIn).toBe(false)
    })

    it("returns true when user is set", () => {
      auth.user = { id: 1, username: "test" }
      expect(auth.isLoggedIn).toBe(true)
    })
  })
})
