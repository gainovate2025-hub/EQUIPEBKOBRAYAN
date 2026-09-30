import { useState } from 'react'
import SectionHeading from '../../components/ui/SectionHeading'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { submitRelatorio, submitContestacao } from '../../lib/api'

export default function RelatorioDiario() {
  const { toast, showToast } = useToast()
  const [reagendamentos, setReagendamentos] = useState('')
  const [faturas, setFaturas] = useState('')
  const [enviando, setEnviando] = useState(false)

  const [custCode, setCustCode] = useState('')
  const [observacao, setObservacao] = useState('')
  const [enviandoContestacao, setEnviandoContestacao] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const r = Math.max(parseInt(reagendamentos, 10) || 0, 0)
    const f = Math.max(parseInt(faturas, 10) || 0, 0)
    if (r + f <= 0) {
      return showToast('Preenche pelo menos um dos campos.', 'error')
    }
    setEnviando(true)
    try {
      await submitRelatorio({ reagendamentos: r, faturas: f })
      setReagendamentos('')
      setFaturas('')
      showToast('Relatório enviado.')
    } catch (err) {
      showToast(err.message || 'Falha ao enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  async function handleSubmitContestacao(e) {
    e.preventDefault()
    if (!custCode.trim()) return showToast('Informe o Cust Code.', 'error')
    setEnviandoContestacao(true)
    try {
      await submitContestacao(custCode.trim(), observacao.trim())
      setCustCode('')
      setObservacao('')
      showToast('Contestação enviada para aprovação.')
    } catch (err) {
      showToast(err.message || 'Falha ao enviar.', 'error')
    } finally {
      setEnviandoContestacao(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Relatório diário" hint="Manda um resumo rápido do que fez hoje" />

      <form onSubmit={handleSubmit} className="card flex flex-wrap items-end gap-4 p-5">
        <Field label="Reagendamentos">
          <input type="number" min="0" className="field-input" placeholder="0" value={reagendamentos} onChange={(e) => setReagendamentos(e.target.value)} />
        </Field>
        <Field label="Faturas">
          <input type="number" min="0" className="field-input" placeholder="0" value={faturas} onChange={(e) => setFaturas(e.target.value)} />
        </Field>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar relatório'}
        </button>
      </form>

      <div className="card flex flex-col gap-3 p-5">
        <span className="text-sm font-semibold">Contestação</span>
        <form onSubmit={handleSubmitContestacao} className="flex flex-wrap items-end gap-4">
          <Field label="Cust Code">
            <input className="field-input" placeholder="Ex: CC-10293" value={custCode} onChange={(e) => setCustCode(e.target.value)} />
          </Field>
          <Field label="Observação (opcional)">
            <input className="field-input" placeholder="Detalhe o caso para o supervisor" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </Field>
          <button type="submit" className="btn-primary" disabled={enviandoContestacao}>
            {enviandoContestacao ? 'Enviando…' : 'Enviar para aprovação'}
          </button>
        </form>
      </div>

      <Toast toast={toast} />
    </div>
  )
}
