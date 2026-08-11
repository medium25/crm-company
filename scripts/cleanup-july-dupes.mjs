/**
 * Одноразовая чистка: бэкафилл 06.08.2026 (rebuild-full-history.js, метчинг
 * по (type, month, amount) без дня) плюс более ранний баг с studentId=null/
 * createdAt=epoch задвоили часть платежей за июль 2026 — новая система
 * показывала 125 600 385 UZS против 111 466 000 в старой (icon.modme.uz),
 * разница 14 134 385.
 *
 * Сверка построчная: 177 платежей старой системы (снято через её API
 * /v1/replenishments, встроено ниже как OLD_JULY) против 201 транзакции
 * type=payment за июль в новой — по ключу (дата в Ташкенте, сумма, метод,
 * имя). Несопоставленные новые записи — кандидаты на удаление.
 *
 * Жёстко ограничено month === '2026-07' на каждой записи — август не трогает.
 * Удаление через deleteTransaction() (src/lib/billing.js) — тем же батчем
 * откатывает students.balance, monthlyBalances и monthlyRevenue.
 *
 *   node --env-file=.env scripts/cleanup-july-dupes.mjs           # dry-run
 *   node --env-file=.env scripts/cleanup-july-dupes.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { deleteTransaction } from '../src/lib/billing.js';

const APPLY = process.argv.includes('--apply');
const MONTH = '2026-07';
const BRANCH_ID = 'icon-main';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

// Снято 08.08.2026 через API старой системы: GET /v1/replenishments,
// branch_id=681, from=2026-07-01, to=2026-07-31 (все 4 страницы, per_page=50).
// Сумма debit сошлась с "Total Revenue" карточкой старой системы (111 466 000).
const OLD_JULY = [{"date":"2026-07-01","amount":800000,"method":"Click","group":"R6","name":"Aydin Adilova"},{"date":"2026-07-01","amount":840000,"method":"Click","group":"R7","name":"Hojiakbar Zuxriddinov"},{"date":"2026-07-01","amount":840000,"method":"Click","group":"R42","name":"Muhammadziyo Abdulxamidov"},{"date":"2026-07-01","amount":840000,"method":"Click","group":"R7","name":"Mahsudali Voxobjonov"},{"date":"2026-07-01","amount":900000,"method":"Cash","group":"I7","name":"Kamron Kenjayev"},{"date":"2026-07-01","amount":850000,"method":"Cash","name":"Asadbek Baxtiyorov"},{"date":"2026-07-01","amount":890000,"method":"Cash","group":"I5","name":"Sobirjonov Muhammadali"},{"date":"2026-07-01","amount":900000,"method":"Cash","group":"I5","name":"Shaxnur Axmedov"},{"date":"2026-07-01","amount":850000,"method":"Cash","group":"R20","name":"Mubina Inogamova"},{"date":"2026-07-01","amount":850000,"method":"Cash","group":"R6","name":"Jahongir G`oyibov"},{"date":"2026-07-01","amount":840000,"method":"Cash","group":"R5","name":"Abduazim Axrorov"},{"date":"2026-07-01","amount":210000,"method":"Cash","name":"Abdulaziz Ahrorov"},{"date":"2026-07-02","amount":890000,"method":"Cash","group":"I12","name":"Azamat Ergashev"},{"date":"2026-07-02","amount":230000,"method":"Cash","group":"R39","name":"Dinora Xurramova"},{"date":"2026-07-02","amount":850000,"method":"Click","group":"R14","name":"Shohjahon Axmatov"},{"date":"2026-07-02","amount":560000,"method":"Click","group":"R37","name":"Yunus Hamdamov"},{"date":"2026-07-02","amount":1680000,"method":"Click","group":"R36","name":"Doniyor Ismoilov"},{"date":"2026-07-03","amount":850000,"method":"Cash","group":"R34","name":"Nozima Maxkamova"},{"date":"2026-07-03","amount":850000,"method":"Cash","group":"R21","name":"Roziya Murodova"},{"date":"2026-07-03","amount":840000,"method":"Cash","group":"R5","name":"Iroda Alimbekova"},{"date":"2026-07-03","amount":840000,"method":"Click","group":"R4","name":"Munisa Karimova"},{"date":"2026-07-03","amount":840000,"method":"Click","group":"R30","name":"Mahliyo Musulmonova"},{"date":"2026-07-04","amount":500000,"method":"Click","group":"R14","name":"Tohir Toirjonov"},{"date":"2026-07-04","amount":840000,"method":"Click","group":"R42","name":"Elbek Sadriyev"},{"date":"2026-07-04","amount":890000,"method":"Cash","group":"I13","name":"Mirazim Mirjalolov"},{"date":"2026-07-04","amount":840000,"method":"Cash","group":"R41","name":"Madina Zoidbekova"},{"date":"2026-07-04","amount":840000,"method":"Click","group":"R11","name":"Saidafzal  Mirzayev"},{"date":"2026-07-04","amount":840000,"method":"UZCARD","group":"R34","name":"Mohir Abdurauffov"},{"date":"2026-07-04","amount":280000,"method":"UZCARD","group":"R41","name":"Abdujabbor Asrorov"},{"date":"2026-07-04","amount":420000,"method":"Cash","group":"R12","name":"Farzona Raxmatullayeva"},{"date":"2026-07-04","amount":420000,"method":"UZCARD","group":"R42","name":"E`zoza To`raboyeva"},{"date":"2026-07-04","amount":560000,"method":"Cash","group":"R40","name":"Rasulova Robiya"},{"date":"2026-07-04","amount":840000,"method":"Cash","group":"R39","name":"Muslima Murodova"},{"date":"2026-07-06","amount":70000,"method":"Click","group":"R7","name":"Sitora Egamberdiyeva"},{"date":"2026-07-06","amount":700000,"method":"Click","group":"R14","name":"Baxrom Musulmonov"},{"date":"2026-07-06","amount":290000,"method":"Click","group":"R14","name":"Tohir Toirjonov"},{"date":"2026-07-06","amount":890000,"method":"UZCARD","group":"I7","name":"Fazliddin Lutfullayev"},{"date":"2026-07-06","amount":430000,"method":"Cash","group":"R7","name":"Sitora Egamberdiyeva"},{"date":"2026-07-06","amount":630000,"method":"UZCARD","group":"R6","name":"Muslima Erkinjonova"},{"date":"2026-07-06","amount":830000,"method":"Cash","group":"R34","name":"Jafar Sayfiddinov"},{"date":"2026-07-06","amount":840000,"method":"Cash","group":"R20","name":"Muxlisa Mahmudova"},{"date":"2026-07-06","amount":770000,"method":"Click","group":"R41","name":"Qudratjon Kabirjonov"},{"date":"2026-07-06","amount":900000,"method":"Cash","group":"I6","name":"Maryam Mirsaidova"},{"date":"2026-07-06","amount":900000,"method":"Cash","group":"I5","name":"Samira Mahkamova"},{"date":"2026-07-06","amount":880000,"method":"Cash","group":"I6","name":"Muslima Jamalova"},{"date":"2026-07-06","amount":140000,"method":"Click","group":"R41","name":"Asliddin Oybekov"},{"date":"2026-07-06","amount":790000,"method":"Cash","group":"I6","name":"Diyorbek Radjapov"},{"date":"2026-07-06","amount":840000,"method":"Click","group":"R5","name":"Asadbek Ergashev"},{"date":"2026-07-06","amount":840000,"method":"Click","group":"R19","name":"Asliddin G'apporov"},{"date":"2026-07-06","amount":560000,"method":"Cash","group":"R20","name":"Izzatilla Mahmudov"},{"date":"2026-07-06","amount":840000,"method":"Cash","group":"R7","name":"Asilbek Jaxonov"},{"date":"2026-07-06","amount":840000,"method":"Cash","group":"R20","name":"Maftuna Fozilova"},{"date":"2026-07-06","amount":842000,"method":"Cash","group":"R4","name":"Habibulloh Jo'rayev"},{"date":"2026-07-06","amount":40000,"method":"Click","group":"R18","name":"Feruza Zokirova"},{"date":"2026-07-06","amount":400000,"method":"Cash","group":"R18","name":"Feruza Zokirova"},{"date":"2026-07-06","amount":840000,"method":"Cash","group":"R5","name":"Shahruza Muqumjonova"},{"date":"2026-07-06","amount":700000,"method":"Click","group":"R41","name":"Asliddin Oybekov"},{"date":"2026-07-06","amount":340000,"method":"Click","group":"R29","name":"Sardor Toirov"},{"date":"2026-07-06","amount":560000,"method":"Click","group":"R37","name":"Ibrohim Ismoilov"},{"date":"2026-07-06","amount":840000,"method":"Cash","group":"R30","name":"Dilafruz Nig'matjanova"},{"date":"2026-07-06","amount":350000,"method":"Click","group":"R29","name":"Sevinchoy Rajabboyeva"},{"date":"2026-07-06","amount":600000,"method":"Click","group":"R29","name":"Elbek Uchqunov"},{"date":"2026-07-06","amount":500000,"method":"Cash","group":"R29","name":"Sardor Toirov"},{"date":"2026-07-06","amount":420000,"method":"Cash","group":"R30","name":"Munisa Norboyeva"},{"date":"2026-07-07","amount":840000,"method":"Cash","group":"R13","name":"Fayzulloh Axrorov"},{"date":"2026-07-07","amount":490000,"method":"Cash","group":"R42","name":"Komila Egamberdiyeva"},{"date":"2026-07-07","amount":280000,"method":"Click","group":"R41","name":"E'zoza Usmanova"},{"date":"2026-07-07","amount":840000,"method":"Click","group":"R40","name":"Samandar Ermatov"},{"date":"2026-07-07","amount":840000,"method":"Click","group":"R13","name":"Maftuna Ixtiyarova"},{"date":"2026-07-07","amount":890000,"method":"Click","group":"I12","name":"Foziljon Ozodov"},{"date":"2026-07-07","amount":840000,"method":"Click","group":"R13","name":"Munisa Ammonova"},{"date":"2026-07-07","amount":890000,"method":"UZCARD","group":"I12","name":"Mohinur Abdug'afforova"},{"date":"2026-07-07","amount":140000,"method":"Cash","group":"R39","name":"Robiya Abdug'aniyeva"},{"date":"2026-07-07","amount":840000,"method":"Cash","group":"R39","name":"Sevinch Muxammadiyeva"},{"date":"2026-07-07","amount":840000,"method":"Cash","group":"R39","name":"Muslima Saidova"},{"date":"2026-07-07","amount":840000,"method":"Cash","group":"R39","name":"Sojida Umarova"},{"date":"2026-07-07","amount":840000,"method":"UZCARD","name":"Mohinur Mansurova"},{"date":"2026-07-07","amount":840000,"method":"Cash","group":"R36","name":"Nodirxo'ja Muzaffarov"},{"date":"2026-07-08","amount":280000,"method":"Click","group":"R7","name":"Diyorbek Yursunov"},{"date":"2026-07-08","amount":835000,"method":"Click","group":"I6","name":"Muslima Azamatova"},{"date":"2026-07-08","amount":840000,"method":"Click","group":"R34","name":"Javohir Tulanov"},{"date":"2026-07-08","amount":630000,"method":"UZCARD","group":"R14","name":"Roziya Bahodirova"},{"date":"2026-07-08","amount":840000,"method":"Cash","group":"R19","name":"Robiya Saidganiyeva"},{"date":"2026-07-08","amount":640000,"method":"Cash","group":"R34","name":"Asilbek Ro'ziboyev"},{"date":"2026-07-08","amount":200000,"method":"Click","group":"R34","name":"Asilbek Ro'ziboyev"},{"date":"2026-07-08","amount":840000,"method":"Cash","group":"R30","name":"Shahrizoda Xasanova"},{"date":"2026-07-08","amount":890000,"method":"Click","group":"I7","name":"Lazizbek Xusanboyev"},{"date":"2026-07-08","amount":64000,"method":"Cash","group":"I6","name":"Maryam Mirsaidova"},{"date":"2026-07-08","amount":840000,"method":"Cash","group":"R5","name":"Madina Sharipova"},{"date":"2026-07-08","amount":840000,"method":"Click","group":"R4","name":"Shahriyor Kamoliddinov"},{"date":"2026-07-08","amount":840000,"method":"Cash","group":"R29","name":"Ziyoda Yo'ldosheva"},{"date":"2026-07-08","amount":840000,"method":"Cash","group":"R18","name":"Habiba To'xtasinova"},{"date":"2026-07-08","amount":350000,"method":"Cash","group":"R30","name":"Sarvar Nuraliyev"},{"date":"2026-07-08","amount":840000,"method":"Click","group":"R37","name":"Muslima G'ofurova"},{"date":"2026-07-09","amount":890000,"method":"Cash","group":"I14","name":"Oybek Shavkatov"},{"date":"2026-07-09","amount":840000,"method":"Click","group":"R42","name":"Hayrulla Abdukamolov"},{"date":"2026-07-09","amount":70000,"method":"Click","group":"R12","name":"Farzona Raxmatullayeva"},{"date":"2026-07-09","amount":840000,"method":"Cash","group":"R42","name":"Shohjaxon Erkinov"},{"date":"2026-07-09","amount":890000,"method":"Click","group":"I13","name":"Sindor Allanazarov"},{"date":"2026-07-09","amount":770000,"method":"Click","group":"R33","name":"Abror Alijonov"},{"date":"2026-07-09","amount":400000,"method":"Cash","group":"R40","name":"Lobar Tadjimirzayeva"},{"date":"2026-07-09","amount":140000,"method":"Click","group":"R37","name":"Muxlisa Tolipova"},{"date":"2026-07-09","amount":840000,"method":"Click","group":"R11","name":"Mubina Yaqubhajjayeva"},{"date":"2026-07-10","amount":400000,"method":"Click","group":"I14","name":"Sanjar Akbarov"},{"date":"2026-07-10","amount":840000,"method":"Cash","group":"R33","name":"Asila Ismoilova"},{"date":"2026-07-10","amount":280000,"method":"Cash","group":"R7","name":"Xasan Urozov"},{"date":"2026-07-10","amount":400000,"method":"UZCARD","group":"R5","name":"Soliha Xikmatova"},{"date":"2026-07-10","amount":850000,"method":"Cash","group":"I6","name":"Muxsina Javalova"},{"date":"2026-07-10","amount":890000,"method":"Cash","group":"I13","name":"Saidabror G`aniyev"},{"date":"2026-07-10","amount":148000,"method":"Click","group":"I14","name":"Sanjar Akbarov"},{"date":"2026-07-10","amount":100000,"method":"Click","group":"R4","name":"Munisa Nazirova"},{"date":"2026-07-10","amount":740000,"method":"Cash","group":"R4","name":"Munisa Nazirova"},{"date":"2026-07-10","amount":140000,"method":"Click","group":"R29","name":"Elbek Uchqunov"},{"date":"2026-07-10","amount":420000,"method":"Cash","group":"R30","name":"Dilnoza Rihsiboyeva"},{"date":"2026-07-11","amount":300000,"method":"Cash","group":"I14","name":"Abdulloh Hikmatullayev"},{"date":"2026-07-11","amount":840000,"method":"Click","group":"R40","name":"Ozodbek Rajabov"},{"date":"2026-07-11","amount":840000,"method":"Click","group":"R40","name":"Diyora Normamatova"},{"date":"2026-07-11","amount":700000,"method":"Click","group":"R39","name":"G'iyosiddin Sodiqov"},{"date":"2026-07-11","amount":840000,"method":"Cash","group":"R36","name":"Durdona Nomozboyeva"},{"date":"2026-07-13","amount":350000,"method":"Click","group":"R30","name":"Umar Faxriddinov"},{"date":"2026-07-13","amount":370000,"method":"Cash","group":"R5","name":"Soliha Xikmatova"},{"date":"2026-07-13","amount":70000,"method":"Click","group":"R4","name":"Ulug'bek Usmonov"},{"date":"2026-07-13","amount":820000,"method":"UZCARD","group":"R5","name":"Shahlo Sayfuddinova"},{"date":"2026-07-13","amount":20000,"method":"Cash","group":"R5","name":"Shahlo Sayfuddinova"},{"date":"2026-07-13","amount":840000,"method":"Click","group":"R30","name":"Muhammad Xamidov"},{"date":"2026-07-14","amount":40000,"method":"Click","group":"R6","name":"Aydin Adilova"},{"date":"2026-07-14","amount":1300000,"method":"Click","group":"MINI 1","name":"Ilhom Mirakbarov"},{"date":"2026-07-14","amount":820000,"method":"Cash","group":"R42","name":"Farhod Abdug'aniyev"},{"date":"2026-07-14","amount":600000,"method":"Cash","group":"R37","name":"Zokirjon Shokirov"},{"date":"2026-07-15","amount":40000,"method":"Cash","group":"I6","name":"Muxsina Javalova"},{"date":"2026-07-15","amount":670000,"method":"Cash","group":"R5","name":"Muhammadjon Rustamov"},{"date":"2026-07-15","amount":840000,"method":"Cash","group":"R30","name":"Mubina Maxkamova"},{"date":"2026-07-15","amount":420000,"method":"Click","group":"R30","name":"Munisa Norboyeva"},{"date":"2026-07-16","amount":500000,"method":"Cash","group":"R42","name":"Javohir Turdiyev"},{"date":"2026-07-16","amount":490000,"method":"Cash","group":"R13","name":"Ruxsora Ibragimova"},{"date":"2026-07-16","amount":30000,"method":"Cash","group":"R37","name":"Zokirjon Shokirov"},{"date":"2026-07-17","amount":100000,"method":"Cash","group":"MINI 1","name":"Kamronbek Yunusov"},{"date":"2026-07-17","amount":890000,"method":"Cash","group":"I6","name":"Bunyodbek Mirzohidov"},{"date":"2026-07-17","amount":400000,"method":"Click","group":"R31","name":"Feruza Zokirova"},{"date":"2026-07-18","amount":200000,"method":"Cash","group":"I14","name":"Jaloliddin Xasanov"},{"date":"2026-07-18","amount":342000,"method":"Click","group":"I14","name":"Sanjar Akbarov"},{"date":"2026-07-20","amount":40000,"method":"Click","group":"R7","name":"Boburbek Sultonov"},{"date":"2026-07-20","amount":8000,"method":"Click","group":"MINI 1","name":"Sitora Egamberdiyeva"},{"date":"2026-07-20","amount":275000,"method":"Cash","group":"MINI 1","name":"Sitora Egamberdiyeva"},{"date":"2026-07-20","amount":840000,"method":"Click","group":"R5","name":"Jahongir Vositov"},{"date":"2026-07-20","amount":800000,"method":"Cash","group":"R37","name":"Xojiakbar"},{"date":"2026-07-20","amount":840000,"method":"Click","name":"O'lmasbek"},{"date":"2026-07-21","amount":490000,"method":"Click","group":"R11","name":"Lobar Mahmudova"},{"date":"2026-07-22","amount":800000,"method":"UZCARD","group":"R7","name":"Boburbek Sultonov"},{"date":"2026-07-22","amount":840000,"method":"Click","group":"R33","name":"Otabek Jamilov"},{"date":"2026-07-22","amount":490000,"method":"Click","group":"R32","name":"Shaxnoza Bafayeva"},{"date":"2026-07-22","amount":200000,"method":"Click","group":"R31","name":"Madina Abdukarimova"},{"date":"2026-07-22","amount":840000,"method":"Cash","group":"R29","name":"Erkinova Muhlisa"},{"date":"2026-07-23","amount":500000,"method":"Cash","name":"Asilbek Saidov"},{"date":"2026-07-23","amount":1350000,"method":"Click","name":"Umid Sa'dullayev"},{"date":"2026-07-24","amount":617000,"method":"Click","group":"I14","name":"Muhammadqodir Ravshanbekov"},{"date":"2026-07-24","amount":100000,"method":"Click","group":"R30","name":"Abduqodir Jo'raev"},{"date":"2026-07-25","amount":1300000,"method":"Cash","group":"MINI 2","name":"Zuhriddin Qayimov"},{"date":"2026-07-25","amount":640000,"method":"Click","group":"R31","name":"Madina Abdukarimova"},{"date":"2026-07-27","amount":445000,"method":"Cash","group":"I6","name":"Mubina Muminova"},{"date":"2026-07-27","amount":840000,"method":"Cash","group":"R3","name":"Zubayr Ahromov"},{"date":"2026-07-27","amount":850000,"method":"Cash","group":"R4","name":"Bilol Jo'rayev"},{"date":"2026-07-28","amount":440000,"method":"Cash","group":"R40","name":"Lobar Tadjimirzayeva"},{"date":"2026-07-28","amount":420000,"method":"Cash","group":"R37","name":"Ziyayeva Madina"},{"date":"2026-07-28","amount":100000,"method":"Cash","group":"R36","name":"Sultonova Komila"},{"date":"2026-07-28","amount":740000,"method":"Click","group":"R36","name":"Sultonova Komila"},{"date":"2026-07-29","amount":850000,"method":"Cash","group":"R14","name":"Shuxrat Ashurov"},{"date":"2026-07-30","amount":840000,"method":"Click","name":"Nodira Jumanazarova"},{"date":"2026-07-30","amount":30000,"method":"Cash","group":"I14","name":"Jaloliddin Xasanov"},{"date":"2026-07-30","amount":320000,"method":"Cash","group":"I14","name":"Jaloliddin Xasanov"},{"date":"2026-07-30","amount":840000,"method":"Cash","group":"R37","name":"Muhammadiev Bekzod"},{"date":"2026-07-31","amount":990000,"method":"Click","group":"R41","name":"Sharifabonu Ahrorjonova"},{"date":"2026-07-31","amount":200000,"method":"Click","group":"R32","name":"Asliddin G'apporov"},{"date":"2026-07-31","amount":80000,"method":"Click","name":"Sarvinoz Muhammadkulova"},{"date":"2026-07-31","amount":200000,"method":"Cash","name":"Sarvinoz Muhammadkulova"},{"date":"2026-07-31","amount":1680000,"method":"UZCARD","name":"Axmadxon Shuxratov"},{"date":"2026-07-31","amount":490000,"method":"Click","group":"R4","name":"Zubayr Ahromov"}];

// Известные "почти совпадения" — реальные платежи старой системы, у которых в
// новой чуть другое написание имени или метод оплаты (не дубль, не трогаем):
//  - "Maryam" (новая) = "Maryam Mirsaidova" (старая), 900000 и 64000
//  - Axmadxon Shuxratov 1680000: в новой method=cash, в старой UZCARD (та же сумма)
const KEEP_IDS = new Set([
  'dtNJ8e6phhmhROk19dIo', // Maryam 900000 07-06 = старая "Maryam Mirsaidova" 900000
  'FUYXisNBA6WX52ebYBtr', // Maryam 64000 07-08 = старая "Maryam Mirsaidova" 64000
  'Us6VAxqxkxq9YJ2zRbnL', // Axmadxon Shuxratov 1680000 07-31 = старая, метод cash/UZCARD разошёлся
]);

function tashkentDate(d) {
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}
const norm = (s) => (s || '').toLowerCase().replace(/[`']/g, "'").replace(/\s+/g, ' ').trim();
const methodNorm = (m) => (m || '').toLowerCase();
const key = (x) => `${x.date}|${x.amount}|${methodNorm(x.method)}|${norm(x.name)}`;

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  const start = new Date('2026-07-01T00:00:00');
  const end = new Date('2026-08-01T00:00:00');
  const txSnap = await getDocs(
    query(
      collection(db, 'transactions'),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<', Timestamp.fromDate(end)),
    ),
  );
  const newList = [];
  txSnap.forEach((d) => {
    const t = d.data();
    if (t.type !== 'payment' || t.branchId !== BRANCH_ID) return;
    newList.push({
      id: d.id,
      date: tashkentDate(t.date?.toDate?.()),
      amount: t.amount,
      method: t.method,
      group: t.groupCode ?? '',
      name: t.studentName ?? '',
      studentId: t.studentId ?? null,
      month: t.month,
      branchId: t.branchId,
      createdAtMs: t.createdAt?.toMillis?.() ?? 0,
    });
  });

  const oldByKey = new Map();
  OLD_JULY.forEach((o, i) => {
    const k = key(o);
    if (!oldByKey.has(k)) oldByKey.set(k, []);
    oldByKey.get(k).push(i);
  });
  const oldUsed = new Array(OLD_JULY.length).fill(false);

  // Когда на один и тот же ключ старой системы претендуют 2 новых записи
  // (настоящая + призрак-дубль с studentId=null/createdAt=epoch), сначала
  // должна забирать пару настоящая — иначе жадный мэтчинг может случайно
  // сопоставить призрака и пометить настоящий платёж на удаление.
  const isGhost = (n) => !n.studentId || n.createdAtMs === 0;
  const ordered = [...newList].sort((a, b) => Number(isGhost(a)) - Number(isGhost(b)));

  const toDelete = [];
  for (const n of ordered) {
    if (KEEP_IDS.has(n.id)) continue;
    const k = key(n);
    const candidates = oldByKey.get(k) || [];
    const free = candidates.find((i) => !oldUsed[i]);
    if (free !== undefined) {
      oldUsed[free] = true;
    } else {
      toDelete.push(n);
    }
  }
  toDelete.sort((a, b) => a.date.localeCompare(b.date));

  console.log(`\nВсего платежей за июль в новой: ${newList.length}`);
  console.log(`Найдена пара в старой: ${newList.length - toDelete.length}`);
  console.log(`Кандидатов на удаление: ${toDelete.length}, сумма=${toDelete.reduce((s, t) => s + t.amount, 0)}\n`);

  for (const t of toDelete) {
    console.log(`  ${t.date}  ${t.amount}  ${t.method}  ${t.group}  ${t.name}  id=${t.id} studentId=${t.studentId} month=${t.month}`);
    if (t.month !== MONTH) {
      throw new Error(`СТОП: у ${t.id} month=${t.month}, ожидался ${MONTH} — не трогаю ничего.`);
    }
    if (t.branchId !== BRANCH_ID) {
      throw new Error(`СТОП: у ${t.id} branchId=${t.branchId} — не трогаю ничего.`);
    }
  }

  const remainingOld = OLD_JULY.filter((_, i) => !oldUsed[i]);
  if (remainingOld.length) {
    console.log(`\nВНИМАНИЕ: ${remainingOld.length} старых записей остались без пары (не удаляются, только для справки):`);
    remainingOld.forEach((t) => console.log(`  OLD ${t.date} ${t.amount} ${t.method} ${t.group} ${t.name}`));
  }

  if (!APPLY) {
    console.log('\ndry-run. Проверь список и запусти с --apply.');
    process.exit(0);
  }

  for (const t of toDelete) {
    // eslint-disable-next-line no-await-in-loop
    await deleteTransaction(db, { id: t.id, studentId: t.studentId, amount: t.amount, month: t.month, type: 'payment', branchId: t.branchId });
    console.log(`Удалено: ${t.id}`);
  }
  console.log('\nГотово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
