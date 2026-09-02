import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';

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

// Транскрипт старой системы (icon.modme.uz), «Все оплаты», 01.08.2026—31.08.2026,
// без фильтра — все 4 страницы. [date, name, amount, teacher|null, groupCode|null]
const OLD = [
  ['2026-08-28','Kitob',55000,null,null],
  ['2026-08-28','Miraziz Ochilov',910000,'MS SHAXZODA','R34'],
  ['2026-08-28','Husan Turdumuhammedov',840000,'MS KRISTINA','R6'],
  ['2026-08-28','Amirbek Raximov',990000,'MS KRISTINA','R12'],
  ['2026-08-28','Ibrohim Ismoilov',240000,'MS ZIYODA (BETA)','R37'],
  ['2026-08-26','Kitob',55000,null,null],
  ['2026-08-26','Maryam Mirsaidova',890000,'MR IBROHIM','I6'],
  ['2026-08-24','Munisa Norboyeva',420000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-24','Sunatillo Tugalov',800000,'MS KRISTINA','R4'],
  ['2026-08-22','Kitob',55000,null,null],
  ['2026-08-21','Kitob',55000,null,null],
  ['2026-08-21','Alisher Qurbonov',840000,'MS SHAXZODA','R39'],
  ['2026-08-21','Madina Sharipova',840000,'MS KRISTINA','R5'],
  ['2026-08-21','Ziyayeva Madina',860000,'MS ZIYODA (BETA)','R37'],
  ['2026-08-21','Yusuf Turdumuhammadov',440000,'MS KRISTINA','R6'],
  ['2026-08-21','Jaloliddin Xasanov',10000,'MR IBROHIM','I14'],
  ['2026-08-21','Kitob',55000,null,null],
  ['2026-08-21','Abdullox Abdullaxatov',845000,'MS ZIYODA (BETA)','R29'],
  ['2026-08-20','Jaloliddin Xasanov',360000,'MR IBROHIM','I14'],
  ['2026-08-20','Fazliddin Sirojiddinov',840000,'MS KRISTINA','R14'],
  ['2026-08-20','Kitob',55000,null,null],
  ['2026-08-20','Yusuf Turdumuhammadov',400000,'MS KRISTINA','R6'],
  ['2026-08-19','Asqar Ilhamov',100000,'MR IBROHIM','I7'],
  ['2026-08-19','Jobir Boboqulov',100000,'MR IBROHIM','I14'],
  ['2026-08-18','Jaloliddin Xasanov',500000,'MR IBROHIM','I14'],
  ['2026-08-18','Kitob',55000,null,null],
  ['2026-08-18','Habibulloh Jorayev',430000,'MS KRISTINA','R4'],
  ['2026-08-18','Shahrizoda Xasanova',540000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-17','Mubina Inogamova',840000,'MS SHAXZODA','R33'],
  ['2026-08-17','Kitob',55000,null,null],
  ['2026-08-17','Asliddin Gapporov',290000,'MS SHAXZODA','R32'],
  ['2026-08-15','Said Abdurahmonov',840000,null,null],
  ['2026-08-15','Kitob',55000,null,null],
  ['2026-08-15','Olmasbek Yusupov',845000,null,null],
  ['2026-08-15','Kitob',55000,null,null],
  ['2026-08-15','Abdullox Abdullayev',400000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-15','Ozodbek Rajabov',770000,'MS SHAXZODA','R40'],
  ['2026-08-15','Kitob',55000,null,null],
  ['2026-08-15','Yunus Hamdamov',840000,'MS ZIYODA (BETA)','R37'],
  ['2026-08-14','Feruza Zokirova',890000,'MS SHAXZODA','R31'],
  ['2026-08-14','Saidabror Ganiyev',890000,'MR IBROHIM','I6'],
  ['2026-08-14','Habiba Toxtasinova',100000,'MS SHAXZODA','R31'],
  ['2026-08-13','Bahodir Suyarov',840000,'MS KRISTINA','R14'],
  ['2026-08-13','Mirjalol Hamidullayev',890000,null,null],
  ['2026-08-13','Sabina Anvarova',1,'MS KRISTINA','R5'],
  ['2026-08-13','Kitob',55000,null,null],
  ['2026-08-13','Anvarxojayev Tohir',840000,'MS KRISTINA','R11'],
  ['2026-08-13','Diyora Normamatova',840000,'MS SHAXZODA','R40'],
  ['2026-08-13','Safiya Najimova',840000,null,null],
  ['2026-08-13','Sultonova Komila',140000,'MS ZIYODA (BETA)','R36'],
  ['2026-08-12','Kitob',5000,null,null],
  ['2026-08-12','Maryam Mirsaidova',190000,'MR IBROHIM','I6'],
  ['2026-08-12','Kitob',50000,null,null],
  ['2026-08-12','Kitob',45000,null,null],
  ['2026-08-12','Kitob',10000,null,null],
  ['2026-08-12','Madina Abdukarimova',490000,'MS SHAXZODA','R31'],
  ['2026-08-12','Abdullox Abdullayev',370000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-11','Sitora Egamberdiyeva',100000,'MS KRISTINA','MINI 1'],
  ['2026-08-11','Otabek Jamilov',420000,'MS SHAXZODA','R33'],
  ['2026-08-11','Abdulloh Hikmatullayev',890000,'MR IBROHIM','I14'],
  ['2026-08-11','Feruza Zokirova',640000,'MS SHAXZODA','R31'],
  ['2026-08-11','Robiya Abdugʻaniyeva',840000,null,null],
  ['2026-08-11','Saidafzal Mirzayev',840000,'MS KRISTINA','R11'],
  ['2026-08-11','Munisa Ammonova',40000,'MS KRISTINA','R13'],
  ['2026-08-11','Kitob',55000,null,null],
  ['2026-08-11','Kitob',55000,null,null],
  ['2026-08-11','Nodirxoja Muzaffarov',840000,'MS ZIYODA (BETA)','R36'],
  ['2026-08-11','Zokirjon Shokirov',840000,'MS ZIYODA (BETA)','R37'],
  ['2026-08-11','Dilnoza Rihsiboyeva',840000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-10','Shahlo Sayfuddinova',40000,'MS KRISTINA','R5'],
  ['2026-08-10','Fayoz Toraqulov',1300000,'MS KRISTINA','MINI 1'],
  ['2026-08-10','Sitora Egamberdiyeva',1200000,'MS KRISTINA','MINI 1'],
  ['2026-08-10','Odina Kamilova',700000,null,null],
  ['2026-08-10','Farzona Raxmatullayeva',840000,'MS KRISTINA','R12'],
  ['2026-08-10','Maftuna Fozilova',840000,'MS SHAXZODA','R33'],
  ['2026-08-10','Shahlo Sayfuddinova',800000,'MS KRISTINA','R5'],
  ['2026-08-10','Munisa Ammonova',700000,'MS KRISTINA','R13'],
  ['2026-08-10','Habiba Toxtasinova',440000,'MS SHAXZODA','R31'],
  ['2026-08-10','Ziyoda Yoldosheva',840000,'MS ZIYODA (BETA)','R29'],
  ['2026-08-08','Asadbek Baxtiyorov',560000,null,null],
  ['2026-08-08','Umar Faxriddinov',840000,'MS KRISTINA','R12'],
  ['2026-08-08','Mohinur Abdugafforova',890000,'MR IBROHIM','I13'],
  ['2026-08-08','Doniyor Sharifjonov',840000,'MS KRISTINA','R13'],
  ['2026-08-08','Sojida Umarova',840000,'MS SHAXZODA','R39'],
  ['2026-08-08','Muslima Saidova',840000,'MS SHAXZODA','R39'],
  ['2026-08-08','Durdona Nomozboyeva',420000,'MS ZIYODA (BETA)','R36'],
  ['2026-08-07','Zuhriddin Qayimov',436000,'MS KRISTINA','MINI 2'],
  ['2026-08-07','Shaxnur Axmedov',900000,'MR IBROHIM','I6'],
  ['2026-08-07','Sobirjonov Muhammadali',890000,'MR IBROHIM','I6'],
  ['2026-08-07','Zuhra Akmalova',640000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-07','Kitob',55000,null,null],
  ['2026-08-07','Mahliyo Xasanova',840000,'MS SHAXZODA','R32'],
  ['2026-08-07','Kitob',55000,null,null],
  ['2026-08-07','Kitob',55000,null,null],
  ['2026-08-07','Habiba Toxtasinova',300000,'MS SHAXZODA','R31'],
  ['2026-08-07','Mohinur Mansurova',80000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-07','Munisa Norboyeva',420000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-07','Shahrizoda Xasanova',300000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-07','Mohinur Mansurova',640000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-07','Zuhra Akmalova',200000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-06','Sanjar Akbarov',890000,'MR IBROHIM','I14'],
  ['2026-08-06','Sevinch Muxammadiyeva',560000,'MS SHAXZODA','R39'],
  ['2026-08-06','Azamat Ergashev',190000,'MR IBROHIM','I12'],
  ['2026-08-06','Azamat Ergashev',700000,'MR IBROHIM','I12'],
  ['2026-08-06','Ibrohim Ismoilov',600000,'MS ZIYODA (BETA)','R37'],
  ['2026-08-06','Jahongir Vositov',800000,'MS KRISTINA','R5'],
  ['2026-08-06','Lobar Sayidahmadova',840000,'MS ZIYODA (BETA)','R37'],
  ['2026-08-06','Sherzod Xidirov',840000,'MS ZIYODA (BETA)','R36'],
  ['2026-08-05','Kitob',55000,null,null],
  ['2026-08-05','Javohir Tulanov',770000,'MS SHAXZODA','R33'],
  ['2026-08-05','Asila Ismoilova',770000,'MS SHAXZODA','R33'],
  ['2026-08-05','Roziya Bahodirova',840000,'MS KRISTINA','R14'],
  ['2026-08-05','Nozima Maxkamova',830000,'MS SHAXZODA','R33'],
  ['2026-08-05','Mirazim Mirjalolov',890000,'MR IBROHIM','I13'],
  ['2026-08-05','Kamron Kenjayev',880000,'MR IBROHIM','I7'],
  ['2026-08-05','Mubina Muminova',890000,'MR IBROHIM','I6'],
  ['2026-08-05','Maryam Mirsaidova',700000,'MR IBROHIM','I6'],
  ['2026-08-05','Muhammadjon Rustamov',800000,'MS KRISTINA','R5'],
  ['2026-08-05','Shaxnoza Bafayeva',350000,'MS SHAXZODA','R32'],
  ['2026-08-05','Samandar Ermatov',840000,'MS SHAXZODA','R40'],
  ['2026-08-05','Soliha Xikmatova',840000,'MS KRISTINA','R5'],
  ['2026-08-05','Nasiba Usarova',420000,'MS SHAXZODA','R32'],
  ['2026-08-05','Muhammadiso Ganiyev',840000,'MS KRISTINA','R4'],
  ['2026-08-05','Bilol Jorayev',170000,'MS KRISTINA','R4'],
  ['2026-08-05','Abduazim Axrorov',840000,'MS KRISTINA','R5'],
  ['2026-08-05','Habibulloh Jorayev',200000,'MS KRISTINA','R4'],
  ['2026-08-05','Muhammad Xamidov',630000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-05','Sardor Toirov',840000,'MS ZIYODA (BETA)','R29'],
  ['2026-08-04','Aydin Adilova',840000,'MS SHAXZODA','R33'],
  ['2026-08-04','Komila Egamberdiyeva',560000,'MS SHAXZODA','R42'],
  ['2026-08-04','Fayzulloh Axrorov',840000,'MS KRISTINA','R13'],
  ['2026-08-04','Shohjaxon Erkinov',70000,'MS SHAXZODA','R42'],
  ['2026-08-04','Shohjaxon Erkinov',700000,'MS SHAXZODA','R42'],
  ['2026-08-04','Ruxsora Ibragimova',10000,'MS KRISTINA','R13'],
  ['2026-08-04','Ruxsora Ibragimova',840000,'MS KRISTINA','R13'],
  ['2026-08-04','Muslima Murodova',840000,'MS SHAXZODA','R39'],
  ['2026-08-04','Shahriyor Kamoliddinov',840000,'MS KRISTINA','R4'],
  ['2026-08-03','Bexruz Ganiyev',850000,'MS ZIYODA (BETA)','R29'],
  ['2026-08-03','Ismoil Turgunov',890000,'MR IBROHIM','I14'],
  ['2026-08-03','Hojiakbar Zuxriddinov',1050000,'MS KRISTINA','R7'],
  ['2026-08-03','Roziya Murodova',830000,'MS SHAXZODA','R34'],
  ['2026-08-03','Mahsudali Voxobjonov',840000,'MS KRISTINA','R7'],
  ['2026-08-03','Shuxrat Ashurov',60000,'MS KRISTINA','R14'],
  ['2026-08-03','Marjona Ungboyeva',910000,null,null],
  ['2026-08-03','Asadbek Ergashev',840000,'MS KRISTINA','R5'],
  ['2026-08-03','Shahruza Muqumjonova',840000,'MS KRISTINA','R5'],
  ['2026-08-03','Iroda Alimbekova',840000,'MS KRISTINA','R5'],
  ['2026-08-03','Erkinova Muhlisa',350000,'MS ZIYODA (BETA)','R29'],
  ['2026-08-03','Elbek Uchqunov',840000,'MS ZIYODA (BETA)','R29'],
  ['2026-08-03','Mubina Maxkamova',630000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-03','Sarvar Nuraliyev',840000,'MS ZIYODA (BETA)','R30'],
  ['2026-08-03','Zarnigor Abdushukurova',1050000,'MS KRISTINA','MINI 2'],
  ['2026-08-01','Malika Fattoyeva',910000,'MS SHAXZODA','R42'],
];

console.log('OLD rows:', OLD.length, 'OLD sum:', OLD.reduce((s,r)=>s+r[2],0));

const from = Timestamp.fromDate(new Date('2026-08-01T00:00:00+05:00'));
const to = Timestamp.fromDate(new Date('2026-08-31T23:59:59+05:00'));
const snap = await getDocs(query(collection(db, 'transactions'), where('branchId','==','icon-main'), where('type','==','payment'), where('date','>=',from), where('date','<=',to)));
const NEW = [];
snap.forEach(d => {
  const t = d.data();
  NEW.push({ id: d.id, date: t.date?.toDate?.(), studentName: t.studentName, amount: t.amount, teacherName: t.teacherName ?? null, groupCode: t.groupCode ?? null });
});
console.log('NEW rows:', NEW.length, 'NEW sum:', NEW.reduce((s,r)=>s+r.amount,0));

// Сопоставление: по (amount, name-похожесть). Каждую NEW запись сопоставляем максимум с одной OLD.
const norm = (s) => (s||'').toLowerCase().replace(/['`ʻ’]/g,'').replace(/[^a-zа-я0-9]/gi,'');
const usedOld = new Set();
const mismatches = [];
const unmatched = [];

for (const n of NEW) {
  const nName = norm(n.studentName);
  let bestIdx = -1;
  for (let i = 0; i < OLD.length; i++) {
    if (usedOld.has(i)) continue;
    const [, oName, oAmount] = OLD[i];
    if (oAmount !== n.amount) continue;
    if (norm(oName) !== nName) continue;
    bestIdx = i;
    break;
  }
  if (bestIdx === -1) {
    unmatched.push(n);
    continue;
  }
  usedOld.add(bestIdx);
  const [, , , oTeacher, oGroup] = OLD[bestIdx];
  if ((oTeacher||null) !== (n.teacherName||null)) {
    mismatches.push({ id: n.id, studentName: n.studentName, amount: n.amount, newTeacher: n.teacherName, oldTeacher: oTeacher, newGroup: n.groupCode, oldGroup: oGroup });
  }
}

console.log('\n=== Несовпадения учителя (new vs old) ===');
mismatches.forEach(m => console.log(`${m.studentName} | ${m.amount} | NEW: ${m.newTeacher}/${m.newGroup} <- OLD: ${m.oldTeacher}/${m.oldGroup}`));
console.log('mismatches count:', mismatches.length);

console.log('\n=== NEW без пары в OLD (возможно лишние/дубли в новой) ===');
unmatched.forEach(n => console.log(n.studentName, n.amount, n.date?.toISOString().slice(0,10), n.teacherName));
console.log('unmatched NEW count:', unmatched.length, 'sum:', unmatched.reduce((s,n)=>s+n.amount,0));

console.log('\n=== OLD без пары в NEW (возможно отсутствуют в новой) ===');
const unmatchedOld = OLD.filter((_,i) => !usedOld.has(i));
unmatchedOld.forEach(o => console.log(o.join(' | ')));
console.log('unmatched OLD count:', unmatchedOld.length, 'sum:', unmatchedOld.reduce((s,o)=>s+o[2],0));

console.log('\n=== CORRECTION_PLAN_JSON ===');
console.log(JSON.stringify(mismatches, null, 0));

process.exit(0);
