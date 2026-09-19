import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { Search } from 'lucide-react';
import { db } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useAuth } from '../../hooks/useAuth.js';
import { COLUMNS } from '../leads/columns.js';
import { formatPhone } from '../../lib/format.js';

const STUDENT_STATUS = { active: 'Активен', paused: 'Заморожен', trial: 'Пробный', left: 'Ушёл' };

/**
 * Где человек живёт в системе и куда вести по клику: лид (стадия воронки,
 * кроме «Оплачено») — на доску «Заявки», к его карточке (выделяется рамкой; раскрываются группы),
 * остальные — на страницу ученика. Лид, которого нет на доске (скрыт
 * крестиком или чужой у оператора без права видеть всех), — тоже на
 * страницу.
 */
function locate(s, canSeeAllLeads, uid) {
  // Доска строится по funnelStage (не по status: лид на пробном/в дожиме уже
  // имеет status 'trial'). 'won' — уже ученик, его место — раздел «Студенты».
  const column = COLUMNS.find((c) => c.key === s.funnelStage);
  if (column && column.key !== 'won') {
    if (s.boardHiddenAt) return { path: `/students/${s.id}`, place: 'Заявки · скрыта с доски' };
    if (!canSeeAllLeads && s.assignedOperator !== uid) return { path: `/students/${s.id}`, place: `Заявки · ${column.label} · у другого оператора` };
    return { path: `/leads?highlight=${s.id}&t=${Date.now()}`, place: `Заявки · ${column.label}`, live: true };
  }
  return { path: `/students/${s.id}`, place: `Студенты · ${STUDENT_STATUS[s.status] ?? 'ученик'}` };
}

/** Поиск по студентам и группам активного филиала — ⌘K/Ctrl+K или клик. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { user, staff } = useAuth();
  const canSeeAllLeads = staff?.role === 'ceo' || staff?.role === 'manager' || staff?.role === 'test';
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  const studentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'students'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: students } = useCollection(open ? studentsQuery : null);

  const groupsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: groups } = useCollection(open ? groupsQuery : null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const term = q.trim().toLowerCase();
  const studentResults = term
    ? students.filter((s) => s.fullName?.toLowerCase().includes(term) || s.phone?.includes(term)).slice(0, 6)
    : [];
  const groupResults = term
    ? groups
        .filter((g) => g.code?.toLowerCase().includes(term) || g.courseName?.toLowerCase().includes(term) || g.teacherName?.toLowerCase().includes(term))
        .slice(0, 6)
    : [];

  const goTo = (path) => {
    navigate(path);
    setOpen(false);
    setQ('');
  };

  return (
    <div ref={boxRef} className="relative min-w-0 max-w-md flex-1">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-full border border-border-strong bg-white px-3 text-[13px] text-muted sm:justify-start"
      >
        <Search className="h-4 w-4 shrink-0" />
        {open ? (
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Поиск"
            className="w-full min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          />
        ) : (
          <span className="hidden flex-1 truncate text-left sm:inline">Поиск по студентам и группам</span>
        )}
        <kbd className="hidden shrink-0 rounded bg-surface-alt px-1.5 py-0.5 text-[11px] sm:inline">⌘K</kbd>
      </button>

      {open && term && (
        <div className="fixed inset-x-3 top-[4.5rem] z-20 max-h-96 overflow-y-auto rounded-field border border-border bg-surface py-2 shadow-hover sm:absolute sm:inset-x-auto sm:left-0 sm:top-11 sm:w-full">
          {studentResults.length === 0 && groupResults.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-muted">Ничего не найдено</p>
          ) : (
            <>
              {studentResults.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 pb-1 text-[11px] font-bold uppercase text-muted">Студенты</p>
                  {studentResults.map((s) => {
                    const where = locate(s, canSeeAllLeads, user?.uid);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => goTo(where.path)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[14px] hover:bg-surface-alt"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-text">{s.fullName}</span>
                          <span className="block truncate text-[11px] text-muted">{where.place}</span>
                        </span>
                        <span className="shrink-0 text-muted">{formatPhone(s.phone)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {groupResults.length > 0 && (
                <div>
                  <p className="px-3 pb-1 text-[11px] font-bold uppercase text-muted">Группы</p>
                  {groupResults.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => goTo(`/groups/${g.id}`)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[14px] hover:bg-surface-alt"
                    >
                      <span className="text-text">
                        {g.code} · {g.courseName}
                      </span>
                      <span className="text-muted">{g.teacherName}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
