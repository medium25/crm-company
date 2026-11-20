import { addDoc, collection, doc, getDocs, increment, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { recomputeStudentAggregates } from './students.js';
import { logActivity } from './activityLog.js';

/**
 * Записывает студента на пробный в группу: enrollment со статусом «пробный» (учитель берётся из группы), +1 к
 * числу студентов группы, пересчёт статуса студента и запись в журнал группы. Пробный без группы и учителя
 * не создаётся — этим пользуются все пути оформления пробного (TrialFormModal, AddToTrialModal).
 * Если у студента уже есть неархивная запись в этой же группе — новая не создаётся (идемпотентно).
 * @param {import('firebase/firestore').Firestore} db
 * @param {{student: Object, group: Object, branchId: string, user: {uid: string}, staff?: {fullName?: string}}} p
 * @returns {Promise<{created: boolean}>}
 */
export async function enrollOnTrial(db, { student, group, branchId, user, staff }) {
  const existing = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', student.id), where('isArchived', '==', false)));
  if (existing.docs.some((d) => d.data().groupId === group.id && d.data().status !== 'left')) return { created: false };

  const now = serverTimestamp();
  await addDoc(collection(db, 'enrollments'), {
    branchId,
    studentId: student.id,
    studentName: student.fullName,
    groupId: group.id,
    groupCode: group.code,
    courseName: group.courseName,
    teacherId: group.teacherId,
    teacherName: group.teacherName,
    status: 'trial',
    statusLabel: 'Пробный урок',
    price: group.price,
    discountPercent: 0,
    discountReason: '',
    addedAt: now,
    activatedAt: null,
    pausedFrom: null,
    pausedTo: null,
    leftAt: null,
    leftReason: null,
    lastChargedMonth: null,
    isArchived: false,
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  await updateDoc(doc(db, 'groups', group.id), { studentsCount: increment(1) });
  await recomputeStudentAggregates(db, student.id);
  await logActivity(
    db,
    { entityType: 'group', entityId: group.id, action: 'enrollment_added', field: 'studentsCount', after: student.fullName },
    { uid: user.uid, fullName: staff?.fullName ?? '' },
  );
  return { created: true };
}
