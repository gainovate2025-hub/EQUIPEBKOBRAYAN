import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import PlanilhaLista from '../../components/planilha/PlanilhaLista'

export default function BkoReagendamentos() {
  const { profile } = useAuth()

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Reagendamentos" hint="Seus clientes pra reagendar — planilha Controle de fatura" />
      <PlanilhaLista
        modulo="reagendamento"
        filtroNomes={profile?.name ? [profile.name] : []}
        mostrarWhatsapp
      />
    </div>
  )
}
