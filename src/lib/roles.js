export const ROLE_OPTIONS = [
  { value: 'ceo', label: 'CEO' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'admin', label: 'Администратор' },
  { value: 'operator', label: 'Оператор' },
  { value: 'teacher', label: 'Учитель' },
  { value: 'test', label: 'Тестовый сотрудник' },
];

export const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]));

/**
 * Роли с «админскими» правами в данных (то же, что ceo/manager/admin): оператор — как администратор,
 * ограничен так же. Ведут заявки, поэтому входят в пулы операторов (см. OPERATOR_POOL_ROLES).
 */
export const OPERATOR_POOL_ROLES = ['ceo', 'manager', 'admin', 'operator'];

/** Роли, у которых список разделов бокового меню настраивается вручную (см. AddStaffModal). */
export const CUSTOM_SECTION_ROLES = ['manager', 'admin', 'operator', 'test'];

/** Все пункты бокового меню (ключи — Sidebar.ITEMS), доступные для ручного выбора. */
export const SECTION_OPTIONS = [
  { value: 'dashboard', label: 'Дашборд' },
  { value: 'leads', label: 'Заявки' },
  { value: 'trials', label: 'Пробные' },
  { value: 'tasks', label: 'Задачи' },
  { value: 'students', label: 'Студенты' },
  { value: 'teachersGroups', label: 'Учителя и группы' },
  { value: 'payments', label: 'Финансы' },
  { value: 'staff', label: 'Сотрудники' },
  { value: 'settings', label: 'Настройки' },
];

/** Для test — прежний короткий список (без дашборда, сотрудников и настроек). */
export const TEST_SECTION_OPTIONS = SECTION_OPTIONS.filter((o) => !['dashboard', 'staff', 'settings'].includes(o.value));

const ALL_SECTIONS = SECTION_OPTIONS.map((o) => o.value);

/** Разделы меню по умолчанию для роли — пока им не выбран свой список. */
export const DEFAULT_SECTIONS = {
  ceo: ALL_SECTIONS,
  manager: ALL_SECTIONS,
  admin: ALL_SECTIONS.filter((k) => k !== 'staff'),
  operator: ALL_SECTIONS.filter((k) => k !== 'staff'),
  teacher: ['teachersGroups'],
  test: [],
};

/**
 * Какие разделы меню видит сотрудник. test — только выбранные вручную; manager/admin/operator — выбранные
 * вручную, а пока список пуст, набор по умолчанию для роли; ceo и teacher — всегда по роли.
 * @param {string|null} role
 * @param {string[]} [allowedSections] staff.allowedSections
 * @returns {string[]}
 */
export function visibleSectionKeys(role, allowedSections = []) {
  if (role === 'test') return allowedSections;
  if (CUSTOM_SECTION_ROLES.includes(role) && allowedSections.length > 0) return allowedSections;
  return DEFAULT_SECTIONS[role] ?? [];
}

/**
 * ceo/manager назначают любую роль; admin/operator — только «Учитель» (см. правило
 * на бэкенде в firestore.rules, это только скрытие недоступного в UI).
 * @param {import('../types.js').Role|null} callerRole
 * @returns {typeof ROLE_OPTIONS}
 */
export function assignableRoleOptions(callerRole) {
  return callerRole === 'admin' || callerRole === 'operator' ? ROLE_OPTIONS.filter((o) => o.value === 'teacher') : ROLE_OPTIONS;
}
