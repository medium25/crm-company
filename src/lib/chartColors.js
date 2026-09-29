// Цвета для Recharts/SVG: атрибуты stroke/fill не принимают var(--…), поэтому hex
// живёт здесь, в одном месте. Значения совпадают с токенами в src/index.css (:root);
// на графиках тёмной темы нет. Скрипт check-design разрешает hex только тут.
export const chartColors = {
  grid: '#E9EBEF', // border
  gridStrong: '#D6DAE1', // border-strong
  axis: '#8B94A3', // muted
  line: '#3C4656', // orange (тёмный графит)
  lineAlt: '#E8695A',
  lineMuted: '#8B94A3',
  white: '#FFFFFF',
  navy: '#4364C3',
  navyNum: '#2F6FE4',
  warning: '#E5842B',
  danger: '#C0392B',
  success: '#34A853',
  // chart-1 … chart-7 из index.css
  bars: ['#378ADD', '#1D9E75', '#BA7517', '#7F77DD', '#888780', '#D4537E', '#0F6E56'],
};
