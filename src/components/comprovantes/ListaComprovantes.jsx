import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, ExternalLink, Trash2, CheckSquare, Square, Hourglass } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

// Lista dos comprovantes de fatura enviados, com filtro de período e
// miniatura de cada arquivo (pedido do Brayan em 23/11/2026: "pra eu poder
// ver os comprovantes enviados"). Usada na tela do BKO (só os dele) e na
// do supervisor (de todo mundo, com filtro por pessoa).
// Os comprovantes zeram todo dia 1 (migration_044), então "Este mês" é
// tudo o que existe.

const PERIODOS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: 'mes', label: 'Este mês' },
  { id: 'dia', label: 'Escolher dia' },
]

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Devolve [início, fim) do período, no horário do navegador.
function intervalo(periodo, dia) {
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  if (periodo === 'ontem') inicio.setDate(inicio.getDate() - 1)
  if (periodo === 'mes') inicio.setDate(1)
  if (periodo === 'dia' && dia) {
    const [a, m, d] = dia.split('-').map(Number)
    inicio.setFullYear(a, m - 1, d)
  }
  const fim = new Date(inicio)
  if (periodo === 'mes') fim.setMonth(fim.getMonth() + 1)
  else fim.setDate(fim.getDate() + 1)
  return [inicio.toISOString(), fim.toISOString()]
}

function ehImagem(c) {
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(c.arquivo_path || c.arquivo_url || '')
}

function dataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

export default function ListaComprovantes({ somenteUsuarioId = null, mostrarPessoa = false, recarregarQuando = 0 }) {
  const [periodo, setPeriodo] = useState('hoje')
  const [dia, setDia] = useState(hojeISO())
  const [pessoa, setPessoa] = useState('')
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  // Exclusão (23/11/2026): lixeira em cada um, ou "Selecionar" pra vários.
  const [selecionando, setSelecionando] = useState(false)
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [excluindo, setExcluindo] = useState(false)
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    const [de, ate] = intervalo(periodo, dia)
    let query = supabase
      .from('comprovantes_fatura')
      .select('*, profiles(name)')
      .gte('enviado_em', de)
      .lt('enviado_em', ate)
      .order('enviado_em', { ascending: false })
    if (somenteUsuarioId) query = query.eq('user_id', somenteUsuarioId)
    const { data, error } = await query
    if (error) setErro(error.message)
    setLinhas(data || [])
    setCarregando(false)
  }, [periodo, dia, somenteUsuarioId])

  useEffect(() => { carregar() }, [carregar, recarregarQuando])

  // Trocar de período/pessoa limpa a seleção (pra não apagar o que não está na tela).
  useEffect(() => { setSelecionados(new Set()) }, [periodo, dia, pessoa])

  function alternar(id) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  async function excluir(ids) {
    if (ids.length === 0) return
    const texto = ids.length === 1 ? 'este comprovante' : `estes ${ids.length} comprovantes`
    if (!window.confirm(`Excluir ${texto}? Some o arquivo e desconta -1 fatura e -R$2 da comissão de quem enviou (por comprovante; os que estão aguardando comprovante não descontam nada). Não dá pra desfazer.`)) return
    setExcluindo(true)
    setErro('')
    setAviso('')
    // A função apaga o registro e desconta a comissão, e devolve o caminho
    // dos arquivos; o arquivo sai pela Storage API (o Supabase não deixa
    // apagar arquivo pelo SQL — migration_072).
    const { data: caminhos, error } = await supabase.rpc('excluir_comprovantes_fatura', { p_ids: ids })
    if (!error && caminhos?.length) {
      // Os que estavam aguardando comprovante não têm arquivo (vem vazio).
      const arquivos = caminhos.map((c) => (typeof c === 'string' || c == null ? c : Object.values(c)[0])).filter(Boolean)
      if (arquivos.length) await supabase.storage.from('comprovantes').remove(arquivos)
    }
    setExcluindo(false)
    if (error) {
      const faltaFuncao = /excluir_comprovantes_fatura|function|schema cache/i.test(error.message)
      setErro(faltaFuncao
        ? 'A exclusão ainda não foi ativada no banco: rode a migration_072 no SQL Editor do Supabase.'
        : error.message)
      return
    }
    setAviso(ids.length === 1 ? 'Comprovante excluído.' : `${ids.length} comprovantes excluídos.`)
    setSelecionados(new Set())
    setSelecionando(false)
    carregar()
  }

  const porPessoa = useMemo(() => {
    const mapa = new Map()
    for (const l of linhas) {
      const nome = l.profiles?.name || 'Alguém'
      mapa.set(nome, (mapa.get(nome) || 0) + 1)
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1])
  }, [linhas])

  const visiveis = pessoa ? linhas.filter((l) => (l.profiles?.name || 'Alguém') === pessoa) : linhas
  const aguardando = visiveis.filter((c) => !c.arquivo_path).length
  const todosMarcados = visiveis.length > 0 && visiveis.every((c) => selecionados.has(c.id))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriodo(p.id)}
            className={periodo === p.id ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
          >
            {p.label}
          </button>
        ))}
        {periodo === 'dia' && (
          <input type="date" className="field-input w-auto" value={dia} max={hojeISO()} onChange={(e) => setDia(e.target.value)} aria-label="Dia" />
        )}
        {mostrarPessoa && porPessoa.length > 1 && (
          <select className="field-input w-auto" value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Pessoa">
            <option value="">Todas as pessoas</option>
            {porPessoa.map(([nome]) => <option key={nome} value={nome}>{nome}</option>)}
          </select>
        )}
      </div>

      {mostrarPessoa && !carregando && porPessoa.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {porPessoa.map(([nome, qtd]) => (
            <button
              key={nome}
              type="button"
              onClick={() => setPessoa(pessoa === nome ? '' : nome)}
              className={`card px-3 py-1.5 text-sm ${pessoa === nome ? 'border-brand-600' : ''}`}
            >
              <span className="font-medium text-ink">{nome}</span> <span className="text-muted">({qtd})</span>
            </button>
          ))}
        </div>
      )}

      {erro && <p className="tim-alert" role="alert">{erro}</p>}
      {aviso && <p className="text-sm font-medium text-good-text">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs font-medium text-muted">{carregando ? 'Carregando…' : `${visiveis.length} comprovante${visiveis.length === 1 ? '' : 's'}${aguardando ? ` · ${aguardando} aguardando comprovante (não conta ainda)` : ''}`}</p>
        {!carregando && visiveis.length > 0 && !selecionando && (
          <button type="button" className="btn-outline btn-sm" onClick={() => setSelecionando(true)}>
            <CheckSquare size={14} /> Selecionar pra excluir
          </button>
        )}
        {selecionando && (<>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => setSelecionados(todosMarcados ? new Set() : new Set(visiveis.map((c) => c.id)))}
          >
            {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
          <button
            type="button"
            className="btn-outline-danger btn-sm"
            disabled={selecionados.size === 0 || excluindo}
            onClick={() => excluir([...selecionados])}
          >
            <Trash2 size={14} /> {excluindo ? 'Excluindo…' : `Excluir selecionados (${selecionados.size})`}
          </button>
          <button type="button" className="btn-outline btn-sm" onClick={() => { setSelecionando(false); setSelecionados(new Set()) }}>
            Cancelar
          </button>
        </>)}
      </div>

      {!carregando && visiveis.length === 0 && (
        <p className="text-sm text-muted">Nenhum comprovante enviado nesse período.</p>
      )}

      {!carregando && visiveis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((c) => {
            const marcado = selecionados.has(c.id)
            const semArquivo = !c.arquivo_path
            const conteudo = (<>
              <div className="flex h-36 items-center justify-center bg-paper">
                {semArquivo ? (
                  // CUSTCODE mandado sem comprovante (migration_077).
                  <span className="flex flex-col items-center gap-1 px-2 text-center font-medium text-warn-text">
                    <Hourglass size={26} /> Aguardando comprovante
                  </span>
                ) : ehImagem(c) ? (
                  <img src={c.arquivo_url} alt="Comprovante" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-muted">
                    <FileText size={28} /> PDF
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5 px-2.5 pt-2.5">
                {mostrarPessoa && <span className="truncate font-semibold text-ink">{c.profiles?.name || 'Alguém'}</span>}
                {c.custcode && <span className="truncate font-medium text-ink">CUSTCODE {c.custcode}</span>}
                <span className="truncate text-ink">{c.observacao || (c.custcode ? '' : 'Sem observação')}</span>
              </div>
            </>)
            return (
              <div key={c.id} className={`card relative flex flex-col overflow-hidden text-xs ${marcado ? 'border-bad-border ring-2 ring-bad-border' : ''}`}>
                {selecionando ? (
                  // No modo de seleção, clicar no cartão marca/desmarca.
                  <button type="button" className="flex flex-col text-left" onClick={() => alternar(c.id)} aria-pressed={marcado}>
                    {conteudo}
                    <span className="absolute left-2 top-2 rounded bg-white/90 p-0.5 text-ink">
                      {marcado ? <CheckSquare size={18} className="text-bad-text" /> : <Square size={18} />}
                    </span>
                  </button>
                ) : semArquivo ? (
                  <div className="flex flex-col">{conteudo}</div>
                ) : (
                  <a href={c.arquivo_url} target="_blank" rel="noreferrer" className="flex flex-col hover:opacity-90" title="Abrir o comprovante">
                    {conteudo}
                  </a>
                )}
                {/* Rodapé: data, abrir e lixeira lado a lado (23/11/2026). */}
                <div className="flex items-center gap-1 px-2.5 pb-2 pt-1 text-muted">
                  <span className="mr-auto">{dataHora(c.enviado_em)}</span>
                  {!selecionando && (<>
                    {!semArquivo && <a
                      href={c.arquivo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md p-1.5 hover:bg-paper hover:text-ink"
                      title="Abrir o comprovante"
                      aria-label="Abrir o comprovante"
                    >
                      <ExternalLink size={16} />
                    </a>}
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-bad-text hover:bg-bad-bg"
                      title="Excluir este comprovante"
                      aria-label="Excluir este comprovante"
                      disabled={excluindo}
                      onClick={() => excluir([c.id])}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
