import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Единая кнопка «назад»: светлая пилюля со стрелкой и подписью. Везде, где экран возвращает
 * на уровень выше (раздел → список, карточка → список, месяц → месяцы). Либо `to` (ссылка), либо `onClick`.
 * @param {Object} props
 * @param {string} [props.to]
 * @param {() => void} [props.onClick]
 * @param {string} [props.className] внешние отступы/позиционирование, напр. «mb-4»
 * @param {import('react').ReactNode} props.children подпись
 */
export function BackButton({ to, onClick, className = '', children }) {
  const cls = `inline-flex items-center gap-1.5 rounded-badge bg-chip py-1.5 pl-2.5 pr-3.5 text-small font-bold text-text transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 ${className}`;
  const content = (
    <>
      <ArrowLeft className="h-4 w-4 text-navy" aria-hidden="true" />
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}
