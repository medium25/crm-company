import { useState } from 'react';
import { collection, doc, orderBy, query, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Users, Plus, Link as LinkIcon } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Table } from '../ui/Table.jsx';
import { Select } from '../ui/Select.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { SkeletonRow } from '../ui/Skeleton.jsx';
import { Badge } from '../ui/Badge.jsx';
import { AddStaffModal } from './AddStaffModal.jsx';

const ROLE_OPTIONS = [
  { value: 'ceo', label: 'CEO' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'admin', label: 'Администратор' },
  { value: 'teacher', label: 'Учитель' },
];

const LOGIN_URL = `${window.location.origin}${window.location.pathname}#/login`;

// Модуль грузится один раз — стабильная ссылка достаточна, useMemo тут не нужен.
const staffQuery = db ? query(collection(db, 'staff'), orderBy('fullName')) : null;

export function StaffSettingsTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: staffList, loading, error } = useCollection(staffQuery);
  const [addOpen, setAddOpen] = useState(false);

  const copyLoginLink = async () => {
    try {
      await navigator.clipboard.writeText(LOGIN_URL);
      showToast('Ссылка для входа скопирована.');
    } catch {
      showToast('Не удалось скопировать ссылку.', { type: 'error' });
    }
  };

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

  const addButton = (
    <div className="mb-4 flex items-center justify-end">
      <Button onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" /> Добавить сотрудника
      </Button>
    </div>
  );

  const modal = <AddStaffModal open={addOpen} onClose={() => setAddOpen(false)} />;

  if (loading) {
    return (
      <>
        {addButton}
        <div className="flex flex-col gap-2">
          <SkeletonRow columns={4} />
          <SkeletonRow columns={4} />
        </div>
        {modal}
      </>
    );
  }

  if (error) {
    return (
      <>
        {addButton}
        <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>
        {modal}
      </>
    );
  }

  if (staffList.length === 0) {
    return (
      <>
        {addButton}
        <EmptyState icon={Users} title="Пока нет ни одного сотрудника" />
        {modal}
      </>
    );
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
    {
      key: '__link',
      label: '',
      render: () => (
        <button type="button" onClick={copyLoginLink} className="text-muted hover:text-navy" aria-label="Скопировать ссылку для входа">
          <LinkIcon className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      {addButton}
      <Table columns={columns} rows={staffList} />
      {modal}
    </>
  );
}
