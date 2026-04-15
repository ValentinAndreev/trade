import { BG_HOVER, BG_INPUT, BG_MODAL, BG_PANEL, BG_PRIMARY, BG_SURFACE, BG_TOOLBAR, BORDER_COLOR, MODAL_GLASS_STYLE, POPOVER_GLASS_STYLE } from "../config/theme"
import type {
  AssistantChatMessage,
  AssistantChatSummary,
  AssistantDraftPayload,
  LlmConnectionCheckPayload,
  LlmSettingPayload,
  LlmSettingsDraft,
  LlmSettingsPayload,
} from "./assistant_api"
import { escapeHTML } from "../utils/dom"
import { highlightYaml } from "./yaml_highlighter"
import type {
  ResearchCatalogEntry,
  ResearchConditionExpressionFunction,
  ResearchConditionExpressionMetadata,
  ResearchConditionExpressionOperator,
  ResearchDslDiagnostic,
  ResearchValidationResponse,
} from "../research/dsl"
import type { SystemEditorConfig } from "../types/store"
import { renderFileManagerModal } from "../research/file_manager"
import { getConditionExpressionMetadata } from "./condition_expression"

type SystemEditorTemplateArgs = {
  tabId: string
  state: SystemEditorConfig
  catalog: ResearchCatalogEntry[]
  directories: string[]
  validation: ResearchValidationResponse | null
  validating: boolean
  saving: boolean
  sourceFileName: string | null
  hasUnsavedChanges: boolean
  searchMatchCount: number
  filePickerOpen: boolean
  filePickerQuery: string
  filePickerDirectoryPath: string
  filePickerSelectedPath: string | null
  isOnline: boolean
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

type HelpSection = {
  title: string
  body?: string
  rows?: string[]
  columns?: HelpColumn[]
}

type HelpColumn = {
  title: string
  rows: string[]
}

const SHORTCUTS = [
  ["Ctrl/Cmd+S", "save"],
  ["Ctrl/Cmd+Z", "undo"],
  ["Ctrl/Cmd+Shift+Z", "redo"],
  ["Ctrl/Cmd+F", "search"],
  ["F3", "next match"],
] as const

const ARGUMENT_ORDINALS = ["first", "second", "third"] as const

export function renderSystemEditorHTML({
  tabId,
  state,
  catalog,
  directories,
  validation,
  validating,
  saving,
  sourceFileName,
  hasUnsavedChanges,
  searchMatchCount,
  filePickerOpen,
  filePickerQuery,
  filePickerDirectoryPath,
  filePickerSelectedPath,
  isOnline,
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
}: SystemEditorTemplateArgs): string {
  const diagnostics = validation?.diagnostics || []
  const valid = validation?.ok === true
  const offline = !isOnline
  const conditionExpressionMetadata = getConditionExpressionMetadata()
  const providerOptions = assistantSettings?.providers || []
  const selectedProvider = state.assistantSettingsProvider
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
  const modelListId = `system-editor-model-suggestions-${escapeHTML(tabId)}`

  return `
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-[${BG_PRIMARY}] text-white">
      <div class="border-b border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] px-4 py-3">
        <div class="flex flex-wrap items-center gap-2">
          ${toolbarButton("Open file", "click->system-editor#openFilePicker", offline)}
          ${toolbarButton("New", "click->system-editor#newSystem", offline)}
          ${toolbarButton(validating ? "Validating..." : "Validate", "click->system-editor#validateNow", offline || validating, "", `data-role="validate-button"`)}
          ${toolbarButton(saving ? "Saving..." : "Save", "click->system-editor#saveSystem", offline || saving)}
          ${toolbarButton("Rename", "click->system-editor#renameSystem", offline || saving || !sourceFileName)}
          ${toolbarButton("Delete", "click->system-editor#deleteSystem", offline || saving || !sourceFileName, "border-red-500/30 text-red-200 hover:bg-red-500/10 hover:text-red-100")}
          ${toolbarButton("Reload", "click->system-editor#resetSystem", offline || !sourceFileName)}
          ${toolbarButton("Open in Test", "click->system-editor#openInTest", offline || !sourceFileName || hasUnsavedChanges, "", `data-role="open-in-test-button"`)}

          <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
            <input
              type="search"
              value="${escapeHTML(state.searchQuery)}"
              placeholder="Search"
              data-field="searchQuery"
              data-action="input->system-editor#updateSearchQuery keydown->system-editor#handleSearchKeydown"
              class="h-10 w-56 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-white"
            >
            ${toolbarButton("Prev", "click->system-editor#findPrevious", !state.searchQuery.trim(), "", `data-role="search-prev-button"`)}
            ${toolbarButton("Next", "click->system-editor#findNext", !state.searchQuery.trim(), "", `data-role="search-next-button"`)}
            ${toolbarButton("Settings", "click->system-editor#openAssistantSettings", assistantSettingsSaving)}
            ${helpPopoverHTML(conditionExpressionMetadata)}
          </div>
        </div>
      </div>

      <div class="border-b border-[${BORDER_COLOR}] bg-[${BG_TOOLBAR}] px-4 py-2 text-xs text-gray-400">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <span>File: <span data-role="current-file-name">${currentFileNameHTML(sourceFileName)}</span></span>
            <span>State: <span data-role="save-state" class="${hasUnsavedChanges ? "text-amber-300" : "text-emerald-300"}">${hasUnsavedChanges ? "Unsaved changes" : "Saved"}</span></span>
            <span>Search: <span data-role="search-match-count" class="text-white">${searchMatchCount} matches</span></span>
            <span data-role="validation-status" class="${valid ? "text-emerald-300" : diagnostics.length ? "text-red-300" : "text-gray-400"}">${statusLabel(validation, validating)}</span>
            ${offline ? `<span class="font-medium text-red-400">Server offline</span>` : ""}
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <span class="uppercase tracking-[0.18em] text-gray-500">Shortcuts</span>
            ${shortcutChipsHTML()}
          </div>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section class="min-h-0 min-w-0 border-b border-[${BORDER_COLOR}] lg:border-b-0 lg:border-r">
          <div class="flex h-full min-h-0 flex-col gap-4 p-4">
            <div class="min-h-0 flex-1 overflow-hidden rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
              <div class="border-b border-[${BORDER_COLOR}] px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-500">
                System YAML
              </div>
              <div class="relative h-[calc(100%-2.25rem)] min-h-0 overflow-hidden">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-14 overflow-hidden border-r border-[${BORDER_COLOR}] bg-[${BG_INPUT}]">
                  <pre data-system-editor-gutter class="px-2 py-4 text-right font-mono text-xs leading-6 text-gray-500">${buildLineNumbers(state.systemYaml, diagnostics)}</pre>
                </div>
                <div data-system-editor-highlight class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                  <pre data-system-editor-highlight-pre class="m-0 whitespace-pre-wrap break-words pl-16 pr-4 py-4 font-mono text-[13px] leading-6 text-white">${highlightYaml(state.systemYaml)}</pre>
                </div>
                <textarea
                  data-field="systemYaml"
                  data-action="input->system-editor#updateYaml scroll->system-editor#syncEditorScroll keydown->system-editor#handleEditorKeydown"
                  class="block h-full w-full resize-none overflow-x-hidden bg-transparent pl-16 pr-4 py-4 font-mono text-[13px] leading-6 whitespace-pre-wrap break-words outline-none"
                  style="color: transparent; caret-color: white"
                  spellcheck="false"
                >${escapeHTML(state.systemYaml)}</textarea>
              </div>
            </div>

            <div class="rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] p-4">
              <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Diagnostics</div>
              <div data-role="diagnostics-list" class="mt-3 flex max-h-44 flex-col gap-2 overflow-auto">
                ${diagnosticsHTML(diagnostics)}
              </div>
            </div>
          </div>
        </section>

        <section class="min-h-0 min-w-0">
          <div class="flex h-full min-h-0 flex-col p-4">
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_MODAL}] shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
              <div class="border-b border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] px-4 py-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.18em] text-gray-500">LLM assistant</div>
                    <div class="mt-1 text-sm text-gray-300">${assistantStatusHTML(assistantSettings, configured, selectedProvider, selectedProviderSetting)}</div>
                  </div>
                  <div class="flex flex-wrap items-center justify-end gap-2">
                    <select
                      data-role="assistant-chat-select"
                      data-action="change->system-editor#selectAssistantChat"
                      class="h-10 min-w-44 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-white"
                      ${assistantChatsLoading ? "disabled" : ""}
                    >
                      ${assistantChats.length
                        ? assistantChats.map(chat => assistantChatOptionHTML(chat, state.assistantChatId)).join("")
                        : assistantChatEmptyOptionHTML(assistantChatsLoading)}
                    </select>
                    ${toolbarButton("New", "click->system-editor#createAssistantChat", assistantLoading || !configured)}
                    ${toolbarButton("Rename", "click->system-editor#renameAssistantChat", assistantLoading || !assistantCurrentChat)}
                    ${toolbarButton("Delete", "click->system-editor#deleteAssistantChat", assistantLoading || !assistantCurrentChat, "border-red-500/30 text-red-200 hover:bg-red-500/10 hover:text-red-100")}
                  </div>
                </div>
                ${assistantCurrentChat ? `
                  <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span>${escapeHTML(assistantCurrentChat.title)}</span>
                    ${assistantCurrentChat.source_path ? `<span class="font-mono text-gray-300">${escapeHTML(assistantCurrentChat.source_path)}</span>` : ""}
                  </div>
                ` : ""}
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
                })}
              </div>

              <div class="border-t border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] px-4 py-4">
                <div class="rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] p-3">
                  <textarea
                    data-role="assistant-input"
                    data-action="input->system-editor#updateAssistantInput keydown->system-editor#handleAssistantInputKeydown"
                    class="min-h-28 w-full resize-none bg-transparent text-sm leading-6 text-white outline-none"
                    placeholder="${configured ? "Ask the assistant to generate, explain, or fix the system YAML..." : "Configure provider, model, and API key in Settings before using the assistant."}"
                    ${configured ? "" : "disabled"}
                  >${escapeHTML(assistantInput)}</textarea>
                  <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div class="text-xs text-gray-500">
                      Send with Ctrl/Cmd+Enter. Drafts are only applied to the editor when you confirm.
                    </div>
                    ${toolbarButton(assistantLoading ? "Sending..." : "Send", "click->system-editor#sendAssistantMessage", assistantLoading || !configured || !assistantInput.trim(), "min-w-24", `data-role="assistant-send-button"`)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
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

      ${filePickerOpen ? renderFileManagerModal({
        ctrl: "system-editor",
        title: "System files",
        catalog,
        directories,
        currentDirectoryPath: filePickerDirectoryPath,
        selectedPath: filePickerSelectedPath,
        searchQuery: filePickerQuery,
        closeAction: "click->system-editor#closeFilePicker",
        navigateAction: "click->system-editor#navigateFileManager",
        selectAction: "click->system-editor#selectFileManagerEntry",
        openAction: "click->system-editor#openFileManagerEntry",
        confirmAction: "click->system-editor#confirmFileSelection",
        searchAction: "input->system-editor#updateFilePickerQuery",
        createDirectoryAction: "click->system-editor#createDirectory",
        createFileAction: "click->system-editor#createFile",
        renameAction: "click->system-editor#renameFileManagerEntry",
        deleteAction: "click->system-editor#deleteFileManagerEntry",
        confirmLabel: "Open",
      }) : ""}
    </div>
  `
}

function shortcutChipsHTML(): string {
  return SHORTCUTS.map(([value, label]) => `
    <span class="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-300">
      <span class="font-mono text-white">${escapeHTML(value)}</span>
      <span class="ml-1">${escapeHTML(label)}</span>
    </span>
  `).join("")
}

function helpPopoverHTML(metadata: ResearchConditionExpressionMetadata | null): string {
  return `
    <div class="group relative">
      <button
        type="button"
        class="flex h-10 w-10 items-center justify-center rounded-full border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] text-sm text-gray-200 hover:bg-[${BG_HOVER}] hover:text-white"
        aria-label="Condition syntax help"
      >?</button>
      <div class="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-20 hidden w-[30rem] max-w-[calc(100vw-2rem)] rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_MODAL}] p-4 text-left shadow-[0_24px_48px_rgba(0,0,0,0.36)] group-hover:block" style="${POPOVER_GLASS_STYLE}">
        ${conditionHelpPopoverBody(metadata)}
      </div>
    </div>
  `
}

function conditionHelpPopoverBody(metadata: ResearchConditionExpressionMetadata | null): string {
  const sections = metadata ? conditionHelpSections(metadata) : unavailableMetadataSection()

  return `
    <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Condition syntax</div>
    ${sections.map((section, index) => renderHelpSection(section, index === 0)).join("")}
    <div class="mt-4 border-t border-white/5 pt-4 text-[12px] leading-5 text-gray-500">
      If a referenced value is missing on early bars, or an arithmetic step fails such as division by zero, the comparison evaluates to false.
    </div>
  `
}

function unavailableMetadataSection(): HelpSection[] {
  return [
    {
      title: "Condition syntax",
      body: "Editor metadata is unavailable until the metadata endpoint loads.",
    },
  ]
}

function conditionHelpSections(metadata: ResearchConditionExpressionMetadata): HelpSection[] {
  return [
    {
      title: "Condition expressions",
      body: `${escapeHTML(metadata.root_requirement)}. Wrap each condition in quotes and use comparisons or logical combinations as the top-level expression.`,
    },
    {
      title: "Operators",
      columns: [
        buildOperatorColumn("Comparison and crossover", metadata.operators, ["comparison"]),
        buildOperatorColumn("Logic and math", metadata.operators, ["logical", "arithmetic"]),
      ],
    },
    {
      title: "Functions",
      rows: metadata.functions.map(renderFunctionHelp),
    },
    {
      title: "Available references",
      rows: [
        `Candle fields: ${renderMono(metadata.references.candle_fields.join(" "))}`,
        `Module outputs: ${renderMono(metadata.references.module_output)}`,
        `Params: ${renderMono(metadata.references.params_prefix)}`,
      ],
    },
  ]
}

function renderHelpSection(section: HelpSection, first = false): string {
  const spacingClass = first ? "mt-3" : "mt-4 border-t border-white/5 pt-4"

  return `
    <div class="${spacingClass}">
      <div class="text-gray-300">${escapeHTML(section.title)}</div>
      ${renderHelpSectionBody(section)}
    </div>
  `
}

function renderHelpSectionBody(section: HelpSection): string {
  if (section.columns?.length) {
    return `
      <div class="mt-2 grid grid-cols-1 gap-3 text-[12px] md:grid-cols-2">
        ${section.columns.map(renderHelpColumn).join("")}
      </div>
    `
  }

  if (section.rows?.length) {
    return `
      <div class="mt-2 space-y-2 text-[12px] leading-5 text-gray-400">
        ${section.rows.map(row => `<div>${row}</div>`).join("")}
      </div>
    `
  }

  return `<div class="mt-2 text-[12px] leading-5 text-gray-400">${section.body || ""}</div>`
}

function renderHelpColumn(column: HelpColumn): string {
  return `
    <div>
      <div class="text-gray-300">${escapeHTML(column.title)}</div>
      <div class="mt-2 space-y-1 text-gray-400">
        ${column.rows.map(row => `<div>${row}</div>`).join("")}
      </div>
    </div>
  `
}

function buildOperatorColumn(
  title: string,
  operators: ResearchConditionExpressionOperator[],
  categories: string[],
): HelpColumn {
  const rows = operators
    .filter(operator => categories.includes(operator.category))
    .map(renderOperatorHelp)

  if (categories.includes("arithmetic")) {
    rows.push(`${renderMono("(...)")} grouping and precedence`)
  }

  return { title, rows }
}

function renderMono(value: string): string {
  return `<span class="font-mono text-white">${escapeHTML(value)}</span>`
}

function renderOperatorHelp(operator: ResearchConditionExpressionOperator): string {
  return `${renderMono(operator.symbol)} ${escapeHTML(operator.label)}`
}

function renderFunctionHelp(fn: ResearchConditionExpressionFunction): string {
  const details = buildFunctionDetail(fn)
  return `${renderMono(fn.signature)} ${escapeHTML(fn.description)}${details}`
}

function buildFunctionDetail(fn: ResearchConditionExpressionFunction): string {
  if (!fn.positive_integer_literal_indexes.length) return ""

  const positions = fn.positive_integer_literal_indexes
    .map(index => ARGUMENT_ORDINALS[index] || `argument ${index + 1}`)
    .join(", ")

  return ` (${escapeHTML(positions)} must be a positive integer literal)`
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
}: {
  configured: boolean
  loading: boolean
  currentChat: AssistantChatSummary | null
  messages: AssistantChatMessage[]
  expandedReasoningIds: number[]
}): string {
  if (!configured) {
    return emptyAssistantStateHTML(
      "Settings required",
      "Choose a provider, set a model, and save an API key when the selected endpoint requires one.",
      "Open Settings",
      "click->system-editor#openAssistantSettings",
    )
  }

  if (!currentChat) {
    return emptyAssistantStateHTML(
      "No active chat",
      "Create a new chat or select a saved conversation for this system.",
      "New chat",
      "click->system-editor#createAssistantChat",
    )
  }

  if (!messages.length && !loading) {
    return emptyAssistantStateHTML(
      "Start the conversation",
      "Ask for a new system, request a YAML fix, or ask the assistant to explain validation errors.",
    )
  }

  const hasVisibleReasoning = messages.some(message => Boolean(message.thinking_text?.trim()))

  return `
    <div class="flex min-h-full flex-col gap-4">
      ${messages.map(message => assistantMessageHTML(message, expandedReasoningIds)).join("")}
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

function assistantMessageHTML(message: AssistantChatMessage, expandedReasoningIds: number[]): string {
  const isUser = message.role === "user"
  const createdAt = formatAssistantTimestamp(message.created_at)
  const content = message.content || ""
  const reasoning = message.thinking_text?.trim() || ""
  const draft = assistantDraftFromMetadata(message.metadata)
  const contentHTML = content ? renderAssistantMessageContent(content, !isUser) : ""
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
            ${assistantDraftPreviewHTML(draft, message.id)}
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
      data-action="toggle->system-editor#toggleAssistantReasoning"
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
      data-action="click->system-editor#closeAssistantSettings"
      class="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-6"
    >
      <div
        data-action="click->system-editor#stopAssistantSettingsPropagation"
        class="w-full max-w-2xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-[${BORDER_COLOR}] bg-[${BG_MODAL}] shadow-[0_28px_64px_rgba(0,0,0,0.48)]"
        style="${MODAL_GLASS_STYLE}"
      >
        <div class="border-b border-[${BORDER_COLOR}] px-6 py-4">
          <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Assistant settings</div>
          <div class="mt-1 text-sm text-gray-300">Provider, model, and API credentials used by the system editor assistant.</div>
        </div>

        <div class="grid gap-4 px-6 py-5 md:grid-cols-2">
          <label class="text-sm text-gray-300">
            <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Provider</div>
            <select
              data-field="assistantSettings.provider"
              data-action="change->system-editor#updateAssistantSettingsField"
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
              data-action="input->system-editor#updateAssistantSettingsField"
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
              data-action="input->system-editor#updateAssistantSettingsField"
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
              data-action="input->system-editor#updateAssistantSettingsField"
              class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white ${launchable ? "opacity-70" : ""}"
              placeholder="${escapeHTML(apiBasePlaceholder)}"
              ${launchable ? "readonly" : ""}
            >
            <div class="mt-2 text-xs text-gray-500">${launchable
              ? `For llama.cpp this URL is derived from client host and port below. The app uses <span class="font-mono text-gray-300">${escapeHTML(effectiveApiBase)}</span>.`
              : `For local servers use the client-reachable URL, for example <span class="font-mono text-gray-300">http://127.0.0.1:8080/v1</span>. Do not use <span class="font-mono text-gray-300">0.0.0.0</span> in the app.`}</div>
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
              data-action="input->system-editor#updateAssistantSettingsField"
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
              data-action="input->system-editor#updateAssistantSettingsField"
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
                  data-action="input->system-editor#updateAssistantSettingsField"
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
                  data-action="input->system-editor#updateAssistantSettingsField"
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
                  data-action="input->system-editor#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                  placeholder="0.0.0.0"
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
                  data-action="input->system-editor#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                >
              </label>

              <label class="text-sm text-gray-300">
                <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Client host</div>
                <input
                  type="text"
                  value="${escapeHTML(draft.launch_client_host)}"
                  data-field="assistantSettings.launchClientHost"
                  data-action="input->system-editor#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                  placeholder="127.0.0.1"
                >
                <div class="mt-2 text-xs text-gray-500">Use a client-reachable host here. If the server binds to <span class="font-mono text-gray-300">0.0.0.0</span>, the app should still usually connect via <span class="font-mono text-gray-300">127.0.0.1</span>.</div>
              </label>

              <label class="text-sm text-gray-300 md:col-span-2">
                <div class="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Extra args</div>
                <input
                  type="text"
                  value="${escapeHTML(draft.launch_extra_args)}"
                  data-field="assistantSettings.launchExtraArgs"
                  data-action="input->system-editor#updateAssistantSettingsField"
                  class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-white"
                  placeholder="-ngl 99 -c 16384 -t 8 -b 512 --flash-attn auto"
                >
                <div class="mt-2 text-xs text-gray-500">Do not include <span class="font-mono text-gray-300">-m</span>, <span class="font-mono text-gray-300">--host</span>, or <span class="font-mono text-gray-300">--port</span> here; they come from the dedicated fields.</div>
              </label>
            </div>

            <div class="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Server status</div>
                  <div class="mt-1 ${launchStatusTone}">${escapeHTML(launchStatus?.message || "No launch status yet")}</div>
                  ${launchStatus?.pid ? `<div class="mt-1 text-xs text-gray-500">PID <span class="font-mono text-gray-300">${launchStatus.pid}</span></div>` : ""}
                  ${launchStatus?.log_path ? `<div class="mt-1 text-xs text-gray-500">Log <span class="font-mono text-gray-300">${escapeHTML(launchStatus.log_path)}</span></div>` : ""}
                </div>
                <div class="flex items-center gap-2">
                  ${toolbarButton(connectionChecking ? "Checking..." : "Check", "click->system-editor#checkAssistantConnection", saving || connectionChecking || launchStarting || launchStopping)}
                  ${toolbarButton(launchStarting ? "Launching..." : "Launch", "click->system-editor#launchAssistantServer", saving || connectionChecking || launchStarting || launchStopping)}
                  ${toolbarButton(launchStopping ? "Stopping..." : "Stop", "click->system-editor#stopAssistantServer", saving || connectionChecking || launchStarting || launchStopping || !launchStatus?.running)}
                </div>
              </div>
              ${connectionCheck ? `
                <div class="mt-3 border-t border-white/10 pt-3 text-xs">
                  <div class="${connectionTone}">${escapeHTML(connectionCheck.ok ? "Endpoint reachable" : (connectionCheck.error || "Endpoint is not reachable"))}</div>
                  ${connectionCheck.checked_url ? `<div class="mt-1 text-gray-500">Checked <span class="font-mono text-gray-300">${escapeHTML(connectionCheck.checked_url)}</span></div>` : ""}
                  ${connectionCheck.models.length ? `<div class="mt-1 text-gray-500">Models: <span class="font-mono text-gray-300">${escapeHTML(connectionCheck.models.join(", "))}</span></div>` : ""}
                </div>
              ` : ""}
            </div>
          </div>
        ` : ""}

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-[${BORDER_COLOR}] px-6 py-4">
          <div class="text-xs leading-5 text-gray-500">
            Keys are stored server-side per user. The editor keeps drafts local until you explicitly save the YAML file.
          </div>
          <div class="flex items-center gap-2">
            ${toolbarButton("Cancel", "click->system-editor#closeAssistantSettings", saving)}
            ${toolbarButton(saving ? "Saving..." : "Save settings", "click->system-editor#saveAssistantSettings", saving)}
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
  const caption = dialog.tone === "warning" ? "Confirm overwrite" : "Confirm deletion"

  return `
    <div
      data-role="system-editor-confirm-dialog"
      data-action="click->system-editor#closeConfirmDialog"
      class="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4 py-6"
    >
      <div
        data-action="click->system-editor#stopConfirmDialogPropagation"
        class="w-full max-w-lg rounded-2xl border border-[${BORDER_COLOR}] bg-[${BG_MODAL}] shadow-[0_28px_64px_rgba(0,0,0,0.48)]"
        style="${MODAL_GLASS_STYLE}"
      >
        <div class="border-b border-[${BORDER_COLOR}] px-6 py-4">
          <div class="text-xs uppercase tracking-[0.18em] ${accentClass}">${caption}</div>
          <div class="mt-1 text-base font-medium text-white">${escapeHTML(dialog.title)}</div>
          <div class="mt-2 text-sm leading-6 text-gray-300">${escapeHTML(dialog.body)}</div>
        </div>

        <div class="flex items-center justify-end gap-2 px-6 py-4">
          ${toolbarButton("Cancel", "click->system-editor#closeConfirmDialog")}
          ${toolbarButton(dialog.confirmLabel, "click->system-editor#confirmDialogAction", false, confirmButtonClass)}
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
      data-role="system-editor-rename-dialog"
      data-action="click->system-editor#closeRenameDialog"
      class="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4 py-6"
    >
      <div
        data-action="click->system-editor#stopRenameDialogPropagation"
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
            data-action="input->system-editor#updateRenameDialogValue keydown->system-editor#handleRenameDialogKeydown"
            class="h-11 w-full rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-white outline-none"
            placeholder="Chat title"
            autocomplete="off"
          >
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-[${BORDER_COLOR}] px-6 py-4">
          ${toolbarButton("Cancel", "click->system-editor#closeRenameDialog")}
          ${toolbarButton(dialog.confirmLabel, "click->system-editor#submitRenameDialog", disabled)}
        </div>
      </div>
    </div>
  `
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

function renderAssistantMessageContent(content: string, allowYamlApply = false): string {
  const segments = splitCodeFenceSegments(content)
  if (!segments.length) {
    return `<div class="whitespace-pre-wrap break-words">${escapeHTML(content)}</div>`
  }

  return segments.map(segment => {
    if (segment.type === "text") {
      if (!segment.value.trim()) return ""
      return `<div class="whitespace-pre-wrap break-words">${escapeHTML(segment.value.trim())}</div>`
    }

    return assistantCodeBlockHTML(segment.value, segment.language, allowYamlApply)
  }).join("")
}

function assistantCodeBlockHTML(code: string, language = "", allowYamlApply = false): string {
  const languageLabel = language || "code"
  const body = language === "yaml" ? highlightYaml(code) : escapeHTML(code)
  const applyButton = allowYamlApply && language === "yaml"
    ? toolbarButton(
        "Apply YAML",
        "click->system-editor#applyAssistantYamlSnippet",
        false,
        "h-8 border-emerald-400/30 bg-emerald-500/15 px-2 text-xs text-emerald-50 hover:bg-emerald-500/20",
        `data-yaml="${escapeHTML(encodeURIComponent(code))}"`
      )
    : ""

  return `
    <div class="overflow-hidden rounded-xl border border-white/10 bg-[#0b0c18]">
      <div class="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">
        <span>${escapeHTML(languageLabel)}</span>
        ${applyButton}
      </div>
      <pre class="m-0 overflow-auto px-3 py-3 font-mono text-[12px] leading-6 text-gray-100">${body}</pre>
    </div>
  `
}

function assistantDraftPreviewHTML(draft: AssistantDraftPayload, messageId?: number): string {
  const applyButton = messageId
    ? toolbarButton(
        "Apply draft",
        "click->system-editor#applyAssistantMessageDraft",
        false,
        "h-8 border-emerald-400/30 bg-emerald-500/15 px-2 text-xs text-emerald-50 hover:bg-emerald-500/20",
        `data-message-id="${messageId}"`
      )
    : ""

  return `
    <div class="overflow-hidden rounded-xl border border-white/10 bg-[#0b0c18]">
      <div class="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">
        <span>YAML draft</span>
        ${applyButton}
      </div>
      <pre class="m-0 overflow-auto px-3 py-3 font-mono text-[12px] leading-6 text-gray-100">${highlightYaml(draft.yaml)}</pre>
    </div>
  `
}

function assistantDraftFromMetadata(metadata: Record<string, unknown>): AssistantDraftPayload | null {
  const draft = metadata?.draft
  if (!draft || typeof draft !== "object") return null

  const payload = draft as Record<string, unknown>
  if (typeof payload.yaml !== "string") return null

  return {
    yaml: payload.yaml,
    source_yaml_hash: typeof payload.source_yaml_hash === "string" ? payload.source_yaml_hash : null,
    validation: {
      ok: Boolean((payload.validation as Record<string, unknown> | undefined)?.ok),
      diagnostics: Array.isArray((payload.validation as Record<string, unknown> | undefined)?.diagnostics)
        ? ((payload.validation as Record<string, unknown>).diagnostics as ResearchDslDiagnostic[])
        : [],
      system: ((payload.validation as Record<string, unknown> | undefined)?.system as Record<string, unknown> | null) || null,
    },
  }
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

export function currentFileNameHTML(sourceFileName: string | null, className = "font-mono text-white"): string {
  if (!sourceFileName) {
    return `<span class="${className}">Unsaved draft</span>`
  }

  return `
    <button
      type="button"
      title="Double-click to open containing directory"
      data-action="dblclick->system-editor#openFilePicker"
      class="${className} rounded px-1 py-0.5 hover:bg-white/5"
    >${escapeHTML(sourceFileName)}</button>
  `
}

export function diagnosticsHTML(diagnostics: ResearchDslDiagnostic[]): string {
  if (!diagnostics.length) {
    return `<div class="rounded border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">No YAML errors.</div>`
  }

  return diagnostics.map(diagnostic => `
    <button
      type="button"
      data-line="${diagnostic.line}"
      data-column="${diagnostic.column}"
      data-length="${diagnostic.length}"
      data-action="click->system-editor#focusDiagnostic"
      class="cursor-pointer rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-left text-xs text-red-100 hover:bg-red-500/15"
    >
      <div class="font-medium">Line ${diagnostic.line}, col ${diagnostic.column}</div>
      <div class="mt-1">${escapeHTML(diagnostic.message)}</div>
    </button>
  `).join("")
}

export function buildLineNumbers(yaml: string, diagnostics: ResearchDslDiagnostic[]): string {
  const errorLines = new Set(diagnostics.map(diagnostic => diagnostic.line))
  const lineCount = Math.max(1, yaml.split("\n").length)

  return Array.from({ length: lineCount }, (_value, index) => {
    const lineNumber = index + 1
    const classes = errorLines.has(lineNumber) ? "text-red-300" : ""
    return `<span class="block ${classes}">${lineNumber}</span>`
  }).join("")
}

export function statusLabel(validation: ResearchValidationResponse | null, validating: boolean): string {
  if (validating && !(validation?.diagnostics?.length)) return "Validating..."
  if (!validation) return "Not validated"
  return validation.ok ? "YAML valid" : "YAML invalid"
}
