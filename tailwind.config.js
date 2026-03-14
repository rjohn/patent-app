/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        patent: {
          navy:    '#0A1628',
          blue:    '#1B3A6B',
          steel:   '#2D5A9E',
          sky:     '#4A90D9',
          ice:     '#E8F4FD',
          gold:    '#C8A951',
          amber:   '#E6B84A',
          cream:   '#FDF8EE',
          slate:   '#6B7A99',
          muted:   '#A8B5CC',
        },
        status: {
          pending:   '#E6B84A',
          granted:   '#22C55E',
          abandoned: '#EF4444',
          expired:   '#9CA3AF',
          published: '#3B82F6',
          licensed:  '#A855F7',
        }
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body:    ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'monospace'],
      },
      animation: {
        'fade-in':      'fadeIn 0.4s ease-out',
        'slide-up':     'slideUp 0.4s ease-out',
        'slide-right':  'slideRight 0.3s ease-out',
      },
      keyframes: {
        fadeIn:     { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:    { '0%': { transform: 'translateY(12px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        slideRight: { '0%': { transform: 'translateX(-12px)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
}
