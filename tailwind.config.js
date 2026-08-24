/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Значения — CSS-переменные (см. src/index.css :root/.dark), не хардкод,
      // чтобы токены палитры переключались тёмной темой (сейчас — только на
      // странице «Заявки», см. LeadsPage.jsx) без дублирования палитры здесь.
      colors: {
        bg:            'var(--color-bg)',
        surface:       'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        border:        'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        text:          'var(--color-text)',
        muted:         'var(--color-muted)',
        navy:          { DEFAULT: 'var(--color-navy)', hover: 'var(--color-navy-hover)', num: 'var(--color-navy-num)' },
        orange:        { DEFAULT: 'var(--color-orange)', soft: 'var(--color-orange-soft)' },
        success:       { DEFAULT: 'var(--color-success)', bg: 'var(--color-success-bg)' },
        danger:        { DEFAULT: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
        present:       'var(--color-present)',
        absent:        'var(--color-absent)',
        link:          'var(--color-link)',
        freeze: {
          blue:   'var(--color-freeze-blue)',
          yellow: 'var(--color-freeze-yellow)',
          red:    'var(--color-freeze-red)',
        },
      },
      fontFamily: {
        sans: ['"Nunito Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { card: '12px', row: '10px', field: '8px', badge: '6px' },
      boxShadow: {
        card:  '0 1px 3px rgba(16,24,40,.06)',
        hover: '0 4px 12px rgba(16,24,40,.08)',
        modal: '0 24px 48px rgba(16,24,40,.18)',
      },
      maxWidth: { content: '1920px' },
    },
  },
  plugins: [],
};
