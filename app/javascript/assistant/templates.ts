import {
  BG_HOVER,
  BG_INPUT,
  BG_MODAL,
  BG_PANEL,
  BG_PRIMARY,
  BG_SURFACE,
  BG_TOOLBAR,
  BORDER_COLOR,
  MODAL_GLASS_STYLE,
} from "../config/theme"
import type {
  AssistantChatMessage,
  AssistantChatSummary,
  AssistantDraftPayload,
  AssistantEditorContextPayload,
  LlmConnectionCheckPayload,
  LlmSettingPayload,
  LlmSettingsDraft,
  LlmSettingsPayload,
} from "./api"
import type { AssistantWorkspaceSnapshot, WorkspaceAssistantState } from "../types/store"
import { escapeHTML } from "../utils/dom"
import { highlightYaml } from "../system_editor/yaml_highlighter"

type AssistantTemplateArgs = {
  tabId: string
  assistantState: WorkspaceAssistantState
  workspaceSnapshot: AssistantWorkspaceSnapshot
  linkedTargetContext: AssistantEditorContextPayload | null
  assistantChats: AssistantChatSummary[]
  assistantMessages: AssistantChatMessage[]
  assistantCurrentChat: AssistantChatSummary | null
  assistantInput: string
  assistantLoading: boolean
  assistantChatsLoading: boolean
  assistantError: string | null
  assistantSettings: LlmSettingsPayload | null
  assistantSettingsDraft: LlmSettingsDraft | null
  assistantSettingsOpen: boolean
  assistantSettingsSaving: boolean
  assistantConnectionCheck: LlmConnectionCheckPayload | null
  assistantConnectionChecking: boolean
  assistantLaunchStarting: boolean
  assistantLaunchStopping: boolean
  assistantExpandedReasoningIds: number[]
  renameDialog: {
    title: string
    body: string
    confirmLabel: string
    value: string
  } | null
  confirmDialog: {
    tone: "danger" | "warning"
    title: string
    body: string
    confirmLabel: string
  } | null
}

export function renderAssistantHTML({
  tabId,
  assistantState,
  workspaceSnapshot,
  linkedTargetContext,
  assistantChats,
  assistantMessages,
  assistantCurrentChat,
  assistantInput,
  assistantLoading,
  assistantChatsLoading,
  assistantError,
  assistantSettings,
  assistantSettingsDraft,
  assistantSettingsOpen,
  assistantSettingsSaving,
  assistantConnectionCheck,
  assistantConnectionChecking,
  assistantLaunchStarting,
  assistantLaunchStopping,
  assistantExpandedReasoningIds,
  renameDialog,
  confirmDialog,
}: AssistantTemplateArgs): string {
  const providerOptions = assistantSettings?.providers || []
  const selectedProvider = assistantState.provider
    || assistantSettingsDraft?.provider
    || assistantSettings?.setting.provider
    || assistantSettings?.defaults.provider
    || providerOptions[0]?.value
    || ""
  const modelSuggestions = assistantSettings?.model_suggestions_by_provider?.[selectedProvider] || []
  const selectedProviderSetting = assistantSettings?.settings_by_provider?.[selectedProvider] || null
  const configured = Boolean(
    selectedProviderSetting?.model.trim()
    && (selectedProviderSetting.api_key_present || !selectedProviderSetting.api_key_required),
  )
  const modelListId = `assistant-model-suggestions-${escapeHTML(tabId)}`
  const linkedTargetLabel = linkedTargetContext?.source_path || linkedTargetContext?.system_id || "Unlinked"

  return `
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-[${BG_PRIMARY}] text-white">
      <div class="border-b border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] px-4 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <div>
            <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Workspace assistant</div>
            <div class="mt-1 text-sm text-gray-300">${assistantStatusHTML(assistantSettings, configured, selectedProvider, selectedProviderSetting)}</div>
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            ${toolbarButton("Settings", "click->assistant#openAssistantSettings", assistantSettingsSaving)}
            ${toolbarButton("New chat", "click->assistant#createAssistantChat", assistantLoading || !configured)}
          </div>
        </div>
      </div>

      <div class="border-b border-[${BORDER_COLOR}] bg-[${BG_TOOLBAR}] px-4 py-3 text-xs text-gray-400">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="uppercase tracking-[0.18em] text-gray-500">Linked target</span>
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-gray-200">${escapeHTML(linkedTargetLabel)}</span>
            ${assistantState.linkedTarget
              ? toolbarButton("Clear link", "click->assistant#clearLinkedTarget", assistantLoading, "h-8 px-2 text-xs")
              : ""}
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <label class="text-xs uppercase tracking-[0.18em] text-gray-500">Chat</label>
            <select
              data-role="assistant-chat-select"
              data-action="change->assistant#selectAssistantChat"
              class="h-10 min-w-56 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-white"
              ${assistantChatsLoading ? "disabled" : ""}
            >
              ${assistantChats.length
                ? [
                    assistantState.currentChatId === null
                      ? `<option value="" disabled selected style="background-color: ${BG_INPUT}; color: #6b7280;">— no active chat —</option>`
                      : "",
                    ...assistantChats.map(chat => assistantChatOptionHTML(chat, assistantState.currentChatId)),
                  ].join("")
                : assistantChatEmptyOptionHTML(assistantChatsLoading)}
            </select>
            ${toolbarButton("Rename", "click->assistant#renameAssistantChat", assistantLoading || !assistantCurrentChat)}
            ${toolbarButton("Delete", "click->assistant#deleteAssistantChat", assistantLoading || !assistantCurrentChat, "border-red-500/30 text-red-200 hover:bg-red-500/10 hover:text-red-100")}
          </div>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          <span class="uppercase tracking-[0.18em]">Workspace</span>
          ${workspaceSnapshot.tabs.map(tab => workspaceTabChipHTML({
            tabId: tab.id,
            label: tab.label,
            type: tab.type,
            active: tab.id === workspaceSnapshot.activeTabId,
            linked: assistantState.linkedTarget?.type === "system_editor" && assistantState.linkedTarget.tabId === tab.id,
          })).join("")}
        </div>
        ${assistantError ? `
          <div class="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            ${escapeHTML(assistantError)}
          </div>
        ` : ""}
      </div>

      <div data-role="assistant-messages" class="min-h-0 flex-1 overflow-auto bg-[${BG_PANEL}] px-4 py-4">
        ${assistantMessagesHTML({
          configured: !!configured,
          loading: assistantLoading,
          currentChat: assistantCurrentChat,
          messages: assistantMessages,
          expandedReasoningIds: assistantExpandedReasoningIds,
          linked: !!assistantState.linkedTarget,
        })}
      </div>

      <div class="border-t border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] px-4 py-4">
        <div class="rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] p-3">
          <textarea
            data-role="assistant-input"
            data-action="input->assistant#updateAssistantInput keydown->assistant#handleAssistantInputKeydown"
            class="min-h-28 w-full resize-none bg-transparent text-sm leading-6 text-white outline-none"
            placeholder="${configured ? "Ask for a new system, a patch for the linked editor, or an explanation..." : "Configure provider, model, and API key in Settings before using the assistant."}"
            ${configured ? "" : "disabled"}
          >${escapeHTML(assistantInput)}</textarea>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs text-gray-500">
              Send with Ctrl/Cmd+Enter. Drafts stay in chat until you explicitly open or apply them.
            </div>
            ${toolbarButton(assistantLoading ? "Sending..." : "Send", "click->assistant#sendAssistantMessage", assistantLoading || !configured || !assistantInput.trim(), "min-w-24", `data-role="assistant-send-button"`)}
          </div>
        </div>
      </div>

      ${assistantSettingsOpen ? assistantSettingsModalHTML({
        modelListId,
        settings: assistantSettings,
        settingsDraft: assistantSettingsDraft,
        providerOptions,
        modelSuggestions,
        selectedProviderSetting,
        connectionCheck: assistantConnectionCheck,
        connectionChecking: assistantConnectionChecking,
        launchStarting: assistantLaunchStarting,
        launchStopping: assistantLaunchStopping,
        saving: assistantSettingsSaving,
      }) : ""}

      ${renameDialog ? renameDialogHTML(renameDialog) : ""}

      ${confirmDialog ? confirmDialogHTML(confirmDialog) : ""}
    </div>
  `
}

function workspaceTabChipHTML({
  tabId,
  label,
  type,
  active,
  linked,
}: {
  tabId: string
  label: string
  type: string
  active: boolean
  linked: boolean
}): string {
  const baseClass = linked
    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
    : active
      ? "border-blue-400/30 bg-blue-500/10 text-blue-100"
      : "border-white/10 bg-white/5 text-gray-300"

  if (type === "system_editor") {
    return `
      <button
        type="button"
        data-tab-id="${escapeHTML(tabId)}"
        data-tab-type="${escapeHTML(type)}"
        data-action="click->assistant#linkWorkspaceTarget"
        title="${linked ? "Linked target" : "Link this system editor as the current target"}"
        class="rounded-full border px-2 py-1 transition hover:text-white ${baseClass}"
      >${escapeHTML(label)}</button>
    `
  }

  return `
    <span
      data-tab-id="${escapeHTML(tabId)}"
      class="rounded-full border px-2 py-1 ${baseClass}"
    >${escapeHTML(label)}</span>
  `
}

function assistantStatusHTML(
  settings: LlmSettingsPayload | null,
  configured: boolean | string,
  provider: string,
  providerSetting: LlmSettingPayload | null,
): string {
  if (!settings) return "Assistant settings are unavailable"
  if (!configured) return "Configure provider, model, and API key when required in Settings"

  const model = providerSetting?.model || settings.model_suggestions_by_provider?.[provider]?.[0] || ""
  return `${escapeHTML(provider)} / <span class="font-mono text-white">${escapeHTML(model)}</span>`
}

function assistantChatOptionHTML(chat: AssistantChatSummary, selectedChatId: number | null): string {
  return selectOptionHTML(String(chat.id), chat.title, selectedChatId === chat.id)
}

function assistantChatEmptyOptionHTML(loading: boolean): string {
  const label = loading ? "Loading chats..." : "No chats"
  return `
    <option
      value=""
      disabled
      selected
      style="background-color: ${BG_INPUT}; color: #ffffff;"
    >${escapeHTML(label)}</option>
  `
}

function assistantMessagesHTML({
  configured,
  loading,
  currentChat,
  messages,
  expandedReasoningIds,
  linked,
}: {
  configured: boolean
  loading: boolean
  currentChat: AssistantChatSummary | null
  messages: AssistantChatMessage[]
  expandedReasoningIds: number[]
  linked: boolean
}): string {
  if (!configured) {
    return emptyAssistantStateHTML(
      "Settings required",
      "Choose a provider, set a model, and save an API key when the selected endpoint requires one.",
      "Open Settings",
      "click->assistant#openAssistantSettings",
    )
  }

  if (!currentChat) {
    return emptyAssistantStateHTML(
      "No active chat",
      linked
        ? "Create a chat to start working with the linked editor."
        : "Create a chat to draft a system, then open or link it to a system editor when you are ready.",
      "New chat",
      "click->assistant#createAssistantChat",
    )
  }

  if (!messages.length && !loading) {
    return emptyAssistantStateHTML(
      "Start the conversation",
      linked
        ? "Ask for a patch to the linked system, or describe a new strategy and then apply the generated draft."
        : "Ask for a new system, an explanation, or a comparison. Open the resulting draft in a system editor when needed.",
    )
  }

  const hasVisibleReasoning = messages.some(message => Boolean(message.thinking_text?.trim()))

  return `
    <div class="flex min-h-full flex-col gap-4">
      ${messages.map(message => assistantMessageHTML(message, expandedReasoningIds, linked)).join("")}
      ${loading && !hasVisibleReasoning ? `
        <div class="self-start rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
          Assistant is thinking...
        </div>
      ` : ""}
    </div>
  `
}

function emptyAssistantStateHTML(
  title: string,
  body: string,
  actionLabel?: string,
  action?: string,
): string {
  return `
    <div class="flex h-full items-center justify-center">
      <div class="max-w-md rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-center">
        <div class="text-sm font-medium text-white">${escapeHTML(title)}</div>
        <div class="mt-2 text-sm leading-6 text-gray-400">${escapeHTML(body)}</div>
        ${actionLabel && action ? `
          <button
            type="button"
            data-action="${action}"
            class="mt-4 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 py-2 text-sm text-gray-200 hover:bg-[${BG_HOVER}] hover:text-white"
          >${escapeHTML(actionLabel)}</button>
        ` : ""}
      </div>
    </div>
  `
}

function assistantMessageHTML(message: AssistantChatMessage, expandedReasoningIds: number[], linked: boolean): string {
  const isUser = message.role === "user"
  const createdAt = formatAssistantTimestamp(message.created_at)
  const content = message.content || ""
  const reasoning = message.thinking_text?.trim() || ""
  const draft = assistantDraftFromMetadata(message.metadata)
  // Suppress per-block yaml action buttons when the message already carries a full
  // structured draft — the draft preview card below the content owns those actions
  // and preserves source_yaml_hash / suggested_target that _draftFromYaml() loses.
  const contentHTML = content ? renderAssistantMessageContent(content, !isUser && !draft, message.id, linked) : ""
  const reasoningHTML = !isUser && reasoning ? assistantReasoningHTML(reasoning, message.id, expandedReasoningIds.includes(message.id)) : ""

  return `
    <article class="flex ${isUser ? "justify-end" : "justify-start"}">
      <div class="max-w-[90%] rounded-2xl px-4 py-3 ${isUser ? "rounded-br-md border border-blue-400/20 bg-blue-500/15" : "rounded-bl-md border border-white/10 bg-white/5"}">
        <div class="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] ${isUser ? "text-blue-100/80" : "text-gray-500"}">
          <span>${isUser ? "You" : "Assistant"}</span>
          <span class="normal-case tracking-normal text-gray-500">${escapeHTML(createdAt)}</span>
        </div>
        ${reasoningHTML ? `<div class="${contentHTML ? "mt-3" : "mt-2"}">${reasoningHTML}</div>` : ""}
        ${contentHTML ? `<div class="mt-2 space-y-3 text-sm leading-6 text-gray-100">${contentHTML}</div>` : ""}
        ${draft ? `
          <div class="mt-3">
            ${assistantDraftPreviewHTML(draft, message.id, linked)}
          </div>
        ` : ""}
      </div>
    </article>
  `
}

function assistantReasoningHTML(reasoning: string, messageId: number, expanded: boolean): string {
  return `
    <details
      class="overflow-hidden rounded-xl border border-amber-400/20 bg-amber-500/10"
      data-message-id="${messageId}"
      data-action="toggle->assistant#toggleAssistantReasoning"
      ${expanded ? "open" : ""}
    >
      <summary class="cursor-pointer list-none px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-amber-200 marker:hidden">
        <span class="inline-flex items-center gap-2">
          <span>Reasoning</span>
          <span class="normal-case tracking-normal text-amber-100/70">click to expand</span>
        </span>
      </summary>
      <div class="border-t border-amber-400/10 px-3 py-3">
        <div class="whitespace-pre-wrap break-words text-[13px] leading-6 text-amber-50/90">${escapeHTML(reasoning)}</div>
      </div>
    </details>
  `
}

function renderAssistantMessageContent(
  content: string,
  allowYamlActions = false,
  messageId?: number,
  linked = false,
): string {
  const segments = splitCodeFenceSegments(content)
  if (!segments.length) {
    return `<div class="whitespace-pre-wrap break-words">${escapeHTML(content)}</div>`
  }

  return segments.map(segment => {
    if (segment.type === "text") {
      if (!segment.value.trim()) return ""
      return `<div class="whitespace-pre-wrap break-words">${escapeHTML(segment.value.trim())}</div>`
    }

    return assistantCodeBlockHTML(segment.value, segment.language, allowYamlActions, messageId, linked)
  }).join("")
}

function assistantCodeBlockHTML(
  code: string,
  language = "",
  allowYamlActions = false,
  messageId?: number,
  linked = false,
): string {
  const languageLabel = language || "code"
  const body = language === "yaml" ? highlightYaml(code) : escapeHTML(code)
  // Code-fence YAML blocks only get "Open editor" — no "Apply linked".
  // Snippets from explanatory replies have no source_yaml_hash / suggested_target,
  // so a synthetic draft would bypass the target-mismatch and overwrite guards.
  // "Apply linked" is only available on structured draft cards (assistantDraftPreviewHTML)
  // which carry real validated metadata from apply_system_draft tool.
  const actionButtons = allowYamlActions && language === "yaml"
    ? `
        <div class="flex items-center gap-2">
          ${toolbarButton(
            "Open editor",
            "click->assistant#openAssistantYamlSnippetInSystemEditor",
            false,
            "h-8 px-2 text-xs",
            `data-yaml="${escapeHTML(encodeURIComponent(code))}" ${messageId ? `data-message-id="${messageId}"` : ""}`
          )}
        </div>
      `
    : ""

  return `
    <div class="overflow-hidden rounded-xl border border-white/10 bg-[#0b0c18]">
      <div class="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">
        <span>${escapeHTML(languageLabel)}</span>
        ${actionButtons}
      </div>
      <pre class="m-0 overflow-auto px-3 py-3 font-mono text-[12px] leading-6 text-gray-100">${body}</pre>
    </div>
  `
}

function assistantDraftPreviewHTML(draft: AssistantDraftPayload, messageId: number, linked: boolean): string {
  return `
    <div class="overflow-hidden rounded-xl border border-white/10 bg-[#0b0c18]">
      <div class="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">
        <span>YAML draft</span>
        <div class="flex items-center gap-2">
          ${linked ? toolbarButton(
            "Apply linked",
            "click->assistant#applyAssistantMessageDraft",
            false,
            "h-8 border-emerald-400/30 bg-emerald-500/15 px-2 text-xs text-emerald-50 hover:bg-emerald-500/20",
            `data-message-id="${messageId}"`
          ) : ""}
          ${toolbarButton(
            "Open editor",
            "click->assistant#openAssistantMessageDraftInSystemEditor",
            false,
            "h-8 px-2 text-xs",
            `data-message-id="${messageId}"`
          )}
        </div>
      </div>
      <pre class="m-0 overflow-auto px-3 py-3 font-mono text-[12px] leading-6 text-gray-100">${highlightYaml(draft.yaml)}</pre>
    </div>
  `
}

function assistantDraftFromMetadata(metadata: Record<string, unknown> | null | undefined): AssistantDraftPayload | null {
  const payload = metadata?.draft
  if (!payload || typeof payload !== "object") return null
  if (typeof (payload as Record<string, unknown>).yaml !== "string") return null
  return payload as AssistantDraftPayload
}

function formatAssistantTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function assistantApiKeyRequired(
  provider: { api_key_required: boolean } | null,
  apiBase: string,
): boolean {
  if (!provider) return true
  if (provider.api_key_required === false) return false
  if (!apiBase.trim()) return true

  try {
    const url = new URL(apiBase)
    return !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname)
  } catch {
    return true
  }
}

function assistantSettingsModalHTML({
  modelListId,
  settings,
  settingsDraft,
  providerOptions,
  modelSuggestions,
  selectedProviderSetting,
  connectionCheck,
  connectionChecking,
  launchStarting,
  launchStopping,
  saving,
}: {
  modelListId: string
  settings: LlmSettingsPayload | null
  settingsDraft: LlmSettingsDraft | null
  providerOptions: Array<{ value: string; label: string; api_key_required: boolean; default_model: string; default_api_base: string | null; launchable: boolean }>
  modelSuggestions: string[]
  selectedProviderSetting: LlmSettingPayload | null
  connectionCheck: LlmConnectionCheckPayload | null
  connectionChecking: boolean
  launchStarting: boolean
  launchStopping: boolean
  saving: boolean
}): string {
  const defaultProvider = settings?.defaults.provider || providerOptions[0]?.value || ""
  const defaultProviderOption = providerOptions.find(option => option.value === defaultProvider) || null
  const draft = settingsDraft || {
    provider: defaultProvider,
    model: defaultProviderOption?.default_model || "",
    api_key: "",
    api_base: defaultProviderOption?.default_api_base || "",
    temperature: String(settings?.defaults.temperature ?? ""),
    max_output_tokens: String(settings?.defaults.max_output_tokens ?? ""),
    launch_binary_path: "",
    launch_model_path: "",
    launch_bind_host: "0.0.0.0",
    launch_client_host: "127.0.0.1",
    launch_port: "8080",
    launch_extra_args: "",
  }
  const selectedProviderOption = providerOptions.find(option => option.value === draft.provider) || null
  const launchable = selectedProviderOption?.launchable === true
  const apiKeyRequired = assistantApiKeyRequired(selectedProviderOption, draft.api_base)
  const keyStatus = apiKeyRequired
    ? (selectedProviderSetting?.api_key_present
      ? "Saved key exists for this provider. Leave the field blank to keep it."
      : "No saved key for this provider yet.")
    : "This provider/base URL does not require an API key."
  const apiBasePlaceholder = selectedProviderOption?.default_api_base || "Optional override"
  const modelPlaceholder = selectedProviderOption?.default_model || "Enter model id"
  const launchStatus = launchable && settings?.setting.provider === draft.provider ? settings.launch_status : null
  const effectiveApiBase = launchable
    ? `http://${draft.launch_client_host || "127.0.0.1"}:${draft.launch_port || "8080"}/v1`
    : draft.api_base
  const launchStatusTone = launchStatus?.reachable ? "text-emerald-300" : launchStatus?.running ? "text-amber-300" : "text-gray-400"
  const connectionTone = connectionCheck?.ok ? "text-emerald-300" : "text-red-300"

  return `
    <div
      data-role="assistant-settings-modal"
      data-action="click->assistant#closeAssistantSettings"
      class="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-6"
    >
      <div
        data-action="click->assistant#stopAssistantSettingsPropagation"
        class="w-full max-w-2xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-[${BORDER_COLOR}] bg-[${BG_MODAL}] shadow-[0_28px_64px_rgba(0,0,0,0.48)]"
        style="${MODAL_GLASS_STYLE}"
      >
        <div class="border-b border-[${BORDER_COLOR}] px-6 py-4">
          <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Assistant settings</div>
          <div class="mt-1 text-sm text-gray-300">Provider, model, and API credentials used by the workspace assistant.</div>
        </div>

        <div class="grid gap-4 px-6 py-5 md:grid-cols-2">
          <label class="text-sm text-gray-300">
            <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Provider</div>
            <select
              data-field="assistantSettings.provider"
              data-action="change->assistant#updateAssistantSettingsField"
              class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
            >
              ${providerOptions.map(option => selectOptionHTML(option.value, option.label, draft.provider === option.value)).join("")}
            </select>
          </label>

          <label class="text-sm text-gray-300">
            <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Model</div>
            <input
              type="text"
              list="${modelListId}"
              value="${escapeHTML(draft.model)}"
              data-field="assistantSettings.model"
              data-action="input->assistant#updateAssistantSettingsField"
              class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
              placeholder="${escapeHTML(modelPlaceholder)}"
            >
            <datalist id="${modelListId}">
              ${modelSuggestions.map(model => `<option value="${escapeHTML(model)}"></option>`).join("")}
            </datalist>
          </label>

          <label class="text-sm text-gray-300">
            <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">API key</div>
            <input
              type="password"
              value="${escapeHTML(draft.api_key)}"
              data-field="assistantSettings.apiKey"
              data-action="input->assistant#updateAssistantSettingsField"
              class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
              placeholder="${apiKeyRequired ? "Leave blank to keep the saved key" : "Optional for this endpoint"}"
              autocomplete="off"
            >
            <div class="mt-2 text-xs text-gray-500">${escapeHTML(keyStatus)}</div>
          </label>

          <label class="text-sm text-gray-300">
            <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Base URL</div>
            <input
              type="text"
              value="${escapeHTML(launchable ? effectiveApiBase : draft.api_base)}"
              data-field="assistantSettings.apiBase"
              data-action="input->assistant#updateAssistantSettingsField"
              class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white ${launchable ? "opacity-70" : ""}"
              placeholder="${escapeHTML(apiBasePlaceholder)}"
              ${launchable ? "readonly" : ""}
            >
          </label>

          <label class="text-sm text-gray-300">
            <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Temperature</div>
            <input
              type="number"
              value="${escapeHTML(draft.temperature)}"
              min="0"
              max="2"
              step="0.1"
              data-field="assistantSettings.temperature"
              data-action="input->assistant#updateAssistantSettingsField"
              class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
            >
          </label>

          <label class="text-sm text-gray-300">
            <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Max output tokens</div>
            <input
              type="number"
              value="${escapeHTML(draft.max_output_tokens)}"
              min="1"
              max="128000"
              step="1"
              data-field="assistantSettings.maxOutputTokens"
              data-action="input->assistant#updateAssistantSettingsField"
              class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
            >
          </label>
        </div>

        ${launchable ? `
          <div class="border-t border-[${BORDER_COLOR}] px-6 py-5">
            <div class="mb-4 text-xs uppercase tracking-[0.18em] text-gray-500">llama.cpp launch</div>

            <div class="grid gap-4 md:grid-cols-2">
              <label class="text-sm text-gray-300 md:col-span-2">
                <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Binary path</div>
                <input
                  type="text"
                  value="${escapeHTML(draft.launch_binary_path)}"
                  data-field="assistantSettings.launchBinaryPath"
                  data-action="input->assistant#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                  placeholder="~/llama.cpp/build/bin/llama-server"
                >
              </label>

              <label class="text-sm text-gray-300 md:col-span-2">
                <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Model path</div>
                <input
                  type="text"
                  value="${escapeHTML(draft.launch_model_path)}"
                  data-field="assistantSettings.launchModelPath"
                  data-action="input->assistant#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                  placeholder="~/models/Qwen3.5-9B-Q6_K.gguf"
                >
              </label>

              <label class="text-sm text-gray-300">
                <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Bind host</div>
                <input
                  type="text"
                  value="${escapeHTML(draft.launch_bind_host)}"
                  data-field="assistantSettings.launchBindHost"
                  data-action="input->assistant#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                >
              </label>

              <label class="text-sm text-gray-300">
                <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Port</div>
                <input
                  type="number"
                  value="${escapeHTML(draft.launch_port)}"
                  min="1"
                  max="65535"
                  step="1"
                  data-field="assistantSettings.launchPort"
                  data-action="input->assistant#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                >
              </label>

              <label class="text-sm text-gray-300">
                <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Client host</div>
                <input
                  type="text"
                  value="${escapeHTML(draft.launch_client_host)}"
                  data-field="assistantSettings.launchClientHost"
                  data-action="input->assistant#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                >
              </label>

              <label class="text-sm text-gray-300 md:col-span-2">
                <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Extra args</div>
                <input
                  type="text"
                  value="${escapeHTML(draft.launch_extra_args)}"
                  data-field="assistantSettings.launchExtraArgs"
                  data-action="input->assistant#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                >
              </label>
            </div>

            <div class="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Server status</div>
                  <div class="mt-1 ${launchStatusTone}">${escapeHTML(launchStatus?.message || "No launch status yet")}</div>
                </div>
                <div class="flex items-center gap-2">
                  ${toolbarButton(connectionChecking ? "Checking..." : "Check", "click->assistant#checkAssistantConnection", saving || connectionChecking || launchStarting || launchStopping)}
                  ${toolbarButton(launchStarting ? "Launching..." : "Launch", "click->assistant#launchAssistantServer", saving || connectionChecking || launchStarting || launchStopping)}
                  ${toolbarButton(launchStopping ? "Stopping..." : "Stop", "click->assistant#stopAssistantServer", saving || connectionChecking || launchStarting || launchStopping || !launchStatus?.running)}
                </div>
              </div>
              ${connectionCheck ? `
                <div class="mt-3 border-t border-white/10 pt-3 text-xs">
                  <div class="${connectionTone}">${escapeHTML(connectionCheck.ok ? "Endpoint reachable" : (connectionCheck.error || "Endpoint is not reachable"))}</div>
                  ${connectionCheck.checked_url ? `<div class="mt-1 text-gray-500">Checked <span class="font-mono text-gray-300">${escapeHTML(connectionCheck.checked_url)}</span></div>` : ""}
                </div>
              ` : ""}
            </div>
          </div>
        ` : ""}

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-[${BORDER_COLOR}] px-6 py-4">
          <div class="text-xs leading-5 text-gray-500">
            Keys are stored server-side per user. Drafts remain in chat until you open or apply them.
          </div>
          <div class="flex items-center gap-2">
            ${toolbarButton("Cancel", "click->assistant#closeAssistantSettings", saving)}
            ${toolbarButton(saving ? "Saving..." : "Save settings", "click->assistant#saveAssistantSettings", saving)}
          </div>
        </div>
      </div>
    </div>
  `
}

function confirmDialogHTML(dialog: {
  tone: "danger" | "warning"
  title: string
  body: string
  confirmLabel: string
}): string {
  const accentClass = dialog.tone === "warning" ? "text-amber-300" : "text-red-300"
  const confirmButtonClass = dialog.tone === "warning"
    ? "border-amber-400/30 bg-amber-500/15 text-amber-100 hover:bg-amber-500/20 hover:text-white"
    : "border-red-500/30 bg-red-500/15 text-red-100 hover:bg-red-500/20 hover:text-white"

  return `
    <div
      data-role="assistant-confirm-dialog"
      data-action="click->assistant#closeConfirmDialog"
      class="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4 py-6"
    >
      <div
        data-action="click->assistant#stopConfirmDialogPropagation"
        class="w-full max-w-lg rounded-2xl border border-[${BORDER_COLOR}] bg-[${BG_MODAL}] shadow-[0_28px_64px_rgba(0,0,0,0.48)]"
        style="${MODAL_GLASS_STYLE}"
      >
        <div class="border-b border-[${BORDER_COLOR}] px-6 py-4">
          <div class="text-xs uppercase tracking-[0.18em] ${accentClass}">Confirm action</div>
          <div class="mt-1 text-base font-medium text-white">${escapeHTML(dialog.title)}</div>
          <div class="mt-2 text-sm leading-6 text-gray-300">${escapeHTML(dialog.body)}</div>
        </div>

        <div class="flex items-center justify-end gap-2 px-6 py-4">
          ${toolbarButton("Cancel", "click->assistant#closeConfirmDialog")}
          ${toolbarButton(dialog.confirmLabel, "click->assistant#confirmDialogAction", false, confirmButtonClass)}
        </div>
      </div>
    </div>
  `
}

function renameDialogHTML(dialog: {
  title: string
  body: string
  confirmLabel: string
  value: string
}): string {
  const disabled = !dialog.value.trim()

  return `
    <div
      data-role="assistant-rename-dialog"
      data-action="click->assistant#closeRenameDialog"
      class="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4 py-6"
    >
      <div
        data-action="click->assistant#stopRenameDialogPropagation"
        class="w-full max-w-lg rounded-2xl border border-[${BORDER_COLOR}] bg-[${BG_MODAL}] shadow-[0_28px_64px_rgba(0,0,0,0.48)]"
        style="${MODAL_GLASS_STYLE}"
      >
        <div class="border-b border-[${BORDER_COLOR}] px-6 py-4">
          <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Rename chat</div>
          <div class="mt-1 text-base font-medium text-white">${escapeHTML(dialog.title)}</div>
          <div class="mt-2 text-sm leading-6 text-gray-300">${escapeHTML(dialog.body)}</div>
        </div>

        <div class="px-6 py-5">
          <input
            type="text"
            value="${escapeHTML(dialog.value)}"
            data-role="rename-dialog-input"
            data-action="input->assistant#updateRenameDialogValue keydown->assistant#handleRenameDialogKeydown"
            class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-white outline-none"
            placeholder="Chat title"
            autocomplete="off"
          >
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-[${BORDER_COLOR}] px-6 py-4">
          ${toolbarButton("Cancel", "click->assistant#closeRenameDialog")}
          ${toolbarButton(dialog.confirmLabel, "click->assistant#submitRenameDialog", disabled)}
        </div>
      </div>
    </div>
  `
}

function splitCodeFenceSegments(content: string): Array<{ type: "text" | "code"; value: string; language?: string }> {
  const segments: Array<{ type: "text" | "code"; value: string; language?: string }> = []
  const pattern = /```([\w-]+)?\n([\s\S]*?)```/g
  let cursor = 0

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) {
      segments.push({ type: "text", value: content.slice(cursor, index) })
    }

    segments.push({
      type: "code",
      language: (match[1] || "").toLowerCase(),
      value: (match[2] || "").replace(/\n$/, ""),
    })
    cursor = index + match[0].length
  }

  if (cursor < content.length) {
    segments.push({ type: "text", value: content.slice(cursor) })
  }

  return segments
}

function selectOptionHTML(value: string, label: string, selected: boolean): string {
  return `
    <option
      value="${escapeHTML(value)}"
      ${selected ? "selected" : ""}
      style="background-color: ${BG_INPUT}; color: #ffffff;"
    >${escapeHTML(label)}</option>
  `
}

function toolbarButton(label: string, action: string, disabled = false, extraClass = "", extraAttrs = ""): string {
  return `
    <button
      type="button"
      data-action="${action}"
      ${extraAttrs}
      class="h-10 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-gray-200 hover:bg-[${BG_HOVER}] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${extraClass}"
      ${disabled ? "disabled" : ""}
    >${escapeHTML(label)}</button>
  `
}
