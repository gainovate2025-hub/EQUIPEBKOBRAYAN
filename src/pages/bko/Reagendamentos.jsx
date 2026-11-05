import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { fetchReagendamentoCasos, registrarReagendamentoProprio } from '../../lib/api'

export default function BkoReagendamentos() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [quantidade, setQuantidade] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviados, setEnviados] = useState([])
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    if (!profile?.id) return
    setCarregando(true)
    try {
      setEnviados(await fetchReagendamentoCasos({ bkoId: profile.id }))
    } catch (err) {
      showToast(err.message || 'Falha ao carregar.', 'error')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [profile?.id])

  async function handleSubmit(e) {
    e.preventDefault()
    const qtd = Number(quantidade)
    if (!qtd || qtd < 1) {
      return showToast('Informe quantos reagendamentos você fez.', 'error')
    }
    setEnviando(true)
    try {
      await registrarReagendamentoProprio(qtd)
      setQuantidade('')
      showToast('Reagendamento registrado — já contou na meta e na comissão.')
      carregar()
    } catch (err) {
      showToast(err.message || 'Falha ao enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  const total = enviados.reduce((soma, c) => soma + (c.quantidade || 1), 0)

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Reagendamento" hint="Manda direto quantos reagendamentos você já fez" />

      <form onSubmit={handleSubmit} className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Quantos você fez">
          <input
            className="field-input w-28"
            type="number"
            min="1"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Ex: 3"
          />
        </Field>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar reagendamento'}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted">Enviados por você — {total} no total</p>
        {carregando ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : enviados.length === 0 ? (
          <p className="text-sm text-muted">Nenhum reagendamento enviado ainda.</p>
        ) : (
          enviados.map((c) => (
            <div key={c.id} className="card flex items-center justify-between gap-2 p-3 text-sm">
              <span className="font-medium text-ink">{c.quantidade || 1} reagendamento{(c.quantidade || 1) > 1 ? 's' : ''}</span>
              <span className="text-xs text-muted">
                {c.feito_em ? new Date(c.feito_em).toLocaleString('pt-BR') : ''}
              </span>
            </div>
          ))
        )}
      </div>
      <Toast toast={toast} />
    </div>
  )
}
