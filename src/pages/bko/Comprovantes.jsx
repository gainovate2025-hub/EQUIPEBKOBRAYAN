import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import Secao from '../../components/ui/Secao'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { registrarComprovanteFatura } from '../../lib/api'

// Comprovantes de fatura enviada (05/11/2026): sobe o print/foto do que
// mandou hoje, aparece no relatório do dia do supervisor, e já soma +1
// fatura e +R$2 na comissão na hora (migration_044 + migration_047).
// Zera sozinho todo mês.

function inicioDoDia() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function BkoComprovantes() {
  const { user } = useAuth()
  const { toast, showToast } = useToast()
  const [observacao, setObservacao] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [meus, setMeus] = useState([])
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase
      .from('comprovantes_fatura')
      .select('*')
      .eq('user_id', user.id)
      .gte('enviado_em', inicioDoDia())
      .order('enviado_em', { ascending: false })
    setMeus(data || [])
    setCarregando(false)
  }

  useEffect(() => {
    if (user) carregar()
  }, [user])

  async function enviar(e) {
    e.preventDefault()
    if (!arquivo) return showToast('Escolha um arquivo primeiro.', 'error')
    setEnviando(true)
    try {
      const extensao = arquivo.name.split('.').pop()
      const caminho = `${user.id}/${Date.now()}.${extensao}`
      const { error: erroUpload } = await supabase.storage.from('comprovantes').upload(caminho, arquivo)
      if (erroUpload) throw erroUpload

      const { data: pub } = supabase.storage.from('comprovantes').getPublicUrl(caminho)
      await registrarComprovanteFatura(caminho, pub.publicUrl, observacao.trim())

      setArquivo(null)
      setObservacao('')
      e.target.reset()
      showToast('Comprovante enviado. Já contou +R$2 na comissão.')
      carregar()
    } catch (err) {
      showToast(err.message || 'Falha ao enviar o comprovante.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">Envie o print ou a foto de cada fatura que você mandou hoje.</p>

      <Secao titulo="Enviar comprovante">
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <label className="tim-label">
            Arquivo (foto ou print)
            <input
              type="file"
              accept="image/*,application/pdf"
              className="field-input"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            />
          </label>
          <label className="tim-label">
            Observação (opcional)
            <input
              className="field-input"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="ex: CUST CODE, nome do cliente…"
            />
          </label>
          <button type="submit" className="btn-primary self-start" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar comprovante'}
          </button>
        </form>
      </Secao>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium text-muted">Enviados hoje ({meus.length})</p>
        {carregando ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : meus.length === 0 ? (
          <p className="text-sm text-muted">Nenhum comprovante enviado hoje ainda.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {meus.map((c) => (
              <a
                key={c.id}
                href={c.arquivo_url}
                target="_blank"
                rel="noreferrer"
                className="card flex flex-col gap-1 p-3 text-xs hover:border-brand-300"
              >
                <span className="truncate font-medium text-ink">{c.observacao || 'Comprovante'}</span>
                <span className="text-muted">
                  {new Date(c.enviado_em).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  )
}
