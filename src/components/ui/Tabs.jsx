/**
 * Горизонтальные вкладки, подчёркивание активной — снизу (единообразно по 05).
 * @param {Object} props
 * @param {Array<{key: string, label: string}>} props.tabs
 * @param {string} props.activeKey
 * @param {(key: string) => void} props.onChange
 */
export function Tabs({ tabs, activeKey, onChange }) {
  return (
    <div className="flex gap-6 border-b border-border" role="tablist">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`relative -mb-px border-b-[3px] px-1 pb-3 text-[15px] transition-colors ${
              active ? 'border-navy font-bold text-text' : 'border-transparent font-normal text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
