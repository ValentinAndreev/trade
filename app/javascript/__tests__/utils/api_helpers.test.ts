import { describe, it, expect, beforeEach } from "vitest"
import { csrfToken, jsonHeaders } from "../../utils/api_helpers"

describe("csrfToken", () => {
  beforeEach(() => {
    document.head.innerHTML = ""
  })

  it("returns token from meta tag", () => {
    const meta = document.createElement("meta")
    meta.name = "csrf-token"
    meta.content = "abc123"
    document.head.appendChild(meta)
    expect(csrfToken()).toBe("abc123")
  })

  it("returns empty string when meta tag is missing", () => {
    expect(csrfToken()).toBe("")
  })
})

describe("jsonHeaders", () => {
  it("includes Content-Type and CSRF token", () => {
    const meta = document.createElement("meta")
    meta.name = "csrf-token"
    meta.content = "tok"
    document.head.appendChild(meta)

    const headers = jsonHeaders()
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers["X-CSRF-Token"]).toBe("tok")
  })
})
