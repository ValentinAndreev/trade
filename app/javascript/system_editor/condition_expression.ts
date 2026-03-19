import jsep from "jsep"
import type { ResearchDslDiagnostic } from "../research/dsl"

const ALLOWED_BINARY_OPERATORS = new Set(["&&", "||", "<<", ">>", "<", ">", "<=", ">="])
const CONDITIONS_HEADER_RE = /^(\s*)conditions:\s*(?:#.*)?$/
const CONDITION_LINE_RE = /^(\s*)([a-z_][a-z0-9_]*)\s*:\s*(.+?)\s*$/i

let configured = false

export function collectConditionExpressionDiagnostics(yaml: string): ResearchDslDiagnostic[] {
  if (!yaml.trim()) return []

  configureParser()

  return extractConditionExpressions(yaml).flatMap(entry => {
    try {
      const ast = jsep(entry.expression)
      const issue = validateAst(ast, entry.expression)
      return issue ? [buildDiagnostic(entry, issue.message, issue.offset, issue.length)] : []
    } catch (error) {
      const parseError = error as Error & { index?: number; description?: string }
      return [
        buildDiagnostic(
          entry,
          parseError.description || parseError.message,
          parseError.index ?? 0,
          1,
        ),
      ]
    }
  })
}

type ConditionExpressionEntry = {
  name: string
  expression: string
  line: number
  column: number
}

type AstValidationIssue = {
  message: string
  offset: number
  length: number
}

function configureParser(): void {
  if (configured) return

  jsep.addBinaryOp("<<", 7)
  jsep.addBinaryOp(">>", 7)
  configured = true
}

function extractConditionExpressions(yaml: string): ConditionExpressionEntry[] {
  const lines = yaml.split("\n")
  const entries: ConditionExpressionEntry[] = []
  let conditionsIndent: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (conditionsIndent == null) {
      const header = line.match(CONDITIONS_HEADER_RE)
      if (header) conditionsIndent = header[1].length
      continue
    }

    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const indent = line.match(/^\s*/)?.[0].length ?? 0
    if (indent <= conditionsIndent) {
      conditionsIndent = null
      const header = line.match(CONDITIONS_HEADER_RE)
      if (header) conditionsIndent = header[1].length
      continue
    }

    const match = line.match(CONDITION_LINE_RE)
    if (!match) continue

    const [, , name, rawValue] = match
    const valueStart = line.indexOf(rawValue)
    if (valueStart < 0) continue

    const parsed = parseYamlScalar(rawValue)
    if (!parsed) continue

    entries.push({
      name,
      expression: parsed.expression,
      line: index + 1,
      column: valueStart + parsed.columnOffset + 1,
    })
  }

  return entries
}

function parseYamlScalar(rawValue: string): { expression: string; columnOffset: number } | null {
  const value = rawValue.trimEnd()
  if (!value) return null

  const first = value[0]
  if (first === `"` || first === "'") {
    const closingIndex = findClosingQuote(value, first)
    if (closingIndex <= 0) return null

    return {
      expression: value.slice(1, closingIndex),
      columnOffset: 1,
    }
  }

  return {
    expression: value.split(/\s+#/, 1)[0].trimEnd(),
    columnOffset: 0,
  }
}

function findClosingQuote(value: string, quote: string): number {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] === quote && value[index - 1] !== "\\") return index
  }
  return -1
}

function validateAst(node: jsep.Expression, expression: string): AstValidationIssue | null {
  switch (node.type) {
    case "BinaryExpression":
      if (!ALLOWED_BINARY_OPERATORS.has(node.operator)) {
        return {
          message: `Unsupported operator: ${node.operator}`,
          offset: findOffset(expression, node.operator),
          length: node.operator.length,
        }
      }
      return validateAst(node.left, expression) || validateAst(node.right, expression)
    case "Identifier":
      return null
    case "Literal":
      return typeof node.value === "number"
        ? null
        : {
            message: "Only numeric literals are supported",
            offset: findOffset(expression, String(node.raw ?? node.value ?? "")),
            length: String(node.raw ?? node.value ?? "").length || 1,
          }
    case "MemberExpression":
      if (node.computed || node.object.type !== "Identifier" || node.property.type !== "Identifier") {
        return {
          message: "Only dotted references are supported",
          offset: findOffset(expression, renderMember(node)),
          length: Math.max(renderMember(node).length, 1),
        }
      }
      return null
    default:
      return {
        message: `Unsupported syntax: ${node.type}`,
        offset: findOffset(expression, extractNodeToken(node)),
        length: Math.max(extractNodeToken(node).length, 1),
      }
  }
}

function renderMember(node: jsep.MemberExpression): string {
  if (node.object.type !== "Identifier" || node.property.type !== "Identifier") return ""
  return `${node.object.name}.${node.property.name}`
}

function extractNodeToken(node: jsep.Expression): string {
  if ("operator" in node && typeof node.operator === "string") return node.operator
  if ("name" in node && typeof node.name === "string") return node.name
  if ("raw" in node && typeof node.raw === "string") return node.raw
  if (node.type === "MemberExpression") return renderMember(node)
  return ""
}

function findOffset(expression: string, token: string): number {
  if (!token) return 0
  const offset = expression.indexOf(token)
  return offset >= 0 ? offset : 0
}

function buildDiagnostic(
  entry: ConditionExpressionEntry,
  message: string,
  offset: number,
  length: number,
): ResearchDslDiagnostic {
  return {
    message: message.replace(/\s+at character \d+$/, ""),
    line: entry.line,
    column: entry.column + Math.max(offset, 0),
    length: Math.max(length, 1),
    path: `conditions.${entry.name}`,
    code: "condition_expression_syntax",
  }
}
