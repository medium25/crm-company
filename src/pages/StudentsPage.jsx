import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, getDocs, query, where, orderBy, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { differenceInCalendarDays, format, startOfMonth, subDays } from 'date-fns';
import { Plus, CircleUserRound, MessageSquare, Download, ArrowLeft, ChevronRight, Wallet, CalendarCheck, UserX, Snowflake, GraduationCap, ShieldCheck, Pencil } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useDoc } from '../hooks/useDoc.js';
import { useToast } from '../components/ui/Toast.jsx';
import { churnPeriodRange } from '../lib/stats.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { FilterBar } from '../components/layout/FilterBar.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Skeleton, SkeletonRow } from '../components/ui/Skeleton.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { EditFreezeStartModal } from '../components/students/EditFreezeStartModal.jsx';
import { EditFreezeEndModal } from '../components/students/EditFreezeEndModal.jsx';
import { UnfreezeEnrollmentModal } from '../components/students/UnfreezeEnrollmentModal.jsx';
import { SmsSendModal } from '../components/shared/SmsSendModal.jsx';
import { AttendanceByTeacher } from '../components/students/AttendanceByTeacher.jsx';
import { DebtorsByTeacher } from '../components/students/DebtorsByTeacher.jsx';
import { NoChargeHistoryList } from '../components/students/NoChargeHistoryList.jsx';
import { AllStudentsSummary } from '../components/students/AllStudentsSummary.jsx';
import { formatPhone, formatMoney, formatDate, formatDuration, formatAvgMonths, formatDaysLeft, pluralize } from '../lib/format.js';
import { toCsv, downloadCsv } from '../lib/csv.js';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Статус: все' },
  { value: 'active', label: 'Активные' },
  { value: 'trial', label: 'Пробный' },
  { value: 'paused', label: 'Заморожены' },
  { value: 'left', label: 'Ушли' },
  { value: 'archived', label: 'Архив' },
];

const SECTION_TABS = [
  { key: 'all', label: 'Все ученики', icon: CircleUserRound },
  { key: 'debtors', label: 'Должники', icon: Wallet },
  { key: 'attendance', label: 'Посещаемость', icon: CalendarCheck },
  { key: 'paused', label: 'Замороженные', icon: Snowflake },
  { key: 'trial', label: 'На пробном уроке', icon: GraduationCap },
  { key: 'left', label: 'Покинувшие', icon: UserX },
  { key: 'noChargeHistory', label: 'Проверка', icon: ShieldCheck },
];

const PAGE_SIZE = 25;

export function StudentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalStudent, setModalStudent] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [smsOpen, setSmsOpen] = useState(false);
  const [editFreezeTarget, setEditFreezeTarget] = useState(null);
  const [editFreezeEndTarget, setEditFreezeEndTarget] = useState(null);
  const [unfreezeTarget, setUnfreezeTarget] = useState(null);

  const section = searchParams.get('section') || null;
  const search = searchParams.get('q') || '';
  const status = searchParams.get('status') || 'all';
  const onlyDebtors = searchParams.get('debtors') === '1';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const leftView = searchParams.get('leftView') || 'month';

  // «Покинувшие»/«Замороженные»/«На пробном» — отдельные секции с
  // фиксированным фильтром статуса; общий фильтр «Статус» из «Все ученики»
  // на них не влияет. «Должники» — свой drill-down компонент, здесь не
  // участвует.
  const effectiveStatus =
    section === 'left' ? 'left' :
    section === 'paused' ? 'paused' :
    section === 'trial' ? 'trial' :
    status;
  const effectiveOnlyDebtors = onlyDebtors;

  const setFilter = (patch) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setSearchParams(next);
  };
  const setSection = (key, allView) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', key);
    next.delete('page');
    if (allView) next.set('allView', allView);
    else next.delete('allView');
    setSearchParams(next);
  };
  const goToLanding = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('section');
    next.delete('page');
    next.delete('allView');
    setSearchParams(next);
  };
  const setPage = (n) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(n));
    setSearchParams(next);
  };
  const resetFilters = () => setSearchParams(new URLSearchParams());

  const studentsQuery = useMemo(() => {
    if (!db || !activeBranchId || section === 'left') return null;
    const clauses = [where('branchId', '==', activeBranchId), where('isArchived', '==', effectiveStatus === 'archived')];
    if (effectiveStatus !== 'all' && effectiveStatus !== 'archived') clauses.push(where('status', '==', effectiveStatus));
    return query(collection(db, 'students'), ...clauses, orderBy('fullName'));
  }, [activeBranchId, effectiveStatus, section]);
  const showTable = section === 'all' || section === 'left' || section === 'paused' || section === 'trial';
  const { data: statusStudents, loading: statusLoading, error } = useCollection(section === 'left' ? null : (showTable ? studentsQuery : null));

  const enrollmentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: enrollments } = useCollection(enrollmentsQuery);

  // «Покинувшие» — та же метрика, что карточка дашборда «Ушли из активной
  // группы»: уникальные студенты с enrollment.status=='left' в текущем
  // churnPeriod, а НЕ students.status=='left' (студент мог уйти из одной
  // группы и тут же стать trial/active в другой — карточка его всё равно
  // считает, а students.status уже не 'left').
  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: settings } = useDoc(settingsRef);
  const churnPeriod = settings?.churnPeriod ?? 'year';

  const leftEnrollmentsQuery = useMemo(
    () => (db && activeBranchId && section === 'left' ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('status', '==', 'left')) : null),
    [activeBranchId, section],
  );
  const { data: leftEnrollments, loading: leftEnrollmentsLoading } = useCollection(leftEnrollmentsQuery);

  const allStudentsQuery = useMemo(
    () => (db && activeBranchId && section === 'left' ? query(collection(db, 'students'), where('branchId', '==', activeBranchId)) : null),
    [activeBranchId, section],
  );
  const { data: allStudents, loading: allStudentsLoading } = useCollection(allStudentsQuery);

  const leftEnrollmentByStudent = useMemo(() => {
    if (section !== 'left') return new Map();
    const { start, end } = churnPeriodRange(churnPeriod);
    const map = new Map();
    for (const e of leftEnrollments) {
      if (!e.activatedAt || !e.leftAt) continue;
      const leftAt = e.leftAt.toDate();
      if (leftAt < start || leftAt > end) continue;
      const current = map.get(e.studentId);
      if (!current || leftAt > current.leftAt.toDate()) map.set(e.studentId, e);
    }
    return map;
  }, [section, leftEnrollments, churnPeriod]);

  // «Покинувшие» — 3 отдела: ушли в этом месяце (по дате ухода из
  // конкретной группы), и по желанию вернуться (returnIntent с
  // LeaveGroupModal — старые записи до этого поля ни туда, ни туда не
  // попадают, только в «в этом месяце», если подходят по дате).
  const leftAllStudents = useMemo(() => {
    if (section !== 'left') return [];
    return allStudents
      .filter((s) => leftEnrollmentByStudent.has(s.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [section, allStudents, leftEnrollmentByStudent]);

  const leftViewCounts = useMemo(() => {
    if (section !== 'left') return { month: 0, return: 0, no_return: 0 };
    const monthStart = startOfMonth(new Date());
    let month = 0;
    let ret = 0;
    let noRet = 0;
    for (const s of leftAllStudents) {
      const enr = leftEnrollmentByStudent.get(s.id);
      if (enr.leftAt.toDate() >= monthStart) month += 1;
      if (enr.returnIntent === 'return') ret += 1;
      else if (enr.returnIntent === 'no_return') noRet += 1;
    }
    return { month, return: ret, no_return: noRet };
  }, [section, leftAllStudents, leftEnrollmentByStudent]);

  const leftStudents = useMemo(() => {
    if (section !== 'left') return [];
    const monthStart = startOfMonth(new Date());
    return leftAllStudents.filter((s) => {
      const enr = leftEnrollmentByStudent.get(s.id);
      if (leftView === 'month') return enr.leftAt.toDate() >= monthStart;
      return enr.returnIntent === leftView;
    });
  }, [section, leftAllStudents, leftEnrollmentByStudent, leftView]);

  const rawStudents = section === 'left' ? leftStudents : statusStudents;
  const loading = section === 'left' ? leftEnrollmentsLoading || allStudentsLoading : statusLoading;

  // Плитки лендинга «Студенты» — свой запрос без фильтров таблицы (`status`/`q`
  // могут остаться в URL после захода в «Все ученики» и обратно), иначе счётчики
  // считались бы по случайно застрявшему фильтру.
  const summaryStudentsQuery = useMemo(
    () => (db && activeBranchId && !section ? query(collection(db, 'students'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId, section],
  );
  const { data: summaryStudents, loading: summaryLoading } = useCollection(summaryStudentsQuery);

  const summaryCounts = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    const counts = { all: 0, debtors: 0, trial: 0, paused: 0, leftThisMonth: 0 };
    for (const s of summaryStudents) {
      if (s.status !== 'paused') counts.all += 1;
      if (s.status !== 'left' && s.balance < 0) counts.debtors += 1;
      if (s.status === 'trial') counts.trial += 1;
      if (s.status === 'paused') counts.paused += 1;
      if (s.status === 'left' && s.leftAt && s.leftAt.toDate() >= monthStart) counts.leftThisMonth += 1;
    }
    return counts;
  }, [summaryStudents]);

  // «Посещаемость» на плитке — % учеников, посетивших вчерашний день (не
  // средний за месяц): вчерашние уроки филиала → их отметки посещаемости.
  const [attendancePct, setAttendancePct] = useState(null);
  useEffect(() => {
    if (section || !db || !activeBranchId) return;
    const yesterdayKey = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    let cancelled = false;
    (async () => {
      const lessonsSnap = await getDocs(
        query(collection(db, 'lessons'), where('branchId', '==', activeBranchId), where('dateKey', '==', yesterdayKey)),
      );
      if (cancelled) return;
      if (lessonsSnap.empty) {
        setAttendancePct(null);
        return;
      }
      const attendanceSnaps = await Promise.all(
        lessonsSnap.docs.map((l) => getDocs(collection(db, 'lessons', l.id, 'attendance'))),
      );
      if (cancelled) return;
      let present = 0;
      let total = 0;
      for (const snap of attendanceSnaps) {
        for (const d of snap.docs) {
          total += 1;
          if (d.data().status === 'present') present += 1;
        }
      }
      setAttendancePct(total > 0 ? Math.round((present / total) * 100) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [section, activeBranchId]);

  const enrollmentsByStudent = useMemo(() => {
    const map = new Map();
    // "Убрать из группы"/"Вывести" ставит status: 'left'/'archived', но не
    // isArchived — запись остаётся в выборке (isArchived==false), поэтому
    // в бейджах групп и колонке «Учителя» нужно ещё раз отсеять её отдельно,
    // иначе студент выглядит числящимся в группе, из которой его убрали.
    for (const e of enrollments) {
      if (e.status === 'left' || e.status === 'archived') continue;
      if (!map.has(e.studentId)) map.set(e.studentId, []);
      map.get(e.studentId).push(e);
    }
    return map;
  }, [enrollments]);

  // «Все ученики» не считает замороженных — студент возвращается в счёт
  // только когда его разморозят (status обратно 'active'/'trial').
  // recomputeStudentAggregates ставит status='paused' лишь когда ВСЕ записи
  // студента на паузе, так что общий счётчик ниже использует это же поле.
  const nonPausedStudents = useMemo(() => rawStudents.filter((st) => st.status !== 'paused'), [rawStudents]);

  // Разбивка «Все ученики» по учителям — сколько РАЗНЫХ студентов у каждого
  // (студент с 2 группами у одного учителя считается один раз; с группами
  // у 2 разных учителей — попадает в оба). Замороженные записи (status ===
  // 'paused') пропускаются — если у студента есть ещё активная запись у
  // другого учителя, он всё равно считается за тем учителем. Не зависит от
  // поиска/статус-фильтра списка — это ориентир на входе в раздел.
  const teacherBreakdown = useMemo(() => {
    const map = new Map();
    for (const [studentId, list] of enrollmentsByStudent) {
      for (const e of list) {
        if (e.status === 'paused') continue;
        if (!map.has(e.teacherId)) map.set(e.teacherId, { teacherId: e.teacherId, teacherName: e.teacherName, studentIds: new Set() });
        map.get(e.teacherId).studentIds.add(studentId);
      }
    }
    return [...map.values()]
      .map((t) => ({ teacherId: t.teacherId, teacherName: t.teacherName, count: t.studentIds.size }))
      .sort((a, b) => b.count - a.count);
  }, [enrollmentsByStudent]);

  // Замороженная запись на студента, показанная в разделе «Замороженные» —
  // если их несколько сразу, берём с самой ранней pausedTo (самая срочная);
  // пока ни у одной нет pausedTo, берём первую попавшуюся, чтобы дата начала
  // заморозки всё равно была видна.
  const pausedEnrollmentByStudent = useMemo(() => {
    const map = new Map();
    for (const e of enrollments) {
      if (e.status !== 'paused') continue;
      const current = map.get(e.studentId);
      if (!current || (e.pausedTo && (!current.pausedTo || e.pausedTo.toMillis() < current.pausedTo.toMillis()))) {
        map.set(e.studentId, e);
      }
    }
    return map;
  }, [enrollments]);

  // Синие — заморожен, срок ещё не горит (или дедлайн не указан — старые
  // записи, до того как поле стало обязательным); жёлтые — 3 дня или
  // меньше до дедлайна; красные — дедлайн сегодня или уже прошёл.
  const pausedRowClass = (st) => {
    const deadline = pausedEnrollmentByStudent.get(st.id)?.pausedTo;
    if (!deadline) return 'bg-freeze-blue hover:bg-freeze-blue/70';
    const daysLeft = differenceInCalendarDays(deadline.toDate(), new Date());
    if (daysLeft <= 0) return 'bg-freeze-red hover:bg-freeze-red/70';
    if (daysLeft <= 3) return 'bg-freeze-yellow hover:bg-freeze-yellow/70';
    return 'bg-freeze-blue hover:bg-freeze-blue/70';
  };

  const filtered = useMemo(() => {
    let list = rawStudents;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((st) => st.fullName.toLowerCase().includes(s) || st.phone.includes(s));
    }
    if (effectiveOnlyDebtors) list = list.filter((st) => st.balance < 0);
    return list;
  }, [rawStudents, search, effectiveOnlyDebtors]);

  // «На пробном уроке» — не таблица, а список по учителям (обычно 1-2
  // пробных на учителя, пагинация тут не нужна).
  const trialByTeacher = useMemo(() => {
    if (section !== 'trial') return [];
    const map = new Map();
    for (const st of filtered) {
      const teacherNames = [...new Set((enrollmentsByStudent.get(st.id) ?? []).map((e) => e.teacherName))];
      const key = teacherNames[0] || 'Без учителя';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(st);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [section, filtered, enrollmentsByStudent]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkArchive = async () => {
    if (selected.size === 0) return;
    try {
      const batch = writeBatch(db);
      const groupsToDecrement = new Set();
      for (const id of selected) {
        batch.update(doc(db, 'students', id), {
          isArchived: true,
          archivedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        // Архивация студента должна убирать его из ростеров групп — иначе
        // группа продолжает показывать давно архивного студента.
        for (const e of enrollments) {
          if (e.studentId !== id) continue;
          batch.update(doc(db, 'enrollments', e.id), {
            status: 'archived',
            isArchived: true,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
          if (e.status === 'active' || e.status === 'trial' || e.status === 'paused') {
            groupsToDecrement.add(e.groupId);
          }
        }
      }
      for (const groupId of groupsToDecrement) {
        batch.update(doc(db, 'groups', groupId), { studentsCount: increment(-1) });
      }
      await batch.commit();
      showToast(`В архив: ${selected.size}.`);
      setSelected(new Set());
    } catch {
      showToast('Не удалось перенести в архив.', { type: 'error' });
    }
  };

  const selectedStudents = filtered.filter((st) => selected.has(st.id));

  const exportSelected = () => {
    const columns = [
      { key: 'fullName', label: 'Имя', value: (st) => st.fullName },
      { key: 'phone', label: 'Телефон', value: (st) => formatPhone(st.phone) },
      { key: 'groups', label: 'Группы', value: (st) => (enrollmentsByStudent.get(st.id) ?? []).map((e) => e.groupCode).join('; ') },
      { key: 'balance', label: 'Баланс', value: (st) => st.balance },
      { key: 'status', label: 'Статус', value: (st) => st.status },
      { key: 'createdAt', label: 'Дата добавления', value: (st) => formatDate(st.createdAt) },
    ];
    downloadCsv('студенты.csv', toCsv(columns, selectedStudents.length > 0 ? selectedStudents : filtered));
  };

  const columns = [
    {
      key: '__select',
      label: '',
      width: '48px',
      render: (st) => (
        <input
          type="checkbox"
          checked={selected.has(st.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelected(st.id)}
        />
      ),
    },
    {
      key: 'fullName',
      label: 'Имя',
      width: 'minmax(220px, 1.5fr)',
      render: (st) => (
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-[13px] font-bold text-muted">
            {st.fullName[0]}
          </span>
          {st.fullName}
        </span>
      ),
    },
    {
      key: 'phone',
      label: 'Телефон',
      render: (st) => (
        <a href={`tel:+${st.phone}`} onClick={(e) => e.stopPropagation()} className="text-link">
          {formatPhone(st.phone)}
        </a>
      ),
    },
    {
      key: 'groups',
      label: section === 'left' ? 'Ушли из группы' : 'Группы',
      render: (st) => {
        if (section === 'left') {
          const enr = leftEnrollmentByStudent.get(st.id);
          return enr ? <Badge variant="group-code">{enr.groupCode}</Badge> : '—';
        }
        return (
          <span className="flex flex-wrap gap-1">
            {(enrollmentsByStudent.get(st.id) ?? []).map((e) => (
              <Badge key={e.id} variant="group-code">
                {e.groupCode}
              </Badge>
            ))}
          </span>
        );
      },
    },
    {
      key: 'teachers',
      label: 'Учителя',
      render: (st) =>
        section === 'left'
          ? leftEnrollmentByStudent.get(st.id)?.teacherName || '—'
          : [...new Set((enrollmentsByStudent.get(st.id) ?? []).map((e) => e.teacherName))].join(', ') || '—',
    },
    {
      key: 'createdAt',
      label: 'Дата добавления',
      render: (st) => formatDate(st.createdAt),
    },
    ...(section === 'all' || section === 'left'
      ? [
          {
            key: 'duration',
            label: 'Обучается',
            render: (st) => formatDuration(st.createdAt, section === 'left' ? leftEnrollmentByStudent.get(st.id)?.leftAt : null),
          },
        ]
      : []),
    {
      key: 'balance',
      label: 'Баланс',
      render: (st) => <span className={st.balance > 0 ? 'text-success' : 'text-danger'}>{formatMoney(st.balance)}</span>,
    },
  ];
  const trialColumns = columns.filter((c) => c.key !== 'teachers');

  // «Замороженные» — своя урезанная раскладка: группы и учителя в одной
  // колонке, вместо дат добавления/срока обучения — обратный отсчёт до
  // конца заморозки (дублирует цвет карточки текстом).
  const pausedColumns = [
    columns[0],
    columns[1],
    columns[2],
    {
      key: 'groupsTeachers',
      label: 'Группы и учителя',
      render: (st) => {
        const list = enrollmentsByStudent.get(st.id) ?? [];
        return list.length === 0 ? (
          '—'
        ) : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {list.map((e) => (
              <span key={e.id} className="flex items-center gap-1">
                <Badge variant="group-code">{e.groupCode}</Badge>
                <span className="text-muted">{e.teacherName}</span>
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: 'pausedFrom',
      label: 'Начало заморозки',
      render: (st) => {
        const enr = pausedEnrollmentByStudent.get(st.id);
        return (
          <span className="flex items-center gap-2">
            {enr?.pausedFrom ? formatDate(enr.pausedFrom) : '—'}
            {enr && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditFreezeTarget(enr);
                }}
                aria-label="Изменить дату начала заморозки"
                className="text-muted hover:text-navy"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        );
      },
    },
    {
      key: 'pausedTo',
      label: 'Конец заморозки',
      render: (st) => {
        const enr = pausedEnrollmentByStudent.get(st.id);
        return (
          <span className="flex items-center gap-2">
            {enr?.pausedTo ? formatDate(enr.pausedTo) : '—'}
            {enr && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditFreezeEndTarget(enr);
                }}
                aria-label="Изменить дату окончания заморозки"
                className="text-muted hover:text-navy"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        );
      },
    },
    {
      key: 'daysLeft',
      label: 'Осталось',
      render: (st) => formatDaysLeft(pausedEnrollmentByStudent.get(st.id)?.pausedTo),
    },
    columns[columns.length - 1],
    {
      key: '__actions',
      label: '',
      width: '140px',
      render: (st) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Button
            variant="secondary"
            className="h-8 px-3 text-[13px]"
            onClick={() => setUnfreezeTarget(pausedEnrollmentByStudent.get(st.id))}
          >
            Активировать
          </Button>
        </span>
      ),
    },
  ];

  if (!section) {
    const sectionMetric = summaryLoading
      ? {}
      : {
          all: `${summaryCounts.all} ${pluralize(summaryCounts.all, ['ученик', 'ученика', 'учеников'])}`,
          debtors: `${summaryCounts.debtors} ${pluralize(summaryCounts.debtors, ['должник', 'должника', 'должников'])}`,
          attendance: attendancePct === null ? '—' : `${attendancePct}%`,
          paused: `${summaryCounts.paused} ${pluralize(summaryCounts.paused, ['студент', 'студента', 'студентов'])}`,
          trial: `${summaryCounts.trial} ${pluralize(summaryCounts.trial, ['студент', 'студента', 'студентов'])}`,
          left: `${summaryCounts.leftThisMonth} ${pluralize(summaryCounts.leftThisMonth, ['студент', 'студента', 'студентов'])}`,
        };

    return (
      <>
        <PageHeader
          title="Студенты"
          actions={
            <Button onClick={() => setModalStudent({})}>
              <Plus className="h-4 w-4" /> Добавить ученика
            </Button>
          }
        />
        <div className="flex flex-col gap-3">
          {SECTION_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <Card
                key={t.key}
                hoverable
                className="flex cursor-pointer items-center gap-4 p-5"
                onClick={() => setSection(t.key, t.key === 'all' ? 'list' : undefined)}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <span className="flex-1 text-[17px] font-bold text-text">{t.label}</span>
                {sectionMetric[t.key] && <span className="text-[15px] text-muted">{sectionMetric[t.key]}</span>}
                <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
              </Card>
            );
          })}
        </div>

        <StudentFormModal student={modalStudent} onClose={() => setModalStudent(null)} onCreated={(id) => navigate(`/students/${id}`)} />
      </>
    );
  }

  const hideHeaderExtras = section === 'attendance' || section === 'debtors' || section === 'noChargeHistory';

  return (
    <>
      <PageHeader
        title={SECTION_TABS.find((t) => t.key === section)?.label ?? 'Студенты'}
        count={hideHeaderExtras ? undefined : filtered.length}
        actions={
          hideHeaderExtras ? null : (
            <>
              {selected.size > 0 && (
                <>
                  <Button variant="secondary" onClick={() => setSmsOpen(true)}>
                    <MessageSquare className="h-4 w-4" /> SMS ({selected.size})
                  </Button>
                  <Button variant="danger" onClick={bulkArchive}>
                    В архив ({selected.size})
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={exportSelected} disabled={filtered.length === 0}>
                <Download className="h-4 w-4" /> Экспорт{selected.size > 0 ? ` (${selected.size})` : ''}
              </Button>
              <Button onClick={() => setModalStudent({})}>
                <Plus className="h-4 w-4" /> Добавить
              </Button>
            </>
          )
        }
      />

      <button type="button" onClick={goToLanding} className="mb-6 flex items-center gap-1 text-[15px] text-link">
        <ArrowLeft className="h-4 w-4" /> Все разделы
      </button>

      {section === 'attendance' ? (
        <AttendanceByTeacher />
      ) : section === 'debtors' ? (
        <DebtorsByTeacher />
      ) : section === 'noChargeHistory' ? (
        <NoChargeHistoryList />
      ) : (
        <>
          {section === 'all' && !loading && rawStudents.length > 0 && (
            <AllStudentsSummary total={nonPausedStudents.length} breakdown={teacherBreakdown} />
          )}

          {section === 'left' && (
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                { key: 'month', label: 'В этом месяце', count: leftViewCounts.month },
                { key: 'return', label: 'С желанием вернуться', count: leftViewCounts.return },
                { key: 'no_return', label: 'Без желания вернуться', count: leftViewCounts.no_return },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFilter({ leftView: t.key })}
                  className={`rounded-full px-4 py-2 text-[14px] font-bold ${
                    leftView === t.key ? 'bg-navy text-white' : 'bg-surface-alt text-muted hover:text-text'
                  }`}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>
          )}

          <FilterBar onReset={resetFilters}>
            <Input placeholder="Поиск по имени или телефону" value={search} onChange={(e) => setFilter({ q: e.target.value })} className="w-64" />
            {section === 'all' && (
              <>
                <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setFilter({ status: e.target.value })} className="w-44" />
                <label className="flex h-11 items-center gap-2 rounded-field border border-border-strong px-3 text-[15px] text-text">
                  <input type="checkbox" checked={onlyDebtors} onChange={(e) => setFilter({ debtors: e.target.checked ? '1' : '' })} />
                  Только должники
                </label>
              </>
            )}
          </FilterBar>

          {section === 'all' && !loading && filtered.length > 0 && (
            <p className="mb-3 text-[13px] text-muted">
              Средний срок обучения: <span className="font-bold text-text">{formatAvgMonths(filtered)}</span>
            </p>
          )}

          {loading && (
            <div className="flex flex-col gap-2">
              <SkeletonRow columns={6} />
              <SkeletonRow columns={6} />
              <SkeletonRow columns={6} />
            </div>
          )}

          {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

          {!loading && !error && filtered.length === 0 && (
            <EmptyState
              icon={section === 'paused' ? Snowflake : section === 'trial' ? GraduationCap : CircleUserRound}
              title={
                section === 'left' ? 'Никто не уходил' :
                section === 'paused' ? 'Замороженных нет' :
                section === 'trial' ? 'Никого нет на пробном' :
                'Пока нет ни одного студента'
              }
              actionLabel={section === 'all' ? 'Добавить' : undefined}
              onAction={section === 'all' ? () => setModalStudent({}) : undefined}
            />
          )}

          {!loading && !error && filtered.length > 0 && section === 'trial' && (
            <div className="flex flex-col gap-6">
              {trialByTeacher.map(([teacherName, students]) => (
                <Card key={teacherName}>
                  <h3 className="mb-4 text-[15px] font-bold text-text">{teacherName}</h3>
                  <Table columns={trialColumns} rows={students} onRowClick={(st) => navigate(`/students/${st.id}`)} />
                </Card>
              ))}
            </div>
          )}

          {!loading && !error && filtered.length > 0 && section !== 'trial' && (
            <>
              <Table
                columns={section === 'paused' ? pausedColumns : columns}
                rows={pageRows}
                onRowClick={(st) => navigate(`/students/${st.id}`)}
                rowClassName={section === 'paused' ? pausedRowClass : undefined}
              />
              {totalPages > 1 && (
                <div className="mt-4 flex justify-center gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className={`h-9 w-9 rounded-full text-[15px] ${n === pageClamped ? 'bg-navy text-white' : 'text-text hover:bg-surface-alt'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <StudentFormModal student={modalStudent} onClose={() => setModalStudent(null)} onCreated={(id) => navigate(`/students/${id}`)} />

      <EditFreezeStartModal enrollment={editFreezeTarget} onClose={() => setEditFreezeTarget(null)} />

      <EditFreezeEndModal enrollment={editFreezeEndTarget} onClose={() => setEditFreezeEndTarget(null)} />
      <UnfreezeEnrollmentModal enrollment={unfreezeTarget} onClose={() => setUnfreezeTarget(null)} />



      <SmsSendModal
        open={smsOpen}
        onClose={() => setSmsOpen(false)}
        recipients={selectedStudents.map((st) => ({ studentId: st.id, studentName: st.fullName }))}
        branchId={activeBranchId}
      />
    </>
  );
}
