import { collection, collectionGroup, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { differenceInCalendarDays } from 'date-fns';
import { stageDeadline } from './leadFunnel.js';

/**
 * Отчёты — раздел 04 §11: выручка по курсам/учителям, посещаемость по
 * группам, отток и причины ухода, конверсия лид→пробный→студент, долги по
 * срокам. Каждая функция читает только то, что нужно для своего отчёта —
 * без сканирования коллекций целиком, где это возможно.
 */

/** Выручка по курсам за период — джойн transactions↔groups (courseName не денормализовано на transactions). */
export async function revenueByCourse(db, branchId, from, to) {
  const [txSnap, groupsSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'transactions'),
        where('branchId', '==', branchId),
        where('type', '==', 'payment'),
        where('date', '>=', Timestamp.fromDate(from)),
        where('date', '<=', Timestamp.fromDate(to)),
      ),
    ),
    getDocs(query(collection(db, 'groups'), where('branchId', '==', branchId))),
  ]);
  const courseNameByGroupId = new Map(groupsSnap.docs.map((d) => [d.id, d.data().courseName]));
  const map = new Map();
  for (const d of txSnap.docs) {
    const t = d.data();
    const courseName = courseNameByGroupId.get(t.groupId) ?? 'Без курса';
    map.set(courseName, (map.get(courseName) ?? 0) + t.amount);
  }
  return [...map.entries()].map(([courseName, amount]) => ({ courseName, amount })).sort((a, b) => b.amount - a.amount);
}

/**
 * Выручка по учителям за период — teacherName уже денормализовано на
 * transactions. Оплаты за материалы (category:'materials', см.
 * lib/billing.js recordMaterialPayment — книги и т.п.) сюда не входят:
 * это деньги учебного центра, не курса, с них учителю процент не
 * положен.
 */
export async function revenueByTeacher(db, branchId, from, to) {
  const snap = await getDocs(
    query(
      collection(db, 'transactions'),
      where('branchId', '==', branchId),
      where('type', '==', 'payment'),
      where('date', '>=', Timestamp.fromDate(from)),
      where('date', '<=', Timestamp.fromDate(to)),
    ),
  );
  const map = new Map();
  for (const d of snap.docs) {
    const t = d.data();
    if (t.category === 'materials') continue;
    const name = t.teacherName ?? 'Без учителя';
    map.set(name, (map.get(name) ?? 0) + t.amount);
  }
  return [...map.entries()].map(([teacherName, amount]) => ({ teacherName, amount })).sort((a, b) => b.amount - a.amount);
}

/** Посещаемость по группам за месяц — доля «Был» среди отмеченных занятий. */
export async function attendanceByGroup(db, branchId, month) {
  const groupsSnap = await getDocs(
    query(collection(db, 'groups'), where('branchId', '==', branchId), where('isArchived', '==', false)),
  );
  const groups = groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const results = await Promise.all(
    groups.map(async (g) => {
      const attSnap = await getDocs(query(collectionGroup(db, 'attendance'), where('groupId', '==', g.id), where('month', '==', month)));
      let present = 0;
      let total = 0;
      for (const d of attSnap.docs) {
        const status = d.data().status;
        if (status === 'present' || status === 'absent' || status === 'late' || status === 'excused') total += 1;
        if (status === 'present' || status === 'late') present += 1;
      }
      return { groupId: g.id, groupCode: g.code, total, present, rate: total > 0 ? Math.round((present / total) * 100) : null };
    }),
  );
  return results;
}

/** Отток за период: ушли из активной группы + ушли после пробного, с причинами. */
export async function churnReport(db, branchId, periodStart, periodEnd) {
  const [enrollSnap, studentsSnap] = await Promise.all([
    getDocs(query(collection(db, 'enrollments'), where('branchId', '==', branchId), where('status', '==', 'left'))),
    getDocs(query(collection(db, 'students'), where('branchId', '==', branchId), where('isArchived', '==', false), where('status', '==', 'left'))),
  ]);

  const leftActiveGroup = [];
  for (const d of enrollSnap.docs) {
    const e = d.data();
    if (!e.activatedAt || !e.leftAt) continue;
    const leftAt = e.leftAt.toDate();
    if (leftAt >= periodStart && leftAt <= periodEnd) {
      leftActiveGroup.push({ studentName: e.studentName, groupCode: e.groupCode, leftAt, reason: e.leftReason || 'Не указана' });
    }
  }

  const students = studentsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.trialAt && s.leftAt && s.leftAt.toDate() >= periodStart && s.leftAt.toDate() <= periodEnd);

  const leftAfterTrial = [];
  await Promise.all(
    students.map(async (s) => {
      const enrolls = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', s.id)));
      const everActivated = enrolls.docs.some((d) => Boolean(d.data().activatedAt));
      if (!everActivated) {
        leftAfterTrial.push({ studentName: s.fullName, leftAt: s.leftAt.toDate(), reason: s.statusReason || 'Не указана' });
      }
    }),
  );

  const reasonCounts = new Map();
  for (const item of [...leftActiveGroup, ...leftAfterTrial]) {
    reasonCounts.set(item.reason, (reasonCounts.get(item.reason) ?? 0) + 1);
  }

  return {
    leftActiveGroup,
    leftAfterTrial,
    byReason: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

/**
 * Конверсия лид→пробный→студент среди лидов, заведённых в периоде.
 * «Дошёл до студента» — прокси через `firstPaymentAt` (первая оплата
 * означает состоявшуюся активную запись), отдельного поля с историей
 * статусов в схеме нет — тот же осознанный компромисс, что и в KPI
 * дашборда (`src/lib/stats.js`).
 */
export async function conversionFunnel(db, branchId, periodStart, periodEnd) {
  const snap = await getDocs(
    query(
      collection(db, 'students'),
      where('branchId', '==', branchId),
      where('createdAt', '>=', Timestamp.fromDate(periodStart)),
      where('createdAt', '<=', Timestamp.fromDate(periodEnd)),
    ),
  );
  const students = snap.docs.map((d) => d.data());
  const totalLeads = students.length;
  const reachedTrial = students.filter((s) => Boolean(s.trialAt)).length;
  const reachedStudent = students.filter((s) => Boolean(s.firstPaymentAt)).length;
  return { totalLeads, reachedTrial, reachedStudent };
}

/** Долги по срокам: активные должники, бакеты по дням с последней оплаты. */
export async function debtAging(db, branchId, today = new Date()) {
  const snap = await getDocs(
    query(collection(db, 'students'), where('branchId', '==', branchId), where('isArchived', '==', false), where('status', '==', 'active')),
  );
  const buckets = [
    { label: '0–30 дней', min: 0, max: 30, students: [], total: 0 },
    { label: '31–60 дней', min: 31, max: 60, students: [], total: 0 },
    { label: '61–90 дней', min: 61, max: 90, students: [], total: 0 },
    { label: '90+ дней', min: 91, max: Infinity, students: [], total: 0 },
  ];
  for (const d of snap.docs) {
    const s = d.data();
    if (s.balance >= 0) continue;
    const since = s.lastPaymentAt ?? s.createdAt;
    const days = since ? differenceInCalendarDays(today, since.toDate()) : Infinity;
    const bucket = buckets.find((b) => days >= b.min && days <= b.max) ?? buckets[buckets.length - 1];
    bucket.students.push({ studentName: s.fullName, balance: s.balance, days });
    bucket.total += s.balance;
  }
  return buckets;
}

/**
 * Воронка по операторам за период (2026-08-13-leads-funnel-redesign.md
 * §10): по каждому `assignedOperator` — новых лидов, % дозвона (хотя бы
 * одна запись 'calling' в stageHistory), % записи на пробный, % явки,
 * % оплаты после пробного, доля no_answer+no_show среди всех lost этого
 * оператора (индикатор проблемы с номерами/каналом, не со скриптом/ценой).
 */
export async function funnelByOperator(db, branchId, periodStart, periodEnd) {
  // funnelStage не фильтруется в самом запросе: Firestore не разрешает
  // inequality-фильтр (funnelStage != null) на одном поле вместе с
  // range-фильтром (createdAt >=/<=) на другом без специального
  // multi-inequality индекса — проще и надёжнее отсеять на клиенте.
  const snap = await getDocs(
    query(
      collection(db, 'students'),
      where('branchId', '==', branchId),
      where('createdAt', '>=', Timestamp.fromDate(periodStart)),
      where('createdAt', '<=', Timestamp.fromDate(periodEnd)),
    ),
  );
  const leads = snap.docs.map((d) => d.data()).filter((s) => Boolean(s.funnelStage));

  const byOperator = new Map();
  for (const lead of leads) {
    const opId = lead.assignedOperator ?? 'unassigned';
    if (!byOperator.has(opId)) byOperator.set(opId, []);
    byOperator.get(opId).push(lead);
  }

  const hasStage = (lead, stage) => (lead.stageHistory ?? []).some((h) => h.stage === stage);

  return [...byOperator.entries()].map(([operatorId, opLeads]) => {
    const total = opLeads.length;
    const dozvon = opLeads.filter((l) => hasStage(l, 'calling')).length;
    const trialScheduled = opLeads.filter((l) => hasStage(l, 'trial_scheduled')).length;
    const attended = opLeads.filter((l) => l.attended === true).length;
    const won = opLeads.filter((l) => l.funnelStage === 'won').length;
    const lost = opLeads.filter((l) => l.funnelStage === 'lost');
    const noAnswerOrNoShow = lost.filter((l) => l.lostReason === 'no_answer' || l.lostReason === 'no_show' || l.lostReason === 'cold_lead').length;
    return {
      operatorId,
      total,
      dozvon,
      trialScheduled,
      attended,
      won,
      dozvonRate: total > 0 ? Math.round((dozvon / total) * 100) : 0,
      trialScheduledRate: total > 0 ? Math.round((trialScheduled / total) * 100) : 0,
      attendedRate: total > 0 ? Math.round((attended / total) * 100) : 0,
      wonRate: total > 0 ? Math.round((won / total) * 100) : 0,
      noAnswerShare: lost.length > 0 ? Math.round((noAnswerOrNoShow / lost.length) * 100) : 0,
      lostCount: lost.length,
    };
  });
}

/**
 * Средняя просрочка «прямо сейчас» по каждому оператору — среди лидов,
 * которые ПРЯМО СЕЙЧАС висят просроченными на доске (тот же stageDeadline,
 * что красит бейдж на карточке), сколько в среднем часов прошло с
 * дедлайна. Это снимок текущего состояния, не историческое среднее за
 * период — исторических дедлайнов нигде не хранится (они пересчитываются
 * на лету и перезаписываются при каждом действии), так что ретроспективно
 * их не восстановить. Снимок honest и практичен: показывает реальную боль
 * оператора прямо сейчас, а не архивную статистику.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @returns {Promise<Map<string, number>>} operatorId → часы (0, если нет просроченных)
 */
export async function currentOverdueHoursByOperator(db, branchId) {
  const snap = await getDocs(
    query(collection(db, 'students'), where('branchId', '==', branchId), where('isArchived', '==', false), where('funnelStage', 'in', ['new', 'calling', 'trial_scheduled', 'trial_completed', 'closing'])),
  );
  const now = Date.now();
  const hoursByOperator = new Map();
  for (const doc of snap.docs) {
    const lead = doc.data();
    const deadline = stageDeadline(lead);
    if (!deadline || now <= deadline.getTime()) continue;
    const opId = lead.assignedOperator ?? 'unassigned';
    const hours = (now - deadline.getTime()) / 3_600_000;
    if (!hoursByOperator.has(opId)) hoursByOperator.set(opId, []);
    hoursByOperator.get(opId).push(hours);
  }
  const avgByOperator = new Map();
  for (const [opId, hoursList] of hoursByOperator) {
    avgByOperator.set(opId, hoursList.reduce((a, b) => a + b, 0) / hoursList.length);
  }
  return avgByOperator;
}

/**
 * Отказы, доступные для повторного маркетинга: `lostReason` — no_answer
 * или no_show (не смогли связаться, а не явный отказ), прошло ≥30 дней с
 * `lostAt` (2026-08-13-leads-funnel-redesign.md §7).
 */
export async function remarketingCandidates(db, branchId, today = new Date()) {
  const snap = await getDocs(
    query(collection(db, 'students'), where('branchId', '==', branchId), where('funnelStage', '==', 'lost'), where('lostReason', 'in', ['no_answer', 'no_show', 'cold_lead'])),
  );
  const cutoff = today.getTime() - 30 * 86_400_000;
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.lostAt && s.lostAt.toDate().getTime() <= cutoff)
    .map((s) => ({ studentId: s.id, studentName: s.fullName, phone: s.phone, lostReason: s.lostReason, lostAt: s.lostAt.toDate() }))
    .sort((a, b) => b.lostAt - a.lostAt);
}
