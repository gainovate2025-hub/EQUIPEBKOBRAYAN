import { useMemo } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import FaturasList from '../../components/faturas/FaturasList'

export default function Faturas() {
  const { team } = useSupervisorData()
  // team já vem escopado certo (líder/supervisor com equipe vinculada só
  // vê o próprio time; sem equipe vinculada, todo mundo) — veja fetchTeam.
  const filtroNomes = useMemo(() => team.map((b) => b.name), [team])

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Faturas" hint="Clientes com fatura em aberto — planilha Controle de fatura" />
      <FaturasList filtroNomes={filtroNomes} />
    </div>
  )
}
