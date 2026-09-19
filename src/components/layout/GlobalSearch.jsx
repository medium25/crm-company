import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { Search } from 'lucide-react';
import { db } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useAuth } from '../../hooks/useAuth.js';
import { COLUMNS } from '../leads/columns.js';
import { formatPhone, pluralize } from '../../lib/format.js';
import { useSearchSource } from '../../lib/searchSource.js';

const STUDENT_STATUS = { active: 'Активен', paused: 'Заморожен', trial: 'Пробный', left: 'Ушёл' };

// Стадии доски «Заявки», на которых человек ещё лид (а не студент).
const LEAD_STAGES = COLUMNS.filter((c) => c.key !== 'won').map((c) => c.key);

/** Где ищем — по разделу, в котором сейчас пользователь. */
const SCOPES = {
  leads: { label: 'Заявки', placeholder: 'Поиск по заявкам' },
  trials: { label: 'Пробные', placeholder: 'Поиск по пробным' },
  students: { label: 'Студенты', placeholder: 'Поиск по студентам' },
  groups: { label: 'Группы', placeholder: 'Поиск по группам' },
};

function scopeOf(pathname) {
  if (pathname.startsWith('/leads') || pathname.startsWith('/tasks')) return 'leads';
  if (pathname.startsWith('/trials')) return 'trials';
  if (['/teachers-groups', '/groups', '/teachers', '/courses', '/rooms'].some((p) => pathname.startsWith(p))) return 'groups';
  return 'students';
}

/**
 * Куда вести по клику на лида: на доску «Заявки», к его карточке (рамка,
 * раскрываются группы). «Оплачено» — уже ученик, ему страница ученика; лид,
 * которого нет на доске (скрыт крестиком или чужой у оператора без права
 * видеть всех), — тоже на страницу.
 */
function locateLead(s, canSeeAllLeads, uid) {
  const column = COLUMNS.find((c) => c.key === s.funnelStage);
  if (column && column.key !== 'won') {
    if (s.boardHiddenAt) return { path: `/students/${s.id}`, place: 'Заявки · скрыта с доски' };
    if (!canSeeAllLeads && s.assignedOperator !== uid) return { path: `/students/${s.id}`, place: `Заявки · ${column.label} · у другого оператора` };
    return { path: `/leads?highlight=${s.id}&t=${Date.now()}`, place: `Заявки · ${column.label}` };
  }
  return { path: `/students/${s.id}`, place: `Студенты · ${STUDENT_STATUS[s.status] ?? 'ученик'}` };
}

/**
 * Поиск в шапке — ⌘K/Ctrl+K или клик. Ищет ТОЛЬКО в том разделе, где
 * пользователь сейчас: в «Заявках» и «Задачах» — по лидам доски, в «Пробных» —
 * по пробным, в «Учителях и группах» — по группам, в остальных — по студентам.
 * Заявки/Задачи/Пробные ищут по данным, которые страница уже загрузила (см.
 * searchSource.js), — своей подписки на базу нет, лишних чтений ноль. Студенты и
 * группы читают только свою выборку, и только пока поиск открыт.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { activeBranchId } = useBranch();
  const { user, staff } = useAuth();
  const canSeeAllLeads = staff?.role === 'ceo' || staff?.role === 'manager' || staff?.role === 'test';
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  const scope = scopeOf(pathname);
  const leadsSource = useSearchSource('leads');
  const trialsSource = useSearchSource('trials');

  // Только реальные студенты (не лиды на доске): active/trial/paused/left,
  // без тех, кто пока ещё на стадии воронки.
  const studentsQuery = useMemo(
    () =>
      db && activeBranchId && open && scope === 'students'
        ? query(collection(db, 'students'), where('branchId', '==', activeBranchId), where('isArchived', '==', false), where('status', 'in', ['active', 'trial', 'paused', 'left']))
        : null,
    [activeBranchId, open, scope],
  );
  const { data: studentDocs } = useCollection(studentsQuery);

  const groupsQuery = useMemo(
    () =>
      db && activeBranchId && open && scope === 'groups'
        ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('isArchived', '==', false))
        : null,
    [activeBranchId, open, scope],
  );
  const { data: groups } = useCollection(groupsQuery);

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
  const matchPerson = (s) => s.fullName?.toLowerCase().includes(term) || s.phone?.includes(term);

  // Результаты выбранного раздела в едином виде: { id, title, right, place, path }.
  const results = useMemo(() => {
    if (!term) return [];
    if (scope === 'leads') {
      return (leadsSource?.items ?? [])
        .filter(matchPerson)
        .slice(0, 8)
        .map((s) => ({ id: s.id, title: s.fullName, right: formatPhone(s.phone), ...locateLead(s, canSeeAllLeads, user?.uid) }));
    }
    if (scope === 'trials') {
      return (trialsSource?.items ?? [])
        .filter(matchPerson)
        .slice(0, 8)
        .map((s) => ({
          id: s.id,
          title: s.fullName,
          right: formatPhone(s.phone),
          place: `Пробные · ${COLUMNS.find((c) => c.key === s.funnelStage)?.label ?? ''}`,
          path: `/students/${s.id}`,
        }));
    }
    if (scope === 'groups') {
      return groups
        .filter((g) => g.code?.toLowerCase().includes(term) || g.courseName?.toLowerCase().includes(term) || g.teacherName?.toLowerCase().includes(term))
        .slice(0, 8)
        .map((g) => ({ id: g.id, title: `${g.code} · ${g.courseName}`, right: g.teacherName, place: 'Группы', path: `/groups/${g.id}` }));
    }
    return studentDocs
      .filter((s) => !LEAD_STAGES.includes(s.funnelStage) && matchPerson(s))
      .slice(0, 8)
      .map((s) => ({ id: s.id, title: s.fullName, right: formatPhone(s.phone), place: `Студенты · ${STUDENT_STATUS[s.status] ?? 'ученик'}`, path: `/students/${s.id}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, scope, leadsSource, trialsSource, groups, studentDocs, canSeeAllLeads, user?.uid]);

  // «Отказ» на доске грузится по кнопке — если результатов нет, предлагаем поискать и там.
  const lost = scope === 'leads' ? leadsSource?.lost : null;
  const canSearchLost = Boolean(lost && !lost.loaded);

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
        className="flex h-9 w-full items-center justify-center gap-2 rounded-field border border-border-strong bg-white px-3 text-[13px] text-muted sm:justify-start"
      >
        <Search className="h-4 w-4 shrink-0" />
        {open ? (
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder={SCOPES[scope].placeholder}
            className="w-full min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          />
        ) : (
          <span className="hidden flex-1 truncate text-left sm:inline">{SCOPES[scope].placeholder}</span>
        )}
        <kbd className="hidden shrink-0 rounded bg-surface-alt px-1.5 py-0.5 text-[11px] sm:inline">⌘K</kbd>
      </button>

      {open && term && (
        <div className="fixed inset-x-3 top-[4.5rem] z-20 max-h-96 overflow-y-auto rounded-field border border-border bg-surface py-2 shadow-hover sm:absolute sm:inset-x-auto sm:left-0 sm:top-11 sm:w-full">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-muted">Ничего не найдено</p>
          ) : (
            <div>
              <p className="px-3 pb-1 text-[11px] font-bold uppercase text-muted">{SCOPES[scope].label}</p>
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => goTo(r.path)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[14px] hover:bg-surface-alt"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-text">{r.title}</span>
                    <span className="block truncate text-[11px] text-muted">{r.place}</span>
                  </span>
                  <span className="shrink-0 text-muted">{r.right}</span>
                </button>
              ))}
            </div>
          )}
          {canSearchLost && (
            <button
              type="button"
              onClick={lost.load}
              className="mt-1 w-full border-t border-border px-3 py-2 text-left text-[13px] font-bold text-navy hover:bg-surface-alt"
            >
              Искать и в отказах{lost.count != null ? ` (${lost.count} ${pluralize(lost.count, ['отказ', 'отказа', 'отказов'])})` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
