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
import { format, addMonths, subMonths, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, EyeOff, Users } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useRole } from '../../hooks/useRole.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { AttendanceCell } from '../ui/AttendanceCell.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { generateLessonsForMonth } from '../../lib/schedule.js';

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** activatedAt приходит только у активных записей — у пробных берём addedAt. */
const eligibleFrom = (enrollment) => (enrollment.activatedAt ?? enrollment.addedAt).toDate();

/**
 * Симметрично eligibleFrom, но с конца: у status=='left' запись остаётся в
 * enrollments (isArchived не трогается) — без этой отсечки уроки ПОСЛЕ
 * ухода студента оставались кликабельными, и его можно было по ошибке
 * отметить в группе, которую он уже покинул (studentIsArchived==false и
 * status=='left' одновременно с активным enrollment в новой группе —
 * штатная ситуация при переводе, не баг данных).
 */
const eligibleUntil = (enrollment) => (enrollment.status === 'left' && enrollment.leftAt ? enrollment.leftAt.toDate() : null);

/**
 * Вкладка «Посещаемость» карточки группы — 03 · Бизнес-логика §4.
 * @param {Object} props
 * @param {Object} props.group документ группы (Timestamp-поля как из Firestore)
 */
export function AttendanceTab({ group }) {
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
    () => (db ? query(collection(db, 'enrollments'), where('groupId', '==', group.id), where('isArchived', '==', false)) : null),
    [group.id],
  );
  const { data: enrollments, loading: enrollmentsLoading } = useCollection(enrollmentsQuery);

  // Студент мог быть архивирован напрямую с его карточки — тогда его
  // enrollment иногда остаётся неархивированным (см. тот же комментарий в
  // GroupDetailPage.sortedEnrollments). Без этой подстраховки такой студент
  // пропадал из состава группы, но оставался в сетке посещаемости.
  const studentIds = useMemo(() => enrollments.map((e) => e.studentId).slice(0, 30), [enrollments]);
  const studentsQuery = useMemo(
    () => (db && studentIds.length > 0 ? query(collection(db, 'students'), where(documentId(), 'in', studentIds)) : null),
    [studentIds],
  );
  const { data: rosterStudents } = useCollection(studentsQuery);
  const studentsById = useMemo(() => new Map(rosterStudents.map((s) => [s.id, s])), [rosterStudents]);

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

  useEffect(() => {
    if (lessonsLoading || lessons.length > 0 || attemptedMonths.current.has(monthStr)) return;
    attemptedMonths.current.add(monthStr);
    generateLessonsForMonth(db, {
      ...group,
      startDate: group.startDate.toDate(),
      endDate: group.endDate.toDate(),
    }, monthStr).catch(() => showToast('Не удалось догенерировать уроки месяца.', { type: 'error' }));
  }, [lessonsLoading, lessons.length, monthStr, group, showToast]);

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

  // Учитель открывает вкладку отметить сегодняшний урок — сетка месяца
  // широкая, без автоскролла на телефоне пришлось бы сначала листать её
  // горизонтально, чтобы найти сегодняшнюю колонку.
  useEffect(() => {
    if (!isCurrentMonth) return;
    todayHeaderRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [lessons, isCurrentMonth]);

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
    const eligible = enrollments.filter((en) => {
      if (studentsById.get(en.studentId)?.isArchived) return false;
      if (en.status === 'paused') return false;
      const until = eligibleUntil(en);
      return lessonDate >= eligibleFrom(en) && !(until && lessonDate > until);
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

  // Студент без ЕДИНОГО урока в своём периоде этого месяца (пришёл после
  // последнего урока месяца, или ушёл до первого) — строку не показываем
  // вовсе, не только ячейки: иначе висит пустая строка с именем, которую
  // невозможно отличить от «просто пока никто не отметил».
  const visibleEnrollments = enrollments
    .filter((en) => {
      if (studentsById.get(en.studentId)?.isArchived) return false;
      if (en.status === 'paused') return false;
      const until = eligibleUntil(en);
      return lessons.some((l) => {
        const d = l.date.toDate();
        return d >= eligibleFrom(en) && !(until && d > until);
      });
    })
    // Тот же порядок, что состав группы (GroupDetailPage, сортировка «По
    // А-Я» по умолчанию) — иначе строки идут в порядке ответа Firestore,
    // который не совпадает с тем, что видно в составе.
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ru'));

  if (visibleEnrollments.length === 0) {
    return <EmptyState icon={Users} title="Пока нет студентов в группе" />;
  }

  const gridTemplate = `repeat(${lessons.length}, 64px)`;

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 sm:gap-2">
        <button type="button" onClick={() => setMonthDate(startOfMonth(new Date()))} className="shrink-0 rounded-full px-2 py-1.5 text-[13px] text-link sm:px-3">
          Текущий
        </button>
        <button type="button" onClick={() => setMonthDate((d) => subMonths(d, 12))} aria-label="-12 мес" className="hidden shrink-0 text-muted hover:text-text sm:block">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setMonthDate((d) => subMonths(d, 1))} aria-label="-1 мес" className="shrink-0 text-muted hover:text-text">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-24 shrink-0 text-center text-[15px] font-bold text-text sm:min-w-32">
          {format(monthDate, 'LLLL yyyy', { locale: ru })}
        </span>
        <button type="button" onClick={() => setMonthDate((d) => addMonths(d, 1))} aria-label="+1 мес" className="shrink-0 text-muted hover:text-text">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setMonthDate((d) => addMonths(d, 12))} aria-label="+12 мес" className="hidden shrink-0 text-muted hover:text-text sm:block">
          <ChevronsRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setHideAbsent((v) => !v)} aria-label="Скрыть/показать отсутствующих" className="ml-auto shrink-0 text-muted hover:text-text sm:ml-2">
          {hideAbsent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {lessons.length === 0 ? (
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
            <div className="w-[160px] shrink-0 border-r border-border sm:w-[200px]">
              <div className="flex h-11 items-center bg-surface px-3 text-[15px] font-bold text-text">Имя</div>
              {visibleEnrollments.map((enrollment) => (
                <div key={enrollment.id} className="flex h-11 items-center gap-2 bg-surface px-3 text-[15px] text-text">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[12px] font-bold text-muted">
                    {enrollment.studentName[0]}
                  </span>
                  <span className="truncate">{enrollment.studentName}</span>
                </div>
              ))}
            </div>

            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
                {lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    ref={lesson.dateKey === todayKey ? todayHeaderRef : undefined}
                    type="button"
                    onClick={(e) => handleHeaderClick(lesson, e)}
                    title="Ctrl/Cmd+клик — отметить всех присутствующими"
                    className={`flex h-11 items-center justify-center px-1 text-[13px] font-bold hover:bg-surface-alt ${
                      lesson.dateKey === todayKey ? 'bg-orange-soft/40 text-navy' : 'text-text'
                    }`}
                  >
                    {format(lesson.date.toDate(), 'd MMM', { locale: ru })}
                  </button>
                ))}

                {visibleEnrollments.map((enrollment) =>
                  lessons.map((lesson) => {
                    const lessonDate = lesson.date.toDate();
                    const until = eligibleUntil(enrollment);
                    if (lessonDate < eligibleFrom(enrollment) || (until && lessonDate > until)) {
                      return <div key={`${enrollment.id}_${lesson.id}`} className="h-11" />;
                    }
                    const status = getStatus(lesson.id, enrollment.studentId);
                    const displayStatus = hideAbsent && status === 'absent' ? null : status;
                    const future = lessonDate > today;
                    return (
                      <div key={`${enrollment.id}_${lesson.id}`} className="flex h-11 items-center justify-center">
                        <AttendanceCell
                          status={displayStatus}
                          future={future}
                          onClick={() => handleCellClick(lesson, enrollment)}
                        />
                      </div>
                    );
                  }),
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1">
            {visibleEnrollments.map((enrollment) => {
              // Знаменатель — все уроки группы в месяце (сколько всего будет),
              // не только прошедшие/доступные студенту — по просьбе.
              const presentCount = lessons.filter((l) => getStatus(l.id, enrollment.studentId) === 'present').length;
              const total = lessons.length;
              const pct = total > 0 ? Math.round((presentCount / total) * 100) : 0;
              return (
                <div key={enrollment.id} className="flex items-center justify-between text-[13px] text-muted">
                  <span>{enrollment.studentName}</span>
                  <span>
                    {presentCount}/{total} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
