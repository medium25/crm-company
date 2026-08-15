import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, ChevronDown } from 'lucide-react';

const MARGIN = 8;

/**
 * Меню ⋮ в строках таблиц и карточках (Учителя, Группы, Студенты, Заявки).
 * Триггер по умолчанию — круглая кнопка с ⋮; для сплит-кнопок (карточка
 * студента) передаётся `variant="chevron"` — узкая стрелка ▾, встраиваемая
 * вплотную к основной кнопке в общую пилюлю. Для триггеров с другим смыслом
 * (не "ещё действия", а конкретное действие вроде "перенести") — `icon` и
 * `ariaLabel` переопределяют иконку/подпись, оставляя тот же контейнер и
 * поведение (клик вне — закрыть, Escape — закрыть, скролл — закрыть).
 *
 * Список рендерится через createPortal в body с `position: fixed`,
 * вычисленной из `getBoundingClientRect()` триггера — не `absolute` внутри
 * своего контейнера. Карточки лидов лежат в колонках канбана с
 * `overflow-hidden` (скруглённые углы), обычный absolute-внутри-relative
 * обрезался бы или отставал от скролла колонки. Позиция считается в
 * useLayoutEffect (после первого невидимого рендера для замера размера
 * меню), с автопереворотом вверх, если снизу не хватает места.
 * @param {Object} props
 * @param {Array<{label: string, onClick: () => void, danger?: boolean, disabled?: boolean, title?: string}>} props.items
 * @param {'icon'|'chevron'} [props.variant]
 * @param {import('react').ComponentType} [props.icon] переопределяет иконку триггера (по умолчанию MoreVertical/ChevronDown по variant)
 * @param {string} [props.ariaLabel] переопределяет aria-label триггера (по умолчанию «Действия»)
 */
export function DropdownMenu({ items, variant = 'icon', icon: Icon, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - trigger.bottom;
    const openUpward = spaceBelow < menu.height + MARGIN && trigger.top > menu.height + MARGIN;
    const left = Math.min(trigger.right - menu.width, window.innerWidth - menu.width - MARGIN);
    setStyle({
      position: 'fixed',
      top: openUpward ? trigger.top - menu.height - 4 : trigger.bottom + 4,
      left: Math.max(left, MARGIN),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Скролл (в т.ч. внутри колонки канбана) двигает триггер из-под уже
    // отрисованного fixed-меню — закрываем, а не пытаемся гоняться позицией
    // на каждый scroll-event.
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const TriggerIcon = Icon ?? (variant === 'chevron' ? ChevronDown : MoreVertical);

  return (
    <>
      <div onClick={(e) => e.stopPropagation()}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={
            variant === 'chevron'
              ? 'flex h-11 w-9 items-center justify-center rounded-r-full border-l border-navy text-navy hover:bg-orange-soft/40'
              : 'flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt'
          }
          aria-label={ariaLabel ?? 'Действия'}
        >
          <TriggerIcon className="h-4 w-4" />
        </button>
      </div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            // До первого расчёта позиции (useLayoutEffect) рендерим за
            // пределами экрана — чтобы измерить реальную высоту меню без
            // видимого прыжка в правильную точку.
            style={style ?? { position: 'fixed', top: -9999, left: -9999 }}
            className="z-50 w-52 rounded-field border border-border bg-surface py-2 shadow-hover"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick();
                }}
                className={`block w-full px-3 py-2 text-left text-[15px] hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${
                  item.danger ? 'text-danger' : 'text-text'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
