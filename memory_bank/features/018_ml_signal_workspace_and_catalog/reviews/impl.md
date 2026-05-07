# Review

Фича: 018_ml_signal_workspace_and_catalog
Стадия: impl
Статус: advisory
Дата: 2026-05-08

## Итог

Blocking замечания предыдущего impl review закрыты: ML prediction/checksum boundaries читают canonical keys без symbol/string fallbacks, frontend берет prediction cap из backend `max_prediction_rows`, а grid request guard явно оформлен как process-local MVP guard. Повторная проверка не нашла blockers для перехода в done; остались advisory риски по legacy/adapter shape boundaries и общему API error-sanitization follow-up.

## Замечания

1. advisory, `app/services/ml/feature_window.rb:54,68,108-110` и `app/services/ml/feature_definition_compatibility.rb:23`: legacy feature-spec aliases (`type`/`key`, `name`/`alias`) остаются совместимостью для сохраненных snapshots. При следующем изменении ML feature spec boundary стоит зафиксировать legacy snapshot test/comment либо нормализовать один раз на lifecycle boundary.
2. advisory, `app/services/ml/adapters/baseline_direction_classifier.rb:111-119,244-250`: adapter все еще принимает symbol/string feature payload shapes. Это не блокирует 018, но при следующем изменении adapter/dataset boundary лучше закрепить одну canonical форму.
3. advisory, `app/services/research/modules/native.rb:12-13`: `Native.coerce_params` остается общим runtime/validator normalizer. Если runtime-вход окончательно string-keyed после structure validation, можно сузить этот boundary отдельным follow-up.
4. advisory, `app/services/research/modules/input_resolver.rb:42`: `module_series` key shape остается symbol-keyed while input refs are string-keyed. Это текущий internal runtime contract; не расширялось в fix, но стоит упростить при следующем refactor input resolver.
5. advisory, `app/controllers/api/application_controller.rb:25-27`: базовые `bad_request`/`not_found` продолжают отдавать raw exception message. Это broader API hardening, не blocker для 018. Не применял CodeRabbit suggestion с `case error`, потому что такой type-dispatch противоречит conventions; если чинить, нужен отдельный generic/sanitized API error policy.
6. advisory, CodeRabbit suggested `projected_values` timestamp coercion and `PredictionRepository#source_window_mismatches` safe-access. Оба пункта пропущены намеренно: `InferenceService::Result#series` и repository SQL query already use canonical integer epoch timestamps; `to_i`/safe access widened internal contracts and would mask invariant breaks.
7. advisory, CodeRabbit suggested non-JSON fallback for ML prediction error responses. Не применял: `/api/ml/predictions` is a server-owned JSON API with structured error contract; malformed non-JSON error should remain visible instead of being silently converted to a column error.

## Проверки

- `bundle exec rspec spec/requests/api/ml_predictions_spec.rb spec/services/ml/source_window_checksum_spec.rb spec/services/ml/inference_service_spec.rb` — passed, 43 examples.
- `bundle exec rspec spec/services/research/modules/input_resolver_spec.rb` — passed, 4 examples.
- `npm test -- app/javascript/__tests__/data_grid/ml_prediction_columns.test.ts app/javascript/__tests__/system_editor/autocomplete.test.ts` — passed, 17 tests.
- `npm run typecheck` — passed.
- `bundle exec steep check` — passed.
- `coderabbit review --agent --base-commit 9c85907` — completed; blocking-relevant items were fixed or rejected above as convention-incompatible false positives.

## Следующий шаг

`done: 018` — package can move to done with advisory follow-ups retained above.
