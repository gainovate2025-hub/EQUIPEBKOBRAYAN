import { Outlet, useLocation } from 'react-router-dom'
import { ClipboardList, Settings } from 'lucide-react'
import Sidebar from '../../components/ui/Sidebar'
import Topbar from '../../components/ui/Topbar'

export default function CadastroLayout() {
  const location = useLocation()

  const navItems = [
    { to: '/cadastro', label: 'Vendas pra Cadastrar', end: true, icon: ClipboardList },
    { to: '/cadastro/configuracoes', label: 'Configurações', icon: Settings },
  ]

  const current = navItems.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))

  return (
    <div className="app-shell">
      <Sidebar title="BKO · Cadastro" items={navItems} />
      <div className="app-main">
        <Topbar />
        <main className="mx-auto max-w-6xl p-6">
          <h1 className="mb-6 text-2xl font-bold text-ink">{current?.label || 'Vendas pra Cadastrar'}</h1>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
