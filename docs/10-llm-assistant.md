# LLM Assistant — архитектура и потоки данных

## Обзор

LLM-ассистент — это встроенный чат-бот, который умеет не только отвечать на вопросы, но и генерировать и редактировать YAML-описания торговых систем прямо в редакторе. Система устроена в два слоя:

- **`Llm::Assistant`** — инфраструктура чата: хранение сообщений, запуск LLM, WebSocket-бродкасты, сборка payload.
- **`Llm::SystemEditor`** — доменный слой: инструменты для работы с DSL, извлечение черновиков, контекст редактора.

Чат работает в двух режимах в зависимости от того, поддерживает ли выбранная модель вызов инструментов (function calling):

- **Tool-agent path** — модель вызывает инструменты (`ValidateSystemYamlTool`, `ApplySystemDraftTool` и др.), агент управляет многошаговым диалогом.
- **Plain-chat path** — модель не поддерживает инструменты (локальные провайдеры, Ollama, llama.cpp), история воспроизводится вручную, ответ сохраняется напрямую.

---

## Модели базы данных

### `AiChat`
Сессия чата, принадлежит пользователю. Хранит заголовок, `last_used_provider`, `last_used_model`.

Основные методы:
- `visible_messages` — scope: только `user` и `assistant` сообщения, отсортированные по времени.
- `latest_preview` — делегирует `last_preview_message&.content`; ассоциация `has_one :last_preview_message` с DESC-сортировкой позволяет загружать превью одним `preload` без N+1.
- `scope :recent` — сортировка по `updated_at DESC` для списка чатов.

### `AiMessage`
Одно сообщение в чате. Поля: `role` (user / assistant / tool), `content`, `content_raw`, `thinking_text`, `metadata` (JSONB), `input_tokens`, `output_tokens`, а также внешние ключи на `AiChat`, `AiToolCall` (если сообщение является результатом вызова инструмента).

Связи:
- `ai_tool_calls` — исходящие вызовы инструментов от этого сообщения.
- `parent_tool_call` — входящий вызов (для `role: 'tool'`).

Важные методы:
- `display_content` — `content.presence || content_raw&.to_json`.
- `has_draft?` — проверяет `metadata['draft']['yaml']`.
- `displayable?` — сообщение видимо если есть контент, черновик или extended thinking.

После commit вызывается `broadcast_chat_snapshot`: если сообщение видимо — отправляет обновлённый snapshot чата всем подписчикам по WebSocket.

**Circular FK**: `ai_messages.ai_tool_call_id ↔ ai_tool_calls.ai_message_id`. При удалении orphan-сообщений нужно сначала обнулить `ai_tool_call_id`, потом удалить `AiToolCall`, потом `AiMessage` — иначе FK нарушение.

### `AiToolCall`
Вызов инструмента: `name`, `tool_call_id` (строка от провайдера), `arguments` (JSONB), принадлежит `AiMessage`.

### `AiModel`
Кэш метаданных модели (используется RubyLLM).

---

## Слой конфигурации провайдеров

### `Llm::ProviderCatalog`
Реестр поддерживаемых LLM-провайдеров: OpenAI, Anthropic, Gemini, OpenRouter, Mistral, xAI, Perplexity, DeepSeek, Ollama, llama.cpp.

Ключевые методы:
- `setting_configured?(setting)` — провайдер готов к работе (model + api_key если требуется).
- `tool_calling_enabled?(provider:, model:, api_base:)` — поддерживает ли конкретная модель function calling. Локальные провайдеры (Ollama, llama.cpp, localhost) всегда возвращают `false`.
- `runtime_provider(provider)` — маппинг во внутренний идентификатор RubyLLM (например, `'llama'` → `'openai'`).

### `Llm::RuntimeContext`
Строит конфигурационный объект для RubyLLM: API-ключ, API base URL, дефолтная модель. Вызывается перед каждым запросом к LLM.

### `LlmSetting` (модель)
Настройки провайдера пользователя: provider, model, api_key (зашифрован), api_base, temperature, max_output_tokens, launch_config (JSONB для llama.cpp), launch_state (JSONB для состояния процесса).

---

## Нормализация контекста

### `Llm::ContextNormalizer`
Единственная точка нормализации входящего `assistant_context` от клиента. Принимает сырой хэш из HTTP-параметров, возвращает символьный хэш гарантированной формы:

```ruby
{
  host_type: String,           # 'assistant_tab', 'system_editor_tab', …
  harness: String,             # 'system_patch' | 'system_design'
  linked_target: Hash | nil,   # { type, tab_id, system_id, source_path }
  workspace_snapshot: {        # все открытые вкладки
    active_tab_id: String | nil,
    tabs: [{ id, type, label, source_path, system_id }]
  },
  referenced_tab_ids: Array,
  editor_context: {            # YAML из открытого редактора
    system_id, source_path, yaml_hash, system_yaml, diagnostics
  }
}
```

Поле `harness` вычисляется server-side: `linked_target.type == 'system_editor'` → `'system_patch'`, иначе `'system_design'`. Клиентское значение не используется.

---

## Инфраструктура чата

### `Llm::Assistant::ChatRunner`
Оркестрирует запрос к LLM. Точка входа — `call(content:, assistant_context:)`.

Порядок выполнения:

1. Проверяет `setting_configured?`.
2. Запоминает `previous_message_id` и `no_prior_messages` (для присвоения заголовка).
3. Нормализует `assistant_context` через `ContextNormalizer`.
4. Выбирает путь: `tool_calling_enabled?` → `run_tool_agent`, иначе `run_plain_chat`.
5. После успешного ответа: обновляет `last_used_provider` / `last_used_model` (после, не до — чтобы не двигать чат в списке при ошибке).
6. Присваивает заголовок первому сообщению чата (`suggest_title`).
7. Вызывает `DraftExtractor` — извлекает черновик из новых сообщений.
8. Если черновик найден — сохраняет его в `metadata` ответного сообщения через `persist_draft_metadata`.
9. Возвращает `Result.new(chat:, assistant_message:)`.

**`run_tool_agent`** — настраивает `AiChat` (model, provider, temperature, context), создаёт `Agent`, вызывает `agent.ask(content)`. В rescue: удаляет orphan-сообщения в транзакции (с учётом circular FK), вызывает один broadcast, reraise.

**`run_plain_chat`** — создаёт `user` сообщение, строит `RubyLLM.chat`, воспроизводит историю через SQL-фильтр (без `content_raw IS NOT NULL ...` → без Ruby Enumerable), добавляет текущее сообщение с инструкциями последним, вызывает `complete`, сохраняет ответ. В rescue: удаляет user_message, reraise.

**`persist_draft_metadata`** — пишет черновик в `metadata` через `update_columns` (минуя `after_commit`) и вручную вызывает `ChatBroadcaster.broadcast` — чтобы другие вкладки получили черновик по cable, но без двойного broadcast на инициаторе.

### `Llm::Assistant::Agent`
Наследует `RubyLLM::Agent`. Работает только в tool-agent path.

- Принимает `assistant_context` как `input`.
- Инструкции рендерятся из `app/prompts/llm/assistant/agent/instructions.txt.erb` с двумя local-переменными: `context_json` (JSON контекста для модели) и `harness` (для условного рендеринга секций промпта).
- Инструменты вычисляются через `tools do ... end` блок (instance_exec в RubyLLM). В `system_patch` режиме добавляется `ApplySystemDraftTool`; в `system_design` — не добавляется, чтобы модель не пыталась его вызвать.

### `Llm::Assistant::ChatPayloadBuilder`
Сериализует чат в JSON для HTTP-ответа и cable broadcast.

- `call(chat)` → `{ chat: chat_summary, messages: messages_json }`.
- `chat_summary` — публичный метод, используется и в `index` (список чатов).
- `messages_json` — SQL-фильтр: `content IS NOT NULL OR content_raw IS NOT NULL OR thinking_text IS NOT NULL OR metadata ? 'draft'`. Последнее условие — JSONB key existence — обеспечивает попадание draft-only сообщений (без текста, но с черновиком).

### `Llm::Assistant::ChatBroadcaster`
Отправляет snapshot чата в ActionCable стрим `"assistant_chat:<chat_id>"`. Вызывается из `after_commit` на `AiMessage` и явно из `persist_draft_metadata`.

---

## Слой System Editor

### `Llm::SystemEditor::ContextBuilder`
Строит хэш контекста для промптов из уже нормализованного `assistant_context`. Включает: данные рабочего пространства, открытый YAML, DSL-справочник, примеры систем, метаданные condition expression.

- `from_normalized(normalized_context)` — основной метод; принимает уже нормализованный хэш, не вызывает `ContextNormalizer` повторно.
- `prompt_json_normalized` — сериализует в JSON для вставки в промпт.
- `plain_chat_instructions_prompt` — возвращает путь к шаблону инструкций для plain-chat пути; находится здесь, чтобы `ChatRunner` не ссылался на `KnowledgeBase::PROMPT_NAMESPACE` напрямую.

### `Llm::SystemEditor::KnowledgeBase`
Загружает статические YAML-файлы DSL-справочника: `dsl.yml`, `modules.yml`, `examples.yml`. Используется в `ContextBuilder` и `LoadDslReferenceTool`.

### `Llm::SystemEditor::DraftExtractor`
Извлекает черновик торговой системы из новых сообщений чата после завершения запроса к LLM.

Логика:
1. Ограничивает scope сообщениями с `id > after_message_id`.
2. Ищет tool-сообщение от `apply_system_draft` (последнее).
3. Если нашёл — парсит content как JSON, проверяет `payload['yaml']`, возвращает через `DraftEnvelope.from_payload`.
4. Если не нашёл — ищет последнее assistant-сообщение и запускает `fallback_from_assistant_message`: извлекает YAML-блоки из текста, прогоняет каждый через `Validator`, возвращает первый валидный как `DraftEnvelope.build`.

### `Llm::SystemEditor::DraftEnvelope`
Строит и нормализует хэш черновика стандартной формы:

```ruby
{
  'kind'             => 'system_draft',
  'yaml'             => String,
  'source_yaml_hash' => String | nil,   # FNV-1a хэш исходного YAML для защиты от перезаписи
  'validation'       => {
    'ok'          => Boolean,
    'diagnostics' => Array,
    'system'      => Hash | nil         # метаданные из Validator
  },
  'suggested_target' => {               # куда применить черновик
    'type'        => 'system_editor',
    'system_id'   => String | nil,
    'source_path' => String | nil
  } | nil
}
```

`suggested_target` вычисляется каскадно: явный параметр → fallback → данные из validation.system. Так модель может предложить систему даже без явной linked вкладки.

---

## Инструменты агента

Все инструменты наследуют `RubyLLM::Tool`. Модель вызывает их по имени, результат сохраняется как `role: 'tool'` сообщение.

| Инструмент | Класс | Что делает |
|---|---|---|
| `validate_system_yaml` | `ValidateSystemYamlTool` | Прогоняет YAML через `Research::Systems::Validation::Validator`, возвращает `ok`, `diagnostics`, `system` |
| `load_example_system` | `LoadExampleSystemTool` | Загружает пример системы из каталога по id или пути |
| `load_dsl_reference` | `LoadDslReferenceTool` | Возвращает DSL-справочник, модули, примеры, метаданные condition expression |
| `apply_system_draft` | `ApplySystemDraftTool` | Валидирует финальный YAML и вызывает `halt(JSON.generate(DraftEnvelope.build(...)))` — останавливает агента, результат захватывается `DraftExtractor` |

`ApplySystemDraftTool` доступен только в `system_patch` harness. В `system_design` модель инструктируется вернуть YAML в code-block, который `DraftExtractor` извлечёт через fallback.

---

## HTTP API

### `Api::AssistantChatsController`

| Endpoint | Метод | Действие |
|---|---|---|
| `GET /api/assistant_chats` | `index` | Список 30 последних чатов (только summary, с preload last_preview_message) |
| `POST /api/assistant_chats` | `create` | Создать пустой чат |
| `GET /api/assistant_chats/:id` | `show` | Полный payload: chat + messages |
| `PATCH /api/assistant_chats/:id` | `update` | Переименовать |
| `DELETE /api/assistant_chats/:id` | `destroy` | Удалить |
| `POST /api/assistant_chats/:id/messages` | `create_message` | Отправить сообщение, запустить LLM |

`create_message` принимает `content`, `provider` и `assistant_context` (вложенный хэш с `linked_target`, `workspace_snapshot`, `editor_context` и т.д.). Возвращает полный `ChatPayloadBuilder.call(result.chat)`.

### `AssistantChatChannel` (ActionCable)
При подписке проверяет что `chat` принадлежит `current_user`, подключается к стриму `"assistant_chat:<id>"`. Broadcast идёт при каждом изменении сообщений в чате.

---

## Режимы работы (harness)

### `system_patch` — редактирование привязанной системы

Активируется когда клиент передаёт `linked_target` с `type: 'system_editor'`. Это означает что пользователь открыл ассистент рядом с конкретной системой в редакторе.

- Агент получает в промпте: текущий YAML системы, yaml_hash, диагностику из редактора, список вкладок.
- `apply_system_draft` доступен — модель обязана вызвать его перед тем как объявить черновик готовым.
- `DraftExtractor` ищет tool-сообщение от `apply_system_draft`.
- Черновик в metadata сообщения содержит `suggested_target` с system_id и source_path.

### `system_design` — создание новой системы

Активируется когда нет `linked_target`. Пользователь использует ассистент как standalone.

- `apply_system_draft` не добавляется в инструменты агента.
- Промпт инструктирует модель вернуть YAML в code-block.
- `DraftExtractor` использует fallback: находит последнее assistant-сообщение, извлекает YAML, валидирует.
- `suggested_target` в черновике может быть nil (неизвестная система) или заполнен из метаданных валидации.

---

## Фронтенд

### `AssistantController` (Stimulus)
Главный контроллер ассистента. Управляет состоянием через Stimulus values (сохраняются в localStorage).

Ключевые обязанности:
- **Список чатов**: загружает 30 последних, пинит активный наверх если он не попал в топ-30.
- **Переключение чата**: при смене `currentChatId` немедленно очищает сообщения и отписывается от старого стрима до асинхронной загрузки нового — защита от late delivery по WebSocket.
- **Отправка сообщения**: создаёт чат если нет активного, добавляет оптимистичное user-сообщение, ждёт HTTP-ответ, применяет payload.
- **Draft apply**: проверяет `_draftTargetMatchesLinkedTarget` перед применением черновика. Если цель неизвестна или не совпадает — показывает диалог подтверждения.
- **Подписка на cable**: `AssistantChatSubscription` — при получении payload обновляет чат только если `payload.chat.id === currentChatId` (защита от стale broadcast после переключения).

### `_draftTargetMatchesLinkedTarget`
Защита overwrite guard. Возвращает `false` (требует подтверждения) если:
- нет `suggestedTarget` (черновик без провенанса),
- `linkedTab` не найден в snapshot (stale state — вкладка закрылась),
- `system_id` или `source_path` явно не совпадают с открытой вкладкой.

Возвращает `true` (применяет без подтверждения) только если нет `linkedTarget` (нет привязанного редактора) или все проверки прошли.

### `AssistantChatSubscription`
Обёртка над ActionCable subscription. Подключается к `AssistantChatChannel`, резолвит промис при `connected`/`rejected` (с таймаутом 500ms). Вызывает `onUpdate(payload)` при получении broadcast.

### `assistant/api.ts`
Канонический файл всех типов и функций для работы с API ассистента. Типы: `AssistantDraftPayload`, `AssistantChatPayload`, `AssistantContextPayload` и другие. Функции: `sendAssistantMessage`, `createAssistantChat`, `fetchAssistantChats` и т.д.

### `assistant/state.ts`
Нормализация состояния из localStorage. `hydrateWorkspaceAssistantState` восстанавливает и очищает legacy-поля. `normalizeAssistantTarget` валидирует `linkedTarget` — если нет `tabId` или не `type: 'system_editor'`, возвращает `null`.

### `assistant/templates.ts`
HTML-шаблоны для рендеринга сообщений. Рендерит draft-card только для структурных черновиков из metadata (через `assistantDraftFromMetadata`). YAML code-block в тексте получает только кнопку "Open editor" (`openAssistantYamlSnippetInSystemEditor`) без "Apply" — применять без валидированного `suggested_target` небезопасно.

---

## Полный поток: отправка сообщения (tool-agent path)

```
Пользователь → sendAssistantMessage()
  → POST /api/assistant_chats/:id/messages
    → AssistantChatsController#create_message
      → ContextNormalizer.call(assistant_context)    # нормализация, вычисление harness
      → ChatRunner.new(chat:, setting:).call(...)
        → run_tool_agent(content, context, prev_id)
          → RuntimeContext.build(setting)            # API key, base URL
          → chat.with_model / with_temperature
          → Agent.new(chat:, assistant_context:)
            → инструкции рендерятся из instructions.txt.erb
            → tools: [Validate, LoadExample, LoadDsl] + [ApplyDraft если system_patch]
          → agent.ask(content)                       # многошаговый цикл
            ↳ LLM вызывает инструмент (напр. validate_system_yaml)
            ↳ инструмент выполняется, результат → AiMessage role:tool
            ↳ LLM вызывает apply_system_draft        # только в system_patch
            ↳ ApplySystemDraftTool.execute → halt(JSON.generate(DraftEnvelope.build(...)))
            ↳ агент останавливается
          → находит последнее assistant-сообщение после prev_id
        → chat.update!(last_used_provider, last_used_model)
        → maybe_assign_chat_title
        → chat.reload
        → DraftExtractor.call(chat, after_message_id: prev_id, ...)
          → находит tool-сообщение apply_system_draft
          → парсит JSON из content → DraftEnvelope.from_payload
        → persist_draft_metadata(assistant_message, draft)
          → update_columns(metadata: ...) — без after_commit
          → ChatBroadcaster.broadcast(chat)           # для других вкладок
        → Result.new(chat:, assistant_message:)
      → ChatPayloadBuilder.call(result.chat)
  ← HTTP 200 { chat: {...}, messages: [...] }         # инициатор получает результат
  
  Параллельно:
  AiMessage after_commit (create) → broadcast при создании каждого сообщения
  → AssistantChatChannel → AssistantChatSubscription.received()
    → проверяет payload.chat.id === currentChatId
    → _applyAssistantChatPayload → ре-рендер UI
```

## Полный поток: отправка сообщения (plain-chat path)

```
Пользователь → sendAssistantMessage()
  → POST /api/assistant_chats/:id/messages
    → ChatRunner#run_plain_chat(content, context)
      → chat.ai_messages.create!(role: 'user', content:)
      → RubyLLM.chat(model:, provider:, context:)
      → воспроизводит историю через SQL-фильтр (без текущего user-сообщения)
      → добавляет текущее сообщение с инструкциями:
        ContextBuilder.plain_chat_instructions_prompt + context_json
      → llm_chat.complete                             # один запрос, нет инструментов
      → chat.ai_messages.create!(role: 'assistant', content: response.content.to_s, ...)
    → DraftExtractor.call(...)
      → tool-сообщение не найдено
      → fallback_from_assistant_message:
        → extract_yaml_candidates(content)            # ищет ```yaml блоки
        → Validator.new(yaml).call для каждого
        → возвращает первый валидный → DraftEnvelope.build
    → persist_draft_metadata если черновик найден
  ← HTTP 200 { chat:, messages: }
```

---

## WebSocket broadcast: кто и когда

| Событие | Откуда | Через что |
|---|---|---|
| Создание любого сообщения | `AiMessage after_commit :create` | `ChatBroadcaster.broadcast` |
| Обновление сообщения | `AiMessage after_commit :update` | `ChatBroadcaster.broadcast` |
| Удаление сообщения | `AiMessage after_commit :destroy` | `ChatBroadcaster.broadcast` |
| Запись draft в metadata | `ChatRunner#persist_draft_metadata` (явно) | `ChatBroadcaster.broadcast` |
| Orphan cleanup при ошибке | `ChatRunner#run_tool_agent` (явно) | `ChatBroadcaster.broadcast` |

Broadcast фильтруется в `broadcast_chat_snapshot`: только `role: 'user'` или `role: 'assistant'` с `displayable?` сообщения запускают broadcast — tool-сообщения не попадают напрямую.

---

## Связь с System Editor (вкладки)

Frontend передаёт в `assistant_context`:

- `linked_target` — вкладка к которой привязан чат: только `{ type, tab_id }`. System_id и source_path не хранятся в `linked_target` — они разрешаются из `workspace_snapshot.tabs` по `tab_id`. Это сделано чтобы snapshot всегда был источником истины.
- `workspace_snapshot` — все открытые вкладки с их `system_id`, `source_path`.
- `editor_context` — содержимое активного редактора: YAML, yaml_hash, диагностика.

`yaml_hash` — FNV-1a 32-bit хэш текущего YAML. Сохраняется в `DraftEnvelope.source_yaml_hash`. При применении черновика frontend проверяет совпадение хэшей — если YAML в редакторе изменился пока ассистент отвечал, показывается предупреждение о конфликте.

Когда пользователь нажимает "Apply" на draft-card:
1. `_applyAssistantDraft` проверяет `_draftTargetMatchesLinkedTarget`.
2. Если OK — диспатчит `assistant:applyDraft` событие вверх.
3. Tabs controller получает событие, находит нужную вкладку, применяет YAML через system editor.

При нажатии "Open editor" на YAML code-block (без структурного черновика):
1. `openAssistantYamlSnippetInSystemEditor` строит синтетический `AssistantDraftPayload` из raw YAML.
2. Диспатчит `assistant:openDraftInSystemEditor`.
3. Tabs controller открывает систему в редакторе.
