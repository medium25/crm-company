/**
 * Критерии оценки операторов «Отдел продаж» (Отчёты и статистика →
 * Статистика → Отдел продаж) — пороги зелёный/жёлтый/красный. Каждый шаг
 * воронки считается от ПРЕДЫДУЩЕГО шага (конверсия по цепочке), не от
 * общего числа лидов — так видно, на каком именно переходе оператор
 * реально теряет людей, а не размыто в масштабе всей воронки. Хранятся в
 * settings/{branchId}.operatorScoreCriteria (см. OperatorScoringCriteriaTab),
 * этот объект — дефолт для филиалов, где ещё не настраивали.
 */
export const DEFAULT_OPERATOR_SCORE_CRITERIA = {
  leadsPerDay: { green: 15, yellow: 10 },
  dozvon: { green: 85, yellow: 65 },
  probny: { green: 60, yellow: 40 },
  provoden: { green: 55, yellow: 35 },
  oplata: { green: 30, yellow: 18 },
  overdueHours: { green: 4, yellow: 24 },
};

export const CRITERIA_FIELDS = [
  { key: 'leadsPerDay', label: 'Лидов в день, мин. (6-дневная неделя, пн–сб)' },
  { key: 'dozvon', label: 'Дозвон (от лидов), %' },
  { key: 'probny', label: 'Пробный (от дозвона), %' },
  { key: 'provoden', label: 'Проведён (от пробного), %' },
  { key: 'oplata', label: 'Оплата (от проведён), %' },
  { key: 'overdueHours', label: 'Средняя просрочка сейчас, ч', invert: true },
];

/** Выше — лучше (конверсии). */
export function gradeRate(value, thresholds) {
  if (value >= thresholds.green) return 'good';
  if (value >= thresholds.yellow) return 'warn';
  return 'bad';
}

/**
 * Рабочих дней (пн–сб, воскресенье не считается) в периоде [from, to]
 * включительно — знаменатель для нормы «лидов в день».
 * @param {Date} from
 * @param {Date} to
 * @returns {number}
 */
export function countWorkingDays(from, to) {
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= last) {
    if (cursor.getDay() !== 0) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * Объём лидов за период — норма считается не за весь период разом, а на
 * рабочий день (6-дневная неделя, пн–сб), иначе короткий период всегда
 * выглядел бы «плохим» по сравнению с месячным. Выше — лучше.
 * @param {number} totalLeads
 * @param {number} workingDays
 * @param {{green: number, yellow: number}} thresholds лидов в день
 */
export function gradeLeadsVolume(totalLeads, workingDays, thresholds) {
  if (workingDays <= 0) return 'warn';
  const perDay = totalLeads / workingDays;
  if (perDay >= thresholds.green) return 'good';
  if (perDay >= thresholds.yellow) return 'warn';
  return 'bad';
}

/** Ниже — лучше (просрочка в часах). */
export function gradeOverdue(hours, thresholds) {
  if (hours <= thresholds.green) return 'good';
  if (hours <= thresholds.yellow) return 'warn';
  return 'bad';
}

/**
 * Общая оценка оператора по воронке — называет самый слабый шаг, если он
 * красный, иначе «Хорошо»/«Отлично». Так менеджер сразу видит, куда
 * смотреть, а не только итоговую температуру.
 * @param {{leadsGrade: string, dozvonGrade: string, probnyGrade: string, provodenGrade: string, oplataGrade: string, overdueGrade: string}} grades
 * @returns {{label: string, tone: 'good'|'warn'|'bad'}}
 */
export function overallGrade(grades) {
  const steps = [
    { grade: grades.leadsGrade, label: 'Мало лидов в день' },
    { grade: grades.dozvonGrade, label: 'Проблема на дозвоне' },
    { grade: grades.probnyGrade, label: 'Проблема на записи на пробный' },
    { grade: grades.provodenGrade, label: 'Проблема на явке на пробный' },
    { grade: grades.oplataGrade, label: 'Проблема на оплате' },
    { grade: grades.overdueGrade, label: 'Проблема с просрочками' },
  ];
  const worstBad = steps.find((s) => s.grade === 'bad');
  if (worstBad) return { label: worstBad.label, tone: 'bad' };
  const hasWarn = steps.some((s) => s.grade === 'warn');
  return hasWarn ? { label: 'Хорошо', tone: 'warn' } : { label: 'Отлично', tone: 'good' };
}

/** «3.2» → «3.2 ч»; «26» → «1 д 2 ч» — компактно для метрик-чипов. */
export function formatOverdueHours(hours) {
  if (hours < 24) return `${hours.toFixed(1)} ч`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours % 24);
  return rest > 0 ? `${days} д ${rest} ч` : `${days} д`;
}
