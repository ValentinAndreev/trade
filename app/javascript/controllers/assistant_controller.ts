import { Controller } from "@hotwired/stimulus"
import {
  checkLlmConnection,
  createAssistantChat,
  deleteAssistantChat,
  fetchAssistantChat,
  fetchAssistantChats,
  fetchLlmSettings,
  launchLlamaServer,
  renameAssistantChat,
  saveLlmSettings,
  sendAssistantMessage,
  stopLlamaServer,
  type AssistantChatMessage,
  type AssistantChatPayload,
  type AssistantChatSummary,
  type AssistantDraftPayload,
  type AssistantEditorContextPayload,
  type LlmConnectionCheckPayload,
  type LlmSettingsDraft,
  type LlmSettingsPayload,
} from "../assistant/api"
import monitor from "../services/connection_monitor"
import { showToast } from "../services/toast"
import { AssistantChatSubscription } from "../assistant/chat_subscription"
import { renderAssistantHTML } from "../assistant/templates"
import type { AssistantWorkspaceSnapshot, WorkspaceAssistantState } from "../types/store"
import { buildDefaultWorkspaceAssistantState, hydrateWorkspaceAssistantState } from "../assistant/state"

type ConfirmDialogState = {
  action: "delete-chat" | "apply-draft-overwrite"
  tone: "danger" | "warning"
  title: string
  body: string
  confirmLabel: string
}

type RenameDialogState = {
  title: string
  body: string
  confirmLabel: string
  value: string
}

type PendingDraftAction = {
  type: "apply-linked"
  draft: AssistantDraftPayload
  messageId: number | null
}

export default class extends Controller {
  static values = {
    tabId: String,
    state: String,
    workspaceSnapshot: String,
    linkedTargetContext: String,
  }

  declare tabIdValue: string
  declare stateValue: string
  declare workspaceSnapshotValue: string
  declare linkedTargetContextValue: string

  private assistantState: WorkspaceAssistantState = buildDefaultWorkspaceAssistantState()
  private workspaceSnapshot: AssistantWorkspaceSnapshot = { activeTabId: null, tabs: [] }
  private linkedTargetContext: AssistantEditorContextPayload | null = null

  private assistantChats: AssistantChatSummary[] = []
  private assistantCurrentChat: AssistantChatSummary | null = null
  private assistantMessages: AssistantChatMessage[] = []
  private assistantInput = ""
  private assistantLoading = false
  private assistantChatsLoading = false
  private assistantError: string | null = null
  private assistantSettings: LlmSettingsPayload | null = null
  private assistantSettingsDraft: LlmSettingsDraft | null = null
  private assistantSettingsOpen = false
  private assistantSettingsSaving = false
  private assistantConnectionCheck: LlmConnectionCheckPayload | null = null
  private assistantConnectionChecking = false
  private assistantLaunchStarting = false
  private assistantLaunchStopping = false
  private assistantScrollToBottomPending = false
  private assistantScrollSnapshot: { top: number; pinnedToBottom: boolean } | null = null
  private assistantChatSubscription: AssistantChatSubscription | null = null
  private assistantSubscribedChatId: number | null = null
  private assistantExpandedReasoningIds = new Set<number>()
  private renameDialog: RenameDialogState | null = null
  private confirmDialog: ConfirmDialogState | null = null
  private pendingDraftAction: PendingDraftAction | null = null

  private _onConnectionChange = () => {
    this._renderSafely()
    if (monitor.isOnline) {
      void this._loadAssistantSettings()
      void this._loadAssistantChats()
    }
  }

  private _onKeydown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return
    if (this.confirmDialog) { this.closeConfirmDialog(); return }
    if (this.renameDialog) { this.closeRenameDialog(); return }
    if (this.assistantSettingsOpen) { this.closeAssistantSettings(); return }
  }

  async connect() {
    this.assistantState = this._parsedAssistantState()
    this.workspaceSnapshot = this._parsedWorkspaceSnapshot()
    this.linkedTargetContext = this._parsedLinkedTargetContext()

    this.element.innerHTML = `<div class="flex h-full items-center justify-center text-sm text-gray-500 animate-pulse">Loading assistant...</div>`
    window.addEventListener("connection:change", this._onConnectionChange)
    window.addEventListener("keydown", this._onKeydown)

    this._renderSafely()
    await Promise.allSettled([
      this._loadAssistantSettings(),
      this._loadAssistantChats(),
    ])
  }

  disconnect() {
    this._disconnectAssistantChatSubscription()
    window.removeEventListener("connection:change", this._onConnectionChange)
    window.removeEventListener("keydown", this._onKeydown)
  }

  stateValueChanged() {
    const previous = this.assistantState
    const next = this._parsedAssistantState()
    if (JSON.stringify(previous) === JSON.stringify(next)) return

    this.assistantState = next
    this._renderSafely()

    if (previous.currentChatId !== next.currentChatId) {
      // Always clear immediately so stale subscription callbacks cannot overwrite
      // the new selection while the async load is in flight.
      this.assistantCurrentChat = null
      this.assistantMessages = []
      this.assistantExpandedReasoningIds.clear()
      this._disconnectAssistantChatSubscription()
      this._renderSafely()

      if (next.currentChatId) {
        void this._loadAssistantChat(next.currentChatId)
      }
    }
    if (previous.provider !== next.provider) {
      void this._loadAssistantSettings(true)
    }
  }

  workspaceSnapshotValueChanged() {
    this.workspaceSnapshot = this._parsedWorkspaceSnapshot()
    this._renderSafely()
  }

  linkedTargetContextValueChanged() {
    this.linkedTargetContext = this._parsedLinkedTargetContext()
    this._renderSafely()
  }

  async openAssistantSettings() {
    if (!this.assistantSettings) await this._loadAssistantSettings()
    this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    this.assistantSettingsOpen = true
    this._renderSafely()
  }

  closeAssistantSettings() {
    this.assistantSettingsOpen = false
    this.assistantConnectionCheck = null
    this._renderSafely()
  }

  closeConfirmDialog() {
    this.confirmDialog = null
    this.pendingDraftAction = null
    this._renderSafely()
  }

  closeRenameDialog() {
    this.renameDialog = null
    this._renderSafely()
  }

  clearLinkedTarget() {
    this.assistantState.linkedTarget = null
    this._dispatchStateChanged()
    this._renderSafely()
  }

  linkWorkspaceTarget(e: Event) {
    const target = e.currentTarget as HTMLElement
    const tabId = target.dataset.tabId || ""
    const tabType = target.dataset.tabType || ""
    if (!tabId || tabType !== "system_editor") return
    if (this.assistantState.linkedTarget?.type === "system_editor" && this.assistantState.linkedTarget.tabId === tabId) return

    this.assistantState.linkedTarget = { type: "system_editor", tabId }
    // Clear the active chat so the new editor's context doesn't inherit a conversation
    // that was started under a different linked target.
    this.assistantState.currentChatId = null
    this._dispatchStateChanged()
    this._renderSafely()
    showToast("Assistant linked target updated", "success")
  }

  stopAssistantSettingsPropagation(e: Event) {
    e.stopPropagation()
  }

  stopConfirmDialogPropagation(e: Event) {
    e.stopPropagation()
  }

  stopRenameDialogPropagation(e: Event) {
    e.stopPropagation()
  }

  async confirmDialogAction() {
    if (!this.confirmDialog) return

    const action = this.confirmDialog.action
    this.confirmDialog = null
    this._renderSafely()

    if (action === "delete-chat") {
      await this._performDeleteAssistantChat()
      return
    }

    if (action === "apply-draft-overwrite") {
      this._commitPendingDraftAction()
    }
  }

  updateAssistantSettingsField(e: Event) {
    if (!this.assistantSettingsDraft) {
      this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    }

    const target = e.currentTarget as HTMLInputElement | HTMLSelectElement
    const field = target.dataset.field || ""
    const value = target.value
    this.assistantConnectionCheck = null

    switch (field) {
    case "assistantSettings.provider":
      this.assistantState.provider = value || null
      this._dispatchStateChanged()
      this.assistantSettingsDraft = this._assistantSettingsDraftValue(value)
      this._renderSafely()
      void this._loadAssistantSettings(true)
      break
    case "assistantSettings.model":
      this.assistantSettingsDraft.model = value
      break
    case "assistantSettings.apiKey":
      this.assistantSettingsDraft.api_key = value
      break
    case "assistantSettings.apiBase":
      this.assistantSettingsDraft.api_base = value
      break
    case "assistantSettings.temperature":
      this.assistantSettingsDraft.temperature = value
      break
    case "assistantSettings.maxOutputTokens":
      this.assistantSettingsDraft.max_output_tokens = value
      break
    case "assistantSettings.launchBinaryPath":
      this.assistantSettingsDraft.launch_binary_path = value
      break
    case "assistantSettings.launchModelPath":
      this.assistantSettingsDraft.launch_model_path = value
      break
    case "assistantSettings.launchBindHost":
      this.assistantSettingsDraft.launch_bind_host = value
      break
    case "assistantSettings.launchClientHost":
      this.assistantSettingsDraft.launch_client_host = value
      break
    case "assistantSettings.launchPort":
      this.assistantSettingsDraft.launch_port = value
      break
    case "assistantSettings.launchExtraArgs":
      this.assistantSettingsDraft.launch_extra_args = value
      break
    default:
      break
    }
  }

  async checkAssistantConnection() {
    if (!this.assistantSettingsDraft) {
      this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    }

    this.assistantConnectionChecking = true
    this.assistantConnectionCheck = null
    this._renderSafely()

    try {
      const result = await checkLlmConnection(this.assistantSettingsDraft)
      if (!result.ok || !result.data) {
        this.assistantError = result.error || "Connection check failed"
        showToast(this.assistantError)
        return
      }

      this.assistantConnectionCheck = result.data.connection
      this.assistantError = null
      showToast(result.data.connection.ok ? "LLM endpoint is reachable" : (result.data.connection.error || "LLM endpoint is not reachable"), result.data.connection.ok ? "success" : "error")
    } finally {
      this.assistantConnectionChecking = false
      this._renderSafely()
    }
  }

  async launchAssistantServer() {
    if (!this.assistantSettingsDraft) {
      this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    }

    this.assistantLaunchStarting = true
    this._renderSafely()

    try {
      const result = await launchLlamaServer(this.assistantSettingsDraft)
      if (!result.ok || !result.data) {
        this.assistantError = result.error || "Server launch failed"
        showToast(this.assistantError)
        return
      }

      this.assistantSettings = result.data
      this.assistantSettingsDraft = this._assistantSettingsDraftValue(result.data.setting.provider)
      this.assistantError = null
      this.assistantConnectionCheck = null
      showToast(result.data.launch_status?.message || "llama.cpp server started", "success")
    } finally {
      this.assistantLaunchStarting = false
      this._renderSafely()
    }
  }

  async stopAssistantServer() {
    const provider = this.assistantSettingsDraft?.provider || this._selectedAssistantProvider()
    if (!provider) return

    this.assistantLaunchStopping = true
    this._renderSafely()

    try {
      const result = await stopLlamaServer(provider)
      if (!result.ok || !result.data) {
        this.assistantError = result.error || "Server stop failed"
        showToast(this.assistantError)
        return
      }

      this.assistantSettings = result.data
      this.assistantSettingsDraft = this._assistantSettingsDraftValue(result.data.setting.provider)
      this.assistantError = null
      this.assistantConnectionCheck = null
      showToast(result.data.launch_status?.message || "llama.cpp server stopped", "success")
    } finally {
      this.assistantLaunchStopping = false
      this._renderSafely()
    }
  }

  async saveAssistantSettings() {
    if (!this.assistantSettingsDraft) {
      this.assistantSettingsDraft = this._assistantSettingsDraftValue()
    }

    this.assistantSettingsSaving = true
    this._renderSafely()

    try {
      const result = await saveLlmSettings(this.assistantSettingsDraft)
      if (!result.ok || !result.data) {
        this.assistantError = result.error || "Settings save failed"
        showToast(this.assistantError)
        return
      }

      this.assistantSettings = result.data
      this.assistantState.provider = result.data.setting.provider || null
      this.assistantSettingsDraft = this._assistantSettingsDraftValue(result.data.setting.provider)
      this.assistantSettingsOpen = false
      this.assistantError = null
      this._dispatchStateChanged()
      this._renderSafely()
      showToast("Assistant settings saved", "success")
    } finally {
      this.assistantSettingsSaving = false
      this._renderSafely()
    }
  }

  updateAssistantInput(e: Event) {
    this.assistantInput = (e.currentTarget as HTMLTextAreaElement).value
    this._syncAssistantSendButton()
  }

  handleAssistantInputKeydown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return
    e.preventDefault()
    void this.sendAssistantMessage()
  }

  async createAssistantChat() {
    if (!this._assistantConfigured()) {
      this.openAssistantSettings()
      return
    }

    const chat = await this._createAssistantChat()
    if (!chat) return

    this._applyAssistantChatPayload(chat)
    this._renderSafely()
  }

  async selectAssistantChat(e: Event) {
    const chatId = Number((e.currentTarget as HTMLSelectElement).value)
    if (!chatId) {
      this._clearAssistantSelection()
      this._renderSafely()
      return
    }

    await this._loadAssistantChat(chatId)
  }

  async renameAssistantChat() {
    if (!this.assistantCurrentChat) return

    this.renameDialog = {
      title: "Rename saved chat",
      body: "Update the title for this conversation.",
      confirmLabel: "Save title",
      value: this.assistantCurrentChat.title,
    }
    this._renderSafely()
  }

  deleteAssistantChat() {
    if (!this.assistantCurrentChat) return

    this.confirmDialog = {
      action: "delete-chat",
      tone: "danger",
      title: "Delete saved chat?",
      body: `The chat "${this.assistantCurrentChat.title}" will be removed from local history. This action cannot be undone.`,
      confirmLabel: "Delete chat",
    }
    this._renderSafely()
  }

  toggleAssistantReasoning(e: Event) {
    const details = e.currentTarget as HTMLDetailsElement
    const messageId = Number(details.dataset.messageId)
    if (!messageId) return

    if (details.open) {
      this.assistantExpandedReasoningIds.add(messageId)
    } else {
      this.assistantExpandedReasoningIds.delete(messageId)
    }
  }

  updateRenameDialogValue(e: Event) {
    if (!this.renameDialog) return

    this.renameDialog.value = (e.currentTarget as HTMLInputElement).value
    this._renderSafely()
  }

  handleRenameDialogKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return

    e.preventDefault()
    void this.submitRenameDialog()
  }

  async submitRenameDialog() {
    if (!this.assistantCurrentChat || !this.renameDialog) return

    const nextTitle = this.renameDialog.value.trim()
    const currentTitle = this.assistantCurrentChat.title
    this.renameDialog = null
    this._renderSafely()

    if (!nextTitle || nextTitle === currentTitle) return

    const result = await renameAssistantChat(this.assistantCurrentChat.id, nextTitle)
    if (!result.ok || !result.data) {
      this.assistantError = result.error || "Chat rename failed"
      showToast(this.assistantError)
      this._renderSafely()
      return
    }

    this._applyAssistantChatPayload(result.data)
    this._renderSafely()
    showToast("Chat renamed", "success")
  }

  async sendAssistantMessage() {
    if (this.assistantLoading) return

    const content = this.assistantInput.trim()
    if (!content) return

    if (!this._assistantConfigured()) {
      this.openAssistantSettings()
      return
    }

    const currentChat = this.assistantCurrentChat
    // Fall back to persisted currentChatId so a message sent before the initial
    // fetchAssistantChat resolves continues the existing chat rather than opening a new one.
    const currentChatId = currentChat?.id ?? this.assistantState.currentChatId ?? null
    const chatPayload = currentChatId ? null : await this._createAssistantChat()
    const chatId = currentChatId ?? chatPayload?.chat.id
    if (!chatId) return

    if (chatPayload) {
      this._applyAssistantChatPayload(chatPayload)
    }

    this.assistantInput = ""
    this._appendOptimisticUserMessage(content)
    this.assistantLoading = true
    this.assistantError = null
    this.assistantScrollToBottomPending = true
    this._renderSafely()
    await this._ensureAssistantChatSubscription(chatId)

    try {
      const result = await sendAssistantMessage(chatId, {
        provider: this._selectedAssistantProvider(),
        content,
        assistant_context: this._assistantContextPayload(),
      })

      if (!result.ok || !result.data) {
        this._dropOptimisticUserMessages()
        this.assistantInput = content
        this.assistantError = result.error || "Assistant request failed"
        showToast(this.assistantError)
        return
      }

      this._applyAssistantChatPayload(result.data)
      this._renderSafely()
    } finally {
      this.assistantLoading = false
      this._renderSafely()
    }
  }

  applyAssistantMessageDraft(e: Event) {
    const messageId = Number((e.currentTarget as HTMLElement).dataset.messageId)
    if (!messageId) return

    const message = this.assistantMessages.find(item => item.id === messageId)
    const draft = this._assistantDraftFromMetadata(message?.metadata)
    if (!draft) return

    this._applyAssistantDraft(draft, messageId)
  }

  openAssistantMessageDraftInSystemEditor(e: Event) {
    const messageId = Number((e.currentTarget as HTMLElement).dataset.messageId)
    if (!messageId) return

    const message = this.assistantMessages.find(item => item.id === messageId)
    const draft = this._assistantDraftFromMetadata(message?.metadata)
    if (!draft) return

    this._openAssistantDraftInSystemEditor(draft, messageId)
  }

  openAssistantYamlSnippetInSystemEditor(e: Event) {
    const encodedYaml = (e.currentTarget as HTMLElement).dataset.yaml
    const messageId = Number((e.currentTarget as HTMLElement).dataset.messageId || 0) || null
    if (!encodedYaml) return

    const yaml = decodeURIComponent(encodedYaml)
    const draft = this._draftFromYaml(yaml)
    this._openAssistantDraftInSystemEditor(draft, messageId)
  }

  private _draftFromYaml(yaml: string): AssistantDraftPayload {
    return {
      kind: "system_draft",
      yaml,
      source_yaml_hash: null,
      validation: {
        ok: false,
        diagnostics: [],
        system: null,
      },
      suggested_target: null,
    }
  }

  private _applyAssistantDraft(draft: AssistantDraftPayload, messageId: number | null) {
    if (!this.assistantState.linkedTarget || !this.linkedTargetContext) {
      showToast("Link a system editor or open the draft in a new editor first")
      return
    }

    // Guard: draft provenance doesn't match the currently linked editor.
    // Covers two cases: draft targets a known different system, or draft has no target
    // metadata at all (created in unlinked/system_design mode).
    if (!this._draftTargetMatchesLinkedTarget(draft)) {
      this.pendingDraftAction = { type: "apply-linked", draft, messageId }
      const noProvenance = !draft.suggested_target
      this.confirmDialog = {
        action: "apply-draft-overwrite",
        tone: "danger",
        title: noProvenance ? "Draft has no linked editor context" : "Draft targets a different system",
        body: noProvenance
          ? "This draft was created without a linked editor. Applying it may overwrite the wrong system."
          : "This draft was generated for a different system than the one currently linked. Applying it will overwrite the wrong editor buffer.",
        confirmLabel: "Apply anyway",
      }
      this._renderSafely()
      return
    }

    const currentHash = this.linkedTargetContext.yaml_hash
    const sourceHash = draft.source_yaml_hash
    if (sourceHash && currentHash && sourceHash !== currentHash) {
      this.pendingDraftAction = { type: "apply-linked", draft, messageId }
      this.confirmDialog = {
        action: "apply-draft-overwrite",
        tone: "warning",
        title: "Overwrite linked editor with assistant draft?",
        body: "The linked editor changed after this draft was generated. Applying it now will replace the current YAML buffer.",
        confirmLabel: "Apply draft",
      }
      this._renderSafely()
      return
    }

    this._commitApplyDraft(draft, messageId)
  }

  // Returns false when the draft should not be silently applied to the linked editor.
  // Two failure modes:
  //   1. No suggested_target — draft was created in unlinked mode, no provenance.
  //   2. suggested_target unambiguously identifies a different system.
  // AssistantTarget only carries a tabId; we resolve it from workspaceSnapshot to get
  // systemId / sourcePath. Both sides must have a value for a mismatch to be conclusive.
  private _draftTargetMatchesLinkedTarget(draft: AssistantDraftPayload): boolean {
    const suggestedTarget = draft.suggested_target
    const linkedTarget = this.assistantState.linkedTarget
    if (!linkedTarget) return true           // no linked editor — nothing to protect
    if (!suggestedTarget) return false       // no provenance — require confirmation

    const linkedTab = this.workspaceSnapshot.tabs.find(tab => tab.id === linkedTarget.tabId)
    if (!linkedTab) return false // tab no longer in snapshot — stale state, require confirmation

    if (suggestedTarget.system_id && linkedTab.systemId
        && suggestedTarget.system_id !== linkedTab.systemId) return false

    if (suggestedTarget.source_path && linkedTab.sourcePath
        && suggestedTarget.source_path !== linkedTab.sourcePath) return false

    return true
  }

  private _openAssistantDraftInSystemEditor(draft: AssistantDraftPayload, _messageId: number | null) {
    const system = draft.validation.system || {}
    const suggestedTarget = draft.suggested_target
    this.element.dispatchEvent(new CustomEvent("assistant:openDraftInSystemEditor", {
      bubbles: true,
      detail: {
        yaml: draft.yaml,
        suggestedSystemId: suggestedTarget?.system_id || (typeof system.id === "string" ? system.id : null),
        sourcePath: suggestedTarget?.source_path || (typeof system.source_path === "string" ? system.source_path : null),
      },
    }))
  }

  private _commitPendingDraftAction() {
    if (!this.pendingDraftAction) return

    const action = this.pendingDraftAction
    this.pendingDraftAction = null

    if (action.type === "apply-linked") {
      this._commitApplyDraft(action.draft, action.messageId)
    }
  }

  private _commitApplyDraft(draft: AssistantDraftPayload, _messageId: number | null) {
    if (!this.assistantState.linkedTarget) return

    const system = draft.validation.system || {}
    const suggestedTarget = draft.suggested_target
    this.element.dispatchEvent(new CustomEvent("assistant:applyDraftToLinkedEditor", {
      bubbles: true,
      detail: {
        yaml: draft.yaml,
        target: this.assistantState.linkedTarget,
        suggestedSystemId: suggestedTarget?.system_id || (typeof system.id === "string" ? system.id : null),
        sourcePath: suggestedTarget?.source_path || (typeof system.source_path === "string" ? system.source_path : null),
      },
    }))
  }

  private async _performDeleteAssistantChat() {
    if (!this.assistantCurrentChat) return

    const deletingId = this.assistantCurrentChat.id
    const result = await deleteAssistantChat(deletingId)
    if (!result.ok) {
      this.assistantError = result.error || "Chat delete failed"
      showToast(this.assistantError)
      this._renderSafely()
      return
    }

    this.assistantChats = this.assistantChats.filter(chat => chat.id !== deletingId)
    this._clearAssistantSelection()
    // In linked mode currentChatId = null is the correct empty state — do not auto-select
    // a remaining chat that belongs to a different editor context.
    if (this.assistantChats.length > 0 && !this.assistantState.linkedTarget) {
      await this._loadAssistantChat(this.assistantChats[0].id, false, "force_bottom")
    } else {
      this._renderSafely()
    }
    showToast("Chat deleted", "success")
  }

  private _render() {
    this.element.innerHTML = renderAssistantHTML({
      tabId: this.tabIdValue,
      assistantState: this.assistantState,
      workspaceSnapshot: this.workspaceSnapshot,
      linkedTargetContext: this.linkedTargetContext,
      assistantChats: this.assistantChats,
      assistantMessages: this.assistantMessages,
      assistantCurrentChat: this.assistantCurrentChat,
      assistantInput: this.assistantInput,
      assistantLoading: this.assistantLoading,
      assistantChatsLoading: this.assistantChatsLoading,
      assistantError: this.assistantError,
      assistantSettings: this.assistantSettings,
      assistantSettingsDraft: this.assistantSettingsDraft,
      assistantSettingsOpen: this.assistantSettingsOpen,
      assistantSettingsSaving: this.assistantSettingsSaving,
      assistantConnectionCheck: this.assistantConnectionCheck,
      assistantConnectionChecking: this.assistantConnectionChecking,
      assistantLaunchStarting: this.assistantLaunchStarting,
      assistantLaunchStopping: this.assistantLaunchStopping,
      assistantExpandedReasoningIds: Array.from(this.assistantExpandedReasoningIds),
      renameDialog: this.renameDialog,
      confirmDialog: this.confirmDialog,
    })
  }

  private _renderSafely() {
    this._captureAssistantScrollSnapshot()

    try {
      this._render()
    } catch (error) {
      console.error("[Assistant] Render failed:", error)
      this.element.innerHTML = `<div class="flex h-full items-center justify-center px-6 text-center text-sm text-red-300">Assistant render failed. Check console for details.</div>`
      showToast("Assistant render failed")
    }

    this._restoreAssistantScroll()
  }

  private _restoreAssistantScroll() {
    const messages = this._role<HTMLElement>("assistant-messages")
    if (!messages) return

    if (this.assistantScrollToBottomPending) {
      messages.scrollTop = messages.scrollHeight
      this.assistantScrollToBottomPending = false
      this.assistantScrollSnapshot = null
      return
    }

    if (!this.assistantScrollSnapshot) return

    if (this.assistantScrollSnapshot.pinnedToBottom) {
      messages.scrollTop = messages.scrollHeight
    } else {
      messages.scrollTop = this.assistantScrollSnapshot.top
    }

    this.assistantScrollSnapshot = null
  }

  private _syncAssistantSendButton() {
    const button = this._role<HTMLButtonElement>("assistant-send-button")
    if (!button) return

    button.disabled = this.assistantLoading || !this._assistantConfigured() || !this.assistantInput.trim()
  }

  private _captureAssistantScrollSnapshot() {
    const messages = this._role<HTMLElement>("assistant-messages")
    if (!messages) {
      this.assistantScrollSnapshot = null
      return
    }

    const distanceFromBottom = messages.scrollHeight - messages.clientHeight - messages.scrollTop
    this.assistantScrollSnapshot = {
      top: messages.scrollTop,
      pinnedToBottom: distanceFromBottom <= 24,
    }
  }

  private _assistantSettingsDraftValue(provider = this._selectedAssistantProvider()): LlmSettingsDraft {
    const defaults = this.assistantSettings?.defaults
    const resolvedProvider = provider || defaults?.provider || this.assistantSettings?.providers[0]?.value || ""
    const selectedSetting = this.assistantSettings?.setting.provider === resolvedProvider ? this.assistantSettings.setting : null
    const saved = this._settingForProvider(resolvedProvider) || selectedSetting
    const providerOption = this._providerOption(resolvedProvider)
    const suggestedModel = this._modelSuggestionsFor(resolvedProvider)[0]
    const defaultModel = saved?.model
      || suggestedModel
      || providerOption?.default_model
      || ""
    const launchConfig = saved?.launch_config

    return {
      provider: resolvedProvider,
      model: defaultModel,
      api_key: "",
      api_base: saved?.api_base || providerOption?.default_api_base || "",
      temperature: String(saved?.temperature ?? defaults?.temperature ?? ""),
      max_output_tokens: String(saved?.max_output_tokens ?? defaults?.max_output_tokens ?? ""),
      launch_binary_path: launchConfig?.binary_path || "",
      launch_model_path: launchConfig?.model_path || "",
      launch_bind_host: launchConfig?.bind_host || "0.0.0.0",
      launch_client_host: launchConfig?.client_host || "127.0.0.1",
      launch_port: String(launchConfig?.port ?? 8080),
      launch_extra_args: launchConfig?.extra_args || "",
    }
  }

  private _modelSuggestionsFor(provider: string): string[] {
    return this.assistantSettings?.model_suggestions_by_provider?.[provider] || []
  }

  private _providerOption(provider: string) {
    return this.assistantSettings?.providers.find(option => option.value === provider) || null
  }

  private _settingForProvider(provider: string) {
    return this.assistantSettings?.settings_by_provider?.[provider] || null
  }

  private _assistantConfigured(): boolean {
    const setting = this._settingForProvider(this._selectedAssistantProvider())
    if (!setting?.model.trim()) return false

    return Boolean(setting.api_key_present || !setting.api_key_required)
  }

  private _assistantContextPayload() {
    const linkedTargetPayload = this._linkedTargetPayload()

    return {
      host_type: "assistant_tab",
      linked_target: linkedTargetPayload,
      workspace_snapshot: {
        active_tab_id: this.workspaceSnapshot.activeTabId,
        tabs: this.workspaceSnapshot.tabs.map(tab => ({
          id: tab.id,
          type: tab.type,
          label: tab.label,
          source_path: tab.sourcePath,
          system_id: tab.systemId,
        })),
      },
      referenced_tab_ids: [],
      editor_context: linkedTargetPayload ? this.linkedTargetContext : null,
    }
  }

  private _linkedTargetPayload() {
    const target = this.assistantState.linkedTarget
    if (!target) return null

    const workspaceTab = this.workspaceSnapshot.tabs.find(tab => tab.id === target.tabId) || null

    return {
      type: target.type,
      tab_id: target.tabId,
      system_id: this.linkedTargetContext?.system_id ?? workspaceTab?.systemId ?? null,
      source_path: this.linkedTargetContext?.source_path ?? workspaceTab?.sourcePath ?? null,
    }
  }

  private async _loadAssistantSettings(resetDraft = false) {
    const result = await fetchLlmSettings(this.assistantState.provider)
    if (!result.ok || !result.data) {
      this.assistantSettings = null
      if (result.error && result.error !== "Unauthorized") {
        this.assistantError = this.assistantError || result.error
      }
      this._renderSafely()
      return
    }

    this.assistantSettings = result.data
    this.assistantError = this.assistantError === "Unauthorized" ? null : this.assistantError
    if (!this.assistantState.provider) {
      this.assistantState.provider = result.data.setting.provider || null
      this._dispatchStateChanged()
    }
    if (resetDraft || !this.assistantSettingsDraft) {
      this.assistantSettingsDraft = this._assistantSettingsDraftValue(result.data.setting.provider)
    }
    this._renderSafely()
  }

  private _selectedAssistantProvider(): string {
    return this.assistantState.provider
      || this.assistantSettingsDraft?.provider
      || this.assistantSettings?.setting.provider
      || this.assistantSettings?.defaults.provider
      || this.assistantSettings?.providers[0]?.value
      || ""
  }

  private async _ensureAssistantChatSubscription(chatId: number) {
    if (!chatId) return
    if (this.assistantSubscribedChatId === chatId && this.assistantChatSubscription) return

    this._disconnectAssistantChatSubscription()

    const subscription = new AssistantChatSubscription(chatId, payload => {
      // Guard against late delivery from a previous subscription: only accept
      // payloads for the chat that is currently the intended selection.
      if (payload.chat.id !== this.assistantState.currentChatId) return

      this._applyAssistantChatPayload(payload, "auto")
      this._renderSafely()
    })

    this.assistantChatSubscription = subscription
    this.assistantSubscribedChatId = chatId
    await subscription.connect()
  }

  private _disconnectAssistantChatSubscription() {
    this.assistantChatSubscription?.disconnect()
    this.assistantChatSubscription = null
    this.assistantSubscribedChatId = null
  }

  private async _loadAssistantChats() {
    this.assistantChatsLoading = true
    this._renderSafely()

    try {
      const result = await fetchAssistantChats()
      if (!result.ok || !result.data) {
        if (result.error && result.error !== "Unauthorized") {
          this.assistantError = this.assistantError || result.error
        }
        return
      }

      this.assistantChats = result.data.chats
      const selectedChatId = this.assistantState.currentChatId || this.assistantCurrentChat?.id || null

      // If the active chat is older than the server's page limit it won't appear in the
      // refreshed list. Pin it at the top so the select stays consistent with the message pane.
      if (selectedChatId && this.assistantCurrentChat && !this.assistantChats.some(c => c.id === selectedChatId)) {
        this.assistantChats = [this.assistantCurrentChat, ...this.assistantChats]
      }

      if (selectedChatId) {
        if (this.assistantCurrentChat?.id === selectedChatId) {
          // Already loaded — just refresh the summary
          this.assistantCurrentChat = this.assistantChats.find(chat => chat.id === selectedChatId) || this.assistantCurrentChat
          this._renderSafely()
        } else {
          // Load directly — covers both "in top-30" and "older than the list limit" cases.
          // If the chat was deleted, _loadAssistantChat clears the selection gracefully.
          await this._loadAssistantChat(selectedChatId, false, "force_bottom")
        }
        return
      }

      // No selected chat — auto-select the most recent one only when there is no linked
      // editor target. In linked mode, currentChatId = null means the user just switched
      // editors and should see empty state rather than an unrelated chat being resurrected.
      if (this.assistantChats.length > 0 && !this.assistantState.linkedTarget) {
        await this._loadAssistantChat(this.assistantChats[0].id, false, "force_bottom")
        return
      }

      this._renderSafely()
    } finally {
      this.assistantChatsLoading = false
      this._renderSafely()
    }
  }

  private async _loadAssistantChat(chatId: number, setLoading = true, scrollMode: "auto" | "force_bottom" | "preserve" = "force_bottom") {
    if (setLoading) {
      this.assistantChatsLoading = true
      this._renderSafely()
    }

    try {
      const result = await fetchAssistantChat(chatId)
      if (!result.ok || !result.data) {
        this.assistantError = result.error || "Failed to load chat"
        this._clearAssistantSelection()
        this._renderSafely()
        return
      }

      this._applyAssistantChatPayload(result.data, scrollMode)
      this._renderSafely()
    } finally {
      if (setLoading) {
        this.assistantChatsLoading = false
        this._renderSafely()
      }
    }
  }

  private async _createAssistantChat(): Promise<AssistantChatPayload | null> {
    const result = await createAssistantChat({})

    if (!result.ok || !result.data) {
      this.assistantError = result.error || "Chat create failed"
      showToast(this.assistantError)
      this._renderSafely()
      return null
    }

    return result.data
  }

  private _applyAssistantChatPayload(payload: AssistantChatPayload, scrollMode: "auto" | "force_bottom" | "preserve" = "auto") {
    const shouldScrollToBottom = this._shouldScrollAssistantToBottom(payload, scrollMode)

    this.assistantCurrentChat = payload.chat
    this.assistantMessages = payload.messages
    this.assistantError = null
    this.assistantScrollToBottomPending = shouldScrollToBottom
    this.assistantExpandedReasoningIds = new Set(
      Array.from(this.assistantExpandedReasoningIds).filter(id => payload.messages.some(message => message.id === id)),
    )
    this._mergeAssistantChatSummary(payload.chat)
    const previousChatId = this.assistantState.currentChatId
    this.assistantState.currentChatId = payload.chat.id
    // Only propagate state to tabs_controller when the selected chat actually changes.
    // Skipping the dispatch on routine WebSocket deliveries avoids a full workspace
    // re-render + persist on every message create/update broadcast.
    if (previousChatId !== payload.chat.id) {
      this._dispatchStateChanged()
    }
    void this._ensureAssistantChatSubscription(payload.chat.id)
  }

  private _appendOptimisticUserMessage(content: string) {
    this.assistantMessages = [
      ...this.assistantMessages,
      {
        id: -Date.now(),
        role: "user",
        content,
        created_at: new Date().toISOString(),
        thinking_text: null,
        metadata: {},
      },
    ]
  }

  private _dropOptimisticUserMessages() {
    this.assistantMessages = this.assistantMessages.filter(message => message.id > 0)
  }

  private _assistantDraftFromMetadata(metadata: Record<string, unknown> | null | undefined): AssistantDraftPayload | null {
    const payload = metadata?.draft
    if (!payload || typeof payload !== "object") return null
    if (typeof (payload as Record<string, unknown>).yaml !== "string") return null
    return payload as AssistantDraftPayload
  }

  private _mergeAssistantChatSummary(chat: AssistantChatSummary) {
    this.assistantChats = [
      chat,
      ...this.assistantChats.filter(item => item.id !== chat.id),
    ].sort((left, right) => {
      const rightTime = Date.parse(right.updated_at)
      const leftTime = Date.parse(left.updated_at)
      return rightTime - leftTime
    })
  }

  private _clearAssistantSelection() {
    this.assistantState.currentChatId = null
    this._dispatchStateChanged()
    this.assistantCurrentChat = null
    this.assistantMessages = []
    this.assistantExpandedReasoningIds.clear()
    this._disconnectAssistantChatSubscription()
  }

  private _dispatchStateChanged() {
    this.element.dispatchEvent(new CustomEvent("assistant:stateChanged", {
      bubbles: true,
      detail: { state: { ...this.assistantState } },
    }))
  }

  private _shouldScrollAssistantToBottom(
    payload: AssistantChatPayload,
    scrollMode: "auto" | "force_bottom" | "preserve",
  ): boolean {
    if (scrollMode === "force_bottom") return true
    if (scrollMode === "preserve") return false
    if (!this._assistantIsPinnedToBottom()) return false

    const previousLast = this._assistantMessageSignature(this.assistantMessages[this.assistantMessages.length - 1] || null)
    const nextLast = this._assistantMessageSignature(payload.messages[payload.messages.length - 1] || null)

    return previousLast !== nextLast || this.assistantMessages.length !== payload.messages.length
  }

  private _assistantIsPinnedToBottom(): boolean {
    const messages = this._role<HTMLElement>("assistant-messages")
    if (!messages) return true

    const distanceFromBottom = messages.scrollHeight - messages.clientHeight - messages.scrollTop
    return distanceFromBottom <= 24
  }

  private _assistantMessageSignature(message: AssistantChatMessage | null): string {
    if (!message) return ""

    const draft = this._assistantDraftFromMetadata(message.metadata)
    return [
      message.id,
      message.content || "",
      message.thinking_text || "",
      draft?.yaml || "",
    ].join("::")
  }

  private _parsedAssistantState(): WorkspaceAssistantState {
    if (!this.stateValue) return buildDefaultWorkspaceAssistantState()

    try {
      return hydrateWorkspaceAssistantState(JSON.parse(this.stateValue) as Partial<WorkspaceAssistantState>)
    } catch {
      return buildDefaultWorkspaceAssistantState()
    }
  }

  private _parsedWorkspaceSnapshot(): AssistantWorkspaceSnapshot {
    if (!this.workspaceSnapshotValue) return { activeTabId: null, tabs: [] }

    try {
      const parsed = JSON.parse(this.workspaceSnapshotValue) as Partial<AssistantWorkspaceSnapshot>
      return {
        activeTabId: typeof parsed.activeTabId === "string" ? parsed.activeTabId : null,
        tabs: Array.isArray(parsed.tabs) ? parsed.tabs.map(tab => ({
          id: typeof tab.id === "string" ? tab.id : "",
          type: tab.type,
          label: typeof tab.label === "string" ? tab.label : "Tab",
          sourcePath: typeof tab.sourcePath === "string" ? tab.sourcePath : null,
          systemId: typeof tab.systemId === "string" ? tab.systemId : null,
        })).filter(tab => tab.id) : [],
      }
    } catch {
      return { activeTabId: null, tabs: [] }
    }
  }

  private _parsedLinkedTargetContext(): AssistantEditorContextPayload | null {
    if (!this.linkedTargetContextValue) return null

    try {
      return JSON.parse(this.linkedTargetContextValue) as AssistantEditorContextPayload
    } catch {
      return null
    }
  }

  private _role<T extends Element>(role: string): T | null {
    return this.element.querySelector<T>(`[data-role='${role}']`)
  }
}
