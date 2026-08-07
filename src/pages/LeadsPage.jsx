import { PageHeader } from '../components/layout/PageHeader.jsx';

/**
 * Заглушка — таблица на 2 столбца («Записи»/«Результаты»), оба пока
 * пустые, наполнение отложено. Рабочая версия со списком лидов/пробных и
 * действиями (звонок, отказ, перевод в пробный) есть в git-истории этого
 * файла — вернуть при готовности, разложив по нужному столбцу.
 */
export function LeadsPage() {
  return (
    <>
      <PageHeader title="Заявки" />
      <div className="overflow-hidden rounded-card border border-border">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="w-1/2 border-r border-border px-4 py-3 text-left text-[15px] font-bold text-text">Записи</th>
              <th className="w-1/2 px-4 py-3 text-left text-[15px] font-bold text-text">Результаты</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="h-40 border-r border-border px-4 py-3 align-top text-[15px] text-muted">Раздел появится позже</td>
              <td className="h-40 px-4 py-3 align-top text-[15px] text-muted">Раздел появится позже</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
