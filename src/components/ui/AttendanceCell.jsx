import { Badge } from './Badge.jsx';

/**
 * Ячейка сетки посещаемости, 05 · Дизайн-система.
 * Состояния: Был/Нет (бейдж), пусто-не-отмечено (кликабельно), будущий урок
 * (круг, disabled). Вне периода обучения студента — родитель просто не
 * рендерит ячейку вообще (return null на его стороне), сюда такое не передаём.
 * @param {Object} props
 * @param {'present'|'absent'|null} props.status
 * @param {boolean} [props.future] урок в будущем (не сегодня) — не кликабельно
 * @param {() => void} [props.onClick]
 */
export function AttendanceCell({ status, future = false, onClick }) {
  if (status === 'present') {
    return (
      <button type="button" onClick={onClick} className="mx-auto flex h-8 w-14 items-center justify-center">
        <Badge variant="attendance-present">Был</Badge>
      </button>
    );
  }

  if (status === 'absent') {
    return (
      <button type="button" onClick={onClick} className="mx-auto flex h-8 w-14 items-center justify-center">
        <Badge variant="attendance-absent">Нет</Badge>
      </button>
    );
  }

  if (future) {
    return <span className="mx-auto block h-8 w-8 rounded-full border border-border-strong" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Отметить посещаемость"
      className="mx-auto block h-8 w-14 rounded-badge border border-border-strong bg-transparent hover:bg-surface-alt"
    />
  );
}
