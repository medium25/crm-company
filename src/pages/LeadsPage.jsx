import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, query, where, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { DeclineLeadModal } from '../components/students/DeclineLeadModal.jsx';
import { CallLogModal } from '../components/students/CallLogModal.jsx';
import { formatPhone, formatDate } from '../lib/format.js';

const STAGE_ORDER = ['today', 'tomorrow', 'next_week', 'later'];
const STAGE_LABEL = { today: 'Сегодня', tomorrow: 'Следующий день', next_week: 'На следующей неделе', later: 'В будущем' };
const RESULT_LABEL = { came: 'Пришли', not_came: 'Не пришли' };
const STATUS_BADGE = {
  lead: { variant: 'type-system', label: 'Лид' },
  trial: { variant: 'status-active', label: 'Пробный' },
};

function initials(fullName) {
  return (fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function LeadCard({ lead, onOpen, onCall, onEdit, onDecline, onMarkTrial, onSetStage, onSetResult, onReturnToWork }) {
  const items = [
    { label: 'Позвонить', onClick: () => onCall(lead) },
    ...(lead.status === 'lead' ? [{ label: 'Записать на пробный', onClick: () => onMarkTrial(lead) }] : []),
    ...(lead.leadResult
      ? [{ label: 'Вернуть в работу', onClick: () => onReturnToWork(lead) }]
      : [
          ...STAGE_ORDER.filter((s) => s !== (lead.leadStage ?? 'today')).map((stage) => ({
            label: `Перенести: ${STAGE_LABEL[stage]}`,
            onClick: () => onSetStage(lead, stage),
          })),
          ...(lead.status === 'trial'
            ? [
                { label: 'Пришли', onClick: () => onSetResult(lead, 'came') },
                { label: 'Не пришли', onClick: () => onSetResult(lead, 'not_came') },
              ]
            : []),
        ]),
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    { label: 'Отказ', danger: true, onClick: () => onDecline(lead) },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className="flex cursor-pointer items-center gap-3 rounded-field border border-border bg-surface px-3 py-2.5 hover:bg-surface-alt"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[13px] font-bold text-muted">
        {initials(lead.fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-text">{lead.fullName}</p>
        <a
          href={`tel:+${lead.phone}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[13px] text-link"
        >
          {formatPhone(lead.phone)}
        </a>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={STATUS_BADGE[lead.status].variant}>{STATUS_BADGE[lead.status].label}</Badge>
        <span className="text-[12px] text-muted">{formatDate(lead.createdAt)}</span>
      </div>
      <span onClick={(e) => e.stopPropagation()}>
        <DropdownMenu items={items} />
      </span>
    </div>
  );
}

function LeadSection({ title, leads, onAdd, ...actions }) {
  return (
    <div className="rounded-card bg-surface-alt">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[15px] font-bold text-text">{title}</span>
        <span className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-muted">{leads.length}</span>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Добавить лида: ${title}`}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text"
          >
            <Plus className="h-4 w-4" />
          </button>
        </span>
      </div>
      <div className="space-y-2 border-t border-border px-3 py-3">
        {leads.length === 0 ? (
          <p className="py-4 text-center text-[14px] text-muted">Пусто</p>
        ) : (
          leads.map((lead) => <LeadCard key={lead.id} lead={lead} {...actions} />)
        )}
      </div>
    </div>
  );
}

/**
 * Заявки — лиды и пробные (`students` с `status` in [lead, trial]).
 * «Записи» — ещё не отработанные, разложены по `leadStage` (переносится
 * вручную через меню карточки — аналог «Move to other section» старой
 * системы). «Результаты» — отработанные, по `leadResult` (Пришли/Не пришли,
 * тоже вручную). Клик по карточке — на `/students/:id` (там же полная
 * карточка: комментарии/история/звонки, замена Details/History старой
 * системы).
 */
export function LeadsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('isArchived', '==', false),
            where('status', 'in', ['lead', 'trial']),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [activeBranchId],
  );
  const { data: leads } = useCollection(leadsQuery);

  const [formLead, setFormLead] = useState(null);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [callTarget, setCallTarget] = useState(null);

  const byStage = useMemo(() => {
    const map = { today: [], tomorrow: [], next_week: [], later: [] };
    for (const lead of leads) {
      if (lead.leadResult) continue;
      const stage = STAGE_ORDER.includes(lead.leadStage) ? lead.leadStage : 'today';
      map[stage].push(lead);
    }
    return map;
  }, [leads]);

  const byResult = useMemo(() => {
    const map = { came: [], not_came: [] };
    for (const lead of leads) {
      if (lead.leadResult === 'came' || lead.leadResult === 'not_came') map[lead.leadResult].push(lead);
    }
    return map;
  }, [leads]);

  const patch = async (lead, data, okMessage) => {
    try {
      await updateDoc(doc(db, 'students', lead.id), { ...data, updatedAt: serverTimestamp() });
      if (okMessage) showToast(okMessage);
    } catch {
      showToast('Не удалось обновить лид.', { type: 'error' });
    }
  };

  const openAddForm = (target) => {
    setPendingTarget(target);
    setFormLead({});
  };

  const handleCreated = async (id) => {
    if (!pendingTarget) return;
    const data = pendingTarget.stage ? { leadStage: pendingTarget.stage } : { leadResult: pendingTarget.result };
    setPendingTarget(null);
    if (Object.values(data)[0] === 'today') return;
    try {
      await updateDoc(doc(db, 'students', id), { ...data, updatedAt: serverTimestamp() });
    } catch {
      showToast('Не удалось определить лида в раздел.', { type: 'error' });
    }
  };

  const actions = {
    onOpen: (lead) => navigate(`/students/${lead.id}`),
    onCall: (lead) => setCallTarget(lead),
    onEdit: (lead) => setFormLead(lead),
    onDecline: (lead) => setDeclineTarget(lead),
    onMarkTrial: (lead) => patch(lead, { status: 'trial', trialAt: serverTimestamp() }, `${lead.fullName} записан(а) на пробный.`),
    onSetStage: (lead, stage) => patch(lead, { leadStage: stage }),
    onSetResult: (lead, result) => patch(lead, { leadResult: result }, result === 'came' ? 'Отмечено: пришли.' : 'Отмечено: не пришли.'),
    onReturnToWork: (lead) => patch(lead, { leadResult: null, leadStage: 'today' }, 'Возвращено в работу.'),
  };

  return (
    <>
      <PageHeader
        title="Заявки"
        actions={
          <Button onClick={() => setFormLead({})}>
            <Plus className="h-4 w-4" /> Добавить лида
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-card border border-border p-4">
          <h2 className="mb-4 text-center text-[15px] font-bold text-text">Записи</h2>
          <div className="space-y-4">
            {STAGE_ORDER.map((stage) => (
              <LeadSection
                key={stage}
                title={STAGE_LABEL[stage]}
                leads={byStage[stage]}
                onAdd={() => openAddForm({ stage })}
                {...actions}
              />
            ))}
          </div>
        </div>
        <div className="rounded-card border border-border p-4">
          <h2 className="mb-4 text-center text-[15px] font-bold text-text">Результаты</h2>
          <div className="space-y-4">
            {['came', 'not_came'].map((result) => (
              <LeadSection
                key={result}
                title={RESULT_LABEL[result]}
                leads={byResult[result]}
                onAdd={() => openAddForm({ result })}
                {...actions}
              />
            ))}
          </div>
        </div>
      </div>

      <StudentFormModal
        student={formLead}
        onClose={() => {
          setFormLead(null);
          setPendingTarget(null);
        }}
        onCreated={handleCreated}
      />
      <DeclineLeadModal lead={declineTarget} onClose={() => setDeclineTarget(null)} />
      <CallLogModal open={Boolean(callTarget)} studentId={callTarget?.id} onClose={() => setCallTarget(null)} />
    </>
  );
}
