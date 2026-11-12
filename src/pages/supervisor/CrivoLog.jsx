import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Secao from '../../components/ui/Secao'

// Crivo com 3 PCs (12/11/2026, migration_053). Cada PC tem 2 sistemas
// (1: cliente, 2: negociação). Aqui fica o monitoramento: quais PCs estão
// conectados, a fila, o tempo de resposta e os erros/repasses de cada PC.

const NOME_SISTEMA = { 1: 'Sistema 1: cliente', 2: 'Sistema 2: negociação' }

// Fila: até 4 esperando é normal; 5 a 9 cheia; 10+ lotada.
function nivelFila(qtd) {
  if (qtd >= 10) return { texto: 'Lotada', classe: 'badge-bad' }
  if (qtd >= 5) return { texto: 'Cheia', classe: 'badge border-warn-border bg-warn-bg text-warn-text' }
  return { texto: 'Tranquila', classe: 'badge-ok' }
}

function formatarCnpj(v) {
  const d = (v || '').replace(/\D/g, '')
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v
}

function duracao(ms) {
  if (ms == null || Number.isNaN(ms)) return '—'
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

function hora(iso) {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR') : '—'
}

function etapa(c) {
  if (!c.pc) return c.sistema1_resultado === 'aprovado' ? 'Na fila (falta o sistema 2)' : 'Na fila'
  if (!c.sistema1_resultado) return `PC ${c.pc} · sistema 1`
  return `PC ${c.pc} · sistema 2`
}

// Busca o status dos 3 PCs (usado aqui e na faixa do chat).
export function useStatusPcs(intervaloMs = 5000) {
  const [pcs, setPcs] = useState(null)
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('crivo_status_pcs')
    if (error) return setPcs({ erro: error.message })
    const porPc = [1, 2, 3].map((pc) => {
      const s1 = data.find((l) => l.pc === pc && l.sistema === 1)
      const s2 = data.find((l) => l.pc === pc && l.sistema === 2)
      return { pc, s1, s2, pronto: !!(s1?.conectado && s2?.conectado) }
    })
    setPcs(porPc)
  }, [])
  useEffect(() => {
    carregar()
    const id = setInterval(carregar, intervaloMs)
    return () => clearInterval(id)
  }, [carregar, intervaloMs])
  return pcs
}

function Bolinha({ on }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${on ? 'bg-good-text' : 'bg-bad-text'}`} aria-hidden />
}

// Faixa curta pro topo do chat: quais PCs estão recebendo CNPJ agora.
export function FaixaPcs() {
  const pcs = useStatusPcs()
  if (!pcs || pcs.erro) return null
  const prontos = pcs.filter((p) => p.pronto).length
  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 p-3 text-sm">
      <span className="font-semibold">PCs do Crivo ({prontos}/3 conectados):</span>
      {pcs.map((p) => (
        <span key={p.pc} className="inline-flex items-center gap-1.5" title={`${NOME_SISTEMA[1]}: ${p.s1?.conectado ? 'conectado' : 'desconectado'} · ${NOME_SISTEMA[2]}: ${p.s2?.conectado ? 'conectado' : 'desconectado'}`}>
          <Bolinha on={p.pronto} /> PC {p.pc}
        </span>
      ))}
      {prontos === 0 && <span className="font-medium text-bad-text">Nenhum PC conectado: os CNPJs ficam esperando na fila.</span>}
    </div>
  )
}

export default function CrivoLog() {
  const pcs = useStatusPcs()
  const [consultas, setConsultas] = useState([])
  const [eventos, setEventos] = useState([])
  const [logCompleto, setLogCompleto] = useState([])
  const [verCompleto, setVerCompleto] = useState(false)
  const [agora, setAgora] = useState(Date.now())
  const [erroCarga, setErroCarga] = useState('')

  const carregar = useCallback(async () => {
    const inicioDoDia = new Date()
    inicioDoDia.setHours(0, 0, 0, 0)
    const desde = inicioDoDia.toISOString()

    const [cons, evts] = await Promise.all([
      supabase
        .from('crivo_consultas')
        .select('id, cnpj, status, pc, pc_desde, repasses, pcs_tentados, sistema1_resultado, sistema2_resultado, erro_mensagem, created_at, concluido_at')
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase
        .from('crivo_logs')
        .select('id, criado_em, pc, numero_sistema, tipo, mensagem, crivo_consultas(cnpj)')
        .in('tipo', ['erro', 'repasse'])
        .gte('criado_em', desde)
        .order('criado_em', { ascending: false })
        .limit(100),
    ])
    if (cons.error || evts.error) setErroCarga((cons.error || evts.error).message)
    else setErroCarga('')
    setConsultas(cons.data || [])
    setEventos(evts.data || [])
    setAgora(Date.now())
  }, [])

  const carregarCompleto = useCallback(async () => {
    const { data } = await supabase
      .from('crivo_logs')
      .select('id, criado_em, pc, numero_sistema, tipo, mensagem, crivo_consultas(cnpj)')
      .order('criado_em', { ascending: false })
      .limit(150)
    setLogCompleto(data || [])
  }, [])

  useEffect(() => {
    carregar()
    const id = setInterval(carregar, 5000)
    return () => clearInterval(id)
  }, [carregar])

  useEffect(() => {
    if (!verCompleto) return
    carregarCompleto()
    const id = setInterval(carregarCompleto, 5000)
    return () => clearInterval(id)
  }, [verCompleto, carregarCompleto])

  const fila = consultas.filter((c) => c.status === 'pendente').slice().reverse()
  const nivel = nivelFila(fila.length)
  const concluidas = consultas.filter((c) => c.status === 'concluido' && c.concluido_at)
  const tempos = concluidas.map((c) => new Date(c.concluido_at) - new Date(c.created_at))
  const media = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null
  const maior = tempos.length ? Math.max(...tempos) : null
  const ultimas10 = tempos.slice(0, 10)
  const mediaRecente = ultimas10.length ? ultimas10.reduce((a, b) => a + b, 0) / ultimas10.length : null
  const errosHoje = consultas.filter((c) => c.status === 'erro').length
  const repassesHoje = consultas.reduce((s, c) => s + (c.repasses || 0), 0)

  const porPc = [1, 2, 3].map((pc) => {
    const doPc = concluidas.filter((c) => c.pc === pc)
    const t = doPc.map((c) => new Date(c.concluido_at) - new Date(c.created_at))
    return {
      pc,
      feitas: doPc.length,
      media: t.length ? t.reduce((a, b) => a + b, 0) / t.length : null,
      erros: eventos.filter((e) => e.pc === pc && e.tipo === 'erro').length,
      repasses: eventos.filter((e) => e.pc === pc && e.tipo === 'repasse').length,
    }
  })

  return (
    <div className="flex flex-col gap-4">
      {erroCarga && (
        <p className="tim-alert" role="alert">
          Não consegui carregar o log ({erroCarga}). Confira se a migration_053 já foi rodada no Supabase.
        </p>
      )}

      <Secao titulo="PCs conectados">
        {!pcs && <p className="text-sm text-muted">Carregando…</p>}
        {pcs?.erro && <p className="text-sm text-bad-text">Erro: {pcs.erro}</p>}
        {Array.isArray(pcs) && (
          <div className="grid gap-3 sm:grid-cols-3">
            {pcs.map((p) => {
              const info = porPc.find((x) => x.pc === p.pc)
              const ocupado = p.s1?.consulta_id || p.s2?.consulta_id
              return (
                <div key={p.pc} className={`card flex flex-col gap-2 p-3 text-sm ${p.pronto ? '' : 'border-bad-border'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold">PC {p.pc}</span>
                    <span className={p.pronto ? 'badge-ok' : 'badge-bad'}>{p.pronto ? 'Recebendo CNPJ' : 'Fora da fila'}</span>
                  </div>
                  {[1, 2].map((n) => {
                    const s = n === 1 ? p.s1 : p.s2
                    return (
                      <div key={n} className="flex items-center gap-2">
                        <Bolinha on={s?.conectado} />
                        <span>{NOME_SISTEMA[n]}</span>
                        <span className="ml-auto text-xs text-muted">
                          {s?.conectado ? 'conectado' : s?.visto_em ? `sem sinal desde ${hora(s.visto_em)}` : 'nunca conectou'}
                        </span>
                      </div>
                    )
                  })}
                  <div className="border-t border-divider pt-2 text-xs text-muted">
                    {ocupado ? 'Consultando agora' : 'Livre'} · hoje: {info.feitas} feitas · média {duracao(info.media)}
                    {(info.erros > 0 || info.repasses > 0) && (
                      <span className="text-bad-text"> · {info.erros} erros · {info.repasses} repasses</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Um PC só recebe CNPJ com os 2 sistemas conectados. Sem sinal por 30s, ele sai da fila sozinho.
        </p>
      </Secao>

      <Secao titulo="Tempo de resposta (hoje)">
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <Numero rotulo="Média do dia" valor={duracao(media)} />
          <Numero rotulo="Média das últimas 10" valor={duracao(mediaRecente)} />
          <Numero rotulo="Mais demorada" valor={duracao(maior)} />
          <Numero rotulo="Respondidas" valor={concluidas.length} />
          <Numero rotulo="Erros no chat" valor={errosHoje} ruim={errosHoje > 0} />
          <Numero rotulo="Repassadas pra outro PC" valor={repassesHoje} ruim={repassesHoje > 0} />
        </div>
      </Secao>

      <Secao
        titulo={`Fila agora (${fila.length})`}
        acao={<span className={nivel.classe}>{nivel.texto}</span>}
      >
        {fila.length === 0 ? (
          <p className="text-sm text-muted">Nenhum CNPJ esperando.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3">CNPJ</th>
                  <th className="py-1 pr-3">Onde está</th>
                  <th className="py-1 pr-3">Esperando há</th>
                  <th className="py-1 pr-3">Neste PC há</th>
                  <th className="py-1">Repasses</th>
                </tr>
              </thead>
              <tbody>
                {fila.map((c) => {
                  const noPc = c.pc && c.pc_desde ? agora - new Date(c.pc_desde) : null
                  return (
                    <tr key={c.id} className="border-t border-divider">
                      <td className="py-1.5 pr-3 font-mono">{formatarCnpj(c.cnpj)}</td>
                      <td className="py-1.5 pr-3">{etapa(c)}</td>
                      <td className="py-1.5 pr-3">{duracao(agora - new Date(c.created_at))}</td>
                      <td className={`py-1.5 pr-3 ${noPc > 90000 ? 'font-semibold text-bad-text' : ''}`}>{duracao(noPc)}</td>
                      <td className="py-1.5">{c.repasses ? `${c.repasses} (já passou no PC ${c.pcs_tentados.join(', ')})` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Passou de 1m50 no mesmo sistema de um PC, o CNPJ vai pra outro PC conectado.</p>
      </Secao>

      <Secao titulo="Erros e repasses (hoje)">
        {eventos.length === 0 ? (
          <p className="text-sm text-muted">Nenhum erro hoje.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-divider text-sm">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-1.5">
                <span className="text-xs text-muted">{hora(e.criado_em)}</span>
                <span className={e.tipo === 'erro' ? 'badge-bad' : 'badge-neutral'}>{e.tipo === 'erro' ? 'Erro' : 'Repasse'}</span>
                <span className="font-medium">PC {e.pc ?? '?'} · sistema {e.numero_sistema ?? '?'}</span>
                <span className="font-mono text-xs">{formatarCnpj(e.crivo_consultas?.cnpj)}</span>
                <span className="w-full break-words text-xs text-muted">{e.mensagem}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao
        titulo="Log completo"
        acao={
          <button type="button" className="text-sm font-medium text-white underline" onClick={() => setVerCompleto((v) => !v)}>
            {verCompleto ? 'Esconder' : 'Mostrar'}
          </button>
        }
      >
        {!verCompleto ? (
          <p className="text-sm text-muted">Cada passo que a extensão fez em cada PC (últimas 150 linhas).</p>
        ) : (
          <ul className="flex max-h-[480px] flex-col overflow-y-auto font-mono text-xs">
            {logCompleto.map((e) => (
              <li key={e.id} className={`border-t border-divider py-1 ${e.tipo !== 'info' ? 'text-bad-text' : ''}`}>
                {hora(e.criado_em)} · PC {e.pc ?? '?'} · sis {e.numero_sistema ?? '?'} · {formatarCnpj(e.crivo_consultas?.cnpj)} · {e.mensagem}
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  )
}

function Numero({ rotulo, valor, ruim }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{rotulo}</div>
      <div className={`text-lg font-semibold ${ruim ? 'text-bad-text' : ''}`}>{valor}</div>
    </div>
  )
}
