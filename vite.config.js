import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// O site publicado (GitHub Pages) fica em /EQUIPEBKOBRAYAN/, não na raiz do
// domínio — por isso o "base" muda só no build. No "npm run dev" continua
// tudo em "/" normalmente.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/EQUIPEBKOBRAYAN/' : '/',
}))
