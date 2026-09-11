/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f7f8fa',
        surface: '#ffffff',
        ink: '#101828',
        muted: '#667085',
        label: '#667085',
        subtle: '#98a2b3',
        line: '#e4e7ec',
        divider: '#eef0f3',
        sidebar: {
          DEFAULT: '#111827',
          hover: '#1c2333',
          active: '#242c40',
          border: '#1f2937',
          text: '#cbd2e0',
          textMuted: '#7c8496',
        },
        brand: {
          50: '#fef3f2',
          100: '#fee4e2',
          200: '#fecdca',
          300: '#fda29b',
          400: '#f97066',
          500: '#d92d20',
          600: '#b42318',
          700: '#912018',
          800: '#7a271a',
          900: '#55160c',
        },
        good: { text: '#067647', bg: '#ecfdf3', border: '#abefc6' },
        warn: { text: '#b54708', bg: '#fffaeb', border: '#fedf89' },
        bad: { text: '#b42318', bg: '#fef3f2', border: '#fecdca' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04)',
        cardHover: '0 1px 2px rgba(16,24,40,.04)',
        modal: '0 20px 48px rgba(16,24,40,.18)',
        focus: '0 0 0 4px rgba(217,45,32,.12)',
        hero: '0 1px 2px rgba(16,24,40,.04)',
        heroHover: '0 1px 2px rgba(16,24,40,.04)',
      },
      borderRadius: {
        lg2: '0.625rem',
        xl2: '0.625rem',
      },
    },
  },
  plugins: [],
}
