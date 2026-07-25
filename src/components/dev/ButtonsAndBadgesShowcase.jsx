import { useState } from 'react';
import { Plus, Pencil, Trash2, Mail, History } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';

export function ButtonsAndBadgesShowcase() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">Button — варианты × размеры</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Добавить</Button>
          <Button variant="secondary">Отмена</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Удалить</Button>
          <Button variant="primary" size="lg">
            Большая (lg)
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="primary" loading={loading} onClick={() => setLoading((v) => !v)}>
            {loading ? 'Загрузка…' : 'Кликни для loading'}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">Button — icon-round</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="icon-round" tone="navy" aria-label="Редактировать">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="icon-round" tone="danger" aria-label="Архивировать">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="icon-round" tone="warning" aria-label="SMS">
            <Mail className="h-4 w-4" />
          </Button>
          <Button variant="icon-round" tone="warning" aria-label="История">
            <History className="h-4 w-4" />
          </Button>
          <Button variant="icon-round" tone="navy" aria-label="Добавить">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">Badge — все варианты</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="status-active">Активен</Badge>
          <Badge variant="status-debt">−140 000 UZS</Badge>
          <Badge variant="type-system">система</Badge>
          <Badge variant="type-payment">оплата</Badge>
          <Badge variant="group-code">R30</Badge>
          <Badge variant="attendance-present">Был</Badge>
          <Badge variant="attendance-absent">Нет</Badge>
        </div>
      </div>
    </div>
  );
}
