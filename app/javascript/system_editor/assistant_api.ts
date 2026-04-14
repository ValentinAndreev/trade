import type { ResearchDslDiagnostic } from "../research/dsl"
import { apiFetch } from "../services/api_fetch"
import { jsonHeaders } from "../utils/api_helpers"

export interface LlmSettingPayload {
  provider: string
  model: string
  api_base: string | null
  temperature: number
  max_output_tokens: number
  api_key_present: boolean
}

export interface LlmProviderOption {
  value: string
  label: string
}

export interface LlmSettingsPayload {
  setting: LlmSettingPayload
  providers: LlmProviderOption[]
  model_suggestions: string[]
  model_suggestions_by_provider: Record<string, string[]>
  settings_by_provider: Record<string, LlmSettingPayload>
}

export interface LlmConnectionCheckPayload {
  ok: boolean
  message: string
  normalized_api_base: string | null
  checked_url: string | null
  models: string[]
}

export interface LlmSettingsDraft {
  provider: string
  model: string
  api_key: string
  api_base: string
  temperature: string
  max_output_tokens: string
}

export interface AssistantChatSummary {
  id: number
  title: string
  source_path: string | null
  system_id: string | null
  updated_at: string
  last_message_preview: string
  last_used_provider: string | null
  last_used_model: string | null
}

export interface AssistantDraftPayload {
  yaml: string
  source_yaml_hash: string | null
  validation: {
    ok: boolean
    diagnostics: ResearchDslDiagnostic[]
    system: Record<string, unknown> | null
  }
}

export interface AssistantChatMessage {
  id: number
  role: "user" | "assistant"
  content: string | null
  created_at: string
  thinking_text: string | null
  metadata: Record<string, unknown>
}

export interface AssistantChatPayload {
  chat: AssistantChatSummary
  messages: AssistantChatMessage[]
}

export interface AssistantChatListPayload {
  chats: AssistantChatSummary[]
}

export interface AssistantEditorContextPayload {
  system_yaml: string
  system_id: string | null
  source_path: string | null
  yaml_hash: string
  diagnostics: ResearchDslDiagnostic[]
}

export interface ApiResult<T> {
  ok: boolean
  data: T | null
  error: string | null
}

async function buildResult<T>(response: Response | null): Promise<ApiResult<T>> {
  if (!response) {
    return { ok: false, data: null, error: "Request failed" }
  }

  const payload = await parseJson(response)
  if (!response.ok) {
    return { ok: false, data: null, error: parseError(payload, response.statusText) }
  }

  return { ok: true, data: payload as T, error: null }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function parseError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback || "Request failed"

  const record = payload as Record<string, unknown>
  if (typeof record.error === "string" && record.error.trim()) return record.error

  if (Array.isArray(record.errors)) {
    const messages = record.errors.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    if (messages.length) return messages.join(", ")
  }

  return fallback || "Request failed"
}

export async function fetchLlmSettings(provider?: string | null): Promise<ApiResult<LlmSettingsPayload>> {
  const params = new URLSearchParams()
  if (provider) params.set("provider", provider)
  const url = params.size ? `/api/llm_settings?${params.toString()}` : "/api/llm_settings"

  return buildResult<LlmSettingsPayload>(await apiFetch(url, { headers: jsonHeaders() }, { silent: true }))
}

export async function saveLlmSettings(payload: LlmSettingsDraft): Promise<ApiResult<LlmSettingsPayload>> {
  return buildResult<LlmSettingsPayload>(await apiFetch("/api/llm_settings", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      llm_setting: {
        provider: payload.provider,
        model: payload.model,
        api_key: payload.api_key,
        api_base: payload.api_base || null,
        temperature: payload.temperature,
        max_output_tokens: payload.max_output_tokens,
      },
    }),
  }))
}

export async function checkLlmConnection(payload: LlmSettingsDraft): Promise<ApiResult<LlmConnectionCheckPayload>> {
  return buildResult<LlmConnectionCheckPayload>(await apiFetch("/api/llm_settings/check", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      llm_setting: {
        provider: payload.provider,
        model: payload.model,
        api_key: payload.api_key,
        api_base: payload.api_base || null,
        temperature: payload.temperature,
        max_output_tokens: payload.max_output_tokens,
      },
    }),
  }))
}

export async function fetchAssistantChats(sourcePath: string | null): Promise<ApiResult<AssistantChatListPayload>> {
  const params = new URLSearchParams()
  if (sourcePath) params.set("source_path", sourcePath)
  const url = params.size ? `/api/system_editor_chats?${params.toString()}` : "/api/system_editor_chats"

  return buildResult<AssistantChatListPayload>(await apiFetch(url, { headers: jsonHeaders() }, { silent: true }))
}

export async function createAssistantChat(payload: {
  title?: string
  source_path?: string | null
  system_id?: string | null
}): Promise<ApiResult<AssistantChatPayload>> {
  return buildResult<AssistantChatPayload>(await apiFetch("/api/system_editor_chats", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  }))
}

export async function fetchAssistantChat(chatId: number): Promise<ApiResult<AssistantChatPayload>> {
  return buildResult<AssistantChatPayload>(await apiFetch(`/api/system_editor_chats/${chatId}`, { headers: jsonHeaders() }, { silent: true }))
}

export async function renameAssistantChat(chatId: number, title: string): Promise<ApiResult<AssistantChatPayload>> {
  return buildResult<AssistantChatPayload>(await apiFetch(`/api/system_editor_chats/${chatId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ title }),
  }))
}

export async function deleteAssistantChat(chatId: number): Promise<ApiResult<{ ok: boolean }>> {
  return buildResult<{ ok: boolean }>(await apiFetch(`/api/system_editor_chats/${chatId}`, {
    method: "DELETE",
    headers: jsonHeaders(),
  }))
}

export async function sendAssistantMessage(
  chatId: number,
  payload: {
    provider: string
    content: string
    editor_context: AssistantEditorContextPayload
  },
): Promise<ApiResult<AssistantChatPayload>> {
  return buildResult<AssistantChatPayload>(await apiFetch(`/api/system_editor_chats/${chatId}/messages`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  }))
}
