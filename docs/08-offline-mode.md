# Offline Mode

## Зачем нужен этот раздел

В проекте есть несколько режимов деградации, и их нельзя сводить к одному слову "offline". Для пользователя и для разработчика это принципиально разные ситуации:

- интернет пропал;
- backend приложения недоступен;
- backend доступен, но Bitfinex недоступен;
- часть данных уже есть в browser cache и приложение может продолжать работать локально.

## Какие слои участвуют

Для degraded/offline behavior важны четыре слоя:

- `localStorage` с workspace-state;
- `IndexedDB` с кэшем свечей и indicator series;
- backend API / ActionCable;
- внешние источники вроде Bitfinex и Yahoo Finance.

## Режим 1. Все online

Работают все потоки:

- backend API;
- ActionCable;
- Bitfinex public WebSocket;
- регулярные jobs;
- сохранение и загрузка presets;
- market tiles;
- linked chart/data synchronization.

## Режим 2. Backend доступен, Bitfinex недоступен

Это exchange-degraded mode, а не полный отказ системы.

Что остается доступным:

- навигация по `Main` и `Graph`;
- уже загруженные chart tabs;
- уже загруженные data tabs;
- drawings, overlays, panel layout;
- conditions, formulas, systems и stats по уже имеющимся данным;
- локальное workspace-state.

Что деградирует:

- server-side candle sync;
- live crypto updates из Bitfinex;
- freshness crypto tickers;
- статус соединения в UI становится degraded.

Что важно понимать:

- backend по-прежнему может отвечать;
- `/api/health` может быть доступен;
- проблема в этом режиме не в приложении как таковом, а во внешнем exchange source.

## Режим 3. Backend недоступен, интернет есть

Это режим "сервер приложения down или недоступен из браузера", но интернет у клиента при этом еще есть.

Что может продолжать работать:

- открытие уже сохраненного workspace из `localStorage`;
- чтение свечей из `IndexedDB`;
- чтение кэшированных indicator series из `IndexedDB`;
- chart interaction на уже имеющихся данных;
- data tabs, если им хватает локального candle/indicator cache;
- conditions, formulas, system columns и stats на текущих rows;
- локальные UI-операции: переключение tab, layout, drawings, selection.

Что может частично продолжать обновляться:

- открытые графики могут продолжать получать live candles из публичного Bitfinex WebSocket, потому что этот поток не зависит от backend.

Что не работает:

- API requests;
- ActionCable;
- auth actions;
- загрузка/сохранение presets;
- add/remove dashboard and market symbols;
- market tiles через Yahoo Finance;
- server-side indicators;
- server-derived columns, если для них нет достаточного локального cache.

## Режим 4. Интернет у браузера недоступен

Это наиболее жесткий offline mode.

Что остается доступным:

- восстановление tabs из `localStorage`;
- chart tabs на уже кэшированных свечах;
- data tabs на уже кэшированных свечах;
- client-side indicators, если хватает данных;
- conditions, formulas, systems и stats на локально доступных rows;
- drawings и layout;
- просмотр ранее открытого workspace.

Что не работает:

- любые API calls;
- ActionCable;
- direct Bitfinex WebSocket;
- Yahoo Finance data;
- login / registration;
- сохранение presets на сервер;
- загрузка новых данных, которых нет в local cache.

## Что именно дает `IndexedDB`

`IndexedDB` в проекте хранит:

- cached candles;
- cached indicator series.

Это позволяет:

- быстро восстановить chart после reload;
- открыть data tab без ожидания API, если нужные данные уже были;
- продолжать локальный анализ в degraded/offline mode.

Важно:

- `IndexedDB` не является source of truth;
- это производный browser cache;
- server-only calculations не обязаны быть полностью воспроизводимы без backend.

## Linked Data Tabs в offline/degraded mode

Linked data tabs ведут себя лучше, чем полностью server-driven data tabs, если их набор колонок опирается на локальные данные.

Хорошо работают локально:

- базовые OHLCV;
- client-side indicator columns;
- systems columns;
- conditions;
- navigation chart <-> data by timestamp.

Могут деградировать:

- `change` columns;
- server-side indicators;
- instrument columns, если для второго symbol нет нужного локального cache;
- все, что требует свежего API-response.

## Trading Systems в offline/degraded mode

Если rows уже доступны локально, пользователь все равно может:

- видеть system-column в data tab;
- смотреть `ENTRY`, `EXIT`, `OPEN`;
- считать stats по существующим rows;
- открыть `system_stats` tab;
- смотреть markers на linked chart.

Не будет работать только то, что требует догрузки отсутствующих данных с сервера.
