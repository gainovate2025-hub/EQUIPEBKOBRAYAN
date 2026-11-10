import {
  LayoutDashboard, Receipt, FileCheck2, CalendarClock, Trophy, Percent, Hash,
} from 'lucide-react'
import AppShell from '../../components/ui/AppShell'
import { BkoDataProvider } from '../../lib/BkoDataContext'

const NAV_ITEMS = [
  { to: '/bko', label: 'Meu painel', end: true, icon: LayoutDashboard },
  { to: '/bko/faturas', label: 'Faturas', icon: Receipt },
  { to: '/bko/comprovantes', label: 'Comprovantes', icon: FileCheck2 },
  { to: '/bko/custcode', label: 'CustCode', icon: Hash },
  { to: '/bko/reagendamentos', label: 'Reagendamento', icon: CalendarClock },
  { to: '/bko/ranking', label: 'Ranking', icon: Trophy },
  { to: '/bko/comissao', label: 'Minha comissão', icon: Percent },
]

export default function BkoLayout() {
  return (
    <BkoDataProvider>
      <AppShell titulo="Painel BKO" inicio="/bko" items={NAV_ITEMS} />
    </BkoDataProvider>
  )
}
