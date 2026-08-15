import { useEffect, useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { NON_TERMINAL_STAGES, reassignLeadsToOperator } from '../../lib/leadFunnel.js';
import { withStageOverrides } from '../leads/columns.js';
import { formatPhone } from '../../lib/format.js';

/**
 * Активные лиды оператора, сгруппированные по стадии воронки, с выбором и
 * переводом другому оператору. Разворачивается под таблицей операторов в
 * LeadAssignmentTab при клике на стрелку строки.
 * @param {Object} props
 * @param {{id: string, fullName: string}} props.operator оператор-источник
 * @param {Array<{id: string, fullName: string}>} props.operators все операторы для выбора получателя (источник исключается внутри)
 * @param {Record<string, {label?: string, color?: string}>} [props.stageOverrides]
 * @param {() => void} props.onClose
 * @param {() => void} [props.onTransferred] вызывается после успешного перевода — родитель пересчитывает счётчики «Сейчас лидов»
 */
export function OperatorLeadsPanel({ operator, operators, stageOverrides, onClose, onTransferred }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('assignedOperator', '==', operator.id),
            where('funnelStage', 'in', NON_TERMINAL_STAGES),
          )
        : null,
    [operator.id, activeBranchId],
  );
  const { data: leads, loading } = useCollection(leadsQuery);

  const [selected, setSelected] = useState(() => new Set());
  const [targetId, setTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setTargetId('');
  }, [operator.id]);

  const stages = useMemo(
    () => withStageOverrides(stageOverrides).filter((c) => NON_TERMINAL_STAGES.includes(c.key)),
    [stageOverrides],
  );

  const groups = stages
    .map((stage) => ({ stage, leads: leads.filter((l) => (l.funnelStage ?? 'new') === stage.key) }))
    .filter((g) => g.leads.length > 0);

  const toggleLead = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (groupLeads) => {
    const ids = groupLeads.map((l) => l.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const targetOptions = operators.filter((op) => op.id !== operator.id);

  const handleTransfer = async () => {
    if (selected.size === 0 || !targetId) return;
    setTransferring(true);
    try {
      await reassignLeadsToOperator(db, Array.from(selected), targetId, user);
      showToast(`Переведено лидов: ${selected.size}.`);
      onTransferred?.();
      onClose();
    } catch {
      showToast('Не удалось перевести лиды.', { type: 'error' });
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="mt-2 rounded-2xl border border-border bg-surface-alt p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-text">Активные лиды: {operator.fullName}</h3>
        <button type="button" onClick={onClose} className="text-[13px] text-muted hover:text-navy">
          Свернуть
        </button>
      </div>

      {loading ? (
        <p className="text-[15px] text-muted">Загрузка…</p>
      ) : groups.length === 0 ? (
        <p className="text-[15px] text-muted">У оператора нет активных лидов.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ stage, leads: groupLeads }) => {
            const allSelected = groupLeads.every((l) => selected.has(l.id));
            return (
              <div key={stage.key}>
                <label className="mb-1.5 flex items-center gap-2 text-[13px] font-bold text-muted">
                  <input type="checkbox" checked={allSelected} onChange={() => toggleGroup(groupLeads)} />
                  {stage.label} ({groupLeads.length})
                </label>
                <div className="flex flex-col gap-1">
                  {groupLeads.map((lead) => (
                    <label
                      key={lead.id}
                      className="flex items-center gap-2 rounded-field px-2 py-1 text-[15px] text-text hover:bg-surface"
                    >
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleLead(lead.id)} />
                      {lead.fullName} <span className="text-muted">· {formatPhone(lead.phone)}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <div className="w-64">
          <Select
            options={[{ value: '', label: 'Кому перевести' }, ...targetOptions.map((op) => ({ value: op.id, label: op.fullName }))]}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          />
        </div>
        <Button onClick={handleTransfer} loading={transferring} disabled={selected.size === 0 || !targetId}>
          Перевести выбранных ({selected.size})
        </Button>
      </div>
    </div>
  );
}
