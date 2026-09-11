import { Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, CalendarClock, ClipboardList,
  Trophy, MessageSquare, Percent, Target, StickyNote, Car, Swords,
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
    { to: '/bko/registro-diario', label: 'Registro diário', icon: ClipboardList },
    { to: '/bko/ranking', label: 'Ranking', icon: Trophy },
    { to: '/bko/chat', label: 'Chat', icon: MessageSquare },
    { to: '/bko/comissao', label: 'Minha Comissão', icon: Percent },
    { to: '/bko/objetivo', label: 'Meu Objetivo', icon: Target },
    { to: '/bko/notas', label: 'Minhas Notas', icon: StickyNote },
    { to: '/bko/garagem', label: 'Garagem', icon: Car },
    { to: '/bko/desafios', label: 'Desafios', icon: Swords },
  ]

  const current = navItems.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))

  return (
    <BkoDataProvider>
      <div className="app-shell">
        <Sidebar title="Painel BKO" items={navItems} />
        <div className="app-main">
          <Topbar title={current?.label || 'Dashboard'} />
          <main className="mx-auto max-w-6xl p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </BkoDataProvider>
  )
}
