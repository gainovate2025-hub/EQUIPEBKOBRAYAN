import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Secao from '../../components/ui/Secao'

// Aba "Comparar com Google Chat" do Crivo (16/11/2026, pedido do Brayan).
// A extensão "Crivo — Leitor do Google Chat" grava em crivo_gchat cada CNPJ
// respondido no chat "PEDIDOS TIM EMPRESAS." (migration_061) e manda o
// mesmo CNPJ pra fila do nosso Crivo. Aqui mostra as duas respostas lado a
// lado e se bateram.

function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatarCnpj(v) {
  const d = (v || '').replace(/\D/g, '')
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v
}

// Mesmo veredito do chat do Crivo.
function nossaResposta(c) {
  if (!c) return null
  if (c.status === 'erro') return 'ERRO'
  const s1 = c.sistema1_resultado
  const s2 = c.sistema2_resultado
  if (s1 === 'reprovado' || s2 === 'reprovado') return 'REPROVADO'
  if (s1 === 'nao_encontrado' || s2 === 'nao_encontrado') return 'CNPJ ERRADO'
  if (s1 === 'aprovado' && s2 === 'aprovado') return 'APROVADO'
  return c.status === 'pendente' ? 'AGUARDANDO' : null
}

const COR = {
  APROVADO: 'badge-ok',
  REPROVADO: 'badge-bad',
  'CNPJ ERRADO': 'badge border-warn-border bg-warn-bg text-warn-text',
  ERRO: 'badge-bad',
  AGUARDANDO: 'badge-neutral',
}

export default function CrivoGoogleChat() {
  const [dia, setDia] = useState(hojeLocal)
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('crivo_gchat')
      .select('id, cnpj, resposta, capturado_em, consulta:crivo_consultas(status, sistema1_resultado, sistema2_resultado, sistema1_motivo, sistema2_motivo, pc)')
      .eq('dia', dia)
      .order('capturado_em', { ascending: false })
    setErro(error ? (error.message.includes('crivo_gchat') ? 'Falta rodar o SQL do Google Chat (migration_061) no Supabase.' : error.message) : '')
    setLista(data || [])
    setCarregando(false)
  }, [dia])

  useEffect(() => {
    setCarregando(true)
    carregar()
    const t = setInterval(carregar, 10000)
    return () => clearInterval(t)
  }, [carregar])

  const linhas = lista.map((g) => {
    const nossa = nossaResposta(g.consulta)
    const terminou = nossa && nossa !== 'AGUARDANDO'
    return { ...g, nossa, bateu: terminou ? nossa === g.resposta : null }
  })
  const respondidos = linhas.filter((l) => l.bateu !== null)
  const bateram = respondidos.filter((l) => l.bateu).length

  return (
    <div className="flex flex-col gap-4">
      <Secao titulo="Comparar com o Google Chat (PEDIDOS TIM EMPRESAS.)">
        <p className="mb-3 text-sm text-muted">
          A extensão "Leitor do Google Chat" pega cada CNPJ respondido lá e manda pro nosso Crivo. Aqui aparecem as duas respostas lado a lado.
        </p>
        <label className="flex w-fit flex-col">
          <span className="mb-1.5 block text-xs font-medium text-muted">Dia</span>
          <input type="date" className="field-input" value={dia} max={hojeLocal()} onChange={(e) => setDia(e.target.value || hojeLocal())} />
        </label>

        <p className="mt-3 text-sm font-semibold text-ink">
          {carregando
            ? 'Carregando…'
            : `${lista.length} CNPJ(s) do Google Chat · ${respondidos.length} já respondido(s) pelo nosso Crivo · ${bateram} bateram${respondidos.length ? ` (${Math.round((bateram / respondidos.length) * 100)}%)` : ''}`}
        </p>
        {erro && <p className="mt-2 text-sm font-medium text-bad-text" role="alert">{erro}</p>}

        {!carregando && lista.length === 0 && !erro ? (
          <p className="mt-3 text-sm text-muted">Nenhum CNPJ do Google Chat nesse dia. Deixe o chat aberto no Chrome com a extensão instalada.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3">Hora</th>
                  <th className="py-1 pr-3">CNPJ</th>
                  <th className="py-1 pr-3">Google Chat</th>
                  <th className="py-1 pr-3">Nosso Crivo</th>
                  <th className="py-1 pr-3">Bateu?</th>
                  <th className="py-1">Motivo do nosso Crivo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-t border-divider">
                    <td className="whitespace-nowrap py-1.5 pr-3">{new Date(l.capturado_em).toLocaleTimeString('pt-BR')}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 font-mono">{formatarCnpj(l.cnpj)}</td>
                    <td className="py-1.5 pr-3"><span className={COR[l.resposta] || 'badge-neutral'}>{l.resposta}</span></td>
                    <td className="py-1.5 pr-3">{l.nossa ? <span className={COR[l.nossa] || 'badge-neutral'}>{l.nossa}</span> : '—'}</td>
                    <td className="py-1.5 pr-3 font-semibold">
                      {l.bateu === null ? <span className="text-muted">…</span> : l.bateu ? <span className="text-good-text">Sim</span> : <span className="text-bad-text">Não</span>}
                    </td>
                    <td className="py-1.5 text-xs text-muted">{(l.consulta?.sistema2_motivo || l.consulta?.sistema1_motivo || '').slice(0, 90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  )
}
