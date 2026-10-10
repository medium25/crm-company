import { collection, doc, addDoc, setDoc, updateDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { firebaseConfig } from '../firebase.js';
import { phoneToAuthEmail } from './auth.js';

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

/**
 * Единая точка создания учителя — вызывается и из «Учителя и группы»
 * (TeacherFormModal), и из «Настройки → Сотрудники» (AddStaffModal), чтобы
 * учитель, заведённый с любой из двух сторон, одинаково получал и профиль
 * в `teachers` (для групп/расписания), и логин в `staff` (для входа в CRM
 * с ролью 'teacher') — раньше TeacherFormModal писал только `teachers`, и
 * такой учитель не появлялся в «Сотрудники», не мог зайти в систему (см.
 * 2026-10-08, MS OSUDA).
 *
 * Auth-аккаунт создаётся через отдельный временный instance Firebase App —
 * тот же приём, что в AddStaffModal: иначе createUserWithEmailAndPassword
 * переключил бы текущую сессию вызывающего на новый аккаунт.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{displayName: string, fullName: string, phone: string, password: string, activeBranchId: string}} fields
 * @param {{uid: string}} user
 * @returns {Promise<{teacherId: string, staffUid: string}>}
 */
export async function createTeacherWithStaffAccount(db, { displayName, fullName, phone, password, activeBranchId }, user) {
  const authEmail = phoneToAuthEmail(phone);
  const tempApp = initializeApp(firebaseConfig, `teacher-create-${Date.now()}`);
  try {
    const tempAuth = getAuth(tempApp);
    const { user: newUser } = await createUserWithEmailAndPassword(tempAuth, authEmail, password);

    let teacherRef;
    try {
      teacherRef = await addDoc(collection(db, 'teachers'), {
        displayName,
        fullName,
        phone,
        branchId: activeBranchId,
        branchIds: [activeBranchId],
        staffUid: newUser.uid,
        groupsCount: 0,
        isActive: true,
        isArchived: false,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      await setDoc(doc(db, 'staff', newUser.uid), {
        fullName,
        phone,
        email: '',
        role: 'teacher',
        branchIds: [activeBranchId],
        teacherId: teacherRef.id,
        allowedSections: [],
        isActive: true,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
    } catch (docErr) {
      // Auth-аккаунт создан, а один из документов — нет: откатываем, чтобы
      // не оставить аккаунт без доступа или учителя без логина наполовину.
      if (teacherRef) await updateDoc(doc(db, 'teachers', teacherRef.id), { isArchived: true }).catch(() => {});
      await deleteUser(newUser).catch(() => {});
      throw docErr;
    }

    return { teacherId: teacherRef.id, staffUid: newUser.uid };
  } finally {
    await deleteApp(tempApp);
  }
}
