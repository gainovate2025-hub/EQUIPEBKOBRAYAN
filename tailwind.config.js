/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f6f7f9',
        ink: '#16181c',
        muted: '#7b8190',
        label: '#5b616e',
        line: '#e7e9ee',
        divider: '#f0f1f5',
        brand: {
          50: '#fdeced',
          100: '#fdf6f6',
          200: '#f6b0b5',
          300: '#f07a81',
          400: '#e2242f',
          500: '#d81f2a',
          600: '#c0161f',
          700: '#a5121c',
          800: '#7d0d15',
          900: '#5c0a10',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 24px rgba(20,24,33,.05)',
        cardHover: '0 20px 38px rgba(20,24,33,.1)',
        hero: '0 14px 30px rgba(216,31,42,.28)',
        heroHover: '0 20px 40px rgba(216,31,42,.36)',
        modal: '0 18px 44px rgba(20,24,33,.08)',
      },
      borderRadius: {
        xl2: '1.125rem',
      },
    },
  },
  plugins: [],
}
