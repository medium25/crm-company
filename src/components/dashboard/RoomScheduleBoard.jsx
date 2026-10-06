import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Card } from '../ui/Card.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { RoomScheduleView, DEFAULT_ROOM_TIME_SLOTS } from './RoomScheduleView.jsx';
import { RoomDayTypeChooser } from './RoomDayTypeChooser.jsx';
import { DEFAULT_GROUP_CAPACITY, clampCapacity, nextRoomName, groupTrialCounts } from '../../lib/roomSchedule.js';

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
  const [dayType, setDayType] = useState(null) // null — стартовый экран выбора чётных/нечётных дней;
  const [notice, setNotice] = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const addingRef = useRef(false);

  // те же запросы, что в RoomScheduleGrid: Firestore делит подписку, держим оба блока независимыми
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

  // Времена начала занятий — те же, что в записи на пробный (settings.trialTimeSlots, «Справочники»).
  const settingsRef = useMemo(() => (db && branchId ? doc(db, 'settings', branchId) : null), [branchId]);
  const { data: branchSettings } = useDoc(settingsRef);
  const timeSlots = useMemo(() => {
    const slots = branchSettings?.trialTimeSlots;
    return Array.isArray(slots) && slots.length > 0 ? slots : DEFAULT_ROOM_TIME_SLOTS;
  }, [branchSettings]);

  // лиды с назначенным пробным: считаются жёлтыми местами; десятки документов
  const trialLeadsQuery = useMemo(
    () => (db && branchId ? query(collection(db, 'students'), where('branchId', '==', branchId), where('isArchived', '==', false), where('funnelStage', '==', 'trial_scheduled')) : null),
    [branchId],
  );
  const { data: trialLeads } = useCollection(trialLeadsQuery);

  // orderBy('name') в Firestore сортирует как строки ("10" раньше "2") — для показа и «последнего» кабинета нужен натуральный порядок.
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })),
    [rooms],
  );

  // В представление идут только группы, которые оно реально покажет: в загруженном кабинете, со временем, нужного типа дней.
  const timedGroups = useMemo(() => {
    const roomIds = new Set(sortedRooms.map((r) => r.id));
    return groups.filter((g) => roomIds.has(g.roomId) && g.schedule?.time);
  }, [groups, sortedRooms]);
  const viewGroups = useMemo(() => timedGroups.filter((g) => g.schedule.type === dayType), [timedGroups, dayType]);

  const trialCounts = useMemo(() => groupTrialCounts(viewGroups, trialLeads, new Date()), [viewGroups, trialLeads]);

  const handleDayTypeChange = (value) => {
    setNotice('');
    setDayType(value);
  };

  const handleChangeCapacity = async (groupId, capacity) => {
    setNotice('');
    if (!user?.uid || !branchId || !Number.isFinite(capacity)) return;
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

  const handleRenameRoom = async (roomId, rawName) => {
    setNotice('');
    const name = (rawName ?? '').trim();
    if (!name || !user?.uid || !branchId) return;
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
    if (!user?.uid || !branchId || addingRef.current) return;
    addingRef.current = true;
    try {
      await addDoc(collection(db, 'rooms'), {
        name: nextRoomName(sortedRooms),
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
    } finally {
      addingRef.current = false;
    }
  };

  // Общий поток «убрать кабинет»: проверка активных групп, затем подтверждение и архивация.
  const handleRemoveRoom = async (roomId) => {
    setNotice('');
    const room = sortedRooms.find((r) => r.id === roomId);
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

  const handleRemoveLastRoom = () => handleRemoveRoom(sortedRooms[sortedRooms.length - 1]?.id);

  const confirmArchive = async () => {
    if (!user?.uid || !branchId || !archiveTarget) return;
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

  const chooser = dayType === null;

  return (
    <Card>
      {chooser ? (
        <RoomDayTypeChooser
          rooms={sortedRooms}
          groups={timedGroups}
          timeSlots={timeSlots}
          onPick={handleDayTypeChange}
          loading={groupsLoading || roomsLoading}
        />
      ) : (
      <RoomScheduleView
        title="Расписание кабинетов"
        hint="новый вид"
        rooms={sortedRooms}
        groups={viewGroups}
        trialCounts={trialCounts}
        timeSlots={timeSlots}
        dayType={dayType}
        onDayTypeChange={handleDayTypeChange}
        onRenameRoom={handleRenameRoom}
        onChangeCapacity={handleChangeCapacity}
        onAddRoom={handleAddRoom}
        onRemoveLastRoom={handleRemoveLastRoom}
        onRemoveRoom={handleRemoveRoom}
        onOpenGroup={(id) => navigate(`/groups/${id}`)}
        notice={notice}
        loading={groupsLoading || roomsLoading}
        onBack={() => handleDayTypeChange(null)}
        canEdit
      />
      )}

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
