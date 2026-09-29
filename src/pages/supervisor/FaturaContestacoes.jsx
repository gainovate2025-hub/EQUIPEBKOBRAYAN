import { useMemo } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import PlanilhaLista from '../../components/planilha/PlanilhaLista'

export default function FaturaContestacoes() {
  const { team } = useSupervisorData()
  const filtroNomes = useMemo(() => team.map((b) => b.name), [team])

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Contestação (Faturas)" hint="Clientes em contestação — planilha Controle de fatura" />
      <PlanilhaLista modulo="contestacao" filtroNomes={filtroNomes} mostrarWhatsapp mostrarProtocolo />
    </div>
  )
}
