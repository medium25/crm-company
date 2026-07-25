import { collection, doc, orderBy, query, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Users } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Table } from '../ui/Table.jsx';
import { Select } from '../ui/Select.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { SkeletonRow } from '../ui/Skeleton.jsx';
import { Badge } from '../ui/Badge.jsx';

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Владелец' },
  { value: 'admin', label: 'Администратор' },
  { value: 'teacher', label: 'Учитель' },
  { value: 'accountant', label: 'Бухгалтер' },
];

// Модуль грузится один раз — стабильная ссылка достаточна, useMemo тут не нужен.
const staffQuery = db ? query(collection(db, 'staff'), orderBy('fullName')) : null;

export function StaffSettingsTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: staffList, loading, error } = useCollection(staffQuery);

  const handleRoleChange = async (member, role) => {
    try {
      await updateDoc(doc(db, 'staff', member.id), { role, updatedAt: serverTimestamp(), updatedBy: user.uid });
      showToast('Роль обновлена.');
    } catch {
      showToast('Не удалось изменить роль.', { type: 'error' });
    }
  };

  const handleToggleActive = async (member) => {
    try {
      await updateDoc(doc(db, 'staff', member.id), {
        isActive: !member.isActive,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast(member.isActive ? 'Сотрудник деактивирован.' : 'Сотрудник активирован.');
    } catch {
      showToast('Не удалось изменить статус.', { type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <SkeletonRow columns={4} />
        <SkeletonRow columns={4} />
      </div>
    );
  }

  if (error) return <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>;

  if (staffList.length === 0) {
    return <EmptyState icon={Users} title="Пока нет ни одного сотрудника" />;
  }

  const columns = [
    {
      key: 'fullName',
      label: 'Сотрудник',
      render: (m) => (
        <div>
          <div className="font-bold">{m.fullName}</div>
          <div className="text-[13px] text-muted">{m.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Роль',
      render: (m) => (
        <Select
          options={ROLE_OPTIONS}
          value={m.role}
          onChange={(e) => handleRoleChange(m, e.target.value)}
          disabled={m.id === user.uid}
        />
      ),
    },
    {
      key: 'isActive',
      label: 'Статус',
      render: (m) => (
        <button type="button" onClick={() => handleToggleActive(m)} disabled={m.id === user.uid}>
          <Badge variant={m.isActive ? 'status-active' : 'type-system'}>
            {m.isActive ? 'Активен' : 'Отключён'}
          </Badge>
        </button>
      ),
    },
  ];

  return <Table columns={columns} rows={staffList} />;
}
