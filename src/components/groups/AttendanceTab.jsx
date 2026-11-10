import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  documentId,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { format, addMonths, subMonths, startOfMonth, startOfDay, differenceInMonths, differenceInCalendarDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Eye, EyeOff, Users } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useRole } from '../../hooks/useRole.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { AttendanceCell } from '../ui/AttendanceCell.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { RosterStudentCell, RosterPhone, RosterMenuCell, SORT_OPTIONS } from './RosterCells.jsx';
import { formatMoney } from '../../lib/format.js';
import { generateLessonsForMonth, scheduleDatesInRange } from '../../lib/schedule.js';

/** «2 мес. 5 дн.» — сколько прошло с даты `from` до сегодня; меньше месяца — только дни. */
function formatTenure(from) {
  if (!from) return '—';
  const now = new Date();
  const months = Math.max(0, differenceInMonths(now, from));
  const days = Math.max(0, differenceInCalendarDays(now, addMonths(from, months)));
  return [months > 0 ? `${months} мес.` : '', `${days} дн.`].filter(Boolean).join(' ');
}

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * activatedAt приходит только у активных записей — у пробных берём addedAt.
 * startOfDay: сверяем по КАЛЕНДАРНОМУ дню, не по точному времени. Пробного
 * часто заводят в CRM в день урока, но ПОСЛЕ занятия (или урок записан на
 * начало дня) — без округления до дня ячейка того же дня пропадала, хотя
 * студент реально был на пробном (за который берём плату).
 */
const eligibleFrom = (enrollment) => startOfDay((enrollment.activatedAt ?? enrollment.addedAt).toDate());

/**
 * Симметрично eligibleFrom, но с конца: у status=='left' запись остаётся в
 * enrollments (isArchived не трогается) — без этой отсечки уроки ПОСЛЕ
 * ухода студента оставались кликабельными, и его можно было по ошибке
 * отметить в группе, которую он уже покинул (studentIsArchived==false и
 * status=='left' одновременно с активным enrollment в новой группе —
 * штатная ситуация при переводе, не баг данных).
 */
const eligibleUntil = (enrollment) =>
  enrollment.status === 'left' && enrollment.leftAt ? startOfDay(enrollment.leftAt.toDate()) : null;

const MAX_TRANSFER_SOURCES = 3;

/** Уроки конкретной группы за месяц — тот же запрос, что у основной сетки, просто параметризован groupId (индекс уже есть, новый не нужен). */
function useGroupMonthLessons(groupId, monthStr) {
  const q = useMemo(
    () => (db && groupId ? query(collection(db, 'lessons'), where('groupId', '==', groupId), where('month', '==', monthStr)) : null),
    [groupId, monthStr],
  );
  const { data } = useCollection(q);
  return data;
}

/** Посещаемость конкретной группы за месяц — та же форма запроса, что у основной сетки. */
function useGroupMonthAttendance(groupId, monthStr) {
  const q = useMemo(
    () =>
      db && groupId ? query(collectionGroup(db, 'attendance'), where('groupId', '==', groupId), where('month', '==', monthStr)) : null,
    [groupId, monthStr],
  );
  const [docs, setDocs] = useState([]);
  useEffect(() => {
    if (!q) {
      setDocs([]);
      return undefined;
    }
    return onSnapshot(q, (snap) => {
      setDocs(snap.docs.map((d) => ({ studentId: d.id, lessonId: d.ref.parent.parent.id, ...d.data() })));
    });
  }, [q]);
  return docs;
}

/**
 * Вкладка «Посещаемость» карточки группы — 03 · Бизнес-логика §4.
 *
 * Перевод в другую группу (TransferGroupModal, или прямой перенос групп
 * скриптом — см. scripts/merge-groups-into-duplicates.mjs) переносит
 * enrollment, но не трогает уже отмеченные lessons/attendance в СТАРОЙ
 * группе — они остаются её собственными документами навсегда (та же
 * коллекция, тот же groupId). Чтобы история не терялась и не дублировалась:
 * СТАРАЯ группа для такого студента строку в сетке больше не показывает
 * вовсе (см. visibleEnrollments — status=='left' && returnIntent=='transfer'
 * исключены безусловно), а НОВАЯ группа подмешивает его прошлые уроки/
 * отметки (по enrollment.transferredFromGroupId + transferredAt) в свою же
 * сетку как дополнительные дни — серым цветом (AttendanceCell muted),
 * некликабельные (чужой lessonId, редактировать их отсюда нельзя).
 * @param {Object} props
 * @param {Object} props.group документ группы (Timestamp-поля как из Firestore)
 * @param {{onFreeze: Function, onLeave: Function, onActivate: Function, onTransfer: Function}} props.rosterActions действия меню «⋮» студента
 * @param {string} props.sort 'name' | 'balance' | 'addedAt'
 * @param {(v: string) => void} props.onSortChange
 * @param {boolean} props.showArchived показывать вышедших/архивных студентов
 * @param {() => void} props.onToggleArchived
 * @param {() => void} props.onExport выгрузка состава в CSV
 * @param {boolean} [props.exportDisabled]
 *
 * Состав группы и посещаемость — одна таблица: слева номер, баланс, имя, телефон; справа даты занятий; в конце
 * итог по месяцу и меню «⋮».
 */
export function AttendanceTab({ group, rosterActions, sort, onSortChange, showArchived, onToggleArchived, onExport, exportDisabled = false }) {
  const { user, staff } = useAuth();
  const { isAdmin, isTeacher } = useRole();
  const { showToast } = useToast();

  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const monthStr = format(monthDate, 'yyyy-MM');
  const [hideAbsent, setHideAbsent] = useState(false);
  const [overrides, setOverrides] = useState(new Map());
  const attemptedMonths = useRef(new Set());

  const lessonsQuery = useMemo(
    () =>
      db
        ? query(collection(db, 'lessons'), where('groupId', '==', group.id), where('month', '==', monthStr), orderBy('dateKey'))
        : null,
    [group.id, monthStr],
  );
  const { data: lessons, loading: lessonsLoading } = useCollection(lessonsQuery);

  const enrollmentsQuery = useMemo(
    () =>
      db
        ? query(collection(db, 'enrollments'), where('groupId', '==', group.id), ...(showArchived ? [] : [where('isArchived', '==', false)]))
        : null,
    [group.id, showArchived],
  );
  const { data: rawEnrollments, loading: enrollmentsLoading } = useCollection(enrollmentsQuery);

  // Студент мог быть архивирован напрямую с его карточки — тогда его
  // enrollment иногда остаётся неархивированным (см. тот же комментарий в
  // GroupDetailPage.sortedEnrollments). Без этой подстраховки такой студент
  // пропадал из состава группы, но оставался в сетке посещаемости.
  const studentIds = useMemo(() => rawEnrollments.map((e) => e.studentId).slice(0, 30), [rawEnrollments]);
  const studentsQuery = useMemo(
    () => (db && studentIds.length > 0 ? query(collection(db, 'students'), where(documentId(), 'in', studentIds)) : null),
    [studentIds],
  );
  const { data: rosterStudents } = useCollection(studentsQuery);
  const studentsById = useMemo(() => new Map(rosterStudents.map((s) => [s.id, s])), [rosterStudents]);
  // enrollments.studentName — копия имени на момент записи в группу; показываем актуальное из карточки студента.
  const enrollments = useMemo(
    () => rawEnrollments.map((e) => ({ ...e, studentName: studentsById.get(e.studentId)?.fullName ?? e.studentName })),
    [rawEnrollments, studentsById],
  );

  // Группы, ОТКУДА кто-то из текущего состава был переведён — их прошлые
  // уроки/отметки подмешиваем в сетку этой группы (см. doc-комментарий
  // выше). Фиксированное число «слотов» (MAX_TRANSFER_SOURCES) вместо
  // динамического числа хуков — иначе нарушались бы Rules of Hooks.
  const transferSourceGroupIds = useMemo(() => {
    const ids = new Set();
    for (const en of enrollments) {
      if (en.status === 'left') continue;
      if (studentsById.get(en.studentId)?.isArchived) continue;
      if (en.transferredFromGroupId && en.transferredAt) ids.add(en.transferredFromGroupId);
    }
    return [...ids];
  }, [enrollments, studentsById]);

  const oldGroupId0 = transferSourceGroupIds[0] ?? null;
  const oldGroupId1 = transferSourceGroupIds[1] ?? null;
  const oldGroupId2 = transferSourceGroupIds[2] ?? null;
  const oldLessons0 = useGroupMonthLessons(oldGroupId0, monthStr);
  const oldLessons1 = useGroupMonthLessons(oldGroupId1, monthStr);
  const oldLessons2 = useGroupMonthLessons(oldGroupId2, monthStr);
  const oldAttendance0 = useGroupMonthAttendance(oldGroupId0, monthStr);
  const oldAttendance1 = useGroupMonthAttendance(oldGroupId1, monthStr);
  const oldAttendance2 = useGroupMonthAttendance(oldGroupId2, monthStr);
  const oldLessons = useMemo(() => [...oldLessons0, ...oldLessons1, ...oldLessons2], [oldLessons0, oldLessons1, oldLessons2]);
  const oldAttendanceDocs = useMemo(
    () => [...oldAttendance0, ...oldAttendance1, ...oldAttendance2],
    [oldAttendance0, oldAttendance1, oldAttendance2],
  );
  const oldAttendanceMap = useMemo(() => {
    const map = new Map();
    for (const a of oldAttendanceDocs) map.set(`${a.lessonId}_${a.studentId}`, a.status);
    return map;
  }, [oldAttendanceDocs]);

  const attendanceQuery = useMemo(
    () => (db ? query(collectionGroup(db, 'attendance'), where('groupId', '==', group.id), where('month', '==', monthStr)) : null),
    [group.id, monthStr],
  );
  const [attendanceDocs, setAttendanceDocs] = useState([]);
  useEffect(() => {
    if (!attendanceQuery) {
      setAttendanceDocs([]);
      return undefined;
    }
    return onSnapshot(attendanceQuery, (snap) => {
      setAttendanceDocs(
        snap.docs.map((d) => ({ studentId: d.id, lessonId: d.ref.parent.parent.id, ...d.data() })),
      );
    });
  }, [attendanceQuery]);

  useEffect(() => {
    setOverrides(new Map());
  }, [attendanceDocs]);

  // Уроки при создании группы пишутся скользящим окном на 3 месяца вперёд — дальше месяц оказывается
  // заполнен частично (напр. только 2 и 4 ноября). Поэтому не ждём пустого месяца, а сверяем с расписанием
  // и дописываем недостающие (идемпотентно, существующие уроки не трогаются). Раз на месяц за открытие вкладки.
  useEffect(() => {
    if (lessonsLoading || attemptedMonths.current.has(monthStr)) return;
    const [year, month] = monthStr.split('-').map(Number);
    const from = new Date(Math.max(group.startDate.toDate().getTime(), new Date(year, month - 1, 1).getTime()));
    const to = new Date(Math.min(group.endDate.toDate().getTime(), new Date(year, month, 0).getTime()));
    const existing = new Set(lessons.map((l) => l.dateKey));
    const missing = scheduleDatesInRange(group.schedule, from, to).some((d) => !existing.has(format(d, 'yyyy-MM-dd')));
    if (!missing) return;
    attemptedMonths.current.add(monthStr);
    generateLessonsForMonth(db, {
      ...group,
      startDate: group.startDate.toDate(),
      endDate: group.endDate.toDate(),
    }, monthStr).catch(() => showToast('Не удалось догенерировать уроки месяца.', { type: 'error' }));
  }, [lessonsLoading, lessons, monthStr, group, showToast]);

  const attendanceMap = useMemo(() => {
    const map = new Map();
    for (const a of attendanceDocs) map.set(`${a.lessonId}_${a.studentId}`, a.status);
    return map;
  }, [attendanceDocs]);

  const getStatus = (lessonId, studentId) => {
    const key = `${lessonId}_${studentId}`;
    return overrides.has(key) ? overrides.get(key) : (attendanceMap.get(key) ?? null);
  };

  const today = todayStart();
  const todayKey = format(today, 'yyyy-MM-dd');
  const isCurrentMonth = monthStr === format(today, 'yyyy-MM');
  const todayHeaderRef = useRef(null);

  // Дни сетки — не только уроки ЭТОЙ группы, но и уроки старых групп до
  // transferredAt для переведённых студентов (см. doc-комментарий выше).
  // Один календарный день — одна колонка, даже если у старой и новой групп
  // в этот день СВОИ отдельные lesson-документы (напр. совпадающее
  // расписание) — какой из них показать решает resolveCell ниже, по
  // конкретной строке/студенту, а не колонка целиком.
  const days = useMemo(() => {
    const map = new Map();
    for (const l of lessons) {
      map.set(l.dateKey, { dateKey: l.dateKey, date: startOfDay(l.date.toDate()), currentLesson: l, oldLessonsByGroup: new Map() });
    }
    // Дни, в которые у ЭТОЙ группы нет урока, колонкой не показываем — уроки старой группы
    // видны только в те дни, когда урок есть и у этой.
    for (const l of oldLessons) {
      const entry = map.get(l.dateKey);
      if (entry) entry.oldLessonsByGroup.set(l.groupId, l);
    }
    return [...map.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [lessons, oldLessons]);

  /**
   * Что показать в ячейке (day, enrollment) — до transferredAt смотрим
   * урок СТАРОЙ группы (муted, некликабельно), после — урок ЭТОЙ группы
   * (обычный, кликабельно). null — этот день у этого студента пуст (не
   * рендерим вовсе, как и раньше).
   */
  const resolveCell = (day, enrollment) => {
    const cutoff =
      enrollment.transferredAt && enrollment.transferredFromGroupId ? startOfDay(enrollment.transferredAt.toDate()) : null;
    if (cutoff && day.date < cutoff) {
      const oldLesson = day.oldLessonsByGroup.get(enrollment.transferredFromGroupId);
      if (!oldLesson) return null;
      const status = oldAttendanceMap.get(`${oldLesson.id}_${enrollment.studentId}`) ?? null;
      return { muted: true, status, lesson: oldLesson, clickable: false };
    }
    const lesson = day.currentLesson;
    if (!lesson) return null;
    const from = cutoff && cutoff > eligibleFrom(enrollment) ? cutoff : eligibleFrom(enrollment);
    const until = eligibleUntil(enrollment);
    if (day.date < from || (until && day.date > until)) return null;
    const status = getStatus(lesson.id, enrollment.studentId);
    return { muted: false, status, lesson, clickable: true };
  };

  // Учитель открывает вкладку отметить сегодняшний урок — сетка месяца
  // широкая, без автоскролла на телефоне пришлось бы сначала листать её
  // горизонтально, чтобы найти сегодняшнюю колонку.
  useEffect(() => {
    if (!isCurrentMonth) return;
    todayHeaderRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [days, isCurrentMonth]);

  const canMarkLesson = (lessonDate) => {
    if (isAdmin) return true;
    if (isTeacher && staff?.teacherId === group.teacherId) {
      // Учитель отмечает урок только в день урока или на следующий день —
      // дальше только через администрацию.
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      return lessonDate <= today && lessonDate >= yesterday;
    }
    return false;
  };

  const writeAttendance = async (lessonId, studentId, studentName, status) => {
    if (status === null) {
      await deleteDoc(doc(db, 'lessons', lessonId, 'attendance', studentId));
    } else {
      await setDoc(doc(db, 'lessons', lessonId, 'attendance', studentId), {
        studentName,
        status,
        comment: '',
        groupId: group.id,
        month: monthStr,
        markedBy: user.uid,
        markedAt: serverTimestamp(),
      });
      // Урок помечается «отмечен» по первому же клику — дашборд («Уроки
      // сегодня») и отчёты (фаза 7) читают именно это поле, а не сканируют
      // подколлекцию attendance целиком.
      await updateDoc(doc(db, 'lessons', lessonId), {
        status: 'held',
        markedBy: user.uid,
        markedAt: serverTimestamp(),
      });
    }
  };

  const handleCellClick = async (lesson, enrollment) => {
    const lessonDate = lesson.date.toDate();
    if (!canMarkLesson(lessonDate)) {
      showToast('Нет прав отмечать этот урок.', { type: 'error' });
      return;
    }
    const key = `${lesson.id}_${enrollment.studentId}`;
    const current = getStatus(lesson.id, enrollment.studentId);
    const next = current === null ? 'present' : current === 'present' ? 'absent' : null;
    setOverrides((prev) => new Map(prev).set(key, next));
    try {
      await writeAttendance(lesson.id, enrollment.studentId, enrollment.studentName, next);
    } catch {
      setOverrides((prev) => {
        const m = new Map(prev);
        m.delete(key);
        return m;
      });
      showToast('Не удалось сохранить отметку.', { type: 'error' });
    }
  };

  const handleHeaderClick = async (lesson, e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const lessonDate = lesson.date.toDate();
    if (!canMarkLesson(lessonDate)) {
      showToast('Нет прав отмечать этот урок.', { type: 'error' });
      return;
    }
    const lessonDay = startOfDay(lessonDate);
    const eligible = enrollments.filter((en) => {
      if (studentsById.get(en.studentId)?.isArchived) return false;
      if (en.status === 'paused') return false;
      if (en.status === 'left' && en.returnIntent === 'transfer') return false;
      const until = eligibleUntil(en);
      return lessonDay >= eligibleFrom(en) && !(until && lessonDay > until);
    });
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const en of eligible) next.set(`${lesson.id}_${en.studentId}`, 'present');
      return next;
    });
    try {
      await Promise.all(eligible.map((en) => writeAttendance(lesson.id, en.studentId, en.studentName, 'present')));
      showToast('Все отмечены присутствующими.');
    } catch {
      showToast('Не удалось отметить всех.', { type: 'error' });
    }
  };

  if (lessonsLoading || enrollmentsLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  // Строки — весь состав группы (как раньше в списке слева), а не только те, у кого есть дни в месяце: пробный или
  // замороженный студент без отметок тоже виден. Вышедшие и архивные — только по «Показать архивных студентов».
  const visibleEnrollments = enrollments
    .filter((en) => {
      if (studentsById.get(en.studentId)?.isArchived && !showArchived) return false;
      if (en.status === 'left' && !showArchived) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'balance') return (studentsById.get(a.studentId)?.balance ?? 0) - (studentsById.get(b.studentId)?.balance ?? 0);
      if (sort === 'addedAt') return (a.addedAt?.toMillis?.() ?? 0) - (b.addedAt?.toMillis?.() ?? 0);
      return a.studentName.localeCompare(b.studentName, 'ru');
    });

  // Кнопки под таблицей остаются всегда — и в пустом месяце, и при пустом составе (архивных ещё можно показать).
  const footer = (
    <div className="mt-3 flex items-center justify-between">
      <button type="button" onClick={onToggleArchived} className="text-small text-link">
        {showArchived ? 'Скрыть архивных студентов' : 'Показать архивных студентов'}
      </button>
      <Button variant="icon-round" tone="navy" onClick={onExport} aria-label="Экспорт в CSV" disabled={exportDisabled}>
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );

  if (visibleEnrollments.length === 0) {
    return (
      <div>
        <EmptyState icon={Users} title="Пока нет студентов в группе" />
        {footer}
      </div>
    );
  }

  const gridTemplate = `repeat(${days.length}, 56px)`;

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 sm:gap-2">
        <button type="button" onClick={() => setMonthDate(startOfMonth(new Date()))} className="shrink-0 rounded-full px-2 py-1.5 text-small text-link sm:px-3">
          Текущий
        </button>
        <button type="button" onClick={() => setMonthDate((d) => subMonths(d, 12))} aria-label="-12 мес" className="hidden shrink-0 text-muted hover:text-text sm:block">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setMonthDate((d) => subMonths(d, 1))} aria-label="-1 мес" className="shrink-0 text-muted hover:text-text">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-24 shrink-0 text-center text-control font-bold text-text sm:min-w-32">
          {format(monthDate, 'LLLL yyyy', { locale: ru })}
        </span>
        <button type="button" onClick={() => setMonthDate((d) => addMonths(d, 1))} aria-label="+1 мес" className="shrink-0 text-muted hover:text-text">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setMonthDate((d) => addMonths(d, 12))} aria-label="+12 мес" className="hidden shrink-0 text-muted hover:text-text sm:block">
          <ChevronsRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setHideAbsent((v) => !v)} aria-label="Скрыть/показать отсутствующих" className="shrink-0 text-muted hover:text-text sm:ml-2">
          {hideAbsent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <Select size="sm" options={SORT_OPTIONS} value={sort} onChange={(e) => onSortChange(e.target.value)} className="ml-auto w-44 shrink-0" />
      </div>

      {days.length === 0 ? (
        <EmptyState icon={Users} title="В этом месяце нет уроков" />
      ) : (
        <div className="w-full">
          {/*
            Имя-колонка — отдельная от прокручиваемой сетки дат панель, а не
            `position: sticky` grid-item: в Chromium sticky внутри CSS Grid с
            явными широкими треками теряет привязку после ~90px прокрутки
            (эмпирически воспроизведено) — имена уезжают вместе со скроллом.
            Две синхронные колонки с одинаковой высотой строк (h-11) не
            зависят от этого поведения.
          */}
          <div className="flex">
            {/* Ровно половина ширины — данные студента, вторая половина — даты занятий (прокручиваются). */}
            <div className="w-1/2 min-w-[26rem] shrink-0 border-r border-border">
              <div className="grid h-11 grid-cols-[minmax(0,2.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_2rem] items-center gap-2 bg-surface px-3 text-control font-bold text-text">
                <span>Студент</span>
                <span>Баланс</span>
                <span>Учится</span>
                <span>Телефон</span>
                <span />
              </div>
              {visibleEnrollments.map((enrollment, i) => {
                const student = studentsById.get(enrollment.studentId);
                const balance = student?.balance ?? 0;
                // Учится у нас с даты активации (платный), если её нет — с первой оплаты, иначе с даты записи в группу.
                const since = enrollment.activatedAt?.toDate?.() ?? student?.firstPaymentAt?.toDate?.() ?? enrollment.addedAt?.toDate?.() ?? null;
                return (
                  <div
                    key={enrollment.id}
                    className="grid h-11 grid-cols-[minmax(0,2.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_2rem] items-center gap-2 bg-surface px-3"
                  >
                    <RosterStudentCell index={i + 1} enrollment={enrollment} student={student} />
                    {/* Сумму баланса учителю не показываем (он видит только цвет кружка у имени). */}
                    <span className={`truncate text-small font-bold ${isTeacher || !student ? 'text-muted' : balance >= 0 ? 'text-success' : 'text-danger'}`}>
                      {isTeacher || !student ? '—' : `${balance > 0 ? '+' : ''}${formatMoney(balance)}`}
                    </span>
                    <span className="truncate text-small text-text">{formatTenure(since)}</span>
                    <RosterPhone student={student} />
                    <RosterMenuCell enrollment={enrollment} student={student} {...rosterActions} />
                  </div>
                );
              })}
            </div>

            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
                {days.map((day) => (
                  <button
                    key={day.dateKey}
                    ref={day.dateKey === todayKey ? todayHeaderRef : undefined}
                    type="button"
                    onClick={(e) => day.currentLesson && handleHeaderClick(day.currentLesson, e)}
                    title={day.currentLesson ? 'Ctrl/Cmd+клик — отметить всех присутствующими' : 'Уроки прежней группы'}
                    className={`flex h-11 items-center justify-center px-0 text-small font-bold hover:bg-surface-alt ${
                      day.dateKey === todayKey ? 'bg-orange-soft/40 text-navy' : day.currentLesson ? 'text-text' : 'text-muted'
                    }`}
                  >
                    {format(day.date, 'd MMM', { locale: ru })}
                  </button>
                ))}

                {visibleEnrollments.map((enrollment) =>
                  days.map((day) => {
                    const cell = resolveCell(day, enrollment);
                    if (!cell) {
                      return <div key={`${enrollment.id}_${day.dateKey}`} className="h-11" />;
                    }
                    const displayStatus = hideAbsent && cell.status === 'absent' ? null : cell.status;
                    const future = !cell.muted && cell.lesson.date.toDate() > today;
                    return (
                      <div key={`${enrollment.id}_${day.dateKey}`} className="flex h-11 items-center justify-center">
                        <AttendanceCell
                          status={displayStatus}
                          future={future}
                          muted={cell.muted}
                          onClick={cell.clickable ? () => handleCellClick(cell.lesson, enrollment) : undefined}
                        />
                      </div>
                    );
                  }),
                )}
              </div>
            </div>

          </div>
        </div>
      )}
      {footer}
    </div>
  );
}
