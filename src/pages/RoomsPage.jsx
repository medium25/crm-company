import { useMemo, useState } from 'react';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp, orderBy } from 'firebase/firestore';
import { Plus, Pencil, Archive, DoorOpen } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { SkeletonRow } from '../components/ui/Skeleton.jsx';

const EMPTY_FORM = { name: '', capacity: '' };

export function RoomsPage() {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const roomsQuery = useMemo(() => {
    if (!db || !activeBranchId) return null;
    return query(collection(db, 'rooms'), where('branchId', '==', activeBranchId), orderBy('name'));
  }, [activeBranchId]);
  const { data: allRooms, loading, error } = useCollection(roomsQuery);

  const [showArchived, setShowArchived] = useState(false);
  const [modalRoom, setModalRoom] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const rooms = useMemo(
    () => allRooms.filter((r) => Boolean(r.isArchived) === showArchived),
    [allRooms, showArchived],
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalRoom({});
  };

  const openEdit = (room) => {
    setForm({ name: room.name, capacity: String(room.capacity) });
    setModalRoom(room);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        capacity: Number(form.capacity),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };
      if (modalRoom?.id) {
        await updateDoc(doc(db, 'rooms', modalRoom.id), payload);
        showToast('Кабинет обновлён.');
      } else {
        await addDoc(collection(db, 'rooms'), {
          ...payload,
          branchId: activeBranchId,
          isArchived: false,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
        showToast('Кабинет добавлен.');
      }
      setModalRoom(null);
    } catch {
      showToast('Не удалось сохранить кабинет.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const requestArchive = async (room) => {
    const usedByGroups = await getDocs(
      query(collection(db, 'groups'), where('roomId', '==', room.id), where('isArchived', '==', false)),
    );
    if (!usedByGroups.empty) {
      const codes = usedByGroups.docs.map((d) => d.data().code).join(', ');
      showToast(`Нельзя архивировать — используется в группах: ${codes}`, { type: 'error' });
      return;
    }
    setArchiveTarget(room);
  };

  const confirmArchive = async () => {
    setArchiving(true);
    try {
      await updateDoc(doc(db, 'rooms', archiveTarget.id), {
        isArchived: true,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast('Кабинет перенесён в архив.');
      setArchiveTarget(null);
    } catch {
      showToast('Не удалось архивировать кабинет.', { type: 'error' });
    } finally {
      setArchiving(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Название', render: (r) => <span className="font-bold">{r.name}</span> },
    { key: 'capacity', label: 'Вместимость', render: (r) => `${r.capacity} чел.` },
    {
      key: 'actions',
      label: '',
      render: (r) =>
        !showArchived && (
          <span className="flex justify-end gap-2">
            <Button variant="icon-round" tone="navy" onClick={() => openEdit(r)} aria-label="Редактировать">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="icon-round" tone="danger" onClick={() => requestArchive(r)} aria-label="Архивировать">
              <Archive className="h-4 w-4" />
            </Button>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Кабинеты"
        count={rooms.length}
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Показать действующие' : 'Показать архивные'}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          </>
        }
      />

      {loading && (
        <div className="flex flex-col gap-2">
          <SkeletonRow columns={2} />
          <SkeletonRow columns={2} />
        </div>
      )}

      {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

      {!loading && !error && rooms.length === 0 && (
        <EmptyState
          icon={DoorOpen}
          title={showArchived ? 'Архив пуст' : 'Пока нет ни одного кабинета'}
          actionLabel={showArchived ? undefined : 'Добавить кабинет'}
          onAction={showArchived ? undefined : openCreate}
        />
      )}

      {!loading && !error && rooms.length > 0 && <Table columns={columns} rows={rooms} />}

      <Modal
        open={Boolean(modalRoom)}
        onClose={() => setModalRoom(null)}
        title={modalRoom?.id ? 'Редактировать кабинет' : 'Добавить кабинет'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalRoom(null)}>
              Отмена
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Название"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Вместимость"
            type="number"
            min="1"
            required
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        loading={archiving}
        title="Архивировать кабинет"
        message={`Архивировать кабинет «${archiveTarget?.name}»? Он пропадёт из списков, история останется.`}
        confirmLabel="Архивировать"
      />
    </>
  );
}
