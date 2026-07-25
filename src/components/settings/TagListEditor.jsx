import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '../ui/Input.jsx';
import { Button } from '../ui/Button.jsx';

/**
 * Редактор списка строк (источники лидов / причины ухода / праздники) —
 * добавить/удалить, сохраняет через `onChange(nextArray)`.
 * @param {Object} props
 * @param {string[]} props.items
 * @param {(next: string[]) => void} props.onChange
 * @param {string} [props.placeholder]
 */
export function TagListEditor({ items, onChange, placeholder = 'Добавить…' }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value || items.includes(value)) return;
    onChange([...items, value]);
    setDraft('');
  };

  const remove = (value) => onChange(items.filter((i) => i !== value));

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="flex items-center gap-1 rounded-full bg-surface-alt px-3 py-1 text-[13px] text-text">
            {item}
            <button type="button" onClick={() => remove(item)} aria-label={`Удалить ${item}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
