import { BG_HOVER, BG_INPUT, BG_MODAL, BG_PRIMARY, BG_SURFACE, BG_TOOLBAR, BORDER_COLOR, MODAL_GLASS_STYLE, POPOVER_GLASS_STYLE } from "../config/theme"
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
import { SYSTEM_EDITOR_EVENTS } from "./events"

type SystemEditorTemplateArgs = {
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
  confirmDialog: {
    tone: "danger"
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
  confirmDialog,
}: SystemEditorTemplateArgs): string {
  const diagnostics = validation?.diagnostics || []
  const valid = validation?.ok === true
  const offline = !isOnline
  const conditionExpressionMetadata = getConditionExpressionMetadata()

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
            ${toolbarButton("Assistant", "click->system-editor#openAssistant")}
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

      <div class="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section class="min-h-0 min-w-0 border-b border-[${BORDER_COLOR}] xl:border-b-0 xl:border-r">
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

        <aside class="min-h-0 min-w-0 border-t border-[${BORDER_COLOR}] xl:border-t-0">
          <div class="flex h-full min-h-0 flex-col gap-4 p-4">
            <div class="rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_MODAL}] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
              <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Assistant</div>
              <div class="mt-2 text-sm leading-6 text-gray-300">
                The LLM assistant now lives in the dedicated <span class="font-medium text-white">Assistant</span> workspace tab.
                Use it to create drafts, compare ideas, and send changes back here through explicit preview and apply steps.
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                ${toolbarButton("Open Assistant", "click->system-editor#openAssistant")}
                ${toolbarButton("Link This Editor", "click->system-editor#linkAssistantTarget")}
              </div>
            </div>

            <div class="rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] p-4">
              <div class="text-xs uppercase tracking-[0.18em] text-gray-500">How It Works</div>
              <div class="mt-3 space-y-3 text-sm leading-6 text-gray-300">
                <div>1. Ask for a system or a patch in the Assistant tab.</div>
                <div>2. Review the generated draft there.</div>
                <div>3. Open or apply the draft here only when you want it.</div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      ${confirmDialog ? confirmDialogHTML(confirmDialog) : ""}

      ${filePickerOpen ? renderFileManagerModal({
        ctrl: "system-editor",
        title: "System files",
        catalog,
        directories,
        currentDirectoryPath: filePickerDirectoryPath,
        selectedPath: filePickerSelectedPath,
        searchQuery: filePickerQuery,
        closeEventName: SYSTEM_EDITOR_EVENTS.CLOSE_FILE_PICKER,
        navigateEventName: SYSTEM_EDITOR_EVENTS.NAVIGATE_FILE_MANAGER,
        selectEventName: SYSTEM_EDITOR_EVENTS.SELECT_FILE_MANAGER_ENTRY,
        confirmEventName: SYSTEM_EDITOR_EVENTS.CONFIRM_FILE_SELECTION,
        searchEventName: SYSTEM_EDITOR_EVENTS.UPDATE_FILE_PICKER_QUERY,
        createDirectoryEventName: SYSTEM_EDITOR_EVENTS.CREATE_DIRECTORY,
        createFileEventName: SYSTEM_EDITOR_EVENTS.CREATE_FILE,
        renameEventName: SYSTEM_EDITOR_EVENTS.RENAME_FILE_MANAGER_ENTRY,
        deleteEventName: SYSTEM_EDITOR_EVENTS.DELETE_FILE_MANAGER_ENTRY,
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

function confirmDialogHTML(dialog: {
  tone: "danger"
  title: string
  body: string
  confirmLabel: string
}): string {
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
          <div class="text-xs uppercase tracking-[0.18em] text-red-300">Confirm deletion</div>
          <div class="mt-1 text-base font-medium text-white">${escapeHTML(dialog.title)}</div>
          <div class="mt-2 text-sm leading-6 text-gray-300">${escapeHTML(dialog.body)}</div>
        </div>

        <div class="flex items-center justify-end gap-2 px-6 py-4">
          ${toolbarButton("Cancel", "click->system-editor#closeConfirmDialog")}
          ${toolbarButton(dialog.confirmLabel, "click->system-editor#confirmDialogAction", false, "border-red-500/30 bg-red-500/15 text-red-100 hover:bg-red-500/20 hover:text-white")}
        </div>
      </div>
    </div>
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
