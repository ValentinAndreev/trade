type WorkspaceEventHandler = (event: Event) => void
type WorkspaceEventBinding = [eventName: string, handler: WorkspaceEventHandler]

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
      ["label:created", this.handlers.onLabelCreated],
      ["line:created", this.handlers.onLineCreated],
      ["hline:created", this.handlers.onHLineCreated],
      ["vline:created", this.handlers.onVLineCreated],
      ["tabs:openSymbol", this.handlers.onOpenSymbol],
      ["datagrid:rowclick", this.handlers.onDataGridRowClick],
      ["datagrid:timerange", this.handlers.onDataGridTimeRange],
      ["datagrid:loaded", this.handlers.onDataGridLoaded],
      ["tabs:startLinkedDataRefresh", this.handlers.onStartLinkedDataRefresh],
      ["datagrid:columnStateChanged", this.handlers.onDataGridColumnStateChanged],
      ["datatab:openSystemStats", this.handlers.onOpenSystemStats],
      ["systemstats:requestStats", this.handlers.onSystemStatsRequest],
      ["research:configChanged", this.handlers.onResearchConfigChanged],
      ["research:resultChanged", this.handlers.onResearchResultChanged],
      ["systemeditor:configChanged", this.handlers.onSystemEditorConfigChanged],
      ["systemeditor:catalogChanged", this.handlers.onSystemEditorCatalogChanged],
      ["systemeditor:openResearch", this.handlers.onSystemEditorOpenResearch],
      ["systemeditor:openAssistant", this.handlers.onSystemEditorOpenAssistant],
      ["systemeditor:linkAssistantTarget", this.handlers.onSystemEditorLinkAssistantTarget],
      ["assistant:stateChanged", this.handlers.onAssistantStateChanged],
      ["assistant:openDraftInSystemEditor", this.handlers.onAssistantOpenDraftInSystemEditor],
      ["assistant:applyDraftToLinkedEditor", this.handlers.onAssistantApplyDraftToLinkedEditor],
    ]
    this.bindings.forEach(([name, handler]) => this.element.addEventListener(name, handler))
  }

  disconnect(): void {
    this.bindings.forEach(([name, handler]) => this.element.removeEventListener(name, handler))
    this.bindings = []
  }
}
