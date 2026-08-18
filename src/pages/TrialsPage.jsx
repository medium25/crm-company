// src/pages/TrialsPage.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { TrialLeadCard } from '../components/leads/TrialLeadCard.jsx';
import { groupLeadsByTrialDay } from '../components/leads/LeadColumn.jsx';
import { AddToGroupModal } from '../components/students/AddToGroupModal.jsx';

/** Свёрнутая/развёрнутая секция карточек — та же идея, что LeadGroup на «Заявки». */
function TrialGroup({ title, leads, operatorByUid, onOpen, onCreateStudent }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-field border border-border bg-surface-alt">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-text">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
          {title}
        </span>
        <span className="text-[12px] font-bold text-muted">{leads.length}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {leads.length === 0 ? (
            <p className="col-span-full py-2 text-center text-[13px] text-muted">Пусто</p>
          ) : (
            leads.map((lead) => {
              const op = operatorByUid.get(lead.assignedOperator);
              return (
                <TrialLeadCard
                  key={lead.id}
                  lead={lead}
                  operatorColor={op?.color}
                  operatorName={op?.name}
                  onOpen={onOpen}
                  onCreateStudent={onCreateStudent}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * «Пробные» — все лиды на стадии «Пробный назначен» (см. columns.js),
 * от всех операторов сразу, без операторских действий. Единственное
 * действие — «Создать студента» (AddToGroupModal), после чего лид у
 * оператора на «Заявки» переходит в «Пробный проведён».
 */
export function TrialsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('isArchived', '==', false),
            where('funnelStage', '==', 'trial_scheduled'),
          )
        : null,
    [activeBranchId],
  );
  const { data: rawLeads } = useCollection(leadsQuery);

  const leads = useMemo(
    () => [...rawLeads].sort((a, b) => (a.trialDate?.toMillis?.() ?? 0) - (b.trialDate?.toMillis?.() ?? 0)),
    [rawLeads],
  );

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

  const [createStudentTarget, setCreateStudentTarget] = useState(null);
  const groups = useMemo(() => groupLeadsByTrialDay(leads), [leads]);

  return (
    <div>
      <PageHeader title="Пробные" count={leads.length} />
      <div className="flex flex-col gap-3">
        <TrialGroup
          title="Сегодня"
          leads={groups.today}
          operatorByUid={operatorByUid}
          onOpen={(lead) => navigate(`/students/${lead.id}`)}
          onCreateStudent={setCreateStudentTarget}
        />
        <TrialGroup
          title="Завтра"
          leads={groups.tomorrow}
          operatorByUid={operatorByUid}
          onOpen={(lead) => navigate(`/students/${lead.id}`)}
          onCreateStudent={setCreateStudentTarget}
        />
        <TrialGroup
          title="Другой день"
          leads={groups.other}
          operatorByUid={operatorByUid}
          onOpen={(lead) => navigate(`/students/${lead.id}`)}
          onCreateStudent={setCreateStudentTarget}
        />
      </div>

      <AddToGroupModal open={Boolean(createStudentTarget)} student={createStudentTarget} onClose={() => setCreateStudentTarget(null)} />
    </div>
  );
}
