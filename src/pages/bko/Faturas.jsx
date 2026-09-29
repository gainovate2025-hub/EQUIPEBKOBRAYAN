import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import FaturasList from '../../components/faturas/FaturasList'

export default function BkoFaturas() {
  const { profile } = useAuth()

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Faturas" hint="Seus clientes com fatura em aberto — planilha Controle de fatura" />
      <FaturasList filtroNomes={profile?.name ? [profile.name] : []} />
    </div>
  )
}
