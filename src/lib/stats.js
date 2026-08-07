import { collection, getCountFromServer, getDocs, query, where, orderBy } from 'firebase/firestore';
import { format, startOfMonth, startOfQuarter, startOfYear, subMonths, getDaysInMonth } from 'date-fns';

/**
 * Диапазон периода оттока для двух KPI-карточек («Ушли из активной группы»,
 * «Ушли после пробного периода») — период настраивается в `settings.churnPeriod`
 * (раздел 02), по умолчанию год.
 * @param {'month'|'quarter'|'year'} churnPeriod
 * @param {Date} [today]
 * @returns {{start: Date, end: Date}}
 */
export function churnPeriodRange(churnPeriod, today = new Date()) {
  if (churnPeriod === 'month') return { start: startOfMonth(today), end: today };
  if (churnPeriod === 'quarter') return { start: startOfQuarter(today), end: today };
  return { start: startOfYear(today), end: today };
}

async function count(db, collectionName, ...constraints) {
  const snap = await getCountFromServer(query(collection(db, collectionName), ...constraints));
  return snap.data().count;
}

/** Активные лиды — «03 · Бизнес-логика» §5. */
export function countActiveLeads(db, branchId) {
  return count(db, 'students', where('branchId', '==', branchId), where('status', '==', 'lead'), where('isArchived', '==', false));
}

/** Активные студенты. */
export function countActiveStudents(db, branchId) {
  return count(db, 'students', where('branchId', '==', branchId), where('status', '==', 'active'), where('isArchived', '==', false));
}

/** Группы (действующие). */
export function countActiveGroups(db, branchId) {
  return count(db, 'groups', where('branchId', '==', branchId), where('status', '==', 'active'), where('isArchived', '==', false));
}

/** В пробном уроке. */
export function countTrial(db, branchId) {
  return count(db, 'students', where('branchId', '==', branchId), where('status', '==', 'trial'), where('isArchived', '==', false));
}

/**
 * Должники: активные студенты с отрицательным балансом. `getCountFromServer`
 * не умеет `<` + равенство статуса в одном месте без нужного индекса под саму
 * count-агрегацию, поэтому берём студентов status=='active' и считаем
 * должников клиентски — на масштабе одного филиала (сотни, не тысячи) дешевле,
 * чем заводить ещё один точный composite-индекс только под счётчик.
 */
export async function countDebtors(db, branchId) {
  const snap = await getDocs(
    query(collection(db, 'students'), where('branchId', '==', branchId), where('status', '==', 'active'), where('isArchived', '==', false)),
  );
  return snap.docs.filter((d) => d.data().balance < 0).length;
}

/** Оплатили в текущем месяце — уникальные студенты среди оплат месяца. */
export async function countPaidThisMonth(db, branchId, month) {
  const snap = await getDocs(
    query(collection(db, 'transactions'), where('branchId', '==', branchId), where('type', '==', 'payment'), where('month', '==', month)),
  );
  return new Set(snap.docs.map((d) => d.data().studentId)).size;
}

/**
 * Ушли из активной группы: enrollments со `status: 'left'`, `leftAt` в
 * периоде, у которых `activatedAt` когда-либо был проставлен (единственный
 * надёжный признак «был активен» — отдельного поля с историей статусов в
 * схеме нет). Уникальные студенты.
 */
export async function countLeftActiveGroup(db, branchId, periodStart, periodEnd) {
  const snap = await getDocs(
    query(collection(db, 'enrollments'), where('branchId', '==', branchId), where('status', '==', 'left')),
  );
  const studentIds = new Set();
  for (const d of snap.docs) {
    const e = d.data();
    if (!e.activatedAt || !e.leftAt) continue;
    const leftAt = e.leftAt.toDate();
    if (leftAt >= periodStart && leftAt <= periodEnd) studentIds.add(e.studentId);
  }
  return studentIds.size;
}

/**
 * Ушли после пробного периода: студенты `trialAt != null && status == 'left'`,
 * `leftAt` в периоде, и ни одна из их записей никогда не была активирована.
 * Кандидатов сперва отбираем по студентам, «никогда не был active» проверяем
 * их enrollments (параллельно, по кандидату — не по всей коллекции).
 */
export async function countLeftAfterTrial(db, branchId, periodStart, periodEnd) {
  const snap = await getDocs(
    query(collection(db, 'students'), where('branchId', '==', branchId), where('isArchived', '==', false), where('status', '==', 'left')),
  );
  const candidates = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.trialAt && s.leftAt && s.leftAt.toDate() >= periodStart && s.leftAt.toDate() <= periodEnd);

  const results = await Promise.all(
    candidates.map(async (student) => {
      const enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', student.id)));
      const everActivated = enrollSnap.docs.some((d) => Boolean(d.data().activatedAt));
      return everActivated ? null : student.id;
    }),
  );
  return results.filter(Boolean).length;
}

/**
 * Все 8 KPI дашборда одним вызовом — «03 · Бизнес-логика» §5.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @param {'month'|'quarter'|'year'} [churnPeriod]
 * @returns {Promise<Object>}
 */
export async function loadDashboardStats(db, branchId, churnPeriod = 'year') {
  const month = format(new Date(), 'yyyy-MM');
  const { start, end } = churnPeriodRange(churnPeriod);

  const [activeLeads, activeStudents, activeGroups, trial, debtors, paidThisMonth, leftActiveGroup, leftAfterTrial] = await Promise.all([
    countActiveLeads(db, branchId),
    countActiveStudents(db, branchId),
    countActiveGroups(db, branchId),
    countTrial(db, branchId),
    countDebtors(db, branchId),
    countPaidThisMonth(db, branchId, month),
    countLeftActiveGroup(db, branchId, start, end),
    countLeftAfterTrial(db, branchId, start, end),
  ]);

  return { activeLeads, activeStudents, activeGroups, trial, debtors, paidThisMonth, leftActiveGroup, leftAfterTrial };
}

/**
 * Данные для графика выручки — читает предпосчитанный агрегат
 * `monthlyRevenue`, не всю коллекцию `transactions`.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @returns {Promise<Array<{month: string, amount: number, paymentsCount: number}>>}
 */
export async function getMonthlyRevenue(db, branchId) {
  const snap = await getDocs(query(collection(db, 'monthlyRevenue'), where('branchId', '==', branchId), orderBy('month')));
  return snap.docs.map((d) => d.data());
}

/**
 * Текущий месяц против предыдущего, по дням, нарастающим итогом — для
 * графика с 2 линиями на дашборде. Читает `transactions` напрямую (не
 * `monthlyRevenue`), т.к. нужна разбивка по дню, а не по месяцу целиком;
 * только type=payment, как и в агрегате monthlyRevenue.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @param {Date} [today]
 * @returns {Promise<{data: Array<{day: number, current: number|null, previous: number|null}>, currentMonth: string, prevMonth: string}>}
 */
export async function getDailyRevenueComparison(db, branchId, today = new Date()) {
  const currentMonth = format(today, 'yyyy-MM');
  const prevMonthDate = subMonths(today, 1);
  const prevMonth = format(prevMonthDate, 'yyyy-MM');

  const snap = await getDocs(
    query(
      collection(db, 'transactions'),
      where('branchId', '==', branchId),
      where('type', '==', 'payment'),
      where('month', 'in', [currentMonth, prevMonth]),
    ),
  );

  const byDay = { [currentMonth]: {}, [prevMonth]: {} };
  for (const d of snap.docs) {
    const tx = d.data();
    const day = tx.date.toDate().getDate();
    byDay[tx.month][day] = (byDay[tx.month][day] ?? 0) + tx.amount;
  }

  const todayDay = today.getDate();
  const currentDays = getDaysInMonth(today);
  const prevDays = getDaysInMonth(prevMonthDate);
  const maxDays = Math.max(currentDays, prevDays);

  let curCum = 0;
  let prevCum = 0;
  const data = [];
  for (let day = 1; day <= maxDays; day += 1) {
    let current = null;
    if (day <= currentDays && day <= todayDay) {
      curCum += byDay[currentMonth][day] ?? 0;
      current = curCum;
    }
    let previous = null;
    if (day <= prevDays) {
      prevCum += byDay[prevMonth][day] ?? 0;
      previous = prevCum;
    }
    data.push({ day, current, previous });
  }

  return { data, currentMonth, prevMonth };
}
