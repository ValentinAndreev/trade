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
  api_key_required: boolean
  launch_config: LlmLaunchConfigPayload
}

export interface LlmProviderOption {
  value: string
  label: string
  api_key_required: boolean
  default_model: string
  default_api_base: string | null
  launchable: boolean
}

export interface LlmLaunchConfigPayload {
  binary_path: string
  model_path: string
  bind_host: string
  client_host: string
  port: number
  extra_args: string
}

export interface LlmLaunchStatusPayload {
  supported: boolean
  configured: boolean
  running: boolean
  reachable: boolean
  pid: number | null
  api_base: string | null
  log_path: string | null
  started_at: string | null
  message: string | null
}

export interface LlmConnectionCheckPayload {
  ok: boolean
  checked_url: string | null
  models: string[]
  error: string | null
}

export interface LlmSettingsPayload {
  setting: LlmSettingPayload
  defaults: {
    provider: string
    temperature: number
    max_output_tokens: number
  }
  providers: LlmProviderOption[]
  launch_status: LlmLaunchStatusPayload | null
  model_suggestions: string[]
  model_suggestions_by_provider: Record<string, string[]>
  settings_by_provider: Record<string, LlmSettingPayload>
}

export interface LlmSettingsDraft {
  provider: string
  model: string
  api_key: string
  api_base: string
  temperature: string
  max_output_tokens: string
  launch_binary_path: string
  launch_model_path: string
  launch_bind_host: string
  launch_client_host: string
  launch_port: string
  launch_extra_args: string
}

export interface AssistantChatSummary {
  id: number
  title: string
  updated_at: string
  last_message_preview: string
  last_used_provider: string | null
  last_used_model: string | null
}

export interface AssistantDraftPayload {
  kind: "system_draft"
  yaml: string
  source_yaml_hash: string | null
  validation: {
    ok: boolean
    diagnostics: ResearchDslDiagnostic[]
    system: Record<string, unknown> | null
  }
  suggested_target: AssistantDraftTargetPayload | null
}

export interface AssistantDraftTargetPayload {
  type: "system_editor"
  system_id: string | null
  source_path: string | null
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
  yaml_hash: string | null
  diagnostics: ResearchDslDiagnostic[]
}

export interface AssistantLinkedTargetPayload {
  type: "system_editor"
  tab_id: string
  system_id: string | null
  source_path: string | null
}

export interface AssistantWorkspaceTabPayload {
  id: string
  type: string
  label: string
  source_path: string | null
  system_id: string | null
}

export interface AssistantContextPayload {
  host_type: string
  linked_target: AssistantLinkedTargetPayload | null
  workspace_snapshot: {
    active_tab_id: string | null
    tabs: AssistantWorkspaceTabPayload[]
  }
  referenced_tab_ids: string[]
  editor_context: AssistantEditorContextPayload | null
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

function buildLaunchConfig(payload: LlmSettingsDraft) {
  return {
    binary_path: payload.launch_binary_path,
    model_path: payload.launch_model_path,
    bind_host: payload.launch_bind_host,
    client_host: payload.launch_client_host,
    port: payload.launch_port,
    extra_args: payload.launch_extra_args,
  }
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
        launch_config: buildLaunchConfig(payload),
      },
    }),
  }))
}

export async function checkLlmConnection(payload: LlmSettingsDraft): Promise<ApiResult<{ connection: LlmConnectionCheckPayload }>> {
  return buildResult<{ connection: LlmConnectionCheckPayload }>(await apiFetch("/api/llm_settings/check", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      llm_setting: {
        provider: payload.provider,
        model: payload.model,
        api_key: payload.api_key,
        api_base: payload.api_base || null,
        launch_config: buildLaunchConfig(payload),
      },
    }),
  }))
}

export async function launchLlamaServer(payload: LlmSettingsDraft): Promise<ApiResult<LlmSettingsPayload>> {
  return buildResult<LlmSettingsPayload>(await apiFetch("/api/llm_settings/launch", {
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
        launch_config: buildLaunchConfig(payload),
      },
    }),
  }))
}

export async function stopLlamaServer(provider: string): Promise<ApiResult<LlmSettingsPayload>> {
  return buildResult<LlmSettingsPayload>(await apiFetch("/api/llm_settings/stop", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ provider }),
  }))
}

export async function fetchAssistantChats(): Promise<ApiResult<AssistantChatListPayload>> {
  return buildResult<AssistantChatListPayload>(await apiFetch("/api/assistant_chats", { headers: jsonHeaders() }, { silent: true }))
}

export async function createAssistantChat(payload: {
  title?: string
}): Promise<ApiResult<AssistantChatPayload>> {
  return buildResult<AssistantChatPayload>(await apiFetch("/api/assistant_chats", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  }))
}

export async function fetchAssistantChat(chatId: number): Promise<ApiResult<AssistantChatPayload>> {
  return buildResult<AssistantChatPayload>(await apiFetch(`/api/assistant_chats/${chatId}`, { headers: jsonHeaders() }, { silent: true }))
}

export async function renameAssistantChat(chatId: number, title: string): Promise<ApiResult<AssistantChatPayload>> {
  return buildResult<AssistantChatPayload>(await apiFetch(`/api/assistant_chats/${chatId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ title }),
  }))
}

export async function deleteAssistantChat(chatId: number): Promise<ApiResult<{ ok: boolean }>> {
  return buildResult<{ ok: boolean }>(await apiFetch(`/api/assistant_chats/${chatId}`, {
    method: "DELETE",
    headers: jsonHeaders(),
  }))
}

export async function sendAssistantMessage(
  chatId: number,
  payload: {
    provider: string
    content: string
    assistant_context?: AssistantContextPayload
  },
): Promise<ApiResult<AssistantChatPayload>> {
  return buildResult<AssistantChatPayload>(await apiFetch(`/api/assistant_chats/${chatId}/messages`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  }))
}
