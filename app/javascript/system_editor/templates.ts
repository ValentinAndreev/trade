import { BG_HOVER, BG_PRIMARY, BORDER_COLOR, BG_MODAL, BG_SURFACE, BG_TOOLBAR, BG_INPUT } from "../config/theme"
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
}

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
}: SystemEditorTemplateArgs): string {
  const diagnostics = validation?.diagnostics || []
  const valid = validation?.ok === true
  const offline = !isOnline
  const conditionExpressionMetadata = getConditionExpressionMetadata()

  return `
    <div class="flex h-full min-h-0 flex-col overflow-hidden text-white bg-[${BG_PRIMARY}]">
      <div class="border-b border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] px-4 py-3 flex flex-wrap items-center gap-2">
        ${toolbarButton("Open file", "click->system-editor#openFilePicker", offline)}
        ${toolbarButton("New", "click->system-editor#newSystem", offline)}
        ${toolbarButton(validating ? "Validating…" : "Validate", "click->system-editor#validateNow", offline || validating, "", `data-role="validate-button"`)}
        ${toolbarButton(saving ? "Saving…" : "Save", "click->system-editor#saveSystem", offline || saving)}
        ${toolbarButton("Rename", "click->system-editor#renameSystem", offline || saving || !sourceFileName)}
        ${toolbarButton("Delete", "click->system-editor#deleteSystem", offline || saving || !sourceFileName, "border-red-500/30 text-red-200 hover:text-red-100 hover:bg-red-500/10")}
        ${toolbarButton("Reload", "click->system-editor#resetSystem", offline || !sourceFileName)}
        ${toolbarButton("Open in Test", "click->system-editor#openInTest", offline || !sourceFileName || hasUnsavedChanges, "", `data-role="open-in-test-button"`)}
        <div class="ml-auto flex items-center gap-2">
          <input
            type="search"
            value="${escapeHTML(state.searchQuery)}"
            placeholder="Search"
            data-field="searchQuery"
            data-action="input->system-editor#updateSearchQuery keydown->system-editor#handleSearchKeydown"
            class="h-10 w-64 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-white"
          >
          ${toolbarButton("Prev", "click->system-editor#findPrevious", !state.searchQuery.trim(), "", `data-role="search-prev-button"`)}
          ${toolbarButton("Next", "click->system-editor#findNext", !state.searchQuery.trim(), "", `data-role="search-next-button"`)}
        </div>
      </div>

      <div class="border-b border-[${BORDER_COLOR}] bg-[${BG_TOOLBAR}] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
        <div class="flex flex-wrap items-center gap-3">
          <span>File: <span data-role="current-file-name">${currentFileNameHTML(sourceFileName)}</span></span>
          <span>State: <span data-role="save-state" class="${hasUnsavedChanges ? "text-amber-300" : "text-emerald-300"}">${hasUnsavedChanges ? "Unsaved changes" : "Saved"}</span></span>
          <span>Search: <span data-role="search-match-count" class="text-white">${searchMatchCount} matches</span></span>
          ${offline ? `<span class="text-red-400 font-medium">● Server offline</span>` : ""}
        </div>
        <div
          data-role="validation-status"
          class="${valid ? "text-emerald-300" : diagnostics.length ? "text-red-300" : "text-gray-400"}"
        >${statusLabel(validation, validating)}</div>
      </div>

      <div class="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_28rem]">
        <div class="min-w-0 min-h-0 p-4">
          <div class="h-full min-h-0 rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
            <div class="border-b border-[${BORDER_COLOR}] px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-500">
              System YAML
            </div>
            <div class="relative h-[calc(100%-2.25rem)] min-h-0 overflow-hidden">
              <div class="absolute inset-y-0 left-0 w-14 border-r border-[${BORDER_COLOR}] bg-[${BG_INPUT}] overflow-hidden pointer-events-none">
                <pre data-system-editor-gutter class="px-2 py-4 font-mono text-xs leading-6 text-right text-gray-500">${buildLineNumbers(state.systemYaml, diagnostics)}</pre>
              </div>
              <div data-system-editor-highlight class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <pre data-system-editor-highlight-pre class="m-0 pl-16 pr-4 py-4 font-mono text-[13px] leading-6 text-white whitespace-pre">${highlightYaml(state.systemYaml)}</pre>
              </div>
              <textarea
                data-field="systemYaml"
                data-action="input->system-editor#updateYaml scroll->system-editor#syncEditorScroll keydown->system-editor#handleEditorKeydown"
                class="block h-full w-full resize-none bg-transparent pl-16 pr-4 py-4 font-mono text-[13px] leading-6 outline-none"
                style="color: transparent; caret-color: white"
                spellcheck="false"
                wrap="off"
              >${escapeHTML(state.systemYaml)}</textarea>
            </div>
          </div>
        </div>

        <aside class="min-h-0 overflow-auto border-l border-[${BORDER_COLOR}] bg-[${BG_MODAL}] px-4 py-4 flex flex-col gap-4">
          <div class="rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] p-3">
            <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Current file</div>
            <div data-role="current-file-card-name" class="mt-2 text-sm">${currentFileNameHTML(sourceFileName, "mt-2 text-sm text-left")}</div>
            <div data-role="current-system-id" class="mt-1 text-xs text-gray-400">${escapeHTML(state.systemId || "No id detected yet")}</div>
          </div>

          <div class="rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] p-3">
            <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Diagnostics</div>
            <div data-role="diagnostics-list" class="mt-3 flex flex-col gap-2">
              ${diagnosticsHTML(diagnostics)}
            </div>
          </div>

          ${editorHelpHTML(conditionExpressionMetadata)}
        </aside>
      </div>

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

function editorHelpHTML(metadata: ResearchConditionExpressionMetadata | null): string {
  return `
    <div class="rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] p-4 text-xs text-gray-400 leading-5">
      <div class="text-xs uppercase tracking-[0.18em] text-gray-500">Editor help</div>

      <div class="mt-3">
        <div class="text-gray-300">Shortcuts</div>
        <div class="mt-1 text-[12px] text-gray-400">
          <span class="text-white">Ctrl/Cmd+S</span> save,
          <span class="text-white">Ctrl/Cmd+Z</span> undo,
          <span class="text-white">Ctrl/Cmd+Shift+Z</span> redo,
          <span class="text-white">Ctrl/Cmd+F</span> search,
          <span class="text-white">F3</span> next match.
        </div>
      </div>

      ${conditionHelpSectionsHTML(metadata)}

      <div class="mt-4 border-t border-white/5 pt-4 text-[12px] text-gray-500">
        If a referenced value is missing on early bars, or an arithmetic step fails such as division by zero, the comparison evaluates to false.
      </div>
    </div>
  `
}

function conditionHelpSectionsHTML(metadata: ResearchConditionExpressionMetadata | null): string {
  if (!metadata) {
    return `
      <div class="mt-4 border-t border-white/5 pt-4">
        <div class="text-gray-300">Condition syntax</div>
        <div class="mt-2 text-[12px] text-gray-500">
          Editor metadata is unavailable until the metadata endpoint loads.
        </div>
      </div>
    `
  }

  return `
    <div class="mt-4 border-t border-white/5 pt-4">
      <div class="text-gray-300">Condition syntax</div>
      <div class="mt-2 text-[12px] text-gray-400">
        ${escapeHTML(metadata.root_requirement)}. Wrap each condition in quotes and use comparisons or logical combinations as the top-level expression.
      </div>
    </div>

    <div class="mt-4 border-t border-white/5 pt-4 grid grid-cols-1 gap-3 text-[12px] md:grid-cols-2">
      ${operatorCategoryHTML("Comparison and crossover", metadata.operators, ["comparison"])}
      ${operatorCategoryHTML("Logic and math", metadata.operators, ["logical", "arithmetic"])}
    </div>

    <div class="mt-4 border-t border-white/5 pt-4">
      <div class="text-gray-300">Functions</div>
      <div class="mt-2 space-y-2 text-[12px] text-gray-400">
        ${metadata.functions.map(renderFunctionHelp).join("")}
      </div>
    </div>

    <div class="mt-4 border-t border-white/5 pt-4">
      <div class="text-gray-300">Available references</div>
      <div class="mt-2 text-[12px] text-gray-400">
        Candle fields: <span class="text-white font-mono">${escapeHTML(metadata.references.candle_fields.join(" "))}</span>
      </div>
      <div class="mt-1 text-[12px] text-gray-400">
        Module outputs: <span class="text-white font-mono">${escapeHTML(metadata.references.module_output)}</span>
      </div>
      <div class="mt-1 text-[12px] text-gray-400">
        Params: <span class="text-white font-mono">${escapeHTML(metadata.references.params_prefix)}</span>
      </div>
    </div>
  `
}

function operatorCategoryHTML(
  title: string,
  operators: ResearchConditionExpressionOperator[],
  categories: string[],
): string {
  const categoryOperators = operators.filter(operator => categories.includes(operator.category))
  if (!categoryOperators.length) return ""

  return `
    <div>
      <div class="text-gray-300">${escapeHTML(title)}</div>
      <div class="mt-2 space-y-1 text-gray-400">
        ${categoryOperators.map(renderOperatorHelp).join("")}
        ${categories.includes("arithmetic") ? `<div><span class="text-white font-mono">(...)</span> grouping and precedence</div>` : ""}
      </div>
    </div>
  `
}

function renderOperatorHelp(operator: ResearchConditionExpressionOperator): string {
  return `<div><span class="text-white font-mono">${escapeHTML(operator.symbol)}</span> ${escapeHTML(operator.label)}</div>`
}

function renderFunctionHelp(fn: ResearchConditionExpressionFunction): string {
  const details = buildFunctionDetail(fn)
  return `<div><span class="text-white font-mono">${escapeHTML(fn.signature)}</span> ${escapeHTML(fn.description)}${details}</div>`
}

function buildFunctionDetail(fn: ResearchConditionExpressionFunction): string {
  if (!fn.positive_integer_literal_indexes.length) return ""

  const positions = fn.positive_integer_literal_indexes
    .map(index => ["first", "second", "third"][index] || `argument ${index + 1}`)
    .join(", ")

  return ` (${escapeHTML(positions)} must be a positive integer literal)`
}

function toolbarButton(label: string, action: string, disabled = false, extraClass = "", extraAttrs = ""): string {
  return `
    <button
      type="button"
      data-action="${action}"
      ${extraAttrs}
      class="h-10 rounded border border-[${BORDER_COLOR}] bg-[${BG_INPUT}] px-3 text-sm text-gray-200 hover:text-white hover:bg-[${BG_HOVER}] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${extraClass}"
      ${disabled ? "disabled" : ""}
    >${label}</button>
  `
}

export function currentFileNameHTML(sourceFileName: string | null, className = "text-white font-mono"): string {
  if (!sourceFileName) {
    return `<span class="${className}">Unsaved draft</span>`
  }

  return `
    <button
      type="button"
      title="Double-click to open containing directory"
      data-action="dblclick->system-editor#openFilePicker"
      class="${className} rounded px-1 py-0.5 hover:bg-white/5 cursor-pointer"
    >${escapeHTML(sourceFileName)}</button>
  `
}

export function diagnosticsHTML(diagnostics: ResearchDslDiagnostic[]): string {
  if (!diagnostics.length) {
    return `<div class="text-sm text-emerald-300">No YAML errors.</div>`
  }

  return diagnostics.map(diagnostic => `
    <button
      type="button"
      data-line="${diagnostic.line}"
      data-column="${diagnostic.column}"
      data-length="${diagnostic.length}"
      data-action="click->system-editor#focusDiagnostic"
      class="text-left rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 hover:bg-red-500/15 cursor-pointer"
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
  if (validating && !(validation?.diagnostics?.length)) return "Validating…"
  if (!validation) return "Not validated"
  return validation.ok ? "YAML valid" : "YAML invalid"
}
