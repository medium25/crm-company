import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Card } from '../ui/Card.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { RoomScheduleView } from './RoomScheduleView.jsx';
import { DEFAULT_GROUP_CAPACITY, clampCapacity, nextRoomName } from '../../lib/roomSchedule.js';

/**
 * Новый блок «Расписание кабинетов» (под старым RoomScheduleGrid): подписки, фильтр по типу дней
 * и запись в Firestore — вместимость группы, название кабинета, добавление и архивация кабинета.
 * Само отображение — в RoomScheduleView.
 * @param {Object} props
 * @param {string} props.branchId
 */
export function RoomScheduleBoard({ branchId }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [dayType, setDayType] = useState('even');
  const [notice, setNotice] = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const groupsQuery = useMemo(
    () => (db && branchId ? query(collection(db, 'groups'), where('branchId', '==', branchId), where('isArchived', '==', false), where('status', '==', 'active')) : null),
    [branchId],
  );
  const { data: groups, loading: groupsLoading } = useCollection(groupsQuery);

  const roomsQuery = useMemo(
    () => (db && branchId ? query(collection(db, 'rooms'), where('branchId', '==', branchId), where('isArchived', '==', false), orderBy('name')) : null),
    [branchId],
  );
  const { data: rooms, loading: roomsLoading } = useCollection(roomsQuery);

  // В представление идут только группы, которые оно реально покажет: в загруженном кабинете, со временем, нужного типа дней.
  const viewGroups = useMemo(() => {
    const roomIds = new Set(rooms.map((r) => r.id));
    return groups.filter((g) => roomIds.has(g.roomId) && g.schedule?.time && g.schedule.type === dayType);
  }, [groups, rooms, dayType]);

  const handleDayTypeChange = (value) => {
    setNotice('');
    setDayType(value);
  };

  const handleChangeCapacity = async (groupId, capacity) => {
    setNotice('');
    try {
      await updateDoc(doc(db, 'groups', groupId), {
        capacity: clampCapacity(capacity),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    } catch {
      showToast('Не удалось изменить вместимость группы.', { type: 'error' });
    }
  };

  const handleRenameRoom = async (roomId, name) => {
    setNotice('');
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        name,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    } catch {
      showToast('Не удалось переименовать кабинет.', { type: 'error' });
    }
  };

  const handleAddRoom = async () => {
    setNotice('');
    try {
      await addDoc(collection(db, 'rooms'), {
        name: nextRoomName(rooms),
        capacity: DEFAULT_GROUP_CAPACITY,
        branchId,
        isArchived: false,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    } catch {
      showToast('Не удалось добавить кабинет.', { type: 'error' });
    }
  };

  const handleRemoveLastRoom = async () => {
    setNotice('');
    const room = rooms[rooms.length - 1];
    if (!room) return;
    try {
      const usedByGroups = await getDocs(
        query(collection(db, 'groups'), where('roomId', '==', room.id), where('isArchived', '==', false)),
      );
      if (!usedByGroups.empty) {
        const codes = usedByGroups.docs.map((d) => d.data().code).join(', ');
        setNotice(`В кабинете «${room.name}» есть группы: ${codes}. Сначала переведите их в другой кабинет.`);
        return;
      }
      setArchiveTarget(room);
    } catch {
      showToast('Не удалось проверить кабинет.', { type: 'error' });
    }
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
      setArchiveTarget(null);
    } catch {
      showToast('Не удалось архивировать кабинет.', { type: 'error' });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <Card>
      <RoomScheduleView
        title="Расписание кабинетов"
        hint="новый вид"
        rooms={rooms}
        groups={viewGroups}
        dayType={dayType}
        onDayTypeChange={handleDayTypeChange}
        onRenameRoom={handleRenameRoom}
        onChangeCapacity={handleChangeCapacity}
        onAddRoom={handleAddRoom}
        onRemoveLastRoom={handleRemoveLastRoom}
        onOpenGroup={(id) => navigate(`/groups/${id}`)}
        notice={notice}
        loading={groupsLoading || roomsLoading}
        canEdit
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        loading={archiving}
        title="Архивировать кабинет"
        message={`Архивировать кабинет «${archiveTarget?.name}»? Он пропадёт из списков, история останется.`}
        confirmLabel="Архивировать"
      />
    </Card>
  );
}
