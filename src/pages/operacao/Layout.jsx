import { Search, Settings } from 'lucide-react'
import AppShell from '../../components/ui/AppShell'

const NAV_ITEMS = [
  { to: '/operacao', label: 'Consultas', end: true, icon: Search },
  { to: '/operacao/configuracoes', label: 'Configurações', icon: Settings },
]

export default function OperacaoLayout() {
  return <AppShell titulo="BKO · Operação" inicio="/operacao" items={NAV_ITEMS} />
}
