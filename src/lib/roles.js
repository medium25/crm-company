export const ROLE_OPTIONS = [
  { value: 'ceo', label: 'CEO' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'admin', label: 'Администратор' },
  { value: 'teacher', label: 'Учитель' },
  { value: 'test', label: 'Тестовый сотрудник' },
];

/** Ключи разделов меню, доступные для ручного выбора у роли test — см. Sidebar.ITEMS. */
export const TEST_SECTION_OPTIONS = [
  { value: 'leads', label: 'Заявки' },
  { value: 'trials', label: 'Пробные' },
  { value: 'students', label: 'Студенты' },
  { value: 'teachersGroups', label: 'Учителя и группы' },
  { value: 'payments', label: 'Финансы' },
  { value: 'reports', label: 'Отчёты и статистика' },
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
