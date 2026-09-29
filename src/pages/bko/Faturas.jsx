import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { submitRelatorio } from '../../lib/api'
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
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [valor, setValor] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const n = Math.max(parseInt(valor, 10) || 0, 0)
    if (n <= 0) {
      showToast('Informe uma quantidade.', 'error')
      return
    }
    setEnviando(true)
    try {
      await submitRelatorio({ faturas: n })
      setValor('')
      showToast('Faturas enviadas — contam na hora.')
    } catch (err) {
      showToast(err.message || 'Falha ao enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Faturas" hint="Seus clientes com fatura em aberto — planilha Controle de fatura" />

      <form onSubmit={handleSubmit} className="card flex flex-wrap items-end gap-4 p-5">
        <Field label="Faturas feitas hoje">
          <input
            type="number"
            min="0"
            className="field-input"
            placeholder="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </Field>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      <PlanilhaLista
        modulo="fatura"
        filtroNomes={profile?.name ? [profile.name] : []}
        statusOpcoes={STATUS_OPCOES}
        mostrarWhatsapp
        mostrarProtocolo
        mostrarRetorno
        autoDataContestado
      />

      <Toast toast={toast} />
    </div>
  )
}
