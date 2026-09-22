/**
 * Раз в час пересчитывает 6 плиток дашборда и график «Сравнение» ОДИН РАЗ на
 * весь филиал и пишет результат в Firestore `dashboardStats/{branchId}` —
 * вместо того чтобы каждый сотрудник на каждом заходе на дашборд читал
 * enrollments/students/transactions заново сам (это и было причиной, почему
 * 21.09.2026 раздел «Дашборд» потратил 100 618 чтений из 148 026 за сутки).
 * Веб-приложение (DashboardPage.jsx) теперь только подписывается на этот
 * один документ — 1 чтение при открытии + 1 на каждое обновление документа,
 * не больше ~17-24 в сутки на сотрудника (по числу запусков триггера).
 *
 * Использует те же helpers, что и Code.gs (fsRequest_/runQuery_/countDocs_/
 * cached_/trackedRun_ и т.п.) — файл живёт в ТОМ ЖЕ Apps Script проекте
 * (Web App лидов), отдельного сервис-аккаунта не заводили.
 *
 * Формулы 1:1 скопированы с src/lib/stats.js (countStudentBuckets,
 * countPaidThisMonth, countLeftActiveGroup, countLeftAfterTrial,
 * getDailyRevenueComparison) — если там поменяется бизнес-логика, поправь
 * и здесь, иначе плитки на дашборде разъедутся с остальной системой.
 *
 * Настройка (один раз, после вставки файла в тот же проект, что Code.gs):
 *   1. Запустить refreshDashboardStats() вручную — заполнит документ сразу,
 *      без этого дашборд будет висеть на «Загрузка…» до первого срабатывания триггера.
 *   2. Запустить installDashboardStatsTrigger() — ставит почасовой триггер.
 */

// Реальный подсчёт идёт только в эти часы по Ташкенту (appsscript.json:
// timeZone уже 'Asia/Tashkent') — вне рабочего времени триггер срабатывает,
// но сразу выходит без единого чтения Firestore. Раньше сокращает суточный
// расход, дашборду не нужна свежесть по ночам.
const DASHBOARD_STATS_ACTIVE_HOURS = { from: 7, to: 23 };

function startOfMonth_(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfQuarter_(d) {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}
function startOfYear_(d) {
  return new Date(d.getFullYear(), 0, 1);
}
function addMonths_(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function daysInMonth_(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function monthKey_(d) {
  return Utilities.formatDate(d, 'Asia/Tashkent', 'yyyy-MM');
}

/** Тот же выбор диапазона, что churnPeriodRange в stats.js. */
function churnPeriodRange_(churnPeriod, today) {
  if (churnPeriod === 'month') return { start: startOfMonth_(today), end: today };
  if (churnPeriod === 'quarter') return { start: startOfQuarter_(today), end: today };
  return { start: startOfYear_(today), end: today };
}

/**
 * Активные/пробные (с учителем, дата пробного в этом месяце)/должники —
 * одним запросом students + одним запросом enrollments (для «с учителем»).
 * Копия countStudentBuckets из stats.js.
 */
function computeStudentBuckets_(branchId, now) {
  const docs = runQuery_('students', [
    { field: 'branchId', op: 'EQUAL', value: branchId },
    { field: 'status', op: 'IN', value: ['active', 'trial', 'paused'] },
    { field: 'isArchived', op: 'EQUAL', value: false },
  ]);
  const trialEnrollments = runQuery_('enrollments', [
    { field: 'branchId', op: 'EQUAL', value: branchId },
    { field: 'status', op: 'EQUAL', value: 'trial' },
    { field: 'isArchived', op: 'EQUAL', value: false },
  ]);
  const withTeacher = {};
  trialEnrollments.forEach((e) => {
    if (e.teacherId) withTeacher[e.studentId] = true;
  });

  const monthStart = startOfMonth_(now);
  const nextMonthStart = addMonths_(monthStart, 1);

  let activeStudents = 0;
  let trial = 0;
  let debtors = 0;
  docs.forEach((s) => {
    if (s.status === 'active') activeStudents += 1;
    if (s.status === 'trial' && withTeacher[s.id]) {
      const raw = s.trialDate || s.trialAt;
      if (raw) {
        const at = new Date(raw);
        if (at >= monthStart && at < nextMonthStart) trial += 1;
      }
    }
    if ((s.balance || 0) < 0) debtors += 1;
  });
  return { activeStudents, trial, debtors };
}

/** «Ушли из активной группы» — копия countLeftActiveGroup из stats.js (период уже в запросе). */
function computeLeftActiveGroup_(branchId, start, end) {
  const leftDocs = runQuery_('enrollments', [
    { field: 'branchId', op: 'EQUAL', value: branchId },
    { field: 'status', op: 'IN', value: ['left', 'archived'] },
    { field: 'leftAt', op: 'GREATER_THAN_OR_EQUAL', value: start },
    { field: 'leftAt', op: 'LESS_THAN_OR_EQUAL', value: end },
  ]);
  const openDocs = runQuery_('enrollments', [
    { field: 'branchId', op: 'EQUAL', value: branchId },
    { field: 'status', op: 'IN', value: ['active', 'trial', 'paused'] },
    { field: 'isArchived', op: 'EQUAL', value: false },
  ]);
  const stillEnrolled = {};
  openDocs.forEach((e) => {
    stillEnrolled[e.studentId] = true;
  });
  const studentIds = {};
  leftDocs.forEach((e) => {
    if (!e.activatedAt) return;
    if (stillEnrolled[e.studentId]) return;
    studentIds[e.studentId] = true;
  });
  return Object.keys(studentIds).length;
}

/** «Ушли после пробного» — копия countLeftAfterTrial из stats.js (период уже в запросе). */
function computeLeftAfterTrial_(branchId, start, end) {
  const leftStudents = runQuery_('students', [
    { field: 'branchId', op: 'EQUAL', value: branchId },
    { field: 'isArchived', op: 'EQUAL', value: false },
    { field: 'status', op: 'EQUAL', value: 'left' },
    { field: 'leftAt', op: 'GREATER_THAN_OR_EQUAL', value: start },
    { field: 'leftAt', op: 'LESS_THAN_OR_EQUAL', value: end },
  ]);
  const candidates = leftStudents.filter((s) => s.trialAt);
  let count = 0;
  candidates.forEach((student) => {
    const enrolls = runQuery_('enrollments', [{ field: 'studentId', op: 'EQUAL', value: student.id }]);
    const everActivated = enrolls.some((e) => e.activatedAt);
    if (!everActivated) count += 1;
  });
  return count;
}

/**
 * Платежи текущего и прошлого месяца — ОДИН запрос на «Оплатили в текущем
 * месяце» (уникальные студенты) И на график «Сравнение» по дням (копия
 * fetchDashboardPayments + getDailyRevenueComparison из stats.js).
 */
function computePaymentsAndChart_(branchId, now) {
  const currentMonth = monthKey_(now);
  const prevMonthDate = addMonths_(now, -1);
  const prevMonth = monthKey_(prevMonthDate);

  const txs = runQuery_('transactions', [
    { field: 'branchId', op: 'EQUAL', value: branchId },
    { field: 'type', op: 'EQUAL', value: 'payment' },
    { field: 'month', op: 'IN', value: [currentMonth, prevMonth] },
  ]);

  const paidStudents = {};
  const byDay = {};
  byDay[currentMonth] = {};
  byDay[prevMonth] = {};
  txs.forEach((tx) => {
    if (tx.month === currentMonth) paidStudents[tx.studentId] = true;
    if (tx.date) {
      const day = new Date(tx.date).getDate();
      byDay[tx.month][day] = (byDay[tx.month][day] || 0) + (tx.amount || 0);
    }
  });
  const paidThisMonth = Object.keys(paidStudents).length;

  const todayDay = now.getDate();
  const currentDays = daysInMonth_(now);
  const prevDays = daysInMonth_(prevMonthDate);
  const maxDays = Math.max(currentDays, prevDays);

  let curCum = 0;
  let prevCum = 0;
  const data = [];
  for (let day = 1; day <= maxDays; day += 1) {
    let current = null;
    if (day <= currentDays && day <= todayDay) {
      curCum += byDay[currentMonth][day] || 0;
      current = curCum;
    }
    let previous = null;
    if (day <= prevDays) {
      prevCum += byDay[prevMonth][day] || 0;
      previous = prevCum;
    }
    data.push({ day, current, previous });
  }

  return { paidThisMonth, comparison: { data, currentMonth, prevMonth } };
}

/** Считает все плитки дашборда одного филиала и пишет их в dashboardStats/{branchId} (полная замена документа). */
function refreshDashboardStatsForBranch_(branchId) {
  const now = new Date();
  const settings = cached_('settings:' + branchId, SETTINGS_CACHE_SEC, () => fromFsDoc_(fsGetOptional_(`/settings/${branchId}`) || { fields: {} }));
  const churnPeriod = settings.churnPeriod || 'year';
  const { start, end } = churnPeriodRange_(churnPeriod, now);

  const buckets = computeStudentBuckets_(branchId, now);
  const leftActiveGroup = computeLeftActiveGroup_(branchId, start, end);
  const leftAfterTrial = computeLeftAfterTrial_(branchId, start, end);
  const { paidThisMonth, comparison } = computePaymentsAndChart_(branchId, now);

  const fields = toFsFields_({
    activeStudents: buckets.activeStudents,
    trial: buckets.trial,
    debtors: buckets.debtors,
    paidThisMonth,
    leftActiveGroup,
    leftAfterTrial,
    comparison,
  });
  fields.updatedAt = { timestampValue: new Date().toISOString() };
  fsRequest_('PATCH', `/dashboardStats/${branchId}`, { fields });
}

/** Список филиалов — те же id, что встречаются в settings (обычно один, 'icon-main'). */
function branchIdsForDashboardStats_() {
  return [defaultBranchId_()];
}

/** Обёрнутая триггером точка входа — пропускает подсчёт вне рабочих часов (экономия квоты). */
function refreshDashboardStats() {
  return trackedRun_('trg_dashboard', refreshDashboardStatsImpl_);
}
function refreshDashboardStatsImpl_() {
  const hour = Number(Utilities.formatDate(new Date(), 'Asia/Tashkent', 'H'));
  if (hour < DASHBOARD_STATS_ACTIVE_HOURS.from || hour >= DASHBOARD_STATS_ACTIVE_HOURS.to) return;
  branchIdsForDashboardStats_().forEach((branchId) => refreshDashboardStatsForBranch_(branchId));
}

/** Запусти один раз вручную (Run → installDashboardStatsTrigger) — почасовой триггер. */
function installDashboardStatsTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'refreshDashboardStats')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshDashboardStats').timeBased().everyHours(1).create();
}
