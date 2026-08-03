import { useMemo, useState } from 'react';
import { collection, query, where, orderBy, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ArrowLeft, CalendarDays, GraduationCap, Flag, MessageSquare, ListTodo, Wallet } from 'lucide-react';
import { db } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Card } from '../ui/Card.jsx';
import { Table } from '../ui/Table.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { Badge } from '../ui/Badge.jsx';
import { CommentsModal } from './CommentsModal.jsx';
import { TaskListModal } from './TaskListModal.jsx';
import { formatPhone, formatMoney, pluralize } from '../../lib/format.js';

const PARITY_LABEL = { even: 'Чётные дни', odd: 'Нечётные дни' };

// Круглый флаг должника — цикл серый → зелёный → красный → серый.
// Сбрасывается на серый каждый день (по debtorFlagAt), чтобы администратор
// перепроверял должника заново, а не жил вчерашней отметкой.
const FLAG_NEXT = { gray: 'green', green: 'red', red: 'gray' };
const FLAG_BG = { gray: 'bg-muted', green: 'bg-success', red: 'bg-danger' };

function effectiveFlag(student, todayStr) {
  if (!student.debtorFlagAt) return 'gray';
  return format(student.debtorFlagAt.toDate(), 'yyyy-MM-dd') === todayStr ? (student.debtorFlag ?? 'gray') : 'gray';
}

/**
 * «Должники» — не плоский список, а drill-down: чётность дней → учитель →
 * таблица должников этого учителя (по группам этой чётности). Флаг/
 * комментарий/задача — прямо в строке, без захода в карточку студента.
 */
export function DebtorsByTeacher() {
  const { activeBranchId } = useBranch();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [parity, setParity] = useState(null);
  const [teacherId, setTeacherId] = useState(null);
  const [taskTarget, setTaskTarget] = useState(null);
  const [commentTarget, setCommentTarget] = useState(null);

  const groupsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: groups, loading: groupsLoading } = useCollection(groupsQuery);

  const enrollmentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: enrollments, loading: enrollmentsLoading } = useCollection(enrollmentsQuery);

  const studentsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'students'), where('branchId', '==', activeBranchId), where('isArchived', '==', false), where('status', '==', 'active'))
        : null,
    [activeBranchId],
  );
  const { data: students, loading: studentsLoading } = useCollection(studentsQuery);

  // Последний комментарий на студента — виден прямо в списке, без захода в
  // модалку. Клиентски по всему филиалу, как и остальные срезы здесь —
  // масштаб одной школы это позволяет.
  const commentsQuery = useMemo(
    () => (db ? query(collection(db, 'comments'), where('entityType', '==', 'student'), orderBy('createdAt', 'desc')) : null),
    [],
  );
  const { data: comments, loading: commentsLoading } = useCollection(commentsQuery);

  const loading = groupsLoading || enrollmentsLoading || studentsLoading || commentsLoading;

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const debtorIds = useMemo(() => new Set(students.filter((s) => s.balance < 0).map((s) => s.id)), [students]);

  const latestCommentByStudent = useMemo(() => {
    const map = new Map();
    for (const c of comments) {
      if (!map.has(c.entityId)) map.set(c.entityId, c.text);
    }
    return map;
  }, [comments]);

  // parity -> teacherId -> { teacherName, entries: [{studentId, groupCode}] }
  const structure = useMemo(() => {
    const byParity = { even: new Map(), odd: new Map() };
    for (const e of enrollments) {
      if (e.status === 'left' || e.status === 'archived') continue;
      if (!debtorIds.has(e.studentId)) continue;
      const g = groupById.get(e.groupId);
      const type = g?.schedule?.type;
      if (type !== 'even' && type !== 'odd') continue;
      const map = byParity[type];
      if (!map.has(e.teacherId)) map.set(e.teacherId, { teacherName: e.teacherName, entries: [] });
      map.get(e.teacherId).entries.push({ studentId: e.studentId, groupCode: e.groupCode });
    }
    return byParity;
  }, [enrollments, debtorIds, groupById]);

  const parityDebtorCount = (p) => new Set([...structure[p].values()].flatMap((t) => t.entries.map((en) => en.studentId))).size;

  const today = format(new Date(), 'yyyy-MM-dd');

  const cycleFlag = async (student) => {
    const next = FLAG_NEXT[effectiveFlag(student, today)];
    try {
      await updateDoc(doc(db, 'students', student.id), {
        debtorFlag: next,
        debtorFlagAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    } catch {
      showToast('Не удалось обновить флажок.', { type: 'error' });
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  // Уровень 1 — чётность
  if (!parity) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {['even', 'odd'].map((p) => (
          <Card key={p} hoverable className="flex cursor-pointer items-center gap-4 p-5" onClick={() => setParity(p)}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange">
              <CalendarDays className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <span className="flex-1">
              <span className="block text-[17px] font-bold text-text">{PARITY_LABEL[p]}</span>
              <span className="block text-[13px] text-muted">{parityDebtorCount(p)} должников</span>
            </span>
          </Card>
        ))}
      </div>
    );
  }

  const teachersInParity = [...structure[parity].entries()];

  // Уровень 2 — учителя
  if (!teacherId) {
    return (
      <div>
        <button type="button" onClick={() => setParity(null)} className="mb-4 flex items-center gap-1 text-[15px] text-link">
          <ArrowLeft className="h-4 w-4" /> {PARITY_LABEL[parity]} — назад
        </button>

        {teachersInParity.length === 0 ? (
          <EmptyState icon={GraduationCap} title="Должников нет" />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {teachersInParity.map(([tId, t]) => (
              <Card key={tId} hoverable className="flex cursor-pointer items-center justify-between p-4" onClick={() => setTeacherId(tId)}>
                <span className="font-bold text-text">{t.teacherName}</span>
                <span className="text-[15px] text-muted">
                  {new Set(t.entries.map((e) => e.studentId)).size} {pluralize(new Set(t.entries.map((e) => e.studentId)).size, ['должник', 'должника', 'должников'])}
                </span>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Уровень 3 — список должников учителя
  const teacherEntries = structure[parity].get(teacherId)?.entries ?? [];
  const rows = [...new Map(teacherEntries.map((e) => [e.studentId, e])).values()]
    .map((e) => ({ ...studentById.get(e.studentId), groupCode: e.groupCode }))
    .filter((s) => s.id);

  const columns = [
    {
      key: '__flag',
      label: '',
      width: '40px',
      render: (st) => (
        <button
          type="button"
          onClick={() => cycleFlag(st)}
          aria-label="Флаг"
          className={`flex h-7 w-7 items-center justify-center rounded-full ${FLAG_BG[effectiveFlag(st, today)]}`}
        >
          <Flag className="h-3.5 w-3.5 fill-white text-white" />
        </button>
      ),
    },
    {
      key: 'fullName',
      label: 'Имя',
      render: (st) => <span className="font-bold text-text">{st.fullName}</span>,
    },
    {
      key: 'phone',
      label: 'Телефон',
      render: (st) => (
        <a href={`tel:+${st.phone}`} className="text-link">
          {formatPhone(st.phone)}
        </a>
      ),
    },
    {
      key: 'balance',
      label: 'Баланс',
      render: (st) => <span className="text-danger">{formatMoney(st.balance)}</span>,
    },
    {
      key: 'group',
      label: 'Группа',
      render: (st) => <Badge variant="group-code">{st.groupCode}</Badge>,
    },
    {
      key: 'comment',
      label: 'Комментарий',
      render: (st) => {
        const text = latestCommentByStudent.get(st.id);
        return (
          <button
            type="button"
            onClick={() => setCommentTarget(st)}
            className="flex max-w-[220px] items-center gap-1.5 text-left text-muted hover:text-navy"
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="truncate text-[14px]">{text || '—'}</span>
          </button>
        );
      },
    },
    {
      key: '__actions',
      label: '',
      width: '40px',
      render: (st) => (
        <button type="button" onClick={() => setTaskTarget(st)} aria-label="Задачи" className="text-muted hover:text-navy">
          <ListTodo className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <button type="button" onClick={() => setTeacherId(null)} className="mb-4 flex items-center gap-1 text-[15px] text-link">
        <ArrowLeft className="h-4 w-4" /> {structure[parity].get(teacherId)?.teacherName} — назад
      </button>

      {rows.length === 0 ? <EmptyState icon={Wallet} title="Должников нет" /> : <Table columns={columns} rows={rows} />}

      <CommentsModal student={commentTarget} onClose={() => setCommentTarget(null)} />
      <TaskListModal student={taskTarget} onClose={() => setTaskTarget(null)} />
    </div>
  );
}
