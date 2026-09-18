import { Badge } from './Badge.jsx';

/**
 * Ячейка сетки посещаемости, 05 · Дизайн-система.
 * Состояния: Был/Нет (бейдж), пусто-не-отмечено (кликабельно), будущий урок
 * (круг, disabled). Вне периода обучения студента — родитель просто не
 * рендерит ячейку вообще (return null на его стороне), сюда такое не передаём.
 * `muted` — день из ПРЕЖНЕЙ группы студента (см. AttendanceTab.jsx
 * resolveCell): та же Был/Нет-отметка, но серым и некликабельно — своя
 * группа тут ни при чём, редактировать чужой урок отсюда нельзя.
 * @param {Object} props
 * @param {'present'|'absent'|null} props.status
 * @param {boolean} [props.future] урок в будущем (не сегодня) — не кликабельно
 * @param {boolean} [props.muted] день учёбы в прежней группе — серым, не кликабельно
 * @param {() => void} [props.onClick]
 */
export function AttendanceCell({ status, future = false, muted = false, onClick }) {
  if (status === 'present') {
    return (
      <button
        type="button"
        onClick={muted ? undefined : onClick}
        disabled={muted}
        className={`mx-auto flex h-8 w-14 items-center justify-center ${muted ? 'cursor-default' : ''}`}
      >
        <Badge variant={muted ? 'attendance-present-muted' : 'attendance-present'}>Был</Badge>
      </button>
    );
  }

  if (status === 'absent') {
    return (
      <button
        type="button"
        onClick={muted ? undefined : onClick}
        disabled={muted}
        className={`mx-auto flex h-8 w-14 items-center justify-center ${muted ? 'cursor-default' : ''}`}
      >
        <Badge variant={muted ? 'attendance-absent-muted' : 'attendance-absent'}>Нет</Badge>
      </button>
    );
  }

  if (future) {
    return <span className="mx-auto block h-8 w-8 rounded-full border border-border-strong" aria-hidden="true" />;
  }

  if (muted) {
    return <span className="mx-auto block h-8 w-8 rounded-full border border-border-strong opacity-40" aria-hidden="true" />;
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
