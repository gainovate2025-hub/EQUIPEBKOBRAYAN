import { Outlet } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import NavMenu from '../../components/ui/NavMenu'
import { BkoDataProvider } from '../../lib/BkoDataContext'
import { useAuth } from '../../lib/AuthContext'

const NAV_ITEMS = [
  { to: '/bko', label: 'Meu Dashboard', end: true },
  { to: '/bko/contestacoes', label: 'Minhas Contestações' },
  { to: '/bko/reagendamentos', label: 'Meus Reagendamentos' },
  { to: '/bko/comissao', label: 'Minha Comissão' },
  { to: '/bko/objetivo', label: 'Meu Objetivo' },
  { to: '/bko/notas', label: 'Minhas Notas' },
]

export default function BkoLayout() {
  const { profile } = useAuth()

  return (
    <BkoDataProvider>
      <div className="bg-glow min-h-screen" style={{ padding: '36px 44px 56px' }}>
        <PageHeader title="Painel BKO" subtitle={`Olá, ${profile?.name} · Acompanhamento do seu desempenho`} />
        <NavMenu items={NAV_ITEMS} />
        <div className="mt-8">
          <Outlet />
        </div>
      </div>
    </BkoDataProvider>
  )
}
