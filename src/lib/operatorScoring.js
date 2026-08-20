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
  dozvon: { green: 85, yellow: 65 },
  probny: { green: 60, yellow: 40 },
  provoden: { green: 55, yellow: 35 },
  oplata: { green: 30, yellow: 18 },
  overdueHours: { green: 4, yellow: 24 },
};

export const CRITERIA_FIELDS = [
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
 * @param {{dozvonGrade: string, probnyGrade: string, provodenGrade: string, oplataGrade: string, overdueGrade: string}} grades
 * @returns {{label: string, tone: 'good'|'warn'|'bad'}}
 */
export function overallGrade(grades) {
  const steps = [
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
