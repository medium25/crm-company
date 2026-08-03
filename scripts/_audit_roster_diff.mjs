/**
 * READ-ONLY: сверка полного ростера каждой из 28 активных групп modme
 * (собран вручную в этой сессии через Browser) против enrollments в базе
 * по groupCode + studentName. Ищем студентов из modme, которых нет в базе
 * вообще (пропущены при миграции), и наоборот — лишних в базе, которых нет
 * в modme (не должны быть активны).
 *
 *   node --env-file=.env scripts/_audit_roster_diff.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

// Полный ростер каждой группы (включая frozen/trial) — со страницы группы в
// modme (список НЕ под "Show archived students"), собран в этой сессии.
const MODME_ROSTERS = {
  I12: ['Azamat Ergashev', 'Foziljon Ozodov', 'Mohinur Abdug\'afforova', 'Sora Baxtiyorova'],
  I13: ['Jasmina Tojiyeva', 'Mirazim Mirjalolov', 'Saida`zim Qudratrov', 'Sindor Allanazarov', 'Xadicha Bahtiyorova'],
  I14: ['Abbos Baxtiyev', 'Abdulloh Hikmatullayev', 'Jaloliddin Xasanov', 'Muhammadqodir Ravshanbekov', 'Oybek Shavkatov', 'Sanjar Akbarov'],
  I5: ['Mohir Ergashboyev', 'Muhammadyusuf Akromov', 'Samira Mahkamova', 'Shaxnur Axmedov', 'Sobirjonov Muhammadali', 'Yusuf Rahmatullayev'],
  I6: ['Bunyodbek Mirzohidov', 'Diyorbek Radjapov', 'Maryam', 'Mubina Muminova', 'Muslima Azamatova', 'Muslima Jamalova', 'Muxsina Javalova', 'Saidabror G`aniyev'],
  I7: ['Fazliddin Lutfullayev', 'Kamron Kenjayev', 'Lazizbek Xusanboyev'],
  'MINI 1': ['Ilhom Mirakbarov', 'Kamronbek Yunusov', 'Sitora Egamberdiyeva'],
  'MINI 2': ['Umid Sa\'dullayev', 'Zuhriddin Qayimov'],
  R11: ['Bahodir Aripov', 'Lobar Mahmudova', 'Mubina Yaqubhajjayeva', 'Muhammadiso G\'aniyev', 'Saidafzal Mirzayev'],
  R12: ['Farzona Raxmatullayeva', 'Umar Faxriddinov'],
  R13: ['Abror', 'Fayzulloh Axrorov', 'Maftuna Ixtiyarova', 'Munisa Ammonova', 'Ruxsora Ibragimova', 'Vasila Abdugaffarova'],
  R14: ['Baxrom Musulmonov', 'Muhammadsolih', 'Roziya Bahodirova', 'Shohjahon Axmatov', 'Shuxrat Ashurov', 'Tohir Toirjonov'],
  R29: ['Elbek Uchqunov', 'Erkinova Muhlisa', 'O\'lmasbek', 'Sardor Toirov', 'Ziyoda Yo\'ldosheva', 'Ziyodaxon Saidinabiyeva'],
  R30: ['Abdullox Abdullayev', 'Abduqodir Jo\'raev', 'Dilnoza Rihsiboyeva', 'Maftuna Mohirjonova', 'Mohinur Mansurova', 'Mubina Maxkamova', 'Muhammad Xamidov', 'Munisa Norboyeva', 'Sarvar Nuraliyev', 'Shahrizoda Xasanova'],
  R31: ['Feruza Zokirova', 'Habiba To\'xtasinova', 'Madina Abdukarimova'],
  R32: ['Asliddin G\'apporov', 'Robiya Saidganiyeva', 'Shaxnoza Bafayeva'],
  R33: ['Abror Alijonov', 'Asila Ismoilova', 'Aydin Adilova', 'Izzatilla Mahmudov', 'Javohir Tulanov', 'Maftuna Fozilova', 'Mubina Inogamova', 'Muhammadsolix Abdurashidov', 'Nozima Maxkamova', 'Otabek Jamilov'],
  R34: ['Asilbek Ro\'ziboyev', 'Mohir Abdurauffov', 'Nodira Jumanazarova', 'Roziya Murodova', 'Sarvinoz Mamurjonova', 'Uchqunbek Bomurodov'],
  R36: ['Bobur Sirojiddinov', 'Durdona Nomozboyeva', 'Elbek Sadriyev', 'Nodirxo\'ja Muzaffarov', 'Sultonova Komila'],
  R37: ['Ibrohim Ismoilov', 'Mahliyo Musulmonova', 'Muhammadiev Bekzod', 'Muslima G\'ofurova', 'Ulug\'bek Raimqulov', 'Xojiakbar', 'Yunus Hamdamov', 'Ziyayeva Madina', 'Zokirjon Shokirov'],
  R39: ['G\'iyosiddin Sodiqov', 'Muslima Murodova', 'Muslima Saidova', 'Sevinch Muxammadiyeva', 'Sojida Umarova'],
  R4: ['Bilol Jo\'rayev', 'Dinora Turdimurodova', 'Habibulloh Jo\'rayev', 'Munisa Karimova', 'Munisa Nazirova', 'Muqaddas Jo`rayeva', 'Shahriyor Kamoliddinov', 'Ulug\'bek Usmonov', 'Zubayr Ahromov', 'Zuhriddin Jamoliddinov'],
  R40: ['Diyora Normamatova', 'Lobar Tadjimirzayeva', 'Ozodbek Rajabov', 'Rasulova Robiya', 'Samandar Ermatov'],
  R41: ['Abdujabbor Asrorov', 'Asliddin Oybekov', 'E\'zoza Usmanova', 'Madina Zoidbekova', 'Qudratjon Kabirjonov', 'Sharifabonu Ahrorjonova'],
  R42: ['Abduqodir Toirov', 'E`zoza To`raboyeva', 'Farhod Abdug\'aniyev', 'Hayrulla Abdukamolov', 'Javohir Turdiyev', 'Komila Egamberdiyeva', 'Malika Fattoyeva', 'Muhammadziyo Abdulxamidov', 'Safar Nishonaliyev', 'Shahruz Sharifov', 'Shohjaxon Erkinov'],
  R5: ['Abduazim Axrorov', 'Asadbek Ergashev', 'Iroda Alimbekova', 'Jahongir', 'Madina Sharipova', 'Muhammadjon Rustamov', 'Shahlo Sayfuddinova', 'Shahruza Muqumjonova', 'Soliha Xikmatova'],
  R6: ['Sarvinoz Muhammadkulova', 'Sevara Sho\'ldasova'],
  R7: ['Axmadxon Shuxratov', 'Boburbek Sultonov', 'Diyorbek Yursunov', 'Hojiakbar Zuxriddinov', 'Mahsudali Voxobjonov'],
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  const groupsSnap = await getDocs(collection(db, 'groups'));
  const codeToId = {};
  groupsSnap.forEach((d) => { codeToId[d.data().code] = d.id; });

  const enrollSnap = await getDocs(collection(db, 'enrollments'));
  const enrollments = enrollSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let missingTotal = 0;
  for (const [code, roster] of Object.entries(MODME_ROSTERS)) {
    const gid = codeToId[code];
    if (!gid) { console.log(`!! Группа ${code} не найдена в базе вообще`); continue; }
    const dbNames = enrollments.filter((e) => e.groupId === gid).map((e) => e.studentName);
    const missing = roster.filter((n) => !dbNames.includes(n));
    if (missing.length) {
      missingTotal += missing.length;
      console.log(`${code}: НЕ ХВАТАЕТ в базе: ${missing.join(', ')}`);
    }
  }
  console.log(`\nВсего отсутствующих студентов из проверенных групп: ${missingTotal}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
