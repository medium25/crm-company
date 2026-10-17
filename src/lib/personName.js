/**
 * Имя человека хранится тремя полями: firstName, lastName и fullName = «имя фамилия» (имя всегда первым —
 * остальной код читает fullName и порядок слов не трогает).
 */

/** «Имя Фамилия» из двух полей; пустая фамилия не оставляет пробела. */
export function joinName(firstName, lastName) {
  return [firstName, lastName]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Поля для формы существующей записи: сохранённые firstName/lastName, а у старых записей (где есть только
 * fullName) — первое слово как имя, остальное как фамилия. Для старых записей это лишь заготовка: порядок слов
 * в строке неизвестен, при редактировании его можно поправить.
 */
export function nameParts(person) {
  if (person?.firstName != null || person?.lastName != null) {
    return { firstName: person.firstName ?? '', lastName: person.lastName ?? '' };
  }
  const [first = '', ...rest] = (person?.fullName ?? '').trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
}
