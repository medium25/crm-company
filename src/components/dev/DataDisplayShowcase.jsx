import { useState } from 'react';
import { Users, GraduationCap, Layers, AlertTriangle, Handshake, UserX } from 'lucide-react';
import { StatCard } from '../ui/StatCard.jsx';
import { Card } from '../ui/Card.jsx';
import { Tabs } from '../ui/Tabs.jsx';
import { Table } from '../ui/Table.jsx';
import { Badge } from '../ui/Badge.jsx';
import { AttendanceCell } from '../ui/AttendanceCell.jsx';

const KPI = [
  { icon: Users, label: 'Активные лиды', value: 54 },
  { icon: GraduationCap, label: 'Активные студенты', value: 149 },
  { icon: Layers, label: 'Группы', value: 29 },
  { icon: AlertTriangle, label: 'Должники', value: 16 },
  { icon: Handshake, label: 'Оплатили в текущем месяце', value: 134 },
  { icon: UserX, label: 'Ушли из активной группы', value: 53 },
];

const ROWS = [
  { id: '1', code: 'I14', course: 'INGLIZ TILI', teacher: 'MR SANJAR', students: 6 },
  { id: '2', code: 'R30', course: 'RUS TILI', teacher: 'MS ZIYODA (BETA)', students: 6 },
  { id: '3', code: 'MINI 1', course: 'RUS TILI', teacher: 'MS KRISTINA', students: 3 },
];

const COLUMNS = [
  { key: 'code', label: 'Группа', sortable: true, render: (r) => <Badge variant="group-code">{r.code}</Badge> },
  { key: 'course', label: 'Курс', sortable: true },
  { key: 'teacher', label: 'Учитель', sortable: true },
  { key: 'students', label: 'Студентов', sortable: true },
];

export function DataDisplayShowcase() {
  const [tab, setTab] = useState('attendance');
  const [sortKey, setSortKey] = useState('code');
  const [sortDir, setSortDir] = useState('asc');
  const [demoStatus, setDemoStatus] = useState(null);

  const rows = [...ROWS].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return a[sortKey] > b[sortKey] ? dir : -dir;
  });

  const onSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">StatCard — KPI</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {KPI.map((k) => (
            <StatCard key={k.label} {...k} onClick={() => {}} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">Card</h3>
        <Card hoverable className="max-w-sm">
          Обычная белая карточка с тенью, hover — тень усиливается.
        </Card>
      </div>

      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">Tabs</h3>
        <Tabs
          tabs={[
            { key: 'attendance', label: 'Посещаемость' },
            { key: 'pricing', label: 'Цены со скидкой' },
            { key: 'comments', label: 'Комментарии' },
          ]}
          activeKey={tab}
          onChange={setTab}
        />
      </div>

      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">Table (строки-карточки, сортировка)</h3>
        <Table columns={COLUMNS} rows={rows} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      </div>

      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">AttendanceCell — все состояния</h3>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <AttendanceCell status="present" onClick={() => {}} />
            <span className="text-[13px] text-muted">Был</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <AttendanceCell status="absent" onClick={() => {}} />
            <span className="text-[13px] text-muted">Нет</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <AttendanceCell status={null} onClick={() => {}} />
            <span className="text-[13px] text-muted">Не отмечено</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <AttendanceCell status={null} future onClick={() => {}} />
            <span className="text-[13px] text-muted">Будущий урок</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <AttendanceCell status={demoStatus} onClick={() => setDemoStatus((s) => (s === null ? 'present' : s === 'present' ? 'absent' : null))} />
            <span className="text-[13px] text-muted">Кликни — цикл</span>
          </div>
        </div>
      </div>
    </div>
  );
}
