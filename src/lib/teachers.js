import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

const BATCH_LIMIT = 450;

/**
 * Каскадит переименование учителя в денормализованные `teacherName` на
 * `groups` и `enrollments` — без этого группы/карточки студентов продолжают
 * показывать старое имя, пока их не пересоздадут (как случилось с
 * MR SANJAR → MR IBROHIM: teachers.displayName поменяли, groups/enrollments
 * — нет). `transactions.teacherName` не трогаем — это исторические записи,
 * должны сохранять имя на момент операции.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} teacherId
 * @param {string} displayName новое отображаемое имя
 */
export async function cascadeTeacherName(db, teacherId, displayName) {
  const [groupsSnap, enrollmentsSnap] = await Promise.all([
    getDocs(query(collection(db, 'groups'), where('teacherId', '==', teacherId))),
    getDocs(query(collection(db, 'enrollments'), where('teacherId', '==', teacherId))),
  ]);

  const refs = [...groupsSnap.docs.map((d) => doc(db, 'groups', d.id)), ...enrollmentsSnap.docs.map((d) => doc(db, 'enrollments', d.id))];

  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) {
      batch.update(ref, { teacherName: displayName, updatedAt: serverTimestamp() });
    }
    // eslint-disable-next-line no-await-in-loop -- батчи должны идти последовательно, не пачкой параллельных commit
    await batch.commit();
  }
}
