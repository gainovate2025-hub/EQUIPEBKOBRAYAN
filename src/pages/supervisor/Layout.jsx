import { Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Percent, Trophy, Settings, Zap, PhoneCall, TrendingUp, Receipt, CalendarClock, Hash,
} from 'lucide-react'
import Sidebar from '../../components/ui/Sidebar'
import Topbar from '../../components/ui/Topbar'
import { SupervisorDataProvider } from '../../lib/SupervisorDataContext'

export default function SupervisorLayout() {
  const location = useLocation()

  const navItems = [
    { to: '/supervisor', label: 'Dashboard', end: true, icon: LayoutDashboard },
    { to: '/supervisor/comissao', label: 'Comissão', icon: Percent },
    { to: '/supervisor/comprovantes', label: 'Comprovantes', icon: Receipt },
    { to: '/supervisor/reagendamentos', label: 'Reagendamentos', icon: CalendarClock },
    { to: '/supervisor/custcodes', label: 'CustCodes', icon: Hash },
    { to: '/supervisor/ranking', label: 'Ranking', icon: Trophy },
    { to: '/supervisor/automacoes', label: 'Automações', icon: Zap },
    { to: '/supervisor/venda-cnpj', label: 'Consulta CNPJ + Venda', icon: PhoneCall },
    { to: '/supervisor/vendas-desempenho', label: 'Desempenho — Vendas', icon: TrendingUp },
    { to: '/supervisor/configuracoes', label: 'Configurações', icon: Settings },
  ]

  const current = navItems.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))

  return (
    <SupervisorDataProvider>
      <div className="app-shell">
        <Sidebar title="BKO · Supervisão" items={navItems} />
        <div className="app-main">
          <Topbar />
          <main className="mx-auto max-w-6xl p-6">
            <h1 className="mb-6 text-2xl font-bold text-ink">{current?.label || 'Dashboard'}</h1>
            <Outlet />
          </main>
        </div>
      </div>
    </SupervisorDataProvider>
  )
}
