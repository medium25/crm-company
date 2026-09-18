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
import { format, addMonths, subMonths, startOfMonth, startOfDay } from 'date-fns';
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
    for (const l of oldLessons) {
      const entry = map.get(l.dateKey) ?? {
        dateKey: l.dateKey,
        date: startOfDay(l.date.toDate()),
        currentLesson: null,
        oldLessonsByGroup: new Map(),
      };
      entry.oldLessonsByGroup.set(l.groupId, l);
      map.set(l.dateKey, entry);
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

  // Студент без ЕДИНОГО дня (ни своего, ни муted-истории старой группы) в
  // этом месяце — строку не показываем вовсе, не только ячейки: иначе висит
  // пустая строка с именем, которую невозможно отличить от «просто пока
  // никто не отметил». Переведённый в другую группу (status=='left' &&
  // returnIntent=='transfer') исключён безусловно — его история теперь
  // видна только в НОВОЙ группе (см. doc-комментарий компонента).
  const visibleEnrollments = enrollments
    .filter((en) => {
      if (studentsById.get(en.studentId)?.isArchived) return false;
      if (en.status === 'paused') return false;
      if (en.status === 'left' && en.returnIntent === 'transfer') return false;
      return days.some((day) => resolveCell(day, en) !== null);
    })
    // Тот же порядок, что состав группы (GroupDetailPage, сортировка «По
    // А-Я» по умолчанию) — иначе строки идут в порядке ответа Firestore,
    // который не совпадает с тем, что видно в составе.
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ru'));

  if (visibleEnrollments.length === 0) {
    return <EmptyState icon={Users} title="Пока нет студентов в группе" />;
  }

  const gridTemplate = `repeat(${days.length}, 64px)`;

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
                {days.map((day) => (
                  <button
                    key={day.dateKey}
                    ref={day.dateKey === todayKey ? todayHeaderRef : undefined}
                    type="button"
                    onClick={(e) => day.currentLesson && handleHeaderClick(day.currentLesson, e)}
                    title={day.currentLesson ? 'Ctrl/Cmd+клик — отметить всех присутствующими' : 'Уроки прежней группы'}
                    className={`flex h-11 items-center justify-center px-1 text-[13px] font-bold hover:bg-surface-alt ${
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
