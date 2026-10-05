# Дизайн-код ICON CRM

Один набор токенов на всё приложение. Значения живут в `tailwind.config.js` и `src/index.css`. Спек: `docs/superpowers/specs/2026-09-29-design-tokens-design.md`.

## Правила

1. Только токены. Никаких `text-[13px]`, `#hex`, `bg-[rgba(...)]`, `rounded-xl` в разметке. Проверяет `npm run check:design`, деплой без него не идёт.
2. Высоту и радиус контролов задаёт компонент: `Button/Input/Select/DatePicker` с `size="md"` (48px, формы и модалки) или `size="sm"` (36px, фильтры, таблицы, канбан).
3. Таблицы и канбан «Заявки» компактные (`sm`); карточки, формы, модалки обычные (`md`).
4. Исключение для данных (цвета оператора, палитры, приоритеты): строка с комментарием `design-ok: причина`. Цвета графиков — в `src/lib/chartColors.js`.

## Токены

| Что | Значения |
|---|---|
| Текст | `caption` 12, `small` 13 (таблицы, подписи), `body` 14, `control` 15 (кнопки, поля), `title` 17 (заголовки блоков), `page` 22, `kpi` 36 |
| Радиусы | `card` 16 (карточки, модалки), `row` 12 (плитки, строки), `field` 12 (кнопки, поля), `badge` пилюля; круг — `rounded-full` |
| Тени | `shadow-soft` (карточки), `shadow-card` (строки таблиц), `shadow-hover`, `shadow-modal` |
| Цвета | `bg surface card card-head surface-alt border border-strong text muted navy orange success danger warning info trial burgundy chip chart-1..7` (`trial` жёлтый: записан на пробный; `burgundy`: больше, чем мест) |

## Что использовать вместо чего

| Было | Стало |
|---|---|
| `text-[13px]` | `text-small` |
| `text-[15px]` в заголовке блока | `text-title` |
| `text-[15px]` в кнопке/поле | `text-control` (даёт сам компонент) |
| `text-[34px]` | `text-kpi` |
| `rounded-xl` / `rounded-2xl` | `rounded-row` / `rounded-card` |
| `h-11` на поле | без класса (по умолчанию `md`), фильтр: `size="sm"` |
| `bg-[#EEF0F3]` | `bg-chip` |
| `#E5842B` | `text-warning` |

## Компоненты

`Card` (белая, тень), `Tile` (плитка внутри Card, фон страницы), `StatCard` (KPI-карточка), `SectionTitle` (заголовок блока + подпись), `FilterChip` (чип фильтра), `Badge` (пилюля), `Button`, `Input`, `Select`, `DatePicker`, `Modal`, `Tabs`, `Table`.
