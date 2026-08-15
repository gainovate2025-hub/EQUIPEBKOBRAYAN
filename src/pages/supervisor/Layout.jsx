import { Outlet } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import NavMenu from '../../components/ui/NavMenu'
import { SupervisorDataProvider } from '../../lib/SupervisorDataContext'

const NAV_ITEMS = [
  { to: '/supervisor', label: 'Dashboard', end: true },
  { to: '/supervisor/comissao', label: 'Comissão' },
  { to: '/supervisor/contestacoes', label: 'Contestações' },
  { to: '/supervisor/reagendamentos', label: 'Reagendamentos' },
  { to: '/supervisor/objetivos', label: 'Objetivos' },
  { to: '/supervisor/notas', label: 'Notas' },
  { to: '/supervisor/equipe', label: 'Equipe' },
  { to: '/supervisor/configuracoes', label: 'Configurações' },
]

export default function SupervisorLayout() {
  return (
    <SupervisorDataProvider>
      <div className="bg-glow min-h-screen" style={{ padding: '36px 44px 56px' }}>
        <PageHeader title="BKO · Supervisão" subtitle="Acompanhamento diário da operação" />
        <NavMenu items={NAV_ITEMS} />
        <div className="mt-8">
          <Outlet />
        </div>
      </div>
    </SupervisorDataProvider>
  )
}
