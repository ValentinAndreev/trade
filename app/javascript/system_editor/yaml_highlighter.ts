// YAML syntax highlighter for the system editor.
// - Keywords (YAML keys from schema metadata): dark red
// - Valid values (known enum values, module types, references, condition DSL tokens): dark blue
// - Numbers: amber
// - Comments: muted gray

export type HighlightConfig = {
  keywords: Set<string>
  values: Set<string>
}

// Empty until loaded from the backend metadata endpoint (/api/research/editor_metadata).
// No fallback hardcodes — the backend is the single source of truth.
let activeConfig: HighlightConfig = { keywords: new Set(), values: new Set() }

export function setHighlightConfig(config: HighlightConfig): void {
  activeConfig = config
}

function getConfig(): HighlightConfig {
  return activeConfig
}

const KW_COLOR  = '#e06c75'  // dark red  – YAML keys
const VAL_COLOR = '#61afef'  // dark blue – valid values / module types / references
const CMT_COLOR = '#5c6370'  // gray      – comments
const NUM_COLOR = '#d19a66'  // amber     – numeric literals
const DOTTED_TOKEN_RE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)+$/i

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function colorValue(raw: string): string {
  const { values } = getConfig()
  const trimmed = raw.trim()
  if (!trimmed) return esc(raw)

  const leadLen  = raw.indexOf(trimmed)
  const leading  = raw.slice(0, leadLen)
  const trailing = raw.slice(leadLen + trimmed.length)

  let color = ''
  if (values.has(trimmed) || DOTTED_TOKEN_RE.test(trimmed)) {
    color = VAL_COLOR
  } else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    color = NUM_COLOR
  }

  if (color) {
    return esc(leading) + `<span style="color:${color}">${esc(trimmed)}</span>` + esc(trailing)
  }
  return esc(raw)
}

function highlightLine(line: string): string {
  const { keywords } = getConfig()

  // Comment
  const commentMatch = line.match(/^(\s*)(#.*)$/)
  if (commentMatch) {
    return esc(commentMatch[1]) + `<span style="color:${CMT_COLOR}">${esc(commentMatch[2])}</span>`
  }

  // YAML mapping:  key: [value]
  const kvMatch = line.match(/^(\s*)([a-z_][a-z0-9_.]*)(\s*:)([ \t]*)(.*)$/)
  if (kvMatch) {
    const [, indent, key, colon, space, rest] = kvMatch
    const keyHtml = keywords.has(key)
      ? `<span style="color:${KW_COLOR}">${esc(key)}</span>`
      : esc(key)
    return esc(indent) + keyHtml + esc(colon) + esc(space) + colorValue(rest)
  }

  // YAML sequence item:  - value
  const listMatch = line.match(/^(\s*)(- )(.*)$/)
  if (listMatch) {
    const [, indent, dash, rest] = listMatch
    return esc(indent) + esc(dash) + colorValue(rest)
  }

  return esc(line)
}

export function highlightYaml(text: string): string {
  const html = text.split('\n').map(highlightLine).join('\n')
  return text.endsWith("\n") ? `${html}\u200b` : html
}
