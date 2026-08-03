/**
 * Исправление дат зачисления: `students.createdAt` у Phase-1 студентов был
 * датой СТАРТА ГРУППЫ (общий импорт), а не личной датой присоединения.
 * Из-за этого "Обучается"/средний срок в CRM был завышен. Даты собраны
 * вручную из History каждой из 28 активных групп modme, см.
 * scripts/_activation_dates_progress.md.
 *
 * 17 студентов (Frozen/Trial на момент миграции) отсутствуют в базе целиком
 * и намеренно НЕ включены сюда — они заводятся отдельным скриптом.
 *
 *   node --env-file=.env scripts/_fix_activation_dates.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, writeBatch, Timestamp, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

// [groupCode, studentName, 'YYYY-MM-DD']
const DATA = [
  ['I12', 'Azamat Ergashev', '2026-04-02'],
  ['I12', 'Foziljon Ozodov', '2026-07-04'],
  ['I12', "Mohinur Abdug'afforova", '2026-06-16'],
  ['I12', 'Sora Baxtiyorova', '2026-06-16'],

  ['I13', 'Mirazim Mirjalolov', '2026-04-27'],
  ['I13', 'Sindor Allanazarov', '2026-07-02'],
  ['I13', 'Xadicha Bahtiyorova', '2026-07-04'],

  ['I14', 'Abbos Baxtiyev', '2026-06-16'],
  ['I14', 'Abdulloh Hikmatullayev', '2026-06-23'],
  ['I14', 'Jaloliddin Xasanov', '2026-07-16'],
  ['I14', 'Muhammadqodir Ravshanbekov', '2026-06-25'],
  ['I14', 'Oybek Shavkatov', '2026-02-12'],
  ['I14', 'Sanjar Akbarov', '2026-04-25'],

  ['I5', 'Muhammadyusuf Akromov', '2026-06-22'],
  ['I5', 'Samira Mahkamova', '2026-05-01'],
  ['I5', 'Shaxnur Axmedov', '2026-04-03'],
  ['I5', 'Sobirjonov Muhammadali', '2026-06-01'],
  ['I5', 'Yusuf Rahmatullayev', '2026-06-03'],

  ['I6', 'Bunyodbek Mirzohidov', '2026-07-15'],
  ['I6', 'Diyorbek Radjapov', '2026-07-01'],
  ['I6', 'Maryam', '2026-06-29'],
  ['I6', 'Mubina Muminova', '2026-08-01'],
  ['I6', 'Muslima Azamatova', '2026-06-17'],
  ['I6', 'Muslima Jamalova', '2026-06-12'],
  ['I6', 'Muxsina Javalova', '2026-06-12'],
  ['I6', 'Saidabror G`aniyev', '2026-07-10'],

  ['I7', 'Fazliddin Lutfullayev', '2026-07-03'],
  ['I7', 'Kamron Kenjayev', '2026-06-16'],
  ['I7', 'Lazizbek Xusanboyev', '2026-05-13'],

  ['MINI 1', 'Ilhom Mirakbarov', '2026-07-14'],
  ['MINI 1', 'Kamronbek Yunusov', '2026-07-15'],
  ['MINI 1', 'Sitora Egamberdiyeva', '2026-07-08'],

  ['MINI 2', "Umid Sa'dullayev", '2026-07-21'],
  ['MINI 2', 'Zuhriddin Qayimov', '2026-07-31'],

  ['R11', 'Bahodir Aripov', '2026-01-17'],
  ['R11', 'Lobar Mahmudova', '2026-05-05'],
  ['R11', 'Mubina Yaqubhajjayeva', '2026-01-13'],
  ['R11', "Muhammadiso G'aniyev", '2026-06-18'],
  ['R11', 'Saidafzal Mirzayev', '2026-04-28'],

  ['R12', 'Farzona Raxmatullayeva', '2026-07-02'],
  ['R12', 'Umar Faxriddinov', '2026-07-21'],

  ['R13', 'Fayzulloh Axrorov', '2026-05-09'],
  ['R13', 'Maftuna Ixtiyarova', '2026-06-06'],
  ['R13', 'Munisa Ammonova', '2026-06-06'],
  ['R13', 'Ruxsora Ibragimova', '2026-07-16'],

  ['R14', 'Baxrom Musulmonov', '2026-06-09'],
  ['R14', 'Roziya Bahodirova', '2026-06-10'],
  ['R14', 'Shohjahon Axmatov', '2026-06-04'],
  ['R14', 'Shuxrat Ashurov', '2026-07-29'],
  ['R14', 'Tohir Toirjonov', '2026-06-18'],

  ['R29', 'Elbek Uchqunov', '2026-06-01'],
  ['R29', 'Erkinova Muhlisa', '2026-07-22'],
  ['R29', "O'lmasbek", '2026-07-20'],
  ['R29', 'Sardor Toirov', '2026-07-01'],
  ['R29', "Ziyoda Yo'ldosheva", '2026-07-01'],
  ['R29', 'Ziyodaxon Saidinabiyeva', '2026-05-13'],

  ['R30', 'Abdullox Abdullayev', '2026-07-10'],
  ['R30', "Abduqodir Jo'raev", '2026-07-24'],
  ['R30', 'Dilnoza Rihsiboyeva', '2026-06-17'],
  ['R30', 'Maftuna Mohirjonova', '2026-06-01'],
  ['R30', 'Mohinur Mansurova', '2026-07-06'],
  ['R30', 'Mubina Maxkamova', '2026-07-13'],
  ['R30', 'Muhammad Xamidov', '2026-07-13'],
  ['R30', 'Munisa Norboyeva', '2026-05-20'],
  ['R30', 'Sarvar Nuraliyev', '2026-06-19'],
  ['R30', 'Shahrizoda Xasanova', '2026-07-20'],

  ['R31', 'Feruza Zokirova', '2026-07-13'],
  ['R31', "Habiba To'xtasinova", '2026-07-13'],
  ['R31', 'Madina Abdukarimova', '2026-07-22'],

  ['R32', "Asliddin G'apporov", '2026-07-13'],
  ['R32', 'Shaxnoza Bafayeva', '2026-07-22'],

  ['R33', 'Abror Alijonov', '2026-07-07'],
  ['R33', 'Asila Ismoilova', '2026-07-08'],
  ['R33', 'Aydin Adilova', '2026-07-31'],
  ['R33', 'Izzatilla Mahmudov', '2026-07-13'],
  ['R33', 'Javohir Tulanov', '2026-07-09'],
  ['R33', 'Maftuna Fozilova', '2026-07-13'],
  ['R33', 'Mubina Inogamova', '2026-07-13'],
  ['R33', 'Nozima Maxkamova', '2026-07-09'],
  ['R33', 'Otabek Jamilov', '2026-07-20'],

  ['R34', "Asilbek Ro'ziboyev", '2026-07-06'],
  ['R34', 'Mohir Abdurauffov', '2026-05-13'],
  ['R34', 'Nodira Jumanazarova', '2026-08-01'],
  ['R34', 'Roziya Murodova', '2026-07-13'],
  ['R34', 'Sarvinoz Mamurjonova', '2026-07-24'],

  ['R36', 'Bobur Sirojiddinov', '2026-07-01'],
  ['R36', 'Durdona Nomozboyeva', '2026-07-02'],
  ['R36', 'Elbek Sadriyev', '2026-07-04'],
  ['R36', "Nodirxo'ja Muzaffarov", '2026-07-01'],
  ['R36', 'Sultonova Komila', '2026-07-28'],

  ['R37', 'Ibrohim Ismoilov', '2026-06-13'],
  ['R37', 'Mahliyo Musulmonova', '2026-07-01'],
  ['R37', 'Muhammadiev Bekzod', '2026-07-30'],
  ['R37', "Muslima G'ofurova", '2026-06-02'],
  ['R37', "Ulug'bek Raimqulov", '2026-06-18'],
  ['R37', 'Xojiakbar', '2026-07-20'],
  ['R37', 'Yunus Hamdamov', '2026-07-01'],
  ['R37', 'Ziyayeva Madina', '2026-07-28'],
  ['R37', 'Zokirjon Shokirov', '2026-07-01'],

  ['R39', "G'iyosiddin Sodiqov", '2026-07-09'],
  ['R39', 'Muslima Murodova', '2026-06-04'],
  ['R39', 'Muslima Saidova', '2026-06-04'],
  ['R39', 'Sojida Umarova', '2026-06-04'],

  ['R4', "Bilol Jo'rayev", '2026-07-27'],
  ['R4', "Habibulloh Jo'rayev", '2026-06-19'],
  ['R4', 'Munisa Karimova', '2026-06-01'],
  ['R4', 'Munisa Nazirova', '2026-07-08'],
  ['R4', 'Muqaddas Jo`rayeva', '2026-05-06'],
  ['R4', 'Shahriyor Kamoliddinov', '2026-07-06'],
  ['R4', "Ulug'bek Usmonov", '2026-07-13'],
  ['R4', 'Zubayr Ahromov', '2026-07-31'],

  ['R40', 'Diyora Normamatova', '2026-04-02'],
  ['R40', 'Lobar Tadjimirzayeva', '2026-06-23'],
  ['R40', 'Ozodbek Rajabov', '2026-07-07'],
  ['R40', 'Rasulova Robiya', '2026-06-13'],
  ['R40', 'Samandar Ermatov', '2026-07-04'],

  ['R41', 'Abdujabbor Asrorov', '2026-06-23'],
  ['R41', "E'zoza Usmanova", '2026-06-23'],
  ['R41', 'Madina Zoidbekova', '2026-07-04'],
  ['R41', 'Qudratjon Kabirjonov', '2026-06-06'],
  ['R41', 'Sharifabonu Ahrorjonova', '2026-07-28'],

  ['R42', 'E`zoza To`raboyeva', '2026-07-03'],
  ['R42', "Farhod Abdug'aniyev", '2026-06-23'],
  ['R42', 'Hayrulla Abdukamolov', '2026-01-17'],
  ['R42', 'Javohir Turdiyev', '2026-07-16'],
  ['R42', 'Komila Egamberdiyeva', '2026-07-02'],
  ['R42', 'Malika Fattoyeva', '2026-08-01'],
  ['R42', 'Muhammadziyo Abdulxamidov', '2026-03-28'],
  ['R42', 'Shohjaxon Erkinov', '2026-07-07'],

  ['R5', 'Abduazim Axrorov', '2026-04-08'],
  ['R5', 'Asadbek Ergashev', '2026-06-19'],
  ['R5', 'Iroda Alimbekova', '2026-07-01'],
  ['R5', 'Jahongir', '2026-07-17'],
  ['R5', 'Madina Sharipova', '2026-07-03'],
  ['R5', 'Muhammadjon Rustamov', '2026-07-13'],
  ['R5', 'Shahlo Sayfuddinova', '2026-07-29'],
  ['R5', 'Shahruza Muqumjonova', '2026-07-01'],
  ['R5', 'Soliha Xikmatova', '2026-07-08'],

  ['R6', 'Sarvinoz Muhammadkulova', '2026-07-31'],

  ['R7', 'Axmadxon Shuxratov', '2026-07-31'],
  ['R7', 'Boburbek Sultonov', '2026-07-16'],
  ['R7', 'Diyorbek Yursunov', '2026-06-22'],
  ['R7', 'Hojiakbar Zuxriddinov', '2026-05-18'],
  ['R7', 'Mahsudali Voxobjonov', '2026-05-18'],
];

function toTashkentTimestamp(dateStr) {
  return Timestamp.fromDate(new Date(`${dateStr}T00:00:00+05:00`));
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const groupsSnap = await getDocs(collection(db, 'groups'));
  const codeToId = {};
  groupsSnap.forEach((d) => { codeToId[d.data().code] = d.id; });

  const enrollSnap = await getDocs(collection(db, 'enrollments'));
  const enrollments = enrollSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const batch = writeBatch(db);
  let updated = 0;
  const notFound = [];
  const studentIdsTouched = new Set();

  for (const [groupCode, studentName, dateStr] of DATA) {
    const gid = codeToId[groupCode];
    if (!gid) { notFound.push(`группа ${groupCode} не найдена (${studentName})`); continue; }
    const enrollment = enrollments.find((e) => e.groupId === gid && e.studentName === studentName);
    if (!enrollment) { notFound.push(`${studentName} (${groupCode}) — enrollment не найден`); continue; }

    const ts = toTashkentTimestamp(dateStr);
    batch.update(doc(db, 'enrollments', enrollment.id), {
      addedAt: ts,
      activatedAt: ts,
    });
    if (!studentIdsTouched.has(enrollment.studentId)) {
      studentIdsTouched.add(enrollment.studentId);
      batch.update(doc(db, 'students', enrollment.studentId), {
        createdAt: ts,
      });
    }
    updated++;
  }

  console.log(`К обновлению: ${updated} enrollments, ${studentIdsTouched.size} students.`);
  if (notFound.length) {
    console.log(`\nНЕ НАЙДЕНО (${notFound.length}) — пропущены, не входят в batch:`);
    notFound.forEach((n) => console.log('  ', n));
  }

  await batch.commit();
  console.log('\nГотово. Записано в базу.', 'by', uid);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
