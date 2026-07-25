import { collection, doc, getDocs, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';

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
