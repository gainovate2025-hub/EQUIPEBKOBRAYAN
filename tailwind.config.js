/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#0b0d12',
        surface: '#15171f',
        ink: '#f2f3f6',
        muted: '#9aa1b0',
        label: '#9aa1b0',
        subtle: '#6b7280',
        line: '#262a35',
        divider: '#1e212a',
        sidebar: {
          DEFAULT: '#0b0d12',
          hover: '#1a1d27',
          active: '#20242f',
          border: '#20242f',
          text: '#c7cbd6',
          textMuted: '#6b7280',
        },
        brand: {
          50: '#fdf8ec',
          100: '#faedc4',
          200: '#f5db8c',
          300: '#eec257',
          400: '#e2a930',
          500: '#c9931f',
          600: '#a97a18',
          700: '#8a6314',
          800: '#6b4c10',
          900: '#4a350b',
        },
        good: { text: '#4ade80', bg: 'rgba(74,222,128,.12)', border: 'rgba(74,222,128,.3)' },
        warn: { text: '#facc15', bg: 'rgba(250,204,21,.12)', border: 'rgba(250,204,21,.3)' },
        bad: { text: '#f87171', bg: 'rgba(248,113,113,.12)', border: 'rgba(248,113,113,.3)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.3)',
        cardHover: '0 1px 2px rgba(0,0,0,.3)',
        modal: '0 20px 48px rgba(0,0,0,.5)',
        focus: '0 0 0 4px rgba(201,147,31,.2)',
        hero: '0 1px 2px rgba(0,0,0,.3)',
        heroHover: '0 1px 2px rgba(0,0,0,.3)',
      },
      borderRadius: {
        lg2: '0.625rem',
        xl2: '0.625rem',
      },
    },
  },
  plugins: [],
}
