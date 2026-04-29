# Project Overview

Краткая техническая карта проекта. Продуктовый scope, product areas и non-scope ведутся в [`../prd.md`](../prd.md); этот файл не дублирует PRD.

## Stack

- Backend: Rails 8, Ruby 4.0.1, PostgreSQL 17, TimescaleDB, Solid Queue, Solid Cable.
- Frontend: TypeScript, Stimulus, Tailwind CSS, AG Grid, Lightweight Charts.
- Testing: RSpec, Vitest, jsdom.
- Typing: RBS/Steep for Ruby, `tsc --noEmit` for TypeScript.
- External data: Bitfinex, Yahoo Finance, FRED, AlternativeMe, Coin Metrics Community.
- LLM: OpenAI, Anthropic, Gemini, OpenRouter, Mistral, xAI, Ollama, llama.cpp via RubyLLM.

## Ключевые технические решения

| Решение | Почему |
|---|---|
| Rails monolith | Достаточно для внутреннего приложения и упрощает delivery |
| TimescaleDB для candles/macro | Временные ряды, aggregates и efficient range queries |
| Browser workspace state в localStorage + Preset.payload | Быстрое восстановление UI и server-side сохранение snapshots |
| IndexedDB как cache, не source of truth | Offline/degraded UX без смешивания с серверной истиной |
| Workspace orchestration через coordinators | `TabsController` не должен содержать всю feature-логику |
| YAML DSL для research systems | Торговые системы удобно версионировать и редактировать как файлы |
| LLM tools around System Editor | Ассистент должен работать с валидируемым DSL, а не с неструктурированным текстом |

## Технические принципы

- Server is source of truth для historical data.
- Browser caches are derived.
- Workspace state must remain restorable.
- DSL и presets являются contracts; compatibility matters.
- LLM output must go through validation before becoming system state.

## Architecture Map

Подробная архитектура находится в `docs/02-architecture.md`; domain model — в `docs/03-domain-model.md`; user workflows — в `docs/06-ui-workflows.md`.

Подробная документация находится в `docs/`. Memory bank фиксирует процесс разработки и feature-level контракты; relevant package определяется через `features/index.md`, summaries and `rg`.
