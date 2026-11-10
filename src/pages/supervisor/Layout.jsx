import {
  LayoutDashboard, Percent, Trophy, Settings, Zap, PhoneCall, TrendingUp, Receipt, CalendarClock, Hash,
} from 'lucide-react'
import AppShell from '../../components/ui/AppShell'
import { SupervisorDataProvider } from '../../lib/SupervisorDataContext'

const NAV_ITEMS = [
  { to: '/supervisor', label: 'Dashboard', end: true, icon: LayoutDashboard },
  { to: '/supervisor/comissao', label: 'Comissão', icon: Percent },
  { to: '/supervisor/comprovantes', label: 'Comprovantes', icon: Receipt },
  { to: '/supervisor/reagendamentos', label: 'Reagendamentos', icon: CalendarClock },
  { to: '/supervisor/custcodes', label: 'CustCodes', icon: Hash },
  { to: '/supervisor/ranking', label: 'Ranking', icon: Trophy },
  { to: '/supervisor/automacoes', label: 'Automações', icon: Zap },
  { to: '/supervisor/venda-cnpj', label: 'Consulta CNPJ e venda', icon: PhoneCall },
  { to: '/supervisor/vendas-desempenho', label: 'Desempenho de vendas', icon: TrendingUp },
  { to: '/supervisor/configuracoes', label: 'Configurações', icon: Settings },
]

// Rotas que existem mas não estão no menu (o Crivo abre pela tela de
// Automações). Sem isso o título caía em "Dashboard" (10/11/2026).
const EXTRA_TITULOS = {
  '/supervisor/crivo': 'Crivo',
}

export default function SupervisorLayout() {
  return (
    <SupervisorDataProvider>
      <AppShell
        titulo="BKO · Supervisão"
        inicio="/supervisor"
        items={NAV_ITEMS}
        extraTitulos={EXTRA_TITULOS}
      />
    </SupervisorDataProvider>
  )
}
