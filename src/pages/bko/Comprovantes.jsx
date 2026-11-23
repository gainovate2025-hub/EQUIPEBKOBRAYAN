import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import Secao from '../../components/ui/Secao'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { registrarComprovanteFatura } from '../../lib/api'
import ListaComprovantes from '../../components/comprovantes/ListaComprovantes'

// Comprovantes de fatura enviada (05/11/2026): sobe o print/foto do que
// mandou hoje, aparece no relatório do dia do supervisor, e já soma +1
// fatura e +R$2 na comissão na hora (migration_044 + migration_047).
// Zera sozinho todo mês.

export default function BkoComprovantes() {
  const { user } = useAuth()
  const { toast, showToast } = useToast()
  const [observacao, setObservacao] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  // Muda a cada envio, pra lista de baixo recarregar.
  const [versao, setVersao] = useState(0)

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
      setVersao((v) => v + 1)
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

      <Secao titulo="Meus comprovantes enviados">
        <ListaComprovantes somenteUsuarioId={user?.id} recarregarQuando={versao} />
      </Secao>
      <Toast toast={toast} />
    </div>
  )
}
