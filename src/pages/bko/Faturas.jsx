import SectionHeading from '../../components/ui/SectionHeading'
import PlanilhaLista from '../../components/planilha/PlanilhaLista'

const STATUS_OPCOES = [
  'TRATANDO',
  'CONTESTADO',
  'INCONTESTÁVEL',
  'FATURA PAGA',
  'CLIENTE NÃO ATENDEU',
  'CLIENTE SE RECUSA A PAGAR',
]

export default function BkoFaturas() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Faturas" hint="Clientes com fatura em aberto — planilha Controle de fatura" />
      <PlanilhaLista
        modulo="fatura"
        filtroNomes={null}
        statusOpcoes={STATUS_OPCOES}
        mostrarWhatsapp
        mostrarProtocolo
        mostrarRetorno
        autoDataContestado
      />
    </div>
  )
}
