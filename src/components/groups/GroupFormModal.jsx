import { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, updateDoc, doc, writeBatch, increment, serverTimestamp, query, where, Timestamp } from 'firebase/firestore';
import { addMonths, format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { generateLessons } from '../../lib/schedule.js';
import { logActivity } from '../../lib/activityLog.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Select } from '../ui/Select.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

const SCHEDULE_TYPE_OPTIONS = [
  { value: 'even', label: 'Чётные дни' },
  { value: 'odd', label: 'Нечётные дни' },
  { value: 'weekdays', label: 'По дням недели' },
];

const WEEKDAY_LABELS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' },
];

const toDateInput = (ts) => (ts ? format(ts.toDate(), 'yyyy-MM-dd') : '');

function emptyForm(defaultLessonsPerMonth) {
  return {
    code: '',
    courseId: '',
    teacherId: '',
    roomId: '',
    scheduleType: 'even',
    weekdays: [],
    time: '18:00',
    startDate: '',
    endMode: 'date', // 'date' | 'duration'
    endDate: '',
    durationMonths: '12',
    price: '',
    lessonsPerMonth: String(defaultLessonsPerMonth),
    tags: '',
  };
}

/**
 * Создание/редактирование группы. `group` = null (закрыто), {} (создание)
 * или сущность (редактирование).
 * @param {Object} props
 * @param {Object|null} props.group
 * @param {() => void} props.onClose
 */
export function GroupFormModal({ group, onClose }) {
  const { user, staff } = useAuth();
  const { activeBranchId, activeBranch } = useBranch();
  const { showToast } = useToast();
  const [form, setForm] = useState(() => emptyForm(activeBranch?.lessonsPerMonth ?? 12));
  const [saving, setSaving] = useState(false);

  const coursesQuery = useMemo(() => (db ? query(collection(db, 'courses'), where('isArchived', '==', false)) : null), []);
  const { data: courses } = useCollection(coursesQuery);

  const teachersQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'teachers'), where('branchIds', 'array-contains', activeBranchId), where('isArchived', '==', false))
        : null,
    [activeBranchId],
  );
  const { data: teachers } = useCollection(teachersQuery);

  const roomsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'rooms'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: rooms } = useCollection(roomsQuery);

  useEffect(() => {
    if (!group) return;
    if (group.id) {
      setForm({
        code: group.code,
        courseId: group.courseId,
        teacherId: group.teacherId,
        roomId: group.roomId,
        scheduleType: group.schedule.type,
        weekdays: group.schedule.weekdays ?? [],
        time: group.schedule.time,
        startDate: toDateInput(group.startDate),
        endMode: 'date',
        endDate: toDateInput(group.endDate),
        durationMonths: '12',
        price: String(group.price),
        lessonsPerMonth: String(group.lessonsPerMonth),
        tags: (group.tags ?? []).join(', '),
      });
    } else {
      setForm(emptyForm(activeBranch?.lessonsPerMonth ?? 12));
    }
  }, [group, activeBranch]);

  const handleCourseChange = (courseId) => {
    const course = courses.find((c) => c.id === courseId);
    setForm((f) => ({
      ...f,
      courseId,
      price: course && !f.price ? String(course.defaultPrice) : f.price,
    }));
  };

  const toggleWeekday = (value) => {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(value) ? f.weekdays.filter((d) => d !== value) : [...f.weekdays, value],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const course = courses.find((c) => c.id === form.courseId);
      const teacher = teachers.find((t) => t.id === form.teacherId);
      const room = rooms.find((r) => r.id === form.roomId);

      const startDate = new Date(`${form.startDate}T00:00:00`);
      const endDate =
        form.endMode === 'duration'
          ? addMonths(startDate, Number(form.durationMonths))
          : new Date(`${form.endDate}T00:00:00`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const status = startDate <= today ? 'active' : 'planned';

      const payload = {
        code: form.code.trim(),
        courseId: form.courseId,
        courseName: course?.name ?? '',
        teacherId: form.teacherId,
        teacherName: teacher?.displayName ?? '',
        roomId: form.roomId,
        roomName: room?.name ?? '',
        schedule: {
          type: form.scheduleType,
          weekdays: form.scheduleType === 'weekdays' ? form.weekdays : [],
          time: form.time,
          durationMin: 90,
        },
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        price: Number(form.price),
        lessonsPerMonth: Number(form.lessonsPerMonth),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        status,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };

      let groupId = group.id;
      const previousTeacherId = group.teacherId;

      if (groupId) {
        const batch = writeBatch(db);
        batch.update(doc(db, 'groups', groupId), payload);
        if (previousTeacherId && previousTeacherId !== form.teacherId) {
          batch.update(doc(db, 'teachers', previousTeacherId), { groupsCount: increment(-1) });
          batch.update(doc(db, 'teachers', form.teacherId), { groupsCount: increment(1) });
        }
        await batch.commit();

        // Любое изменение цены/статуса/состава группы — в историю (акцептанс-критерий фазы 7).
        const actor = { uid: user.uid, fullName: staff?.fullName ?? '' };
        const changes = [
          { field: 'price', before: group.price, after: payload.price },
          { field: 'status', before: group.status, after: payload.status },
          { field: 'teacherId', before: previousTeacherId, after: payload.teacherId },
        ].filter((c) => c.before !== c.after);
        await Promise.all(
          changes.map((c) =>
            logActivity(db, { entityType: 'group', entityId: groupId, action: 'update', field: c.field, before: c.before, after: c.after }, actor),
          ),
        );

        showToast('Группа обновлена.');
      } else {
        const created = await addDoc(collection(db, 'groups'), {
          ...payload,
          branchId: activeBranchId,
          publicId: Math.floor(100000 + Math.random() * 900000),
          studentsCount: 0,
          isArchived: false,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
        groupId = created.id;
        await updateDoc(doc(db, 'teachers', form.teacherId), { groupsCount: increment(1) });
        showToast('Группа добавлена.');
      }

      await generateLessons(db, {
        id: groupId,
        branchId: activeBranchId,
        code: payload.code,
        teacherId: payload.teacherId,
        startDate,
        endDate,
        schedule: payload.schedule,
      });

      onClose();
    } catch {
      showToast('Не удалось сохранить группу.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(group)}
      onClose={onClose}
      title={group?.id ? 'Редактировать группу' : 'Добавить группу'}
      width="table"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Сохранить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input label="Код группы" required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
        <Select
          label="Курс"
          required
          options={[{ value: '', label: 'Выбрать' }, ...courses.map((c) => ({ value: c.id, label: c.name }))]}
          value={form.courseId}
          onChange={(e) => handleCourseChange(e.target.value)}
        />
        <Select
          label="Учитель"
          required
          options={[{ value: '', label: 'Выбрать' }, ...teachers.map((t) => ({ value: t.id, label: t.displayName }))]}
          value={form.teacherId}
          onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))}
        />
        <Select
          label="Кабинет"
          options={[{ value: '', label: 'Не выбран' }, ...rooms.map((r) => ({ value: r.id, label: r.name }))]}
          value={form.roomId}
          onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
        />

        <Select
          label="Тип расписания"
          required
          options={SCHEDULE_TYPE_OPTIONS}
          value={form.scheduleType}
          onChange={(e) => setForm((f) => ({ ...f, scheduleType: e.target.value }))}
        />
        <Input
          label="Время"
          type="time"
          required
          value={form.time}
          onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
        />

        {form.scheduleType === 'weekdays' && (
          <div className="md:col-span-2">
            <span className="mb-1 block text-[13px] text-muted">Дни недели</span>
            <div className="flex gap-2">
              {WEEKDAY_LABELS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  className={`h-9 w-9 rounded-full border text-[13px] font-bold ${
                    form.weekdays.includes(d.value) ? 'border-navy bg-navy text-white' : 'border-border-strong text-text'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <DatePicker
          label="Дата начала"
          required
          value={form.startDate}
          onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
        />

        <div>
          <span className="mb-1 block text-[13px] text-muted">Окончание</span>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, endMode: 'date' }))}
              className={`rounded-full px-3 py-1 text-[13px] ${form.endMode === 'date' ? 'bg-navy text-white' : 'bg-surface-alt text-muted'}`}
            >
              Дата
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, endMode: 'duration' }))}
              className={`rounded-full px-3 py-1 text-[13px] ${form.endMode === 'duration' ? 'bg-navy text-white' : 'bg-surface-alt text-muted'}`}
            >
              Длительность
            </button>
          </div>
          {form.endMode === 'date' ? (
            <DatePicker required value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          ) : (
            <Input
              type="number"
              min="1"
              required
              value={form.durationMonths}
              onChange={(e) => setForm((f) => ({ ...f, durationMonths: e.target.value }))}
            />
          )}
        </div>

        <Input
          label="Цена (сум/мес)"
          type="number"
          min="0"
          required
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
        />
        <Input
          label="Уроков в месяц"
          type="number"
          min="1"
          required
          value={form.lessonsPerMonth}
          onChange={(e) => setForm((f) => ({ ...f, lessonsPerMonth: e.target.value }))}
        />
        <div className="md:col-span-2">
          <Input
            label="Тэги (через запятую)"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          />
        </div>
      </form>
    </Modal>
  );
}
