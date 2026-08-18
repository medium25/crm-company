import { collection, doc, getDocs, query, updateDoc, where, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { NON_TERMINAL_STAGES } from './leadFunnel.js';

/**
 * «Статус студента = максимальный по активности статус среди его enrollments»
 * (03 · Бизнес-логика §1). Пересчитывает `students.status` и
 * `activeGroupsCount` по актуальным записям студента. Вызывать после любой
 * мутации enrollment (добавление в группу, заморозка/снятие, уход).
 *
 * Если у студента вообще нет записей (ещё лид или архивирован без единой
 * группы) — статус не трогаем, им управляют напрямую (лид/пробный/отказ).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} studentId
 */
export async function recomputeStudentAggregates(db, studentId) {
  const snap = await getDocs(
    query(collection(db, 'enrollments'), where('studentId', '==', studentId), where('isArchived', '==', false)),
  );
  const enrollments = snap.docs.map((d) => d.data());
  if (enrollments.length === 0) return;

  const activeCount = enrollments.filter((e) => e.status === 'active').length;
  let status;
  if (activeCount > 0) status = 'active';
  else if (enrollments.some((e) => e.status === 'trial')) status = 'trial';
  else if (enrollments.some((e) => e.status === 'paused')) status = 'paused';
  else status = 'left';

  await updateDoc(doc(db, 'students', studentId), {
    status,
    activeGroupsCount: activeCount,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Архивирует студента: isArchived/status + архивация всех его enrollments
 * (и декремент studentsCount у их групп). Если funnelStage ещё не
 * терминальный (например создан через «Пробные», но так и не заплатил) —
 * воронка сама закрывается в «Отказ», иначе карточка зависла бы в
 * «Дожиме»/«Пробный проведён» навсегда. Общая точка для StudentDetailPage
 * и TrialsPage — не дублировать batch-логику в двух местах.
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} student
 * @param {{uid: string}} user
 */
export async function archiveStudent(db, student, user) {
  const enrollmentsSnap = await getDocs(
    query(collection(db, 'enrollments'), where('studentId', '==', student.id), where('isArchived', '==', false)),
  );
  const enrollments = enrollmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const stillInFunnel = NON_TERMINAL_STAGES.includes(student.funnelStage);
  const batch = writeBatch(db);
  batch.update(doc(db, 'students', student.id), {
    isArchived: true,
    archivedAt: serverTimestamp(),
    // Заархивированные enrollments не видны recomputeStudentAggregates
    // (фильтрует isArchived==false), поэтому status здесь выставляем
    // напрямую — иначе он застревает на прежнем значении навсегда.
    status: 'left',
    activeGroupsCount: 0,
    ...(stillInFunnel
      ? {
          funnelStage: 'lost',
          stageHistory: [...(student.stageHistory ?? []), { stage: 'lost', enteredAt: new Date() }],
          lostReason: 'archived_unpaid',
          lostAt: serverTimestamp(),
        }
      : {}),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });

  const groupsToDecrement = new Set();
  for (const e of enrollments) {
    batch.update(doc(db, 'enrollments', e.id), {
      status: 'archived',
      isArchived: true,
      // Без leftAt студент не попадает в KPI «Ушли из активной группы»
      // (see src/lib/stats.js countLeftActiveGroup).
      leftAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    if (e.status === 'active' || e.status === 'trial' || e.status === 'paused') {
      groupsToDecrement.add(e.groupId);
    }
  }
  for (const groupId of groupsToDecrement) {
    batch.update(doc(db, 'groups', groupId), { studentsCount: increment(-1) });
  }
  await batch.commit();
}
