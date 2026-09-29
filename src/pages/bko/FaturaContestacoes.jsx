import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import PlanilhaLista from '../../components/planilha/PlanilhaLista'

export default function BkoFaturaContestacoes() {
  const { profile } = useAuth()

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Contestação (Faturas)" hint="Seus clientes em contestação na planilha" />
      <PlanilhaLista
        modulo="contestacao"
        filtroNomes={profile?.name ? [profile.name] : []}
        mostrarWhatsapp
        mostrarProtocolo
      />
    </div>
  )
}
