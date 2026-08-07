export const ROLE_OPTIONS = [
  { value: 'ceo', label: 'CEO' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'admin', label: 'Администратор' },
  { value: 'teacher', label: 'Учитель' },
];

/**
 * ceo/manager назначают любую роль; admin — только «Учитель» (см. правило
 * на бэкенде в firestore.rules, это только скрытие недоступного в UI).
 * @param {import('../types.js').Role|null} callerRole
 * @returns {typeof ROLE_OPTIONS}
 */
export function assignableRoleOptions(callerRole) {
  return callerRole === 'admin' ? ROLE_OPTIONS.filter((o) => o.value === 'teacher') : ROLE_OPTIONS;
}
