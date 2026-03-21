import jsep from "jsep"
import type {
  ResearchConditionExpressionFunction,
  ResearchConditionExpressionMetadata,
  ResearchDslDiagnostic,
} from "../research/dsl"

const CONDITIONS_HEADER_RE = /^(\s*)conditions:\s*(?:#.*)?$/
const CONDITION_LINE_RE = /^(\s*)([a-z_][a-z0-9_]*)\s*:\s*(.+?)\s*$/i

type ExpressionKind = "boolean" | "numeric"
type ConditionExpressionMetadataIndex = {
  operatorCategories: Map<string, string>
  allowedBinaryOperators: Set<string>
  functionsByName: Map<string, ResearchConditionExpressionFunction>
}

let configured = false
let activeConditionExpressionMetadata: ResearchConditionExpressionMetadata | null = null
let activeConditionExpressionIndex: ConditionExpressionMetadataIndex | null = null

export function setConditionExpressionMetadata(metadata: ResearchConditionExpressionMetadata | null): void {
  activeConditionExpressionMetadata = metadata
  activeConditionExpressionIndex = metadata ? buildMetadataIndex(metadata) : null
  configured = false
}

export function getConditionExpressionMetadata(): ResearchConditionExpressionMetadata | null {
  return activeConditionExpressionMetadata
}

export function collectConditionExpressionDiagnostics(yaml: string): ResearchDslDiagnostic[] {
  if (!yaml.trim()) return []
  const metadata = activeConditionExpressionMetadata
  if (!metadata || !activeConditionExpressionIndex) return []

  configureParser()

  return extractConditionExpressions(yaml).flatMap(entry => {
    try {
      const ast = jsep(entry.expression)
      const issue = validateAst(ast, entry.expression)
      if (issue) return [buildDiagnostic(entry, issue.message, issue.offset, issue.length)]
      if (expressionKind(ast) !== "boolean") {
        return [
          buildDiagnostic(
            entry,
            metadata.root_requirement,
            0,
            Math.max(entry.expression.length, 1),
          ),
        ]
      }
      return []
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

  activeConditionExpressionMetadata?.operators
    .filter(operator => operator.register_in_frontend_parser)
    .forEach(operator => jsep.addBinaryOp(operator.symbol, operator.precedence))

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
  if (!activeConditionExpressionIndex) return null

  switch (node.type) {
    case "BinaryExpression":
      if (!activeConditionExpressionIndex.allowedBinaryOperators.has(node.operator)) {
        return {
          message: `Unsupported operator: ${node.operator}`,
          offset: findOffset(expression, node.operator),
          length: node.operator.length,
        }
      }
      return validateAst(node.left, expression) || validateAst(node.right, expression)
    case "UnaryExpression":
      if (node.operator !== "-") {
        return {
          message: `Unsupported operator: ${node.operator}`,
          offset: findOffset(expression, node.operator),
          length: node.operator.length,
        }
      }
      return validateAst(node.argument, expression)
    case "CallExpression":
      return validateCallExpression(node, expression)
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

function validateCallExpression(node: jsep.CallExpression, expression: string): AstValidationIssue | null {
  if (!activeConditionExpressionIndex) return null

  if (node.callee.type !== "Identifier") {
    return {
      message: "Only simple function calls are supported",
      offset: findOffset(expression, extractNodeToken(node)),
      length: Math.max(extractNodeToken(node).length, 1),
    }
  }

  const functionName = node.callee.name
  const functionDefinition = activeConditionExpressionIndex.functionsByName.get(functionName)
  if (!functionDefinition) {
    return {
      message: `Unsupported function: ${functionName}`,
      offset: findOffset(expression, functionName),
      length: functionName.length,
    }
  }

  const nestedIssue = node.arguments.map(argument => validateAst(argument, expression)).find(Boolean)
  if (nestedIssue) return nestedIssue

  if (!hasValidArity(node.arguments.length, functionDefinition)) {
    return {
      message: arityErrorMessage(functionDefinition),
      offset: findOffset(expression, functionName),
      length: functionName.length,
    }
  }

  const literalIndex = functionDefinition.positive_integer_literal_indexes.find(index => !isPositiveIntegerLiteral(node.arguments[index]))
  if (literalIndex === undefined) return null

  return {
    message: positiveIntegerLiteralErrorMessage(functionDefinition, literalIndex),
    offset: findOffset(expression, functionName),
    length: functionName.length,
  }
}

function expressionKind(node: jsep.Expression): ExpressionKind | null {
  switch (node.type) {
    case "BinaryExpression":
      return binaryExpressionKind(node)
    case "UnaryExpression":
      return node.operator === "-" && expressionKind(node.argument) === "numeric" ? "numeric" : null
    case "CallExpression":
      return callExpressionKind(node)
    case "Identifier":
      return "numeric"
    case "Literal":
      return typeof node.value === "number" ? "numeric" : null
    case "MemberExpression":
      return node.computed || node.object.type !== "Identifier" || node.property.type !== "Identifier" ? null : "numeric"
    default:
      return null
  }
}

function binaryExpressionKind(node: jsep.BinaryExpression): ExpressionKind | null {
  if (!activeConditionExpressionIndex) return null

  const leftKind = expressionKind(node.left)
  const rightKind = expressionKind(node.right)

  switch (activeConditionExpressionIndex.operatorCategories.get(node.operator)) {
    case "logical":
      return leftKind === "boolean" && rightKind === "boolean" ? "boolean" : null
    case "comparison":
      return leftKind === "numeric" && rightKind === "numeric" ? "boolean" : null
    case "arithmetic":
      return leftKind === "numeric" && rightKind === "numeric" ? "numeric" : null
    default:
      return null
  }
}

function callExpressionKind(node: jsep.CallExpression): ExpressionKind | null {
  if (!activeConditionExpressionIndex || node.callee.type !== "Identifier") return null

  const functionDefinition = activeConditionExpressionIndex.functionsByName.get(node.callee.name)
  if (!functionDefinition || !hasValidArity(node.arguments.length, functionDefinition)) return null
  if (functionDefinition.numeric_arguments && node.arguments.some(argument => expressionKind(argument) !== "numeric")) return null
  if (functionDefinition.positive_integer_literal_indexes.some(index => !isPositiveIntegerLiteral(node.arguments[index]))) return null

  return functionDefinition.return_kind === "boolean" || functionDefinition.return_kind === "numeric"
    ? functionDefinition.return_kind
    : null
}

function isPositiveIntegerLiteral(node: jsep.Expression): boolean {
  return node.type === "Literal" && typeof node.value === "number" && Number.isInteger(node.value) && node.value > 0
}

function renderMember(node: jsep.MemberExpression): string {
  if (node.object.type !== "Identifier" || node.property.type !== "Identifier") return ""
  return `${node.object.name}.${node.property.name}`
}

function extractNodeToken(node: jsep.Expression): string {
  if ("operator" in node && typeof node.operator === "string") return node.operator
  if ("name" in node && typeof node.name === "string") return node.name
  if ("raw" in node && typeof node.raw === "string") return node.raw
  if (node.type === "CallExpression" && node.callee.type === "Identifier") return node.callee.name
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

function buildMetadataIndex(metadata: ResearchConditionExpressionMetadata): ConditionExpressionMetadataIndex {
  return {
    operatorCategories: new Map(metadata.operators.map(operator => [operator.symbol, operator.category])),
    allowedBinaryOperators: new Set(metadata.operators.map(operator => operator.symbol)),
    functionsByName: new Map(metadata.functions.map(fn => [fn.name, fn])),
  }
}

function hasValidArity(argumentCount: number, fn: ResearchConditionExpressionFunction): boolean {
  return argumentCount >= fn.min_args && (fn.max_args == null || argumentCount <= fn.max_args)
}

function arityErrorMessage(fn: ResearchConditionExpressionFunction): string {
  if (fn.min_args === fn.max_args) {
    return `${fn.name}() expects exactly ${fn.min_args} argument${fn.min_args === 1 ? "" : "s"}`
  }

  return `${fn.name}() expects at least ${fn.min_args} arguments`
}

function positiveIntegerLiteralErrorMessage(fn: ResearchConditionExpressionFunction, index: number): string {
  const ordinal = ["first", "second", "third"][index] || `argument ${index + 1}`
  return `${fn.name}() expects a positive integer literal as the ${ordinal} argument`
}
