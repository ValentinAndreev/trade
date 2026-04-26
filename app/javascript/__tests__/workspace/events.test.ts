import { describe, expect, it, vi } from "vitest"
import WorkspaceEvents, { WORKSPACE_EVENTS, type WorkspaceEventHandlers } from "../../workspace/events"

const EVENT_HANDLER_PAIRS = [
  [WORKSPACE_EVENTS.LABEL_CREATED, "onLabelCreated"],
  [WORKSPACE_EVENTS.LINE_CREATED, "onLineCreated"],
  [WORKSPACE_EVENTS.HLINE_CREATED, "onHLineCreated"],
  [WORKSPACE_EVENTS.VLINE_CREATED, "onVLineCreated"],
  [WORKSPACE_EVENTS.OPEN_SYMBOL, "onOpenSymbol"],
  [WORKSPACE_EVENTS.DATA_GRID_ROW_CLICK, "onDataGridRowClick"],
  [WORKSPACE_EVENTS.DATA_GRID_TIME_RANGE, "onDataGridTimeRange"],
  [WORKSPACE_EVENTS.DATA_GRID_LOADED, "onDataGridLoaded"],
  [WORKSPACE_EVENTS.START_LINKED_DATA_REFRESH, "onStartLinkedDataRefresh"],
  [WORKSPACE_EVENTS.DATA_GRID_COLUMN_STATE_CHANGED, "onDataGridColumnStateChanged"],
  [WORKSPACE_EVENTS.OPEN_SYSTEM_STATS, "onOpenSystemStats"],
  [WORKSPACE_EVENTS.SYSTEM_STATS_REQUEST, "onSystemStatsRequest"],
  [WORKSPACE_EVENTS.RESEARCH_CONFIG_CHANGED, "onResearchConfigChanged"],
  [WORKSPACE_EVENTS.RESEARCH_RESULT_CHANGED, "onResearchResultChanged"],
  [WORKSPACE_EVENTS.SYSTEM_EDITOR_CONFIG_CHANGED, "onSystemEditorConfigChanged"],
  [WORKSPACE_EVENTS.SYSTEM_EDITOR_CATALOG_CHANGED, "onSystemEditorCatalogChanged"],
  [WORKSPACE_EVENTS.SYSTEM_EDITOR_OPEN_RESEARCH, "onSystemEditorOpenResearch"],
  [WORKSPACE_EVENTS.SYSTEM_EDITOR_OPEN_ASSISTANT, "onSystemEditorOpenAssistant"],
  [WORKSPACE_EVENTS.SYSTEM_EDITOR_LINK_ASSISTANT_TARGET, "onSystemEditorLinkAssistantTarget"],
  [WORKSPACE_EVENTS.ASSISTANT_STATE_CHANGED, "onAssistantStateChanged"],
  [WORKSPACE_EVENTS.ASSISTANT_OPEN_DRAFT_IN_SYSTEM_EDITOR, "onAssistantOpenDraftInSystemEditor"],
  [WORKSPACE_EVENTS.ASSISTANT_APPLY_DRAFT_TO_LINKED_EDITOR, "onAssistantApplyDraftToLinkedEditor"],
  [WORKSPACE_EVENTS.RESEARCH_RUN, "onResearchRun"],
  [WORKSPACE_EVENTS.RESEARCH_OPEN_FILE_PICKER, "onResearchOpenFilePicker"],
  [WORKSPACE_EVENTS.RESEARCH_CLOSE_FILE_PICKER, "onResearchCloseFilePicker"],
  [WORKSPACE_EVENTS.RESEARCH_UPDATE_CONFIG, "onResearchUpdateConfig"],
  [WORKSPACE_EVENTS.RESEARCH_UPDATE_FILE_PICKER_QUERY, "onResearchUpdateFilePickerQuery"],
  [WORKSPACE_EVENTS.RESEARCH_SELECT_FILE_MANAGER_ENTRY, "onResearchSelectFileManagerEntry"],
  [WORKSPACE_EVENTS.RESEARCH_NAVIGATE_FILE_MANAGER, "onResearchNavigateFileManager"],
  [WORKSPACE_EVENTS.RESEARCH_CONFIRM_FILE_SELECTION, "onResearchConfirmFileSelection"],
  [WORKSPACE_EVENTS.RESEARCH_CREATE_DIRECTORY, "onResearchCreateDirectory"],
  [WORKSPACE_EVENTS.RESEARCH_RENAME_ENTRY, "onResearchRenameEntry"],
  [WORKSPACE_EVENTS.RESEARCH_DELETE_ENTRY, "onResearchDeleteEntry"],
  [WORKSPACE_EVENTS.RESEARCH_OPEN_SYSTEM_EDITOR, "onResearchOpenSystemEditor"],
] as const satisfies ReadonlyArray<readonly [string, keyof WorkspaceEventHandlers]>

function buildHandlers(): WorkspaceEventHandlers {
  return Object.fromEntries(
    EVENT_HANDLER_PAIRS.map(([, handlerName]) => [handlerName, vi.fn()])
  ) as unknown as WorkspaceEventHandlers
}

describe("WorkspaceEvents", () => {
  it("does not leak listeners when connect is called twice", () => {
    const element = document.createElement("main")
    const onLabelCreated = vi.fn()
    const events = new WorkspaceEvents(element, { ...buildHandlers(), onLabelCreated })

    events.connect()
    events.connect()
    element.dispatchEvent(new CustomEvent(WORKSPACE_EVENTS.LABEL_CREATED))

    expect(onLabelCreated).toHaveBeenCalledTimes(1)

    events.disconnect()
    element.dispatchEvent(new CustomEvent(WORKSPACE_EVENTS.LABEL_CREATED))
    expect(onLabelCreated).toHaveBeenCalledTimes(1)
  })

  it("routes every workspace event to its matching handler", () => {
    const element = document.createElement("main")
    const handlers = buildHandlers()
    const events = new WorkspaceEvents(element, handlers)

    events.connect()

    for (const [eventName, handlerName] of EVENT_HANDLER_PAIRS) {
      element.dispatchEvent(new CustomEvent(eventName))
      expect(handlers[handlerName]).toHaveBeenCalledTimes(1)
    }
  })
})
