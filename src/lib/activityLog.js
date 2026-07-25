import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Запись в историю изменений — «02 · Модель данных», вспомогательная
 * коллекция `activityLog`. Не блокирует основную операцию: вызывающий код
 * решает сам, ждать ли её или запускать fire-and-forget.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{entityType: string, entityId: string, action: string, field?: string, before?: *, after?: *}} entry
 * @param {{uid: string, fullName: string}} user
 */
export async function logActivity(db, { entityType, entityId, action, field = null, before = null, after = null }, user) {
  await addDoc(collection(db, 'activityLog'), {
    entityType,
    entityId,
    action,
    field,
    before,
    after,
    userId: user.uid,
    userName: user.fullName,
    createdAt: serverTimestamp(),
  });
}
