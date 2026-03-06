import { describe, it, expect, beforeEach } from "vitest"
import { showToast } from "../../services/toast"

describe("showToast", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("creates a toast container on first call", () => {
    showToast("Hello")
    const container = document.querySelector(".fixed.top-4.right-4")
    expect(container).not.toBeNull()
    expect(document.body.contains(container)).toBe(true)
  })

  it("appends a toast element with the message", () => {
    showToast("Test message")
    const toasts = document.querySelectorAll(".pointer-events-auto")
    expect(toasts).toHaveLength(1)
    expect(toasts[0].textContent).toBe("Test message")
  })

  it("uses red background for error type (default)", () => {
    showToast("Error!")
    const toast = document.querySelector(".pointer-events-auto")
    expect(toast?.className).toContain("bg-red-600")
  })

  it("uses green background for success type", () => {
    showToast("Done!", "success")
    const toast = document.querySelector(".pointer-events-auto")
    expect(toast?.className).toContain("bg-green-600")
  })

  it("uses gray background for info type", () => {
    showToast("Info", "info")
    const toast = document.querySelector(".pointer-events-auto")
    expect(toast?.className).toContain("bg-gray-700")
  })

  it("reuses existing container for multiple toasts", () => {
    showToast("First")
    showToast("Second")
    const containers = document.querySelectorAll(".fixed.top-4.right-4")
    expect(containers).toHaveLength(1)
    const toasts = containers[0].querySelectorAll(".pointer-events-auto")
    expect(toasts).toHaveLength(2)
  })
})
