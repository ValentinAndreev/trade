import { describe, expect, it, vi } from "vitest"
import WorkspaceEvents, { type WorkspaceEventHandlers } from "../../workspace/events"

function handlers(overrides: Partial<WorkspaceEventHandlers> = {}): WorkspaceEventHandlers {
  const noop = vi.fn()
  return {
    onLabelCreated: noop,
    onLineCreated: noop,
    onHLineCreated: noop,
    onVLineCreated: noop,
    onOpenSymbol: noop,
    onDataGridRowClick: noop,
    onDataGridTimeRange: noop,
    onDataGridLoaded: noop,
    onStartLinkedDataRefresh: noop,
    onDataGridColumnStateChanged: noop,
    onOpenSystemStats: noop,
    onSystemStatsRequest: noop,
    onResearchConfigChanged: noop,
    onResearchResultChanged: noop,
    onSystemEditorConfigChanged: noop,
    onSystemEditorCatalogChanged: noop,
    onSystemEditorOpenResearch: noop,
    onSystemEditorOpenAssistant: noop,
    onSystemEditorLinkAssistantTarget: noop,
    onAssistantStateChanged: noop,
    onAssistantOpenDraftInSystemEditor: noop,
    onAssistantApplyDraftToLinkedEditor: noop,
    ...overrides,
  }
}

describe("WorkspaceEvents", () => {
  it("does not leak listeners when connect is called twice", () => {
    const element = document.createElement("main")
    const onLabelCreated = vi.fn()
    const events = new WorkspaceEvents(element, handlers({ onLabelCreated }))

    events.connect()
    events.connect()
    element.dispatchEvent(new CustomEvent("label:created"))

    expect(onLabelCreated).toHaveBeenCalledTimes(1)

    events.disconnect()
    element.dispatchEvent(new CustomEvent("label:created"))
    expect(onLabelCreated).toHaveBeenCalledTimes(1)
  })
})
