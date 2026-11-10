/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Tema claro no padrão das telas da TIM (10/11/2026): fundo cinza-
        // azulado, cartões brancos, azul-marinho no menu e azul TIM nos
        // botões. Antes era escuro com dourado.
        paper: '#eef2f8',
        surface: '#ffffff',
        ink: '#14213d',
        muted: '#5b6a85',
        // subtle escurecido em 10/11/2026: o #8a96ab antigo ficava fraco
        // demais sobre o branco (placeholder e textos de apoio).
        subtle: '#6b7894',
        line: '#d3dbe8',
        // Borda dos campos de formulário: mais escura que "line" pra o campo
        // aparecer bem sobre o cartão branco (padrão da tela da TIM).
        field: '#9aa8bf',
        divider: '#e3e8f1',
        sidebar: {
          DEFAULT: '#0f1f45',
          hover: '#17295a',
          active: '#1f3a7a',
          border: '#22366a',
          text: '#c9d4ea',
          textMuted: '#8a9bc0',
        },
        brand: {
          50: '#e8f0fd',
          100: '#cfe0fb',
          200: '#9cc0f5',
          300: '#6aa0ee',
          400: '#2f7cf6',
          500: '#1f5fd1',
          600: '#0b3d91',
          700: '#0a3378',
          800: '#08295f',
          900: '#061d44',
        },
        // Vermelho TIM, usado só em detalhes (risco do logo, obrigatório *).
        tim: '#d6262e',
        // Posições do ranking (1º, 2º, 3º). Ouro e prata claros pra texto
        // escuro ficar legível; bronze escuro pra texto branco (10/11/2026).
        medal: { gold: '#e8c35a', silver: '#cdd5e1', bronze: '#9a5a32' },
        good: { text: '#067647', bg: '#ecfdf3', border: '#abefc6' },
        warn: { text: '#b54708', bg: '#fffaeb', border: '#fedf89' },
        bad: { text: '#b42318', bg: '#fef3f2', border: '#fecdca' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.06)',
        modal: '0 20px 48px rgba(15,31,69,.25)',
        focus: '0 0 0 3px rgba(31,95,209,.2)',
      },
      borderRadius: {
        lg2: '0.5rem',
      },
    },
  },
  plugins: [],
}
