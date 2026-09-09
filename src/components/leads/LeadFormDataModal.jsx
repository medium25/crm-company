import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';

/**
 * Все колонки исходной строки Google Sheets как есть (lead.rawColumns, см.
 * appsscript/SheetsSync.gs → dumpRow_) — на самой карточке НЕ показывается
 * (загромождало бы, там уже есть LeadInfoPopover под «i» для 3 отобранных
 * полей), только тут, из «⋮» → «Данные из формы». Нужно, чтобы сверять/
 * заполнять отдельную таблицу отчётности (кто оплатил/отказался) по любому
 * полю формы, не только тем, что CRM использует сама (ad_id, campaign_name,
 * lead_status и т.п.).
 * @param {Object} props
 * @param {{lead: Object}|null} props.target
 * @param {() => void} props.onClose
 */
export function LeadFormDataModal({ target, onClose }) {
  if (!target) return null;
  const entries = Object.entries(target.lead.rawColumns ?? {});

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={`Данные из формы — ${target.lead.fullName}`}
      footer={<Button onClick={onClose}>Закрыть</Button>}
    >
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted">Этот лид пришёл не из синка Google Sheets — данных формы нет.</p>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {entries.map(([column, value]) => (
            <div key={column}>
              <p className="text-[11px] leading-snug text-muted">{column}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-snug text-text">
                {value === null || value === '' ? <span className="text-muted">—</span> : String(value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
