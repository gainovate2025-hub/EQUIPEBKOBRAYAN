import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import FaturaContestacaoList from '../../components/faturas/FaturaContestacaoList'

export default function BkoFaturaContestacoes() {
  const { profile } = useAuth()

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Contestação (Faturas)" hint="Seus clientes marcados como contestação na planilha" />
      <FaturaContestacaoList filtroNomes={profile?.name ? [profile.name] : []} />
    </div>
  )
}
