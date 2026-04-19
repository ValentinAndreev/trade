import { Controller } from "@hotwired/stimulus"
import {
  sendAssistantMessage,
  type AssistantChatPayload,
  type AssistantDraftPayload,
  type AssistantEditorContextPayload,
} from "../assistant/api"
import monitor from "../services/connection_monitor"
import { showToast } from "../services/toast"
import { renderAssistantHTML } from "../assistant/templates"
import type { AssistantWorkspaceSnapshot, WorkspaceAssistantState } from "../types/store"
import { buildDefaultWorkspaceAssistantState, hydrateWorkspaceAssistantState } from "../assistant/state"
import { AssistantSettingsService } from "../assistant/settings_service"
import { AssistantChatService } from "../assistant/chat_service"
import { buildDraftFromYaml, draftFromMetadata, draftMatchesLinkedTarget } from "../assistant/draft_service"

// Pixels from the bottom within which the scroll position is considered "pinned" to the bottom.
const SCROLL_PINNED_THRESHOLD = 24

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

  private assistantInput = ""
  private assistantLoading = false
  private assistantError: string | null = null
  private assistantScrollToBottomPending = false
  private assistantScrollSnapshot: { top: number; pinnedToBottom: boolean } | null = null
  private renameDialog: RenameDialogState | null = null
  private confirmDialog: ConfirmDialogState | null = null
  private pendingDraftAction: PendingDraftAction | null = null

  private settings = new AssistantSettingsService(
    () => this._renderSafely(),
    (msg) => { this.assistantError = msg },
    (provider) => { this.assistantState.provider = provider; this._dispatchStateChanged() },
  )

  private chat = new AssistantChatService(
    () => this._renderSafely(),
    (msg) => { this.assistantError = msg },
    (id) => { this.assistantState.currentChatId = id; this._dispatchStateChanged() },
    () => this.assistantState.currentChatId,
    () => this.assistantState.linkedTarget,
    () => this._assistantIsPinnedToBottom(),
    () => { this.assistantScrollToBottomPending = true },
  )

  private _onConnectionChange = () => {
    this._renderSafely()
    if (monitor.isOnline) {
      void this.settings.load(this.assistantState.provider)
      void this.chat.loadChats()
    }
  }

  private _onKeydown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return
    if (this.confirmDialog) { this.closeConfirmDialog(); return }
    if (this.renameDialog) { this.closeRenameDialog(); return }
    if (this.settings.isOpen) { this.closeAssistantSettings(); return }
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
      this.settings.load(this.assistantState.provider),
      this.chat.loadChats(),
    ])
  }

  disconnect() {
    this.chat.disconnect()
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
      this.chat.resetState()
      this._renderSafely()
      if (next.currentChatId) void this.chat.loadChat(next.currentChatId)
    }
    if (previous.provider !== next.provider) {
      void this.settings.load(next.provider, true)
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

  // ── Settings actions ────────────────────────────────────────────────────────

  async openAssistantSettings() {
    if (!this.settings.settings) await this.settings.load(this.assistantState.provider)
    this.settings.open()
  }

  closeAssistantSettings() {
    this.settings.close()
  }

  updateAssistantSettingsField(e: Event) {
    const target = e.currentTarget as HTMLInputElement | HTMLSelectElement
    const field = target.dataset.field || ""
    const value = target.value

    const reloadProvider = this.settings.updateField(field, value)
    if (reloadProvider !== null) {
      // Provider changed — update persisted state and reload settings async.
      // The draft was already rebuilt synchronously inside updateField.
      this.assistantState.provider = reloadProvider || null
      this._dispatchStateChanged()
      void this.settings.load(reloadProvider, true)
    }
    this._renderSafely()
  }

  async checkAssistantConnection() {
    await this.settings.check()
  }

  async launchAssistantServer() {
    await this.settings.launch()
  }

  async stopAssistantServer() {
    const provider = this.settings.draft?.provider || this.settings.selectedProvider(this.assistantState.provider)
    if (!provider) return
    await this.settings.stop(provider)
  }

  async saveAssistantSettings() {
    await this.settings.save()
  }

  // ── Dialog actions ───────────────────────────────────────────────────────────

  closeConfirmDialog() {
    this.confirmDialog = null
    this.pendingDraftAction = null
    this._renderSafely()
  }

  closeRenameDialog() {
    this.renameDialog = null
    this._renderSafely()
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

  // ── Workspace target actions ─────────────────────────────────────────────────

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

  // ── Chat actions ─────────────────────────────────────────────────────────────

  async createAssistantChat() {
    if (!this._isConfigured()) {
      this.settings.open()
      return
    }
    const payload = await this.chat.createChat()
    if (!payload) return
    this.chat.applyPayload(payload)
    this._renderSafely()
  }

  async selectAssistantChat(e: Event) {
    const chatId = Number((e.currentTarget as HTMLSelectElement).value)
    if (!chatId) {
      this.chat.clearSelection()
      this._renderSafely()
      return
    }
    await this.chat.loadChat(chatId)
  }

  renameAssistantChat() {
    if (!this.chat.currentChat) return
    this.renameDialog = {
      title: "Rename saved chat",
      body: "Update the title for this conversation.",
      confirmLabel: "Save title",
      value: this.chat.currentChat.title,
    }
    this._renderSafely()
  }

  deleteAssistantChat() {
    if (!this.chat.currentChat) return
    this.confirmDialog = {
      action: "delete-chat",
      tone: "danger",
      title: "Delete saved chat?",
      body: `The chat "${this.chat.currentChat.title}" will be removed from local history. This action cannot be undone.`,
      confirmLabel: "Delete chat",
    }
    this._renderSafely()
  }

  toggleAssistantReasoning(e: Event) {
    const details = e.currentTarget as HTMLDetailsElement
    const messageId = Number(details.dataset.messageId)
    if (!messageId) return

    this.chat.toggleReasoningExpanded(messageId, details.open)
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
    if (!this.chat.currentChat || !this.renameDialog) return

    const nextTitle = this.renameDialog.value.trim()
    const currentTitle = this.chat.currentChat.title
    this.renameDialog = null
    this._renderSafely()

    if (!nextTitle || nextTitle === currentTitle) return

    const result = await this.chat.renameChat(this.chat.currentChat.id, nextTitle)
    if (!result) return

    this.chat.applyPayload(result)
    this._renderSafely()
    showToast("Chat renamed", "success")
  }

  // ── Message actions ──────────────────────────────────────────────────────────

  updateAssistantInput(e: Event) {
    this.assistantInput = (e.currentTarget as HTMLTextAreaElement).value
    this._syncAssistantSendButton()
  }

  handleAssistantInputKeydown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return
    e.preventDefault()
    void this.sendAssistantMessage()
  }

  async sendAssistantMessage() {
    if (this.assistantLoading) return

    const content = this.assistantInput.trim()
    if (!content) return

    const provider = this.settings.selectedProvider(this.assistantState.provider)
    if (!this.settings.configured(provider)) {
      this.settings.open()
      return
    }

    // Fall back to persisted currentChatId so a message sent before the initial
    // fetchAssistantChat resolves continues the existing chat rather than opening a new one.
    const currentChatId = this.chat.currentChat?.id ?? this.assistantState.currentChatId ?? null
    const chatPayload: AssistantChatPayload | null = currentChatId ? null : await this.chat.createChat()
    const chatId = currentChatId ?? chatPayload?.chat.id
    if (!chatId) return

    if (chatPayload) this.chat.applyPayload(chatPayload)

    this.assistantInput = ""
    this.chat.appendOptimisticMessage(content)
    this.assistantLoading = true
    this.assistantError = null
    this.assistantScrollToBottomPending = true
    this._renderSafely()
    await this.chat.ensureSubscription(chatId)

    try {
      const result = await sendAssistantMessage(chatId, {
        provider,
        content,
        assistant_context: this._assistantContextPayload(),
      })

      if (!result.ok || !result.data) {
        this.chat.dropOptimisticMessages()
        this.assistantInput = content
        this.assistantError = result.error || "Assistant request failed"
        showToast(this.assistantError)
        return
      }

      this.chat.applyPayload(result.data)
      this._renderSafely()
    } finally {
      this.assistantLoading = false
      this._renderSafely()
    }
  }

  // ── Draft actions ────────────────────────────────────────────────────────────

  applyAssistantMessageDraft(e: Event) {
    const messageId = Number((e.currentTarget as HTMLElement).dataset.messageId)
    if (!messageId) return

    const message = this.chat.messages.find(item => item.id === messageId)
    const draft = draftFromMetadata(message?.metadata)
    if (!draft) return

    this._applyAssistantDraft(draft, messageId)
  }

  openAssistantMessageDraftInSystemEditor(e: Event) {
    const messageId = Number((e.currentTarget as HTMLElement).dataset.messageId)
    if (!messageId) return

    const message = this.chat.messages.find(item => item.id === messageId)
    const draft = draftFromMetadata(message?.metadata)
    if (!draft) return

    this._openAssistantDraftInSystemEditor(draft, messageId)
  }

  openAssistantYamlSnippetInSystemEditor(e: Event) {
    const encodedYaml = (e.currentTarget as HTMLElement).dataset.yaml
    const messageId = Number((e.currentTarget as HTMLElement).dataset.messageId || 0) || null
    if (!encodedYaml) return

    const draft = buildDraftFromYaml(decodeURIComponent(encodedYaml))
    this._openAssistantDraftInSystemEditor(draft, messageId)
  }

  // ── Event propagation stops ──────────────────────────────────────────────────

  stopAssistantSettingsPropagation(e: Event) { e.stopPropagation() }
  stopConfirmDialogPropagation(e: Event) { e.stopPropagation() }
  stopRenameDialogPropagation(e: Event) { e.stopPropagation() }

  // ── Private ──────────────────────────────────────────────────────────────────

  private _isConfigured(): boolean {
    return this.settings.configured(this.settings.selectedProvider(this.assistantState.provider))
  }

  private _applyAssistantDraft(draft: AssistantDraftPayload, messageId: number | null) {
    if (!this.assistantState.linkedTarget || !this.linkedTargetContext) {
      showToast("Link a system editor or open the draft in a new editor first")
      return
    }

    if (!draftMatchesLinkedTarget(draft, this.assistantState.linkedTarget, this.workspaceSnapshot.tabs)) {
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
    if (!this.chat.currentChat) return

    const deletingId = this.chat.currentChat.id
    const ok = await this.chat.deleteChat(deletingId)
    if (!ok) return

    this.chat.removeChatFromList(deletingId)
    this.chat.clearSelection()

    // In linked mode currentChatId = null is the correct empty state — do not auto-select
    // a remaining chat that belongs to a different editor context.
    if (this.chat.chats.length > 0 && !this.assistantState.linkedTarget) {
      await this.chat.loadChat(this.chat.chats[0].id, false, "force_bottom")
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
      assistantChats: this.chat.chats,
      assistantMessages: this.chat.messages,
      assistantCurrentChat: this.chat.currentChat,
      assistantInput: this.assistantInput,
      assistantLoading: this.assistantLoading,
      assistantChatsLoading: this.chat.isLoading,
      assistantError: this.assistantError,
      assistantSettings: this.settings.settings,
      assistantSettingsDraft: this.settings.draft,
      assistantSettingsOpen: this.settings.isOpen,
      assistantSettingsSaving: this.settings.isSaving,
      assistantConnectionCheck: this.settings.connectionCheck,
      assistantConnectionChecking: this.settings.isChecking,
      assistantLaunchStarting: this.settings.isLaunching,
      assistantLaunchStopping: this.settings.isStopping,
      assistantExpandedReasoningIds: this.chat.getExpandedReasoningIds(),
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

  private _captureAssistantScrollSnapshot() {
    const messages = this._role<HTMLElement>("assistant-messages")
    if (!messages) {
      this.assistantScrollSnapshot = null
      return
    }

    const distanceFromBottom = messages.scrollHeight - messages.clientHeight - messages.scrollTop
    this.assistantScrollSnapshot = {
      top: messages.scrollTop,
      pinnedToBottom: distanceFromBottom <= SCROLL_PINNED_THRESHOLD,
    }
  }

  private _assistantIsPinnedToBottom(): boolean {
    const messages = this._role<HTMLElement>("assistant-messages")
    if (!messages) return true
    return messages.scrollHeight - messages.clientHeight - messages.scrollTop <= SCROLL_PINNED_THRESHOLD
  }

  private _syncAssistantSendButton() {
    const button = this._role<HTMLButtonElement>("assistant-send-button")
    if (!button) return
    button.disabled = this.assistantLoading || !this._isConfigured() || !this.assistantInput.trim()
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

  private _dispatchStateChanged() {
    this.element.dispatchEvent(new CustomEvent("assistant:stateChanged", {
      bubbles: true,
      detail: { state: { ...this.assistantState } },
    }))
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
