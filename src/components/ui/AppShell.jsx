import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

// Moldura comum dos 4 painéis (supervisor, BKO, operação, cadastro),
// criada em 10/11/2026 pra não repetir o mesmo layout em 4 arquivos.
// - Tela larga (md pra cima): sidebar fixa na esquerda.
// - Celular: a sidebar some e abre como gaveta pelo botão de menu da
//   Topbar, com fundo escurecido. Fecha ao navegar, ao clicar fora ou Esc.
// extraTitulos: título de rotas que não aparecem no menu (ex:
// /supervisor/crivo), pra não cair no título da página inicial.
export default function AppShell({ titulo, inicio, items, extraTitulos = {}, tituloPadrao }) {
  const location = useLocation()
  const [menuAberto, setMenuAberto] = useState(false)

  useEffect(() => { setMenuAberto(false) }, [location.pathname])

  useEffect(() => {
    if (!menuAberto) return undefined
    function aoTeclar(e) {
      if (e.key === 'Escape') setMenuAberto(false)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [menuAberto])

  const atual = items.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))
  const extra = Object.entries(extraTitulos).find(([rota]) => location.pathname.startsWith(rota))
  const tituloPagina = atual?.label || extra?.[1] || tituloPadrao || items[0]?.label

  return (
    <div className="app-shell">
      <Sidebar title={titulo} items={items} className="hidden md:flex" />

      {menuAberto && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-sidebar/60" aria-hidden onClick={() => setMenuAberto(false)} />
          <Sidebar title={titulo} items={items} className="relative z-10 h-full shadow-modal" />
        </div>
      )}

      <div className="app-main">
        <Topbar titulo={tituloPagina} inicio={inicio} onAbrirMenu={() => setMenuAberto(true)} />
        <main className="mx-auto max-w-6xl p-4 md:p-6">
          <h1 className="mb-5 text-2xl font-bold text-sidebar">{tituloPagina}</h1>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
