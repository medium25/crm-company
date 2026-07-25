import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { AlertTriangle } from 'lucide-react';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { formatMoney } from '../../lib/format.js';

/**
 * Топ-10 должников по величине долга — блок под графиком выручки на дашборде.
 * @param {Object} props
 * @param {string} props.branchId
 */
export function DebtorsList({ branchId }) {
  const navigate = useNavigate();

  const studentsQuery = useMemo(
    () => (db && branchId ? query(collection(db, 'students'), where('branchId', '==', branchId), where('status', '==', 'active'), where('isArchived', '==', false)) : null),
    [branchId],
  );
  const { data: students, loading } = useCollection(studentsQuery);

  const enrollmentsQuery = useMemo(
    () => (db && branchId ? query(collection(db, 'enrollments'), where('branchId', '==', branchId), where('isArchived', '==', false)) : null),
    [branchId],
  );
  const { data: enrollments } = useCollection(enrollmentsQuery);

  const primaryGroupByStudent = useMemo(() => {
    const map = new Map();
    for (const e of enrollments) {
      if (!map.has(e.studentId)) map.set(e.studentId, e.groupCode);
    }
    return map;
  }, [enrollments]);

  const debtors = useMemo(
    () => students.filter((s) => s.balance < 0).sort((a, b) => a.balance - b.balance).slice(0, 10),
    [students],
  );

  return (
    <Card>
      <h3 className="mb-4 text-[20px] font-bold text-text">Должники</h3>
      {!loading && debtors.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Должников нет" />
      ) : (
        <div className="flex flex-col gap-2">
          {debtors.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-row bg-surface-alt px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[15px] text-text">{s.fullName}</span>
                {primaryGroupByStudent.get(s.id) && <Badge variant="group-code">{primaryGroupByStudent.get(s.id)}</Badge>}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-danger">{formatMoney(s.balance)}</span>
                <Button size="md" className="h-8 px-3 text-[13px]" onClick={() => navigate(`/students/${s.id}`)}>
                  Принять оплату
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
