import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { fetchReagendamentoCasos, registrarReagendamentoProprio } from '../../lib/api'

// Reescrito em 05/11/2026 — BKO manda direto o reagendamento que já fez
// (sem fila de pendência pra marcar depois).

export default function BkoReagendamentos() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [cnpj, setCnpj] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [custcode, setCustcode] = useState('')
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
    if (!cnpj.trim() || !razaoSocial.trim()) {
      return showToast('Preenche o CNPJ e a Razão Social.', 'error')
    }
    setEnviando(true)
    try {
      await registrarReagendamentoProprio(cnpj.trim(), razaoSocial.trim(), custcode.trim())
      setCnpj('')
      setRazaoSocial('')
      setCustcode('')
      showToast('Reagendamento registrado — já contou na meta e na comissão.')
      carregar()
    } catch (err) {
      showToast(err.message || 'Falha ao enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Reagendamentos" hint="Manda direto o que você já reagendou — CNPJ e Razão Social" />

      <form onSubmit={handleSubmit} className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="CNPJ">
          <input className="field-input" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
        </Field>
        <Field label="Razão Social">
          <input className="field-input" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} placeholder="Nome da empresa" />
        </Field>
        <Field label="CustCode (opcional)">
          <input className="field-input" value={custcode} onChange={(e) => setCustcode(e.target.value)} placeholder="Ex: CC-10293" />
        </Field>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar reagendamento'}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted">Enviados por você ({enviados.length})</p>
        {carregando ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : enviados.length === 0 ? (
          <p className="text-sm text-muted">Nenhum reagendamento enviado ainda.</p>
        ) : (
          enviados.map((c) => (
            <div key={c.id} className="card flex items-center justify-between gap-2 p-3 text-sm">
              <div>
                <span className="font-medium text-ink">{c.razao_social}</span>{' '}
                <span className="text-muted">· {c.cnpj}{c.custcode && ` · ${c.custcode}`}</span>
              </div>
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
