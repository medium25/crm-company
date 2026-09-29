/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Значения — CSS-переменные в rgb()-обёртке с <alpha-value> (см.
      // src/index.css :root/.dark, значения там — «R G B» через пробел, БЕЗ
      // rgb()) — так классы вида bg-success/10, ring-navy/40 продолжают
      // работать (Tailwind подставляет альфу в сам rgb()); просто var(...)
      // без этой обёртки ломает все /opacity-модификаторы во всём приложении
      // (Tailwind не умеет резать CSS-переменную на RGB-каналы на этапе
      // сборки). Токены палитры переключаются тёмной темой (сейчас — только
      // на странице «Заявки», см. LeadsPage.jsx) без дублирования палитры тут.
      colors: {
        bg:            'rgb(var(--color-bg) / <alpha-value>)',
        surface:       'rgb(var(--color-surface) / <alpha-value>)',
        card:          'rgb(var(--color-card) / <alpha-value>)',
        'card-head':   'rgb(var(--color-card-head) / <alpha-value>)',
        'surface-alt': 'rgb(var(--color-surface-alt) / <alpha-value>)',
        border:        'rgb(var(--color-border) / <alpha-value>)',
        'border-strong': 'rgb(var(--color-border-strong) / <alpha-value>)',
        text:          'rgb(var(--color-text) / <alpha-value>)',
        muted:         'rgb(var(--color-muted) / <alpha-value>)',
        navy: {
          DEFAULT: 'rgb(var(--color-navy) / <alpha-value>)',
          hover:   'rgb(var(--color-navy-hover) / <alpha-value>)',
          num:     'rgb(var(--color-navy-num) / <alpha-value>)',
        },
        orange: {
          DEFAULT: 'rgb(var(--color-orange) / <alpha-value>)',
          soft:    'rgb(var(--color-orange-soft) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          bg:      'rgb(var(--color-success-bg) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          bg:      'rgb(var(--color-danger-bg) / <alpha-value>)',
        },
        present:       'rgb(var(--color-present) / <alpha-value>)',
        absent:        'rgb(var(--color-absent) / <alpha-value>)',
        link:          'rgb(var(--color-link) / <alpha-value>)',
        freeze: {
          blue:   'rgb(var(--color-freeze-blue) / <alpha-value>)',
          yellow: 'rgb(var(--color-freeze-yellow) / <alpha-value>)',
          red:    'rgb(var(--color-freeze-red) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          bg:      'rgb(var(--color-warning-bg) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          bg:      'rgb(var(--color-info-bg) / <alpha-value>)',
        },
        chip: 'rgb(var(--color-chip) / <alpha-value>)',
        chart: {
          1: 'rgb(var(--color-chart-1) / <alpha-value>)',
          2: 'rgb(var(--color-chart-2) / <alpha-value>)',
          3: 'rgb(var(--color-chart-3) / <alpha-value>)',
          4: 'rgb(var(--color-chart-4) / <alpha-value>)',
          5: 'rgb(var(--color-chart-5) / <alpha-value>)',
          6: 'rgb(var(--color-chart-6) / <alpha-value>)',
          7: 'rgb(var(--color-chart-7) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['"Nunito Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        caption: ['12px', { lineHeight: '16px' }],
        small:   ['13px', { lineHeight: '18px' }],
        body:    ['14px', { lineHeight: '20px' }],
        control: ['15px', { lineHeight: '20px' }],
        title:   ['17px', { lineHeight: '24px' }],
        page:    ['22px', { lineHeight: '28px' }],
        kpi:     ['36px', { lineHeight: '42px' }],
      },
      borderRadius: { card: '16px', row: '12px', field: '12px', badge: '9999px' },
      boxShadow: {
        card:  '0 1px 3px rgba(16,24,40,.06)',
        soft:  '0 4px 12px rgba(16,24,40,.08)',
        hover: '0 4px 12px rgba(16,24,40,.08)',
        modal: '0 24px 48px rgba(16,24,40,.18)',
      },
      maxWidth: { content: '1920px' },
    },
  },
  plugins: [],
};
