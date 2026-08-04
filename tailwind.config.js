/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:            '#F4F5F7',
        surface:       '#FFFFFF',
        'surface-alt': '#FAFBFC',
        border:        '#E9EBEF',
        'border-strong': '#D6DAE1',
        text:          '#2B3440',
        muted:         '#8B94A3',
        navy:          { DEFAULT: '#22406B', hover: '#1A3357', num: '#2E5E96' },
        orange:        { DEFAULT: '#E5842B', soft: '#FDF0E3' },
        success:       { DEFAULT: '#34A853', bg: '#EBF7EE' },
        danger:        { DEFAULT: '#C0392B', bg: '#B02D33' },
        present:       '#3E8B84',
        absent:        '#2F80D8',
        link:          '#2563EB',
        freeze: {
          blue:   '#EAF3FF',
          yellow: '#FFF6D9',
          red:    '#FBEAEA',
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
      maxWidth: { content: '1600px' },
    },
  },
  plugins: [],
};
