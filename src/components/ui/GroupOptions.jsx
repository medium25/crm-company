import { useMemo } from 'react';

const DAY_ORDER = { odd: 0, even: 1 };

/**
 * Группы по учителям (по алфавиту); внутри учителя — нечётные дни, потом чётные,
 * затем по времени и коду. Работает и с группами (`teacherName`, `schedule`, `code`),
 * и с записями студента (`teacherName`, `groupCode`).
 * @template T
 * @param {T[]} items
 * @returns {Array<{teacher: string, items: T[]}>}
 */
export function groupByTeacher(items) {
  const byTeacher = new Map();
  for (const g of items) {
    const key = g.teacherName || 'Без учителя';
    byTeacher.set(key, [...(byTeacher.get(key) ?? []), g]);
  }
  const codeOf = (g) => String(g.code ?? g.groupCode ?? '');
  return [...byTeacher.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([teacher, list]) => ({
      teacher,
      items: [...list].sort(
        (x, y) =>
          (DAY_ORDER[x.schedule?.type] ?? 2) - (DAY_ORDER[y.schedule?.type] ?? 2) ||
          String(x.schedule?.time ?? '').localeCompare(String(y.schedule?.time ?? '')) ||
          codeOf(x).localeCompare(codeOf(y)),
      ),
    }));
}

/**
 * <option>-ы для <Select>: пустой пункт и группы, разложенные по учителям (optgroup).
 * Единый порядок для всех выборов группы в приложении.
 * @param {Object} props
 * @param {Array<Object>} props.items группы или записи студента
 * @param {string} [props.placeholder] текст пустого пункта
 * @param {(g: Object) => string} [props.getValue]
 * @param {(g: Object) => string} [props.getLabel]
 */
export function GroupOptions({
  items,
  placeholder = 'Выбрать',
  getValue = (g) => g.id,
  getLabel = (g) => `${g.code} · ${g.courseName}${g.schedule?.time ? ` · ${g.schedule.time}` : ''}`,
}) {
  const grouped = useMemo(() => groupByTeacher(items), [items]);
  return (
    <>
      <option value="">{placeholder}</option>
      {grouped.map(({ teacher, items: list }) => (
        <optgroup key={teacher} label={teacher}>
          {list.map((g) => (
            <option key={getValue(g)} value={getValue(g)}>
              {getLabel(g)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
