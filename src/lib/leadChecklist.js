/**
 * Чек-лист первого разговора с лидом — фиксированный список пунктов
 * (задан вручную, не редактируется из UI), оператор отмечает пройденные
 * прямо на карточке в стадиях «Новый лид»/«Дозвон». Хранится на
 * лид-документе как map `checklist.{key}: true` — отсутствие ключа
 * равносильно false, ничего не нужно инициализировать при создании лида.
 */
export const LEAD_CHECKLIST_ITEMS = [
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
];

export function checklistCheckedCount(checklist) {
  if (!checklist) return 0;
  return LEAD_CHECKLIST_ITEMS.filter((item) => checklist[item.key]).length;
}

export function checklistPercent(checklist) {
  const checked = checklistCheckedCount(checklist);
  return Math.round((checked / LEAD_CHECKLIST_ITEMS.length) * 100);
}
