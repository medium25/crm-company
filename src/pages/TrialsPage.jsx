// src/pages/TrialsPage.jsx
import { useMemo, useState } from 'react';
import { addMonths, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, query, where } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { Card } from '../components/ui/Card.jsx';
import { SystemSearch } from '../components/trials/SystemSearch.jsx';
import { TrialMonths } from '../components/students/TrialMonths.jsx';

/**
 * «Пробные» — сверху поиск по всей системе с кнопкой «Добавить в пробный», ниже пробные по месяцам и учителям
 * (тот же список, что «На пробном уроке» в «Студентах», см. TrialMonths) и поиск по ним. Пробный — по правилу:
 * есть дата пробного (trialDate) и запись к учителю в группу; стадия воронки не решает.
 */
export function TrialsPage() {
  const { activeBranchId } = useBranch();
  const [tableSearch, setTableSearch] = useState('');
  const [monthOffset, setMonthOffset] = useState(0); // 0 — текущий месяц, -1 — прошлый, +1 — следующий
  const rawMonth = format(addMonths(new Date(), monthOffset), 'LLLL yyyy', { locale: ru });
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);

  const enrollmentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: enrollments } = useCollection(enrollmentsQuery);
  // Статус записи в группу по студенту — поиск по системе различает «уже в группе / уже в пробном».
  const enrollmentStatusByStudent = useMemo(() => {
    const map = new Map();
    for (const e of enrollments) if (e.groupCode && ['trial', 'active', 'paused'].includes(e.status)) map.set(e.studentId, e.status);
    return map;
  }, [enrollments]);

  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);
  const operatorByUid = useMemo(() => {
    const map = new Map();
    for (const s of staffList) map.set(s.id, { color: s.color, name: s.fullName });
    return map;
  }, [staffList]);

  return (
    <div className="flex flex-col gap-4">
      <SystemSearch operatorByUid={operatorByUid} enrollmentStatusByStudent={enrollmentStatusByStudent} />

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-bold text-text" style={{ fontSize: 21, lineHeight: '28px' }}>
            Пробные. {monthLabel}
          </h2>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonthOffset((n) => n - 1)}
              aria-label="Прошлый месяц"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonthOffset(0)}
              disabled={monthOffset === 0}
              className="rounded-field px-2 py-1 text-small text-link hover:bg-surface-alt disabled:opacity-0"
            >
              Текущий
            </button>
            <button
              type="button"
              onClick={() => setMonthOffset((n) => n + 1)}
              disabled={monthOffset >= 1}
              aria-label="Следующий месяц"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <label className="mb-4 flex h-10 items-center overflow-hidden rounded-field border border-border-strong bg-white focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/15">
          <Search className="mx-3 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <input
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Поиск по пробным: имя или телефон"
            className="h-full min-w-0 flex-1 bg-transparent pr-3 text-control text-text placeholder:text-muted focus:outline-none"
          />
        </label>
        <TrialMonths search={tableSearch} enrollments={enrollments} monthsCount={1} monthOffset={monthOffset} compactHeader plain flat hideConversion lightTable hideHeader />
      </Card>
    </div>
  );
}
