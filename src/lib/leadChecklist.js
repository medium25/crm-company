/**
 * Чек-лист первого разговора с лидом — оператор отмечает пройденные пункты
 * прямо на карточке в стадиях «Новый лид»/«Дозвон». Хранится на
 * лид-документе как map `checklist.{key}: true` — отсутствие ключа
 * равносильно false, ничего не нужно инициализировать при создании лида.
 * Сам список пунктов теперь редактируемый (⚙ на панели чек-листа в
 * LeadCard.jsx) — живёт в `settings/{branchId}.checklistItems`, см.
 * `resolvedChecklistItems`/`editChecklistItems` в LeadsPage.jsx.
 * DEFAULT_CHECKLIST_ITEMS — то, с чем филиал начинает (и запасной
 * вариант там, где нет доступа к настройкам филиала, напр.
 * leadDeviationAnalysis.js).
 */
export const DEFAULT_CHECKLIST_ITEMS = [
  { key: 'item_1', label: 'Darhol kimligimizni aytmaslik va Gaplasha olishini bilish' },
  { key: 'item_2', label: 'Mijoz yozgan javobini eslatish (agar bo’lsa)' },
  { key: 'item_3', label: 'ICON haqida oldin eshitganmi? Eshitmagan bo’lsa tanishtirish' },
  { key: 'item_4', label: 'Mijozni ismini so’rash (tabiiy, gapni orasida)' },
  { key: 'item_5', label: 'Rus tilida suhbat' },
  { key: 'item_6', label: 'S - Vaziyatga doir savollar' },
  { key: 'item_7', label: 'P - Muammolarga doir savollar' },
  { key: 'item_8', label: 'I - O’qibatlarni ko’rsatuvchi savollar' },
  { key: 'item_9', label: 'N - Yo’naltiruvchi savollar' },
  { key: 'item_10', label: 'Kurs haqida: yuzma-yuz, 2ta ustoz, bilimdan va olish tezligidan kelib chiqib' },
  { key: 'item_11', label: 'Pul qaytarilishi haqida' },
  { key: 'item_12', label: 'Narx va lokatsiyani aytish' },
  { key: 'item_13', label: 'Telegramga o’tkazish ma’lumot va eslatmalar yuborish' },
  { key: 'item_14', label: 'Mijozning kontaktidan joy olish (Ism + rus tili deb saqlab qo’yishi shart)' },
];

export function checklistCheckedCount(checklist, items = DEFAULT_CHECKLIST_ITEMS) {
  if (!checklist) return 0;
  return items.filter((item) => checklist[item.key]).length;
}

export function checklistPercent(checklist, items = DEFAULT_CHECKLIST_ITEMS) {
  if (items.length === 0) return 0;
  const checked = checklistCheckedCount(checklist, items);
  return Math.round((checked / items.length) * 100);
}
