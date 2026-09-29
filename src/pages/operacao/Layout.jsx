import { Outlet, useLocation } from 'react-router-dom'
import { Search, Settings } from 'lucide-react'
import Sidebar from '../../components/ui/Sidebar'
import Topbar from '../../components/ui/Topbar'

export default function OperacaoLayout() {
  const location = useLocation()

  const navItems = [
    { to: '/operacao', label: 'Consulta Crivo', end: true, icon: Search },
    { to: '/operacao/configuracoes', label: 'Configurações', icon: Settings },
  ]

  const current = navItems.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))

  return (
    <div className="app-shell">
      <Sidebar title="BKO · Operação" items={navItems} />
      <div className="app-main">
        <Topbar />
        <main className="mx-auto max-w-6xl p-6">
          <h1 className="mb-6 text-2xl font-bold text-ink">{current?.label || 'Consulta Crivo'}</h1>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
