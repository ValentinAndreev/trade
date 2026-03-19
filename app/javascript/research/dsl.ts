import { apiFetch } from "../services/api_fetch"

export interface ResearchDslDiagnostic {
  message: string
  line: number
  column: number
  length: number
  path: string | null
  code: string | null
}

export interface ResearchOptimizationTargetOption {
  value: string
  label: string
}

export interface ResearchValidatedSystem {
  id: string
  name: string
  module: {
    type: string
    params: Record<string, number | string | boolean>
  }
  params: Record<string, number | string | boolean>
  conditions: string[]
  optimization_targets: ResearchOptimizationTargetOption[]
}

export interface ResearchCatalogEntry {
  id: string
  name: string
  file_name: string
  relative_path: string
  yaml: string
  metadata: ResearchValidatedSystem | null
}

export interface ResearchCatalogSnapshot {
  systems: ResearchCatalogEntry[]
  directories: string[]
}

export interface ResearchValidationResponse {
  ok: boolean
  diagnostics: ResearchDslDiagnostic[]
  system: ResearchValidatedSystem | null
}

export interface ResearchSystemSaveResponse {
  ok: boolean
  diagnostics: ResearchDslDiagnostic[]
  system: ResearchCatalogEntry | null
}

export interface ResearchSystemDeleteResponse {
  ok: boolean
  diagnostics: ResearchDslDiagnostic[]
  deleted_system_path: string | null
}

export interface ResearchDirectoryMutationResponse {
  ok: boolean
  diagnostics: ResearchDslDiagnostic[]
  path?: string | null
  deleted_path?: string | null
}

export interface ResearchHighlightConfig {
  keywords: string[]
  values: string[]
}

export async function fetchResearchDictionary(): Promise<ResearchHighlightConfig | null> {
  const response = await apiFetch("/api/research/dictionary", {}, { silent: true })
  if (!response?.ok) return null
  return await response.json() as ResearchHighlightConfig
}

export async function cancelResearch(runId: string): Promise<void> {
  await apiFetch("/api/research/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId }),
  }, { silent: true })
}

export async function fetchResearchCatalog(): Promise<ResearchCatalogSnapshot> {
  const response = await apiFetch("/api/research/catalog")
  if (!response?.ok) return { systems: [], directories: [] }

  const payload = await response.json() as ResearchCatalogSnapshot
  return {
    systems: Array.isArray(payload.systems) ? payload.systems : [],
    directories: Array.isArray(payload.directories) ? payload.directories.filter((path): path is string => typeof path === "string") : [],
  }
}

export async function validateResearchSystem(systemYaml: string, systemId?: string): Promise<ResearchValidationResponse | null> {
  const response = await apiFetch("/api/research/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_id: systemId || null,
      system_yaml: systemYaml,
    }),
  })

  if (!response) return null
  return await response.json() as ResearchValidationResponse
}

export async function saveResearchSystem(
  systemYaml: string,
  sourcePath: string | null = null,
  directoryPath: string | null = null,
): Promise<ResearchSystemSaveResponse | null> {
  const response = await apiFetch("/api/research/systems/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_path: sourcePath,
      directory_path: directoryPath,
      system_yaml: systemYaml,
    }),
  })

  if (!response) return null
  return await response.json() as ResearchSystemSaveResponse
}

export async function renameResearchSystem(
  sourcePath: string,
  targetSystemId: string,
  systemYaml: string,
): Promise<ResearchSystemSaveResponse | null> {
  const response = await apiFetch("/api/research/systems/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_path: sourcePath,
      target_system_id: targetSystemId,
      system_yaml: systemYaml,
    }),
  })

  if (!response) return null
  return await response.json() as ResearchSystemSaveResponse
}

export async function deleteResearchSystem(sourcePath: string): Promise<ResearchSystemDeleteResponse | null> {
  const response = await apiFetch("/api/research/systems/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_path: sourcePath,
    }),
  })

  if (!response) return null
  return await response.json() as ResearchSystemDeleteResponse
}

export async function createResearchDirectory(
  parentPath: string | null,
  directoryName: string,
): Promise<ResearchDirectoryMutationResponse | null> {
  const response = await apiFetch("/api/research/directories/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parent_path: parentPath,
      directory_name: directoryName,
    }),
  })

  if (!response) return null
  return await response.json() as ResearchDirectoryMutationResponse
}

export async function renameResearchDirectory(
  sourcePath: string,
  targetName: string,
): Promise<ResearchDirectoryMutationResponse | null> {
  const response = await apiFetch("/api/research/directories/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_path: sourcePath,
      target_name: targetName,
    }),
  })

  if (!response) return null
  return await response.json() as ResearchDirectoryMutationResponse
}

export async function deleteResearchDirectory(
  sourcePath: string,
): Promise<ResearchDirectoryMutationResponse | null> {
  const response = await apiFetch("/api/research/directories/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_path: sourcePath,
    }),
  })

  if (!response) return null
  return await response.json() as ResearchDirectoryMutationResponse
}
