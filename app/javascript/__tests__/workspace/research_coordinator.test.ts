import { beforeEach, describe, expect, it, vi } from "vitest"
import ResearchCoordinator from "../../workspace/research_coordinator"
import { fetchResearchCatalog, validateResearchSystem, type ResearchCatalogEntry } from "../../research/dsl"
import { buildDefaultResearchState } from "../../research/state"
import { showToast } from "../../services/toast"
import type TabStore from "../../tabs/store"
import type { Tab } from "../../types/store"

vi.mock("../../research/dsl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../research/dsl")>()
  return {
    ...actual,
    fetchResearchCatalog: vi.fn(),
    validateResearchSystem: vi.fn(),
  }
})

vi.mock("../../services/toast", () => ({
  showToast: vi.fn(),
}))

function researchTab(): Tab {
  return {
    id: "research-1",
    name: null,
    type: "research",
    panels: [],
    researchConfig: buildDefaultResearchState({ symbols: ["BTCUSD"], timeframes: ["1h"], indicators: [] }),
  }
}

function catalogEntry(): ResearchCatalogEntry {
  return {
    id: "demo_system",
    name: "Demo System",
    file_name: "demo.yml",
    relative_path: "systems/demo.yml",
    yaml: "id: demo_system\nname: Demo\n",
    metadata: null,
  }
}

function validationResponse(targets: Array<{ value: string; label: string }> = []): Awaited<ReturnType<typeof validateResearchSystem>> {
  return {
    ok: true,
    diagnostics: [],
    system: {
      id: "demo_system",
      name: "Demo System",
      modules: {},
      params: {},
      conditions: [],
      optimization_targets: targets,
    },
  }
}

function defaultDeps(overrides: Partial<TabStore> = {}) {
  return {
    store: overrides as unknown as TabStore,
    config: { symbols: ["BTCUSD"], timeframes: ["1h"], indicators: [] },
    sidebarTarget: document.createElement("aside"),
    panelsTarget: document.createElement("main"),
    application: { getControllerForElementAndIdentifier: vi.fn() },
    renderFn: vi.fn(),
    revealActiveTab: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("ResearchCoordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reveals a research tab opened from the system editor", () => {
    const tab = researchTab()
    const revealActiveTab = vi.fn()
    const renderFn = vi.fn()
    const coordinator = new ResearchCoordinator({
      ...defaultDeps({
        tabs: [tab],
        activeTab: tab,
        addResearchTab: vi.fn(() => tab),
        updateResearchConfig: vi.fn(),
      }),
      renderFn,
      revealActiveTab,
    })

    coordinator.openFromSystemEditor("demo_system", "systems/demo.yml")

    expect(revealActiveTab).toHaveBeenCalled()
    expect(renderFn).toHaveBeenCalled()
  })

  it("does not render validation results after disconnect", async () => {
    let resolveValidation: (value: Awaited<ReturnType<typeof validateResearchSystem>>) => void = () => {}
    vi.mocked(validateResearchSystem).mockReturnValue(new Promise((resolve) => {
      resolveValidation = resolve
    }))
    const tab = researchTab()
    const updateResearchConfig = vi.fn((tabId: string, updates: Record<string, unknown>) => {
      const target = tab.id === tabId ? tab : null
      if (target?.researchConfig) Object.assign(target.researchConfig, updates)
      return true
    })
    const renderFn = vi.fn()
    const abortController = new AbortController()
    const coordinator = new ResearchCoordinator({
      ...defaultDeps({
        tabs: [tab],
        activeTab: tab,
        addResearchTab: vi.fn(() => tab),
        updateResearchConfig,
      }),
      renderFn,
      signal: abortController.signal,
    })

    coordinator.setCatalogSnapshot({ systems: [catalogEntry()], directories: [] })
    coordinator.openFromSystemEditor("demo_system", "systems/demo.yml")
    abortController.abort()
    resolveValidation(validationResponse([{ value: "profit", label: "Profit" }]))
    await Promise.resolve()

    expect(renderFn).toHaveBeenCalledTimes(1)
    expect(updateResearchConfig).toHaveBeenCalledTimes(1)
  })

  it("drops pending validation when a research tab is removed", async () => {
    let resolveValidation: (value: Awaited<ReturnType<typeof validateResearchSystem>>) => void = () => {}
    vi.mocked(validateResearchSystem).mockReturnValue(new Promise((resolve) => {
      resolveValidation = resolve
    }))
    const tab = researchTab()
    const updateResearchConfig = vi.fn((tabId: string, updates: Record<string, unknown>) => {
      const target = tab.id === tabId ? tab : null
      if (target?.researchConfig) Object.assign(target.researchConfig, updates)
      return true
    })
    const renderFn = vi.fn()
    const coordinator = new ResearchCoordinator({
      ...defaultDeps({
        tabs: [tab],
        activeTab: tab,
        addResearchTab: vi.fn(() => tab),
        updateResearchConfig,
      }),
      renderFn,
    })

    coordinator.setCatalogSnapshot({ systems: [catalogEntry()], directories: [] })
    coordinator.openFromSystemEditor("demo_system", "systems/demo.yml")
    coordinator.onTabRemoved("research-1")
    resolveValidation(validationResponse([{ value: "profit", label: "Profit" }]))
    await Promise.resolve()

    expect(renderFn).toHaveBeenCalledTimes(1)
    expect(updateResearchConfig).toHaveBeenCalledTimes(1)
  })

  it("clears pending validation after a validation error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(validateResearchSystem)
      .mockRejectedValueOnce(new Error("validation failed"))
      .mockResolvedValueOnce(validationResponse())
    const tab = researchTab()
    const renderFn = vi.fn()
    const coordinator = new ResearchCoordinator({
      ...defaultDeps({
        tabs: [tab],
        activeTab: tab,
        addResearchTab: vi.fn(() => tab),
        updateResearchConfig: vi.fn((tabId: string, updates: Record<string, unknown>) => {
          const target = tab.id === tabId ? tab : null
          if (target?.researchConfig) Object.assign(target.researchConfig, updates)
          return true
        }),
      }),
      renderFn,
    })

    coordinator.setCatalogSnapshot({ systems: [catalogEntry()], directories: [] })
    coordinator.openFromSystemEditor("demo_system", "systems/demo.yml")
    await Promise.resolve()
    await Promise.resolve()
    coordinator.prepareActiveRender()
    await Promise.resolve()

    expect(validateResearchSystem).toHaveBeenCalledTimes(2)
    expect(renderFn).toHaveBeenCalledTimes(3)
    expect(consoleError).toHaveBeenCalledWith("Failed to validate research system", expect.any(Error))
    consoleError.mockRestore()
  })

  it("clears stale validation result after a validation error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(validateResearchSystem)
      .mockResolvedValueOnce(validationResponse([{ value: "profit", label: "Profit" }]))
      .mockRejectedValueOnce(new Error("validation failed"))
    const tab = researchTab()
    const coordinator = new ResearchCoordinator({
      ...defaultDeps({
        tabs: [tab],
        activeTab: tab,
        addResearchTab: vi.fn(() => tab),
        updateResearchConfig: vi.fn((tabId: string, updates: Record<string, unknown>) => {
          const target = tab.id === tabId ? tab : null
          if (target?.researchConfig) Object.assign(target.researchConfig, updates)
          return true
        }),
      }),
      renderFn: vi.fn(),
    })

    const firstEntry = catalogEntry()
    const secondEntry = { ...catalogEntry(), yaml: "id: demo_system\nname: Changed\n" }
    const firstValidation = validationResponse([{ value: "profit", label: "Profit" }])
    coordinator.setCatalogSnapshot({ systems: [firstEntry], directories: [] })
    coordinator.openFromSystemEditor("demo_system", "systems/demo.yml")
    coordinator.prepareActiveRender()
    await Promise.resolve()

    expect(coordinator.prepareActiveRender()).toEqual(firstValidation!.system)

    coordinator.setCatalogSnapshot({ systems: [secondEntry], directories: [] })
    coordinator.prepareActiveRender()
    await Promise.resolve()
    await Promise.resolve()

    expect(coordinator.prepareActiveRender()).toBeNull()
    consoleError.mockRestore()
  })

  it("does not apply refreshed catalog after abort", async () => {
    let resolveCatalog: (value: Awaited<ReturnType<typeof fetchResearchCatalog>>) => void = () => {}
    vi.mocked(fetchResearchCatalog).mockReturnValue(new Promise((resolve) => {
      resolveCatalog = resolve
    }))
    const abortController = new AbortController()
    const coordinator = new ResearchCoordinator({
      ...defaultDeps({
        tabs: [],
        activeTab: undefined,
        updateResearchConfig: vi.fn(),
      }),
      signal: abortController.signal,
    })

    const refresh = coordinator.refreshCatalog()
    abortController.abort()
    resolveCatalog({ systems: [catalogEntry()], directories: ["systems"] })
    await refresh

    expect(coordinator.getCatalog()).toEqual([])
    expect(coordinator.getDirectories()).toEqual([])
  })

  it("deduplicates parallel catalog refreshes", async () => {
    let resolveCatalog: (value: Awaited<ReturnType<typeof fetchResearchCatalog>>) => void = () => {}
    vi.mocked(fetchResearchCatalog).mockReturnValue(new Promise((resolve) => {
      resolveCatalog = resolve
    }))
    const coordinator = new ResearchCoordinator({
      ...defaultDeps({
        tabs: [],
        activeTab: undefined,
        updateResearchConfig: vi.fn(),
      }),
    })

    const first = coordinator.refreshCatalog()
    const second = coordinator.refreshCatalog()
    resolveCatalog({ systems: [catalogEntry()], directories: ["systems"] })
    await Promise.all([first, second])

    expect(fetchResearchCatalog).toHaveBeenCalledTimes(1)
    expect(coordinator.getCatalog()).toEqual([catalogEntry()])
    expect(coordinator.getDirectories()).toEqual(["systems"])
  })

  it("shows toast on catalog refresh error", async () => {
    vi.mocked(fetchResearchCatalog).mockRejectedValueOnce(new Error("network error"))
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const coordinator = new ResearchCoordinator({
      ...defaultDeps({
        tabs: [],
        activeTab: undefined,
        updateResearchConfig: vi.fn(),
      }),
    })

    await coordinator.refreshCatalog()

    expect(showToast).toHaveBeenCalledWith("Failed to refresh research catalog", "error")
    consoleError.mockRestore()
  })
})
