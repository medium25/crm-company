import { collection, deleteField, doc, getDoc, getDocs, query, updateDoc, where, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { logActivity } from './activityLog.js';
import { NON_TERMINAL_STAGES } from './leadFunnel.js';
import { notifySheetsExport } from './sheetsExportHook.js';

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
  if (stillInFunnel) notifySheetsExport(student.id, 'lost', student.rawColumns);
}

/**
 * Возвращает покинувшего студента в ту группу, из которой он ушёл (обратное к LeaveGroupModal /
 * archiveStudent): запись снова открыта (active, если уже была активирована, иначе trial), дата ухода,
 * причина и желание вернуться стираются, у группы studentsCount +1, статус студента пересчитывается.
 * Если студент был архивирован целиком (isArchived) — снимаем архив и у него.
 * Не восстанавливаем, когда группа закрыта/в архиве или студент уже снова числится в этой группе —
 * тогда бросаем ошибку с кодом 'group_closed' / 'already_in_group', а запись в таком случае
 * оформляется обычным «Добавить в группу».
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} enrollment запись со status 'left'|'archived'
 * @param {Object} student документ студента
 * @param {{uid: string, fullName: string}} user
 */
export async function restoreLeftEnrollment(db, enrollment, student, user) {
  const groupSnap = await getDoc(doc(db, 'groups', enrollment.groupId));
  const group = groupSnap.exists() ? groupSnap.data() : null;
  if (!group || group.isArchived || group.status !== 'active') {
    const err = new Error('group_closed');
    err.code = 'group_closed';
    throw err;
  }
  const sameGroup = await getDocs(
    query(collection(db, 'enrollments'), where('studentId', '==', enrollment.studentId), where('groupId', '==', enrollment.groupId), where('isArchived', '==', false)),
  );
  if (sameGroup.docs.some((d) => d.id !== enrollment.id && ['active', 'trial', 'paused'].includes(d.data().status))) {
    const err = new Error('already_in_group');
    err.code = 'already_in_group';
    throw err;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'enrollments', enrollment.id), {
    status: enrollment.activatedAt ? 'active' : 'trial',
    isArchived: false,
    leftAt: deleteField(),
    leftReason: deleteField(),
    returnIntent: deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  batch.update(doc(db, 'groups', enrollment.groupId), { studentsCount: increment(1) });
  if (student?.isArchived) {
    batch.update(doc(db, 'students', enrollment.studentId), {
      isArchived: false,
      archivedAt: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
  }
  await batch.commit();
  await recomputeStudentAggregates(db, enrollment.studentId);
  await logActivity(
    db,
    { entityType: 'group', entityId: enrollment.groupId, action: 'enrollment_restored', field: 'studentsCount', after: enrollment.studentName ?? student?.fullName ?? '' },
    user,
  ).catch(() => {});
}
