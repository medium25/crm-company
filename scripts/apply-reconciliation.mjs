import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, query, where, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

// План коррекции — из scripts/reconcile-old-system.mjs (сверка со старой
// системой icon.modme.uz, «Все оплаты» 01.08–31.08.2026, вручную
// транскрибировано постранично). oldTeacher=null — в старой системе
// платёж не привязан ни к учителю, ни к группе (бэкфилл 37e5a5c ошибочно
// привязал по единственному активному зачислению) — откатываем.
// oldTeacher!=null — в старой системе привязка ЕСТЬ, а в новой её нет
// (пропущено бэкфиллом как неоднозначное — двойное зачисление и т.п.) —
// проставляем.
const PLAN = [
  {"id":"zTiL8bX7gLVpmw0TsOu0","studentName":"Marjona Ungboyeva","amount":910000,"oldTeacher":null,"oldGroup":null},
  {"id":"VeJxvhB1lX8kFr1vFmda","studentName":"Ismoil Turgunov","amount":890000,"oldTeacher":"MR IBROHIM","oldGroup":"I14"},
  {"id":"TIZnVN6L4vsn6fFfYUcI","studentName":"Munisa Norboyeva","amount":420000,"oldTeacher":"MS ZIYODA (BETA)","oldGroup":"R30"},
  {"id":"bN485qfO6rcsreI7kTc2","studentName":"Durdona Nomozboyeva","amount":420000,"oldTeacher":"MS ZIYODA (BETA)","oldGroup":"R36"},
  {"id":"N4MHaZr7ZqDRgosenZtF","studentName":"Odina Kamilova","amount":700000,"oldTeacher":null,"oldGroup":null},
  {"id":"9vYXjogmHgszP1d1UJzb","studentName":"Feruza Zokirova","amount":640000,"oldTeacher":"MS SHAXZODA","oldGroup":"R31"},
  {"id":"rq04bUtSsxNYEFKDBIQh","studentName":"Robiya Abdug'aniyeva","amount":840000,"oldTeacher":null,"oldGroup":null},
  {"id":"edvYdMkfuWVq1zcKjXbh","studentName":"Safiya Najimova","amount":840000,"oldTeacher":null,"oldGroup":null},
  {"id":"hyfomlWf4HXOCXpDf4y6","studentName":"Mirjalol Hamidullayev","amount":890000,"oldTeacher":null,"oldGroup":null},
  {"id":"srzZJc4BHBqcadYd4vkH","studentName":"Feruza Zokirova","amount":890000,"oldTeacher":"MS SHAXZODA","oldGroup":"R31"},
  {"id":"ZzIy3PlBXOrehv0poKKp","studentName":"Said Abdurahmonov","amount":840000,"oldTeacher":null,"oldGroup":null},
  {"id":"j1KK47LPvXxPq3hssKUw","studentName":"O'lmasbek Yusupov","amount":845000,"oldTeacher":null,"oldGroup":null},
  {"id":"BQiz6RN5AUi8DNb7bp6Y","studentName":"Asliddin G'apporov","amount":290000,"oldTeacher":"MS SHAXZODA","oldGroup":"R32"},
  {"id":"NrKbEuAUdzThjwyRdfrt","studentName":"Munisa Norboyeva","amount":420000,"oldTeacher":"MS ZIYODA (BETA)","oldGroup":"R30"},
];

const groupCodes = [...new Set(PLAN.filter((p) => p.oldGroup).map((p) => p.oldGroup))];
const groupsSnap = await getDocs(query(collection(db, 'groups'), where('branchId', '==', 'icon-main'), where('code', 'in', groupCodes)));
const groupByCode = new Map();
groupsSnap.forEach((d) => groupByCode.set(d.data().code, { id: d.id, ...d.data() }));

const batch = writeBatch(db);
let revertCount = 0;
let setCount = 0;
for (const p of PLAN) {
  if (!p.oldTeacher) {
    batch.update(doc(db, 'transactions', p.id), { teacherId: null, teacherName: null, groupId: null, groupCode: null });
    revertCount += 1;
  } else {
    const g = groupByCode.get(p.oldGroup);
    if (!g) { console.log('ГРУППА НЕ НАЙДЕНА:', p.oldGroup, '— пропускаю', p.studentName); continue; }
    batch.update(doc(db, 'transactions', p.id), { teacherId: g.teacherId, teacherName: g.teacherName, groupId: g.id, groupCode: g.code });
    setCount += 1;
  }
}
await batch.commit();
console.log(`Откачено (в null): ${revertCount}. Проставлено: ${setCount}.`);
process.exit(0);
