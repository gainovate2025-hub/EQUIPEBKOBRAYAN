import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, ExternalLink } from 'lucide-react'
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

  const porPessoa = useMemo(() => {
    const mapa = new Map()
    for (const l of linhas) {
      const nome = l.profiles?.name || 'Alguém'
      mapa.set(nome, (mapa.get(nome) || 0) + 1)
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1])
  }, [linhas])

  const visiveis = pessoa ? linhas.filter((l) => (l.profiles?.name || 'Alguém') === pessoa) : linhas

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

      {erro && <p className="tim-alert" role="alert">Não consegui carregar os comprovantes: {erro}</p>}

      <p className="text-xs font-medium text-muted">{carregando ? 'Carregando…' : `${visiveis.length} comprovante${visiveis.length === 1 ? '' : 's'}`}</p>

      {!carregando && visiveis.length === 0 && (
        <p className="text-sm text-muted">Nenhum comprovante enviado nesse período.</p>
      )}

      {!carregando && visiveis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((c) => (
            <a
              key={c.id}
              href={c.arquivo_url}
              target="_blank"
              rel="noreferrer"
              className="card flex flex-col overflow-hidden text-xs hover:border-brand-300"
              title="Abrir o comprovante"
            >
              <div className="flex h-36 items-center justify-center bg-paper">
                {ehImagem(c) ? (
                  <img src={c.arquivo_url} alt="Comprovante" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-muted">
                    <FileText size={28} /> PDF
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5 p-2.5">
                {mostrarPessoa && <span className="truncate font-semibold text-ink">{c.profiles?.name || 'Alguém'}</span>}
                <span className="truncate text-ink">{c.observacao || 'Sem observação'}</span>
                <span className="flex items-center justify-between text-muted">
                  {dataHora(c.enviado_em)} <ExternalLink size={12} />
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
