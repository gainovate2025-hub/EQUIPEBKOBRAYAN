import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import SectionHeading from '../components/ui/SectionHeading'
import StatCard from '../components/ui/StatCard'
import Toast from '../components/ui/Toast'
import { useToast } from '../lib/useToast'
import { fetchCasosWhatsapp, pegarCasoWhatsapp } from '../lib/api'
import { fmtDateTime } from '../lib/helpers'

const ASSUNTO_LABEL = { fatura: 'Fatura', portabilidade: 'Portabilidade' }

export default function CasosWhatsapp() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [casos, setCasos] = useState([])
  const [loading, setLoading] = useState(true)
  const [pegando, setPegando] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setCasos(await fetchCasosWhatsapp())
    } catch (err) {
      showToast(err.message || 'Falha ao carregar os casos.', 'error')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { reload() }, [reload])

  async function pegar(id) {
    setPegando(id)
    try {
      await pegarCasoWhatsapp(id)
      showToast('Caso pego — o cliente já é seu.')
      reload()
    } catch (err) {
      showToast(err.message, 'error')
      reload() // alguém pode ter pego antes — atualiza a lista pra mostrar
    } finally {
      setPegando(null)
    }
  }

  const pendentes = casos.filter((c) => c.status === 'pendente')
  const emAtendimento = casos.filter((c) => c.status === 'em_atendimento')
  const souEu = (c) => c.pego_por === profile?.id

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Casos do WhatsApp"
        hint="O bot encaminha aqui quando o cliente pede um atendente. Quem pegar primeiro, atende."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Aguardando" value={pendentes.length} />
        <StatCard label="Em atendimento" value={emAtendimento.length} />
        <StatCard label="Total" value={casos.length} />
      </div>

      {loading && <p className="text-sm text-muted">Carregando…</p>}
      {!loading && casos.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">Nenhum caso encaminhado ainda.</div>
      )}

      <div className="flex flex-col gap-2">
        {casos.map((c) => (
          <div key={c.id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">{c.nome}</span>
                <span className="rounded bg-paper px-1.5 py-0.5 text-xs text-subtle">{ASSUNTO_LABEL[c.assunto] || c.assunto}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {c.telefone}
                {c.cnpj && ` · CNPJ ${c.cnpj}`}
              </p>
              <p className="mt-1 text-[11px] text-subtle">
                Encaminhado em {fmtDateTime(c.criado_em)}
                {c.status === 'em_atendimento' && (
                  <> · atendido por {souEu(c) ? 'você' : (c.profiles?.name || 'alguém')}</>
                )}
              </p>
            </div>

            {c.status === 'pendente' ? (
              <button type="button" className="btn-primary btn-sm shrink-0" disabled={pegando === c.id} onClick={() => pegar(c.id)}>
                {pegando === c.id ? 'Pegando…' : 'Pegar caso'}
              </button>
            ) : (
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${souEu(c) ? 'bg-good-bg text-good-text' : 'bg-paper text-subtle'}`}>
                {souEu(c) ? 'Seu caso' : 'Em atendimento'}
              </span>
            )}
          </div>
        ))}
      </div>

      <Toast toast={toast} />
    </div>
  )
}
