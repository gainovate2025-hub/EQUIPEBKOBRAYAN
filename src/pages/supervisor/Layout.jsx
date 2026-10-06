import { Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShieldCheck, Percent, FileText, CalendarClock,
  Users, Trophy, Settings, Zap, ClipboardList, Receipt, MessageCircle, BarChart3,
} from 'lucide-react'
import Sidebar from '../../components/ui/Sidebar'
import Topbar from '../../components/ui/Topbar'
import { SupervisorDataProvider } from '../../lib/SupervisorDataContext'
import { useAuth } from '../../lib/AuthContext'

export default function SupervisorLayout() {
  const { contestacaoLabel } = useAuth()
  const location = useLocation()

  const navItems = [
    { to: '/supervisor', label: 'Dashboard', end: true, icon: LayoutDashboard },
    { to: '/supervisor/aprovacao', label: 'Aprovação', icon: ShieldCheck },
    { to: '/supervisor/comissao', label: 'Comissão', icon: Percent },
    { to: '/supervisor/contestacoes', label: contestacaoLabel, icon: FileText },
    { to: '/supervisor/reagendamentos', label: 'Reagendamentos a fazer', icon: CalendarClock },
    { to: '/supervisor/faturas', label: 'Faturas', icon: Receipt },
    { to: '/supervisor/fatura-contestacoes', label: 'Contestação (Faturas)', icon: FileText },
    { to: '/supervisor/relatorio-contestacao-sheet', label: 'Relatório de Contestações', icon: BarChart3 },
    { to: '/supervisor/casos-whatsapp', label: 'Casos do WhatsApp', icon: MessageCircle },
    { to: '/supervisor/relatorios', label: 'Relatórios', icon: ClipboardList },
    { to: '/supervisor/equipe', label: 'Equipe', icon: Users },
    { to: '/supervisor/ranking', label: 'Ranking', icon: Trophy },
    { to: '/supervisor/automacoes', label: 'Automações', icon: Zap },
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
