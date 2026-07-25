import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '../ui/Input.jsx';
import { Select } from '../ui/Select.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

export function FormControlsShowcase() {
  const [search, setSearch] = useState('');

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Input label="Обычное поле" placeholder="Имя студента" />
      <Input
        label="С иконкой"
        leftIcon={Search}
        placeholder="Поиск"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Input label="С ошибкой" defaultValue="94 018 99 56" error="Неверный формат телефона" />
      <Input label="Disabled" defaultValue="890 000 UZS" disabled />

      <Select
        label="Select"
        options={[
          { value: 'ingliz', label: 'INGLIZ TILI' },
          { value: 'rus', label: 'RUS TILI' },
        ]}
      />
      <Select label="Select — ошибка" error="Выберите курс" options={[{ value: '', label: 'Выбрать' }]} />

      <DatePicker label="Дата начала" defaultValue="2026-07-24" />
      <DatePicker label="Дата — ошибка" error="Укажите дату" />
    </div>
  );
}
