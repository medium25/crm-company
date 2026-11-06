import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { Search } from 'lucide-react';
import { db } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Card } from '../ui/Card.jsx';
import { formatPhone } from '../../lib/format.js';
import { locateLead } from '../../lib/leadLocation.js';
import { AddToTrialModal } from './AddToTrialModal.jsx';

const MAX_RESULTS = 20;

/**
 * Поиск по всей системе (лиды, пробные, студенты, в том числе в архиве) — по телефону («+998» уже в поле, вводятся
 * остальные цифры) или по имени/фамилии (в любом порядке слов). Студенты читаются из базы только когда начали
 * вводить (от 2 символов), без своей постоянной подписки. Под каждым результатом — где человек и от кого запись
 * (ответственный оператор).
 * @param {Object} props
 * @param {Map<string, {name: string}>} props.operatorByUid
 * @param {Map<string, string>} props.enrollmentStatusByStudent studentId → статус записи в группу (trial/active/paused)
 */
export function SystemSearch({ operatorByUid, enrollmentStatusByStudent }) {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { user, staff } = useAuth();
  const canSeeAllLeads = staff?.role === 'ceo' || staff?.role === 'manager' || staff?.role === 'test';
  const [q, setQ] = useState('');
  const [trialTarget, setTrialTarget] = useState(null);

  const term = q.trim().toLowerCase();
  const active = term.length >= 2;

  const studentsQuery = useMemo(
    () => (db && activeBranchId && active ? query(collection(db, 'students'), where('branchId', '==', activeBranchId)) : null),
    [activeBranchId, active],
  );
  const { data: students, loading } = useCollection(studentsQuery);

  const results = useMemo(() => {
    if (!active) return [];
    const isPhone = !/[a-zа-яё]/i.test(term);
    let digits = term.replace(/\D/g, '');
    if (digits.startsWith('998') && digits.length > 9) digits = digits.slice(3); // вставили номер целиком
    const tokens = term.split(/\s+/).filter(Boolean);
    const match = (s) => {
      if (isPhone) {
        if (digits.length < 2) return false;
        return [s.phone, s.phone2].some((p) => (p ?? '').replace(/\D/g, '').includes(digits));
      }
      const name = (s.fullName ?? '').toLowerCase();
      return tokens.every((t) => name.includes(t));
    };
    return students
      .filter(match)
      .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? '', 'ru'))
      .slice(0, MAX_RESULTS);
  }, [students, term, active]);

  return (
    <Card>
      <h2 className="mb-3 font-bold text-text" style={{ fontSize: 21, lineHeight: '28px' }}>
        Найти запись
      </h2>
      <label className="flex h-12 items-center overflow-hidden rounded-field border border-border-strong bg-white focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/15">
        <span className="flex h-full shrink-0 items-center border-r border-border px-3 text-control font-bold text-muted">+998</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Телефон, имя или фамилия"
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-control text-text placeholder:text-muted focus:outline-none"
        />
        <Search className="mx-3 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </label>

      {active && (
        <div className="mt-3">
          {loading && results.length === 0 ? (
            <p className="py-3 text-center text-small text-muted">Ищу…</p>
          ) : results.length === 0 ? (
            <p className="py-3 text-center text-small text-muted">Никого не нашли.</p>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((s) => {
                const { path, place } = locateLead(s, canSeeAllLeads, user?.uid);
                const operator = operatorByUid.get(s.assignedOperator)?.name;
                // «Пробный» — это запись к учителю в группу: лид с назначенной датой, но без группы, ещё не пробный.
                const enrollmentStatus = enrollmentStatusByStudent.get(s.id);
                const inGroup = !s.isArchived && (enrollmentStatus === 'active' || enrollmentStatus === 'paused' || s.status === 'active' || s.status === 'paused');
                const alreadyTrial = !s.isArchived && !inGroup && enrollmentStatus === 'trial';
                return (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <button type="button" onClick={() => navigate(path)} className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-80">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-caption font-bold text-muted">
                        {(s.fullName ?? '?')[0]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-control text-text">{s.fullName}</span>
                        <span className="block truncate text-small text-muted">
                          {formatPhone(s.phone)}
                          {operator ? ` · от ${operator}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-badge bg-chip px-2.5 py-0.5 text-caption text-text">{s.isArchived ? 'Архив' : place}</span>
                    </button>
                    {inGroup || alreadyTrial ? (
                      <span className="flex h-9 shrink-0 items-center rounded-field border border-navy px-3 text-small font-bold text-navy">
                        {inGroup ? 'Уже в группе' : 'Уже в пробном'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTrialTarget(s)}
                        className="h-9 shrink-0 rounded-field bg-navy px-3 text-small font-bold text-white transition hover:bg-navy-hover"
                      >
                        Добавить в пробный
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <AddToTrialModal student={trialTarget} onClose={() => setTrialTarget(null)} />
    </Card>
  );
}
