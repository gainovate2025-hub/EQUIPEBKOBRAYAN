import { useState } from 'react'
import SectionHeading from '../../components/ui/SectionHeading'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { submitRelatorio } from '../../lib/api'

export default function RelatorioDiario() {
  const { toast, showToast } = useToast()
  const [reagendamentos, setReagendamentos] = useState('')
  const [contestacoes, setContestacoes] = useState('')
  const [faturas, setFaturas] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const r = Math.max(parseInt(reagendamentos, 10) || 0, 0)
    const c = Math.max(parseInt(contestacoes, 10) || 0, 0)
    const f = Math.max(parseInt(faturas, 10) || 0, 0)
    if (r + c + f <= 0) {
      return showToast('Preenche pelo menos um dos campos.', 'error')
    }
    setEnviando(true)
    try {
      await submitRelatorio({ reagendamentos: r, contestacoes: c, faturas: f })
      setReagendamentos('')
      setContestacoes('')
      setFaturas('')
      showToast('Relatório enviado.')
    } catch (err) {
      showToast(err.message || 'Falha ao enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Relatório diário" hint="Manda um resumo rápido do que fez hoje" />
      <form onSubmit={handleSubmit} className="card flex flex-wrap items-end gap-4 p-5">
        <Field label="Reagendamentos">
          <input type="number" min="0" className="field-input" placeholder="0" value={reagendamentos} onChange={(e) => setReagendamentos(e.target.value)} />
        </Field>
        <Field label="Contestações">
          <input type="number" min="0" className="field-input" placeholder="0" value={contestacoes} onChange={(e) => setContestacoes(e.target.value)} />
        </Field>
        <Field label="Faturas">
          <input type="number" min="0" className="field-input" placeholder="0" value={faturas} onChange={(e) => setFaturas(e.target.value)} />
        </Field>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar relatório'}
        </button>
      </form>
      <Toast toast={toast} />
    </div>
  )
}
