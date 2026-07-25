import { Construction } from 'lucide-react';
import { EmptyState } from './ui/EmptyState.jsx';

/**
 * Заглушка страницы, которая ещё не реализована по «06 · План разработки».
 * @param {Object} props
 * @param {string} props.phase напр. "Фаза 3"
 */
export function PagePlaceholder({ phase }) {
  return <EmptyState icon={Construction} title={`Раздел появится в ${phase}`} />;
}
