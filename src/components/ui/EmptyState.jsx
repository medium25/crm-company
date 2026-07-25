import { Button } from './Button.jsx';

/**
 * @param {Object} props
 * @param {import('react').ComponentType} props.icon иконка из lucide-react
 * @param {string} props.title напр. «Пока нет ни одной группы»
 * @param {string} [props.subtitle] напр. «Добавьте первого студента»
 * @param {string} [props.actionLabel]
 * @param {() => void} [props.onAction]
 */
export function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      {Icon && <Icon className="mb-2 h-12 w-12 text-muted" />}
      <p className="text-[17px] font-bold text-text">{title}</p>
      {subtitle && <p className="text-[15px] text-muted">{subtitle}</p>}
      {actionLabel && onAction && (
        <Button className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
