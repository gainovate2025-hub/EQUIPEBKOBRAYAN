import SectionHeading from '../../components/ui/SectionHeading'
import PlanilhaLista from '../../components/planilha/PlanilhaLista'

export default function FaturaContestacoes() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Contestação (Faturas)" hint="Clientes em contestação na planilha" />
      <PlanilhaLista modulo="contestacao" filtroNomes={null} mostrarWhatsapp mostrarProtocolo />
    </div>
  )
}
