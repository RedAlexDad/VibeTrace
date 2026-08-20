# Perf tooling

Инструменты для измерения производительности VibeTrace. Требуют запущенный
`opencode serve` и dev-сервер (см. `Makefile`).

## Требования

- Python 3.11+
- Playwright Python: `pip install playwright && playwright install chromium`

## bench.py — замер рендера и долгих задач

```bash
python3 perf/bench.py [--url "http://localhost:5173/?dir=...&session=..."]
```

Выводит:

- `cards` — смонтированных карточек субагентов (виртуализация),
- `svgs` — SVG-узлов в DOM,
- `afv` — групп `g.afv-action` в D3-схемах,
- `domNodes` — всего DOM-узлов,
- `cpuRebuildMs` — CPU в долгих задачах при переключении timeline↔summary,
- `cpuScrollMs` — CPU при прокрутке списка сообщений,
- `longTotal` — суммарный CPU долгих задач за сессию,
- `consoleErrors` — ошибок в консоли.

## profile.py — трассировка Chrome и разбивка CPU по фазам

```bash
python3 perf/profile.py [--url ...] [--out /tmp/opencode/trace.json]
```

Снимает CDP-трассировку и группирует время по категориям, а затем
по человекочитаемым фазам:

- **Scripting (JS)** — выполнение/компиляция JS (ускоряется WASM/Rust),
- **Layout** — пересчёт геометрии,
- **Paint/Composite** — отрисовка (ускорению на Rust **не поддаётся**),
- **Parse/Network** — загрузка и разбор.

## История замеров

Бенчмарк (URL: VibeTrace, 13 карточек до виртуализации):

| Дата       | Изменение                           | cards | svgs | domNodes | rebuild ms | longTotal ms |
| ---------- | ----------------------------------- | ----: | ---: | -------: | ---------: | -----------: |
| 2026-08-20 | до оптимизации                      |    13 |  283 |    26171 |       3055 |         5715 |
| 2026-08-20 | виртуализация + memo + heartbeat 5s |   4–5 |  ~90 |    ~7000 |        695 |         2202 |
| 2026-08-20 | memo транскрипта + кэш markdown     |     4 |  702 |    16633 |        394 |         2915 |

Разница ~3.7× по DOM-узлам и ~4.4× по CPU при переключении раскладки.
(замер 2026-08-20 «memo транскрипта + кэш markdown» сделан на сессии
`ses_fe41e5d…` с бо́льшим числом сообщений, чем в прошлых замерах — поэтому
`svgs`/`domNodes` выше, хотя `rebuild` упал в ~7.8× относительно исходника.)

## Профиль CPU (по событиям трассы, 2026-08-20)

| Фаза                    |  Доля | События                                           |
| ----------------------- | ----: | ------------------------------------------------- |
| Scripting (JS)          | 33.7% | FunctionCall, RunMicrotasks, EventDispatch, V8 GC |
| Layout                  |  6.0% | Layout, UpdateLayoutTree, PrePaint                |
| Paint/Composite         |  3.1% | Paint, RasterTask                                 |
| Parse/Network           |  0.3% | —                                                 |
| Other (обёртки RunTask) | 57.0% | RunTask — под ним идут перечисленные выше         |

**Вывод по WASM/Rust:** CPU уходит в выполнение JS (React-рендер + D3-раскладка,
в сумме ~60–70% включая обёртки RunTask), а Paint/Layout — всего ~9%.
WASM ускорил бы только чистые расчёты раскладки D3 (малая доля); основная
стоимость — React-рендер DOM и SVG-узлы, которые Rust-код не заменит.
