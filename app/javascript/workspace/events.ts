type WorkspaceEventHandler = (event: Event) => void
type WorkspaceEventBinding = [eventName: string, handler: WorkspaceEventHandler]

export const WORKSPACE_EVENTS = {
  LABEL_CREATED: "label:created",
  LINE_CREATED: "line:created",
  HLINE_CREATED: "hline:created",
  VLINE_CREATED: "vline:created",
  OPEN_SYMBOL: "tabs:openSymbol",
  DATA_GRID_ROW_CLICK: "datagrid:rowclick",
  DATA_GRID_TIME_RANGE: "datagrid:timerange",
  DATA_GRID_LOADED: "datagrid:loaded",
  START_LINKED_DATA_REFRESH: "tabs:startLinkedDataRefresh",
  DATA_GRID_COLUMN_STATE_CHANGED: "datagrid:columnStateChanged",
  OPEN_SYSTEM_STATS: "datatab:openSystemStats",
  SYSTEM_STATS_REQUEST: "systemstats:requestStats",
  RESEARCH_CONFIG_CHANGED: "research:configChanged",
  RESEARCH_RESULT_CHANGED: "research:resultChanged",
  SYSTEM_EDITOR_CONFIG_CHANGED: "systemeditor:configChanged",
  SYSTEM_EDITOR_CATALOG_CHANGED: "systemeditor:catalogChanged",
  SYSTEM_EDITOR_OPEN_RESEARCH: "systemeditor:openResearch",
  SYSTEM_EDITOR_OPEN_ASSISTANT: "systemeditor:openAssistant",
  SYSTEM_EDITOR_LINK_ASSISTANT_TARGET: "systemeditor:linkAssistantTarget",
  ASSISTANT_STATE_CHANGED: "assistant:stateChanged",
  ASSISTANT_OPEN_DRAFT_IN_SYSTEM_EDITOR: "assistant:openDraftInSystemEditor",
  ASSISTANT_APPLY_DRAFT_TO_LINKED_EDITOR: "assistant:applyDraftToLinkedEditor",
  RESEARCH_RUN: "tabs:runResearch",
  RESEARCH_OPEN_FILE_PICKER: "tabs:openResearchFilePicker",
  RESEARCH_CLOSE_FILE_PICKER: "tabs:closeResearchFilePicker",
  RESEARCH_UPDATE_CONFIG: "tabs:updateResearchConfig",
  RESEARCH_UPDATE_FILE_PICKER_QUERY: "tabs:updateResearchFilePickerQuery",
  RESEARCH_SELECT_FILE_MANAGER_ENTRY: "tabs:selectResearchFileManagerEntry",
  RESEARCH_NAVIGATE_FILE_MANAGER: "tabs:navigateResearchFileManager",
  RESEARCH_CONFIRM_FILE_SELECTION: "tabs:confirmResearchFileSelection",
  RESEARCH_CREATE_DIRECTORY: "tabs:createResearchDirectory",
  RESEARCH_RENAME_ENTRY: "tabs:renameResearchEntry",
  RESEARCH_DELETE_ENTRY: "tabs:deleteResearchEntry",
  RESEARCH_OPEN_SYSTEM_EDITOR: "tabs:openResearchSystemEditor",
} as const

export type WorkspaceEventName = (typeof WORKSPACE_EVENTS)[keyof typeof WORKSPACE_EVENTS]

export interface WorkspaceEventHandlers {
  onLabelCreated: WorkspaceEventHandler
  onLineCreated: WorkspaceEventHandler
  onHLineCreated: WorkspaceEventHandler
  onVLineCreated: WorkspaceEventHandler
  onOpenSymbol: WorkspaceEventHandler
  onDataGridRowClick: WorkspaceEventHandler
  onDataGridTimeRange: WorkspaceEventHandler
  onDataGridLoaded: WorkspaceEventHandler
  onStartLinkedDataRefresh: WorkspaceEventHandler
  onDataGridColumnStateChanged: WorkspaceEventHandler
  onOpenSystemStats: WorkspaceEventHandler
  onSystemStatsRequest: WorkspaceEventHandler
  onResearchConfigChanged: WorkspaceEventHandler
  onResearchResultChanged: WorkspaceEventHandler
  onSystemEditorConfigChanged: WorkspaceEventHandler
  onSystemEditorCatalogChanged: WorkspaceEventHandler
  onSystemEditorOpenResearch: WorkspaceEventHandler
  onSystemEditorOpenAssistant: WorkspaceEventHandler
  onSystemEditorLinkAssistantTarget: WorkspaceEventHandler
  onAssistantStateChanged: WorkspaceEventHandler
  onAssistantOpenDraftInSystemEditor: WorkspaceEventHandler
  onAssistantApplyDraftToLinkedEditor: WorkspaceEventHandler
  onResearchRun: WorkspaceEventHandler
  onResearchOpenFilePicker: WorkspaceEventHandler
  onResearchCloseFilePicker: WorkspaceEventHandler
  onResearchUpdateConfig: WorkspaceEventHandler
  onResearchUpdateFilePickerQuery: WorkspaceEventHandler
  onResearchSelectFileManagerEntry: WorkspaceEventHandler
  onResearchNavigateFileManager: WorkspaceEventHandler
  onResearchConfirmFileSelection: WorkspaceEventHandler
  onResearchCreateDirectory: WorkspaceEventHandler
  onResearchRenameEntry: WorkspaceEventHandler
  onResearchDeleteEntry: WorkspaceEventHandler
  onResearchOpenSystemEditor: WorkspaceEventHandler
}

export default class WorkspaceEvents {
  private bindings: WorkspaceEventBinding[] = []

  constructor(
    private element: Element,
    private handlers: WorkspaceEventHandlers,
  ) {}

  connect(): void {
    this.disconnect()
    this.bindings = [
      [WORKSPACE_EVENTS.LABEL_CREATED, this.handlers.onLabelCreated],
      [WORKSPACE_EVENTS.LINE_CREATED, this.handlers.onLineCreated],
      [WORKSPACE_EVENTS.HLINE_CREATED, this.handlers.onHLineCreated],
      [WORKSPACE_EVENTS.VLINE_CREATED, this.handlers.onVLineCreated],
      [WORKSPACE_EVENTS.OPEN_SYMBOL, this.handlers.onOpenSymbol],
      [WORKSPACE_EVENTS.DATA_GRID_ROW_CLICK, this.handlers.onDataGridRowClick],
      [WORKSPACE_EVENTS.DATA_GRID_TIME_RANGE, this.handlers.onDataGridTimeRange],
      [WORKSPACE_EVENTS.DATA_GRID_LOADED, this.handlers.onDataGridLoaded],
      [WORKSPACE_EVENTS.START_LINKED_DATA_REFRESH, this.handlers.onStartLinkedDataRefresh],
      [WORKSPACE_EVENTS.DATA_GRID_COLUMN_STATE_CHANGED, this.handlers.onDataGridColumnStateChanged],
      [WORKSPACE_EVENTS.OPEN_SYSTEM_STATS, this.handlers.onOpenSystemStats],
      [WORKSPACE_EVENTS.SYSTEM_STATS_REQUEST, this.handlers.onSystemStatsRequest],
      [WORKSPACE_EVENTS.RESEARCH_CONFIG_CHANGED, this.handlers.onResearchConfigChanged],
      [WORKSPACE_EVENTS.RESEARCH_RESULT_CHANGED, this.handlers.onResearchResultChanged],
      [WORKSPACE_EVENTS.SYSTEM_EDITOR_CONFIG_CHANGED, this.handlers.onSystemEditorConfigChanged],
      [WORKSPACE_EVENTS.SYSTEM_EDITOR_CATALOG_CHANGED, this.handlers.onSystemEditorCatalogChanged],
      [WORKSPACE_EVENTS.SYSTEM_EDITOR_OPEN_RESEARCH, this.handlers.onSystemEditorOpenResearch],
      [WORKSPACE_EVENTS.SYSTEM_EDITOR_OPEN_ASSISTANT, this.handlers.onSystemEditorOpenAssistant],
      [WORKSPACE_EVENTS.SYSTEM_EDITOR_LINK_ASSISTANT_TARGET, this.handlers.onSystemEditorLinkAssistantTarget],
      [WORKSPACE_EVENTS.ASSISTANT_STATE_CHANGED, this.handlers.onAssistantStateChanged],
      [WORKSPACE_EVENTS.ASSISTANT_OPEN_DRAFT_IN_SYSTEM_EDITOR, this.handlers.onAssistantOpenDraftInSystemEditor],
      [WORKSPACE_EVENTS.ASSISTANT_APPLY_DRAFT_TO_LINKED_EDITOR, this.handlers.onAssistantApplyDraftToLinkedEditor],
      [WORKSPACE_EVENTS.RESEARCH_RUN, this.handlers.onResearchRun],
      [WORKSPACE_EVENTS.RESEARCH_OPEN_FILE_PICKER, this.handlers.onResearchOpenFilePicker],
      [WORKSPACE_EVENTS.RESEARCH_CLOSE_FILE_PICKER, this.handlers.onResearchCloseFilePicker],
      [WORKSPACE_EVENTS.RESEARCH_UPDATE_CONFIG, this.handlers.onResearchUpdateConfig],
      [WORKSPACE_EVENTS.RESEARCH_UPDATE_FILE_PICKER_QUERY, this.handlers.onResearchUpdateFilePickerQuery],
      [WORKSPACE_EVENTS.RESEARCH_SELECT_FILE_MANAGER_ENTRY, this.handlers.onResearchSelectFileManagerEntry],
      [WORKSPACE_EVENTS.RESEARCH_NAVIGATE_FILE_MANAGER, this.handlers.onResearchNavigateFileManager],
      [WORKSPACE_EVENTS.RESEARCH_CONFIRM_FILE_SELECTION, this.handlers.onResearchConfirmFileSelection],
      [WORKSPACE_EVENTS.RESEARCH_CREATE_DIRECTORY, this.handlers.onResearchCreateDirectory],
      [WORKSPACE_EVENTS.RESEARCH_RENAME_ENTRY, this.handlers.onResearchRenameEntry],
      [WORKSPACE_EVENTS.RESEARCH_DELETE_ENTRY, this.handlers.onResearchDeleteEntry],
      [WORKSPACE_EVENTS.RESEARCH_OPEN_SYSTEM_EDITOR, this.handlers.onResearchOpenSystemEditor],
    ]
    this.bindings.forEach(([name, handler]) => this.element.addEventListener(name, handler))
  }

  disconnect(): void {
    this.bindings.forEach(([name, handler]) => this.element.removeEventListener(name, handler))
    this.bindings = []
  }
}
