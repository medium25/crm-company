import { useMemo, useState } from 'react';
import { collection, orderBy, query } from 'firebase/firestore';
import { Plus, Star } from 'lucide-react';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Skeleton } from '../ui/Skeleton.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Button } from '../ui/Button.jsx';
import { ROLE_OPTIONS } from '../../lib/roles.js';
import { formatName } from '../../lib/format.js';
import { StaffEvaluationModal } from './StaffEvaluationModal.jsx';
import { StaffEvaluationCards } from './StaffEvaluationCards.jsx';
import { AddEvaluationPersonModal } from './AddEvaluationPersonModal.jsx';

const staffQuery = db ? query(collection(db, 'staff'), orderBy('fullName')) : null;
// Люди без логина в CRM, добавленные вручную только для этого раздела (см. AddEvaluationPersonModal).
const manualQuery = db ? query(collection(db, 'evaluationStaff'), orderBy('fullName')) : null;
const evaluationsQuery = db ? query(collection(db, 'staffEvaluations'), orderBy('createdAt', 'desc')) : null;

const roleLabel = (role) => ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;

/**
 * Список для «Оценка сотрудников»: реальные staff (без ceo/manager/test —
 * их тут не оценивают) + вручную добавленные люди без логина (звание —
 * свободный текст, см. AddEvaluationPersonModal). Клик открывает
 * StaffEvaluationModal (кнопка «Оценить» в ленте выбранного сотрудника).
 */
export function StaffEvaluationList() {
  const { data: staff, loading: loadingStaff, error: errorStaff } = useCollection(staffQuery);
  const { data: manual, loading: loadingManual, error: errorManual } = useCollection(manualQuery);
  const { data: evaluations } = useCollection(evaluationsQuery);
  const [target, setTarget] = useState(null);
  const [adding, setAdding] = useState(false);

  const loading = loadingStaff || loadingManual;
  const error = errorStaff || errorManual;

  const staffList = staff
    .filter((m) => m.isActive && !['ceo', 'manager', 'test'].includes(m.role))
    .map((m) => ({ ...m, roleForEval: roleLabel(m.role) }));
  const manualList = manual
    .filter((m) => m.isActive !== false)
    .map((m) => ({ ...m, roleForEval: m.title }));
  const combined = [...staffList, ...manualList].sort((a, b) =>
    formatName(a.fullName).localeCompare(formatName(b.fullName)),
  );

  // uid оценившего → имя: оценивают CEO/менеджеры, которых в списке сотрудников нет, но они есть в staff.
  const nameByUid = useMemo(() => new Map(staff.map((m) => [m.id, m.fullName])), [staff]);

  const addButton = (
    <div className="mb-3 flex justify-end">
      <Button size="sm" onClick={() => setAdding(true)}>
        <Plus className="h-4 w-4" /> Добавить сотрудника
      </Button>
    </div>
  );

  if (loading) {
    return (
      <>
        {addButton}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </>
    );
  }
  if (error) return <p className="text-control text-danger">Не удалось загрузить сотрудников.</p>;

  return (
    <>
      {addButton}
      {combined.length === 0 ? (
        <EmptyState icon={Star} title="Сотрудников пока нет" />
      ) : (
        <StaffEvaluationCards members={combined} evaluations={evaluations} nameByUid={nameByUid} onEvaluate={setTarget} />
      )}
      <StaffEvaluationModal member={target} onClose={() => setTarget(null)} />
      <AddEvaluationPersonModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
