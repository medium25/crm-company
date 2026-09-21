import { taskSnapshot } from './leadTasks.js';
import { unreachableCallDueAt } from './leadFunnel.js';

/**
 * Касание на стадии «Пробный назначен» — «Неуспешно» (не дозвонились) или «Перенос»
 * (перенести пробное, один раз). Общее для доски «Заявки» и страницы «Пробные», чтобы
 * карточки вели себя одинаково. Задача (DeadlineModal) обязательна на каждой попытке;
 * сама запись — только в onConfirm, после того как оператор задачу подтвердил.
 * `onRescheduleCb` вызывается ПОСЛЕ сохранения задачи — иначе форма переноса пробного
 * открылась бы поверх ещё не закрытой DeadlineModal.
 * @param {Object} args
 * @param {Object} args.lead
 * @param {'reschedule'|'fail'} args.result
 * @param {() => void} [args.onRescheduleCb]
 * @param {{uid: string}} args.user
 * @param {(lead: Object, data: Object) => Promise<void>|void} args.patch запись полей лида
 * @param {(target: Object) => void} args.setDeadlineTarget открыть DeadlineModal
 */
export function markTrialUnreachable({ lead, result, onRescheduleCb, user, patch, setDeadlineTarget }) {
  const snapshot = taskSnapshot(lead);
  // expectedBy — дедлайн, действовавший до этой попытки (нужен разбору отклонений при отказе).
  const expectedBy = lead.unreachableNextCallDueAt ?? null;
  const priorAttempts = lead.unreachableAttempts ?? [];
  const buildAttempts = (outcome, nextStep) => [...priorAttempts, { result, at: new Date(), expectedBy, outcome, nextStep, by: user.uid, ...snapshot }];
  const attemptsExhausted = priorAttempts.length + 1 >= 3;

  if (result === 'reschedule') {
    setDeadlineTarget({
      lead,
      title: 'Задача — перенос пробного',
      suggestedDate: unreachableCallDueAt(),
      requireTask: true,
      onConfirm: async (dueDate, outcome, nextStep) => {
        await patch(lead, { unreachableAttempts: buildAttempts(outcome, nextStep), unreachableNextCallDueAt: dueDate });
        onRescheduleCb?.();
      },
    });
    return;
  }
  setDeadlineTarget({
    lead,
    title: attemptsExhausted ? 'Дедлайн следующего звонка' : 'Следующая задача:',
    suggestedDate: unreachableCallDueAt(),
    requireTask: true,
    onConfirm: (dueDate, outcome, nextStep) =>
      patch(lead, { unreachableAttempts: buildAttempts(outcome, nextStep), unreachableNextCallDueAt: dueDate }),
  });
}
