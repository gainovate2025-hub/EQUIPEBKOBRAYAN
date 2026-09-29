import { Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, CalendarClock, Receipt,
  Trophy, Percent, MessageCircle, ClipboardList,
} from 'lucide-react'
import Sidebar from '../../components/ui/Sidebar'
import Topbar from '../../components/ui/Topbar'
import { BkoDataProvider } from '../../lib/BkoDataContext'
import { useAuth } from '../../lib/AuthContext'

export default function BkoLayout() {
  const { contestacaoLabel } = useAuth()
  const location = useLocation()

  const navItems = [
    { to: '/bko', label: 'Meu Dashboard', end: true, icon: LayoutDashboard },
    { to: '/bko/contestacoes', label: contestacaoLabel, icon: FileText },
    { to: '/bko/reagendamentos', label: 'Meus Reagendamentos', icon: CalendarClock },
    { to: '/bko/faturas', label: 'Faturas', icon: Receipt },
    { to: '/bko/fatura-contestacoes', label: 'Contestação (Faturas)', icon: FileText },
    { to: '/bko/relatorio-diario', label: 'Relatório diário', icon: ClipboardList },
    { to: '/bko/casos-whatsapp', label: 'Casos do WhatsApp', icon: MessageCircle },
    { to: '/bko/ranking', label: 'Ranking', icon: Trophy },
    { to: '/bko/comissao', label: 'Minha Comissão', icon: Percent },
  ]

  const current = navItems.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))

  return (
    <BkoDataProvider>
      <div className="app-shell">
        <Sidebar title="Painel BKO" items={navItems} />
        <div className="app-main">
          <Topbar />
          <main className="mx-auto max-w-6xl p-6">
            <h1 className="mb-6 text-2xl font-bold text-ink">{current?.label || 'Dashboard'}</h1>
            <Outlet />
          </main>
        </div>
      </div>
    </BkoDataProvider>
  )
}
