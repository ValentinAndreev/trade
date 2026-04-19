import {
  createAssistantChat,
  deleteAssistantChat,
  fetchAssistantChat,
  fetchAssistantChats,
  renameAssistantChat,
  type AssistantChatMessage,
  type AssistantChatPayload,
  type AssistantChatSummary,
} from "./api"
import { showToast } from "../services/toast"
import { AssistantChatSubscription } from "./chat_subscription"
import type { AssistantTarget } from "../types/store"
import { draftFromMetadata } from "./draft_service"

export class AssistantChatService {
  chats: AssistantChatSummary[] = []
  currentChat: AssistantChatSummary | null = null
  messages: AssistantChatMessage[] = []
  isLoading = false
  expandedReasoningIds = new Set<number>()

  private subscription: AssistantChatSubscription | null = null
  private subscribedChatId: number | null = null

  constructor(
    private readonly rerender: () => void,
    private readonly setError: (msg: string | null) => void,
    private readonly onChatIdChange: (id: number | null) => void,
    private readonly getCurrentChatId: () => number | null,
    private readonly getLinkedTarget: () => AssistantTarget | null,
    private readonly getIsPinnedToBottom: () => boolean,
    private readonly onScrollToBottom: () => void,
  ) {}

  async loadChats() {
    this.isLoading = true
    this.rerender()

    try {
      const result = await fetchAssistantChats()
      if (!result.ok || !result.data) {
        if (result.error && result.error !== "Unauthorized") this.setError(result.error)
        return
      }

      this.chats = result.data.chats
      const selectedChatId = this.getCurrentChatId() || this.currentChat?.id || null

      // If the active chat is older than the server's page limit it won't appear in the
      // refreshed list. Pin it at the top so the select stays consistent with the message pane.
      if (selectedChatId && this.currentChat && !this.chats.some(c => c.id === selectedChatId)) {
        this.chats = [this.currentChat, ...this.chats]
      }

      if (selectedChatId) {
        if (this.currentChat?.id === selectedChatId) {
          // Already loaded — just refresh the summary
          this.currentChat = this.chats.find(c => c.id === selectedChatId) || this.currentChat
          this.rerender()
        } else {
          // Load directly — covers both "in top-N" and "older than list limit" cases.
          // If the chat was deleted, loadChat clears the selection gracefully.
          await this.loadChat(selectedChatId, false, "force_bottom")
        }
        return
      }

      // No selected chat — auto-select the most recent one only when there is no linked
      // editor target. In linked mode, currentChatId = null means the user just switched
      // editors and should see empty state rather than an unrelated chat being resurrected.
      if (this.chats.length > 0 && !this.getLinkedTarget()) {
        await this.loadChat(this.chats[0].id, false, "force_bottom")
        return
      }

      this.rerender()
    } finally {
      this.isLoading = false
      this.rerender()
    }
  }

  async loadChat(chatId: number, setLoading = true, scrollMode: "auto" | "force_bottom" | "preserve" = "force_bottom") {
    if (setLoading) {
      this.isLoading = true
      this.rerender()
    }

    try {
      const result = await fetchAssistantChat(chatId)
      if (!result.ok || !result.data) {
        this.setError(result.error || "Failed to load chat")
        this.clearSelection()
        this.rerender()
        return
      }

      this.applyPayload(result.data, scrollMode)
      this.rerender()
    } finally {
      if (setLoading) {
        this.isLoading = false
        this.rerender()
      }
    }
  }

  async createChat(): Promise<AssistantChatPayload | null> {
    const result = await createAssistantChat({})
    if (!result.ok || !result.data) {
      const msg = result.error || "Chat create failed"
      this.setError(msg)
      showToast(msg)
      this.rerender()
      return null
    }
    return result.data
  }

  async deleteChat(chatId: number): Promise<boolean> {
    const result = await deleteAssistantChat(chatId)
    if (!result.ok) {
      const msg = result.error || "Chat delete failed"
      this.setError(msg)
      showToast(msg)
      this.rerender()
      return false
    }
    return true
  }

  async renameChat(chatId: number, title: string): Promise<AssistantChatPayload | null> {
    const result = await renameAssistantChat(chatId, title)
    if (!result.ok || !result.data) {
      const msg = result.error || "Chat rename failed"
      this.setError(msg)
      showToast(msg)
      this.rerender()
      return null
    }
    return result.data
  }

  applyPayload(payload: AssistantChatPayload, scrollMode: "auto" | "force_bottom" | "preserve" = "auto") {
    if (this._shouldScrollToBottom(payload, scrollMode)) this.onScrollToBottom()

    this.currentChat = payload.chat
    this.messages = payload.messages
    this.setError(null)
    this.expandedReasoningIds = new Set(
      Array.from(this.expandedReasoningIds).filter(id => payload.messages.some(m => m.id === id)),
    )
    this._mergeChatSummary(payload.chat)

    const previousChatId = this.getCurrentChatId()
    if (previousChatId !== payload.chat.id) {
      this.onChatIdChange(payload.chat.id)
    }

    void this.ensureSubscription(payload.chat.id)
  }

  // Clears local state without triggering callbacks — used when the state change
  // originates from outside (stateValueChanged) and chat ID is already updated.
  resetState() {
    this.currentChat = null
    this.messages = []
    this.expandedReasoningIds.clear()
    this.disconnect()
  }

  // Clears local state and notifies the controller to update assistantState.currentChatId.
  // Use for user-initiated actions (delete, back) that originate from within this service.
  clearSelection() {
    this.onChatIdChange(null)
    this.currentChat = null
    this.messages = []
    this.expandedReasoningIds.clear()
    this.disconnect()
  }

  removeChatFromList(chatId: number) {
    this.chats = this.chats.filter(c => c.id !== chatId)
  }

  toggleReasoningExpanded(messageId: number, expanded: boolean) {
    if (expanded) {
      this.expandedReasoningIds.add(messageId)
    } else {
      this.expandedReasoningIds.delete(messageId)
    }
  }

  getExpandedReasoningIds(): number[] {
    return Array.from(this.expandedReasoningIds)
  }

  appendOptimisticMessage(content: string) {
    this.messages = [
      ...this.messages,
      {
        id: -Date.now(),
        role: "user" as const,
        content,
        created_at: new Date().toISOString(),
        thinking_text: null,
        metadata: {},
      },
    ]
  }

  dropOptimisticMessages() {
    this.messages = this.messages.filter(m => m.id > 0)
  }

  async ensureSubscription(chatId: number) {
    if (!chatId) return
    if (this.subscribedChatId === chatId && this.subscription) return

    this.disconnect()

    const subscription = new AssistantChatSubscription(chatId, payload => {
      // Guard against late delivery from a previous subscription: only accept
      // payloads for the chat that is currently the intended selection.
      if (payload.chat.id !== this.getCurrentChatId()) return
      this.applyPayload(payload, "auto")
      this.rerender()
    })

    this.subscription = subscription
    this.subscribedChatId = chatId
    await subscription.connect()
  }

  disconnect() {
    this.subscription?.disconnect()
    this.subscription = null
    this.subscribedChatId = null
  }

  private _shouldScrollToBottom(
    payload: AssistantChatPayload,
    scrollMode: "auto" | "force_bottom" | "preserve",
  ): boolean {
    if (scrollMode === "force_bottom") return true
    if (scrollMode === "preserve") return false
    if (!this.getIsPinnedToBottom()) return false

    const prevLast = this.messages[this.messages.length - 1] || null
    const nextLast = payload.messages[payload.messages.length - 1] || null

    return this._messageSignature(prevLast) !== this._messageSignature(nextLast)
      || this.messages.length !== payload.messages.length
  }

  private _messageSignature(message: AssistantChatMessage | null): string {
    if (!message) return ""
    const draft = draftFromMetadata(message.metadata)
    return [
      message.id,
      message.content || "",
      message.thinking_text || "",
      draft?.yaml || "",
    ].join("::")
  }

  private _mergeChatSummary(chat: AssistantChatSummary) {
    this.chats = [
      chat,
      ...this.chats.filter(item => item.id !== chat.id),
    ].sort((l, r) => Date.parse(r.updated_at) - Date.parse(l.updated_at))
  }
}
