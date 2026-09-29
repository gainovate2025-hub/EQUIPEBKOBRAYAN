import { useMemo } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import FaturaContestacaoList from '../../components/faturas/FaturaContestacaoList'

export default function FaturaContestacoes() {
  const { team } = useSupervisorData()
  const filtroNomes = useMemo(() => team.map((b) => b.name), [team])

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Contestação (Faturas)" hint="Clientes marcados como contestação na planilha Controle de fatura" />
      <FaturaContestacaoList filtroNomes={filtroNomes} />
    </div>
  )
}
