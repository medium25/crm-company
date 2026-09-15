// src/lib/sheetsExportHook.js
/**
 * Уведомление appsscript/SheetsExport.gs о смене funnelStage лида — чтобы
 * колонка «Статус» в Google Sheets обновлялась сразу (нужно для CAPI:
 * Facebook получает конверсию из таблицы, минутный опрос по триггеру
 * (installExportTrigger) был слишком медленным). Fire-and-forget: если
 * VITE_SHEETS_EXPORT_HOOK_URL не задан (например, локальная разработка)
 * или запрос не долетел — тихо игнорируем, не блокируем и не роняем
 * основное действие пользователя. Полная перезапись листа (exportOnce, раз
 * в минуту) остаётся страховкой на случай, если этот вызов потерялся.
 *
 * mode:'no-cors' — Apps Script Web App не отвечает CORS-заголовками; тело
 * шлём как text/plain (дефолт fetch для строки), чтобы не словить
 * preflight, который Apps Script не обрабатывает.
 */
const HOOK_URL = import.meta.env.VITE_SHEETS_EXPORT_HOOK_URL;
const HOOK_SECRET = import.meta.env.VITE_SHEETS_EXPORT_HOOK_SECRET;

export function notifySheetsExport(studentId, funnelStage, rawColumns) {
  if (!HOOK_URL) return;
  try {
    fetch(HOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({
        secret: HOOK_SECRET,
        id: studentId,
        rawId: rawColumns && rawColumns.id ? String(rawColumns.id) : null,
        funnelStage,
      }),
    }).catch(() => {});
  } catch {
    // fetch недоступен/заблокирован — не критично, exportOnce досинхронизирует за минуту
  }
}
