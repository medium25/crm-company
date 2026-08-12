import { useState } from 'react';
import { collection, doc, orderBy, query, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Users, Plus, Link as LinkIcon } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useRole } from '../../hooks/useRole.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Table } from '../ui/Table.jsx';
import { Select } from '../ui/Select.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { SkeletonRow } from '../ui/Skeleton.jsx';
import { Badge } from '../ui/Badge.jsx';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { AddStaffModal } from './AddStaffModal.jsx';
import { formatPhone } from '../../lib/format.js';
import { PALETTE } from '../../lib/colors.js';
import { ROLE_OPTIONS, assignableRoleOptions } from '../../lib/roles.js';

const LOGIN_URL = `${window.location.origin}${window.location.pathname}#/login`;

// Модуль грузится один раз — стабильная ссылка достаточна, useMemo тут не нужен.
const staffQuery = db ? query(collection(db, 'staff'), orderBy('fullName')) : null;

export function StaffSettingsTab() {
  const { user } = useAuth();
  const { role: callerRole } = useRole();
  const { showToast } = useToast();
  const { data: staffList, loading, error } = useCollection(staffQuery);
  const [modalMember, setModalMember] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleColorChange = async (member, color) => {
    try {
      await updateDoc(doc(db, 'staff', member.id), { color, updatedAt: serverTimestamp(), updatedBy: user.uid });
      showToast('Цвет обновлён.');
    } catch {
      showToast('Не удалось изменить цвет.', { type: 'error' });
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'staff', deleteTarget.id));
      showToast('Сотрудник удалён.');
      setDeleteTarget(null);
    } catch {
      showToast('Не удалось удалить сотрудника.', { type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const addButton = (
    <div className="mb-4 flex items-center justify-end">
      <Button onClick={() => setModalMember({})}>
        <Plus className="h-4 w-4" /> Добавить сотрудника
      </Button>
    </div>
  );

  const modal = <AddStaffModal member={modalMember} onClose={() => setModalMember(null)} />;

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
          <div className="text-[13px] text-muted">{m.phone ? formatPhone(m.phone) : m.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Роль',
      render: (m) => {
        // Админ не назначает роли выше «Учитель» — ни новым, ни уже
        // заведённым не-учителям (см. lib/roles.js + firestore.rules).
        const locked = callerRole === 'admin' && m.role !== 'teacher';
        return (
          <Select
            options={locked ? ROLE_OPTIONS : assignableRoleOptions(callerRole)}
            value={m.role}
            onChange={(e) => handleRoleChange(m, e.target.value)}
            disabled={locked}
            title={locked ? 'Администратор не может менять роль этого сотрудника' : undefined}
          />
        );
      },
    },
    {
      key: 'color',
      label: 'Цвет',
      render: (m) => {
        // Тот же расклад прав, что у 'role'/'__actions' выше: admin не
        // может трогать документы не-учителей (firestore.rules — update на
        // staff требует role()!='admin' ИЛИ resource.role=='teacher').
        const locked = callerRole === 'admin' && m.role !== 'teacher';
        return (
          <div className="flex gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                disabled={locked}
                title={locked ? 'Администратор не может менять цвет этого сотрудника' : undefined}
                onClick={() => handleColorChange(m, c)}
                className={`h-6 w-6 shrink-0 rounded-full disabled:cursor-not-allowed disabled:opacity-40 ${
                  m.color === c ? 'ring-2 ring-navy ring-offset-1' : ''
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        );
      },
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
    {
      key: '__actions',
      label: '',
      render: (m) => {
        const editLocked = callerRole === 'admin' && m.role !== 'teacher';
        return (
          <DropdownMenu
            items={[
              {
                label: 'Редактировать',
                onClick: () => setModalMember(m),
                disabled: editLocked,
                title: editLocked ? 'Администратор не может редактировать этого сотрудника' : undefined,
              },
              {
                label: 'Удалить',
                onClick: () => setDeleteTarget(m),
                danger: true,
                disabled: m.id === user.uid,
                title: m.id === user.uid ? 'Нельзя удалить свой же аккаунт' : undefined,
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <>
      {addButton}
      <Table columns={columns} rows={staffList} />
      {modal}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Удалить сотрудника"
        message={`Удалить «${deleteTarget?.fullName}»? Доступ в CRM пропадёт сразу. Firebase Auth-аккаунт (логин/пароль) не удаляется — просто перестаёт пускать в приложение без staff-документа.`}
        confirmLabel="Удалить"
      />
    </>
  );
}
