import { ClipboardList, Settings } from 'lucide-react'
import AppShell from '../../components/ui/AppShell'

const NAV_ITEMS = [
  { to: '/cadastro', label: 'Vendas pra cadastrar', end: true, icon: ClipboardList },
  { to: '/cadastro/configuracoes', label: 'Configurações', icon: Settings },
]

export default function CadastroLayout() {
  return <AppShell titulo="BKO · Cadastro" inicio="/cadastro" items={NAV_ITEMS} />
}
