import { useState } from 'react';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { UploadCloud } from 'lucide-react';
import { db } from '../../firebase.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Table } from '../ui/Table.jsx';
import { Badge } from '../ui/Badge.jsx';
import { parseCsv } from '../../lib/csv.js';
import { formatPhone } from '../../lib/format.js';

/**
 * Импорт учителей из CSV — замена XLSX (раздел 00 запрещает новые
 * зависимости без разрешения, парсер `xlsx` не подключали). Ожидаемые
 * колонки: `Отображаемое имя`/`displayName`, `Полное имя`/`fullName`,
 * `Телефон`/`phone`. Существующий учитель находится по телефону — тогда
 * это обновление, иначе создание. Пишется одним `writeBatch`: если запрос
 * не прошёл — не сохранится ничего (акцептанс-критерий раздела 06).
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Array<Object>} props.teachers существующие учителя филиала — для матчинга по телефону
 * @param {string} props.branchId
 * @param {string} props.userId
 */
export function ImportTeachersModal({ open, onClose, teachers, branchId, userId }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setRows([]);
    setFileName('');
    setReport(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setReport(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    const prepared = parsed.map((r) => {
      const displayName = (r.displayName || r['Отображаемое имя'] || '').trim();
      const fullName = (r.fullName || r['Полное имя'] || '').trim();
      const phone = (r.phone || r['Телефон'] || '').replace(/\D/g, '');
      const errors = [];
      if (!displayName) errors.push('нет отображаемого имени');
      if (!phone) errors.push('нет телефона');
      return { displayName, fullName, phone, errors };
    });
    setRows(prepared);
  };

  const validRows = rows.filter((r) => r.errors.length === 0);

  const doImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const batch = writeBatch(db);
      let created = 0;
      let updated = 0;
      for (const r of validRows) {
        const existing = teachers.find((t) => t.phone === r.phone);
        if (existing) {
          batch.update(doc(db, 'teachers', existing.id), {
            displayName: r.displayName,
            fullName: r.fullName || existing.fullName,
            updatedAt: serverTimestamp(),
            updatedBy: userId,
          });
          updated += 1;
        } else {
          batch.set(doc(collection(db, 'teachers')), {
            displayName: r.displayName,
            fullName: r.fullName,
            phone: r.phone,
            branchId,
            branchIds: [branchId],
            staffUid: null,
            groupsCount: 0,
            isActive: true,
            isArchived: false,
            createdAt: serverTimestamp(),
            createdBy: userId,
            updatedAt: serverTimestamp(),
            updatedBy: userId,
          });
          created += 1;
        }
      }
      await batch.commit();
      setReport({ created, updated, skipped: rows.length - validRows.length });
    } catch {
      setReport({ failed: true });
    } finally {
      setImporting(false);
    }
  };

  const columns = [
    { key: 'displayName', label: 'Отображаемое имя', render: (r) => r.displayName || '—' },
    { key: 'fullName', label: 'Полное имя', render: (r) => r.fullName || '—' },
    { key: 'phone', label: 'Телефон', render: (r) => (r.phone ? formatPhone(r.phone) : '—') },
    {
      key: 'status',
      label: 'Статус',
      render: (r) =>
        r.errors.length > 0 ? (
          <span className="text-danger">{r.errors.join(', ')}</span>
        ) : teachers.some((t) => t.phone === r.phone) ? (
          <Badge variant="type-system">обновление</Badge>
        ) : (
          <Badge variant="status-active">новый</Badge>
        ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Импорт учителей из CSV"
      width="table"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {report ? 'Закрыть' : 'Отмена'}
          </Button>
          {!report && (
            <Button onClick={doImport} loading={importing} disabled={validRows.length === 0}>
              Импортировать ({validRows.length})
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!report && rows.length === 0 && (
          <>
            <p className="text-[15px] text-muted">
              CSV с колонками: <b>Отображаемое имя</b>, <b>Полное имя</b>, <b>Телефон</b>. Первая строка — заголовки.
            </p>
            <label className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-navy px-5 text-[15px] font-bold text-navy hover:bg-orange-soft/40">
              <UploadCloud className="h-4 w-4" /> Выбрать файл
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            </label>
          </>
        )}

        {rows.length > 0 && !report && (
          <>
            <p className="text-[13px] text-muted">
              {fileName} · строк: {rows.length}, готово к импорту: {validRows.length}
            </p>
            <Table columns={columns} rows={rows.map((r, i) => ({ id: i, ...r }))} />
          </>
        )}

        {report && !report.failed && (
          <p className="text-[15px] text-text">
            Создано: {report.created} · Обновлено: {report.updated} · Пропущено с ошибками: {report.skipped}
          </p>
        )}
        {report?.failed && <p className="text-[15px] text-danger">Импорт не удался, ничего не сохранено. Попробуйте ещё раз.</p>}
      </div>
    </Modal>
  );
}
