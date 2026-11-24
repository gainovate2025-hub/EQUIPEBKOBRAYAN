import { useCallback, useEffect, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { anexarComprovanteFatura, subirArquivoComprovante } from '../../lib/api'
import Secao from '../ui/Secao'

// CUSTCODEs que o BKO mandou sem comprovante (24/11/2026, migration_077).
// Aparecem aqui de qualquer dia até ele anexar o arquivo; ao anexar, conta
// +1 fatura e +R$2 na comissão.

function dataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

export default function AguardandoComprovante({ userId, recarregarQuando = 0, onAnexou }) {
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [arquivos, setArquivos] = useState({})
  const [anexando, setAnexando] = useState(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!userId) return
    setCarregando(true)
    const { data, error } = await supabase
      .from('comprovantes_fatura')
      .select('id, custcode, observacao, enviado_em')
      .eq('user_id', userId)
      .is('arquivo_path', null)
      .order('enviado_em', { ascending: true })
    setErro(error ? error.message : '')
    setLinhas(data || [])
    setCarregando(false)
  }, [userId])

  useEffect(() => { carregar() }, [carregar, recarregarQuando])

  async function anexar(item) {
    const arquivo = arquivos[item.id]
    if (!arquivo) return setErro('Escolha o arquivo do comprovante primeiro.')
    setErro('')
    setAnexando(item.id)
    try {
      const { caminho, url } = await subirArquivoComprovante(userId, arquivo)
      await anexarComprovanteFatura(item.id, caminho, url)
      setArquivos((a) => ({ ...a, [item.id]: null }))
      onAnexou?.(item)
      carregar()
    } catch (err) {
      setErro(err.message || 'Falha ao anexar.')
    } finally {
      setAnexando(null)
    }
  }

  if (carregando || (linhas.length === 0 && !erro)) return null

  // A seção só aparece quando tem algum CUSTCODE aguardando.
  return (
    <Secao titulo="Aguardando comprovante">
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {linhas.length} CUSTCODE{linhas.length === 1 ? '' : 's'} esperando comprovante. Só conta na comissão depois que você anexar.
      </p>
      {erro && <p className="tim-alert" role="alert">{erro}</p>}
      <div className="card divide-y divide-line">
        {linhas.map((c) => (
          <div key={c.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-ink">CUSTCODE {c.custcode}</span>
              <span className="truncate text-muted">{c.observacao ? `${c.observacao} · ` : ''}enviado {dataHora(c.enviado_em)}</span>
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="field-input sm:w-60"
              aria-label={`Comprovante do CUSTCODE ${c.custcode}`}
              onChange={(e) => setArquivos((a) => ({ ...a, [c.id]: e.target.files?.[0] || null }))}
            />
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={anexando === c.id || !arquivos[c.id]}
              onClick={() => anexar(c)}
            >
              <Paperclip size={14} /> {anexando === c.id ? 'Anexando…' : 'Anexar'}
            </button>
          </div>
        ))}
      </div>
    </div>
    </Secao>
  )
}
