import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { fmtMoney, fmtDateTime } from '../../lib/helpers'
import SectionHeading from '../ui/SectionHeading'
import Field from '../ui/Field'

// Extra em dinheiro pros BKOs (pedido do Brayan em 24/11/2026). Só o
// supervisor lança e vê; o valor soma na comissão na hora e excluir
// desconta (migration_074). Motivo é opcional.

function inicioDoMes(deslocamento = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  d.setMonth(d.getMonth() + deslocamento)
  return d
}

function nomeDoMes(d) {
  const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Aceita "50", "50,5", "1.250,00" ou "50.5".
function lerValor(texto) {
  let t = String(texto || '').trim().replace(/[R$\s]/g, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

function mensagemErro(error) {
  if (/extras_bko|lancar_extra_bko|excluir_extra_bko|schema cache|does not exist/i.test(error.message)) {
    return 'A parte de extras ainda não foi ativada no banco: rode a migration_074 no SQL Editor do Supabase.'
  }
  return error.message
}

export default function ExtrasBko({ team, onMudou }) {
  const [bkoId, setBkoId] = useState('')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mes, setMes] = useState(0) // 0 = este mês, -1 = mês passado...
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [excluindo, setExcluindo] = useState(null)

  const bkos = useMemo(() => [...team].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [team])

  const carregar = useCallback(async () => {
    setCarregando(true)
    const de = inicioDoMes(mes)
    const ate = inicioDoMes(mes + 1)
    const { data, error } = await supabase
      .from('extras_bko')
      .select('*, profiles!extras_bko_user_id_fkey(name)')
      .gte('criado_em', de.toISOString())
      .lt('criado_em', ate.toISOString())
      .order('criado_em', { ascending: false })
    if (error) setErro(mensagemErro(error))
    else setErro('')
    setLinhas(data || [])
    setCarregando(false)
  }, [mes])

  useEffect(() => { carregar() }, [carregar])

  async function lancar(e) {
    e.preventDefault()
    setAviso('')
    setErro('')
    const v = lerValor(valor)
    if (!bkoId) return setErro('Escolha o BKO.')
    if (!(v > 0)) return setErro('Coloque um valor maior que zero (ex.: 50 ou 25,50).')
    setSalvando(true)
    const { error } = await supabase.rpc('lancar_extra_bko', { p_user_id: bkoId, p_valor: v, p_motivo: motivo })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    const nome = bkos.find((b) => b.id === bkoId)?.name || 'o BKO'
    setAviso(`Extra de ${fmtMoney(v)} lançado para ${nome}. Já somou na comissão.`)
    setValor('')
    setMotivo('')
    setMes(0)
    carregar()
    onMudou?.()
  }

  async function excluir(x) {
    const nome = x.profiles?.name || 'o BKO'
    if (!window.confirm(`Excluir o extra de ${fmtMoney(Number(x.valor))} de ${nome}? O valor sai da comissão dele. Não dá pra desfazer.`)) return
    setExcluindo(x.id)
    setAviso('')
    setErro('')
    const { error } = await supabase.rpc('excluir_extra_bko', { p_id: x.id })
    setExcluindo(null)
    if (error) return setErro(mensagemErro(error))
    setAviso('Extra excluído e descontado da comissão.')
    carregar()
    onMudou?.()
  }

  const total = linhas.reduce((s, x) => s + Number(x.valor || 0), 0)
  const porPessoa = useMemo(() => {
    const m = new Map()
    for (const x of linhas) {
      const n = x.profiles?.name || 'Alguém'
      m.set(n, (m.get(n) || 0) + Number(x.valor || 0))
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [linhas])

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Extra em dinheiro" hint="O valor soma na comissão do BKO na hora. Só você vê esta lista." />

      <form onSubmit={lancar} className="card flex flex-col gap-4 p-5 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="sm:w-56">
          <Field label="BKO">
            <select className="field-input" value={bkoId} onChange={(e) => setBkoId(e.target.value)}>
              <option value="">Escolha…</option>
              {bkos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="sm:w-36">
          <Field label="Valor (R$)">
            <input className="field-input" inputMode="decimal" placeholder="Ex.: 50,00" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
        </div>
        <div className="sm:min-w-[220px] sm:flex-1">
          <Field label="Motivo (opcional)">
            <input className="field-input" placeholder="Ex.: bateu a meta da semana" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
        </div>
        <button type="submit" className="btn-primary" disabled={salvando}>
          {salvando ? 'Lançando…' : 'Lançar extra'}
        </button>
      </form>

      {erro && <p className="tim-alert" role="alert">{erro}</p>}
      {aviso && <p className="text-sm font-medium text-good-text">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <select className="field-input w-auto" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
          {[0, -1, -2].map((d) => <option key={d} value={d}>{nomeDoMes(inicioDoMes(d))}</option>)}
        </select>
        <p className="text-sm text-muted">
          {carregando ? 'Carregando…' : `${linhas.length} extra${linhas.length === 1 ? '' : 's'} · total ${fmtMoney(total)}`}
        </p>
      </div>

      {!carregando && porPessoa.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {porPessoa.map(([nome, soma]) => (
            <span key={nome} className="card px-3 py-1.5 text-sm">
              <span className="font-medium text-ink">{nome}</span> <span className="text-muted">{fmtMoney(soma)}</span>
            </span>
          ))}
        </div>
      )}

      {!carregando && linhas.length === 0 && !erro && (
        <p className="text-sm text-muted">Nenhum extra lançado nesse mês.</p>
      )}

      {!carregando && linhas.length > 0 && (
        <div className="card divide-y divide-line">
          {linhas.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-ink">{x.profiles?.name || 'Alguém'}</span>
                <span className="truncate text-muted">{x.motivo || 'Sem motivo'} · {fmtDateTime(x.criado_em)}</span>
              </div>
              <span className="font-semibold text-ink">{fmtMoney(Number(x.valor))}</span>
              <button
                type="button"
                className="rounded-md p-1.5 text-bad-text hover:bg-bad-bg"
                title="Excluir este extra"
                aria-label="Excluir este extra"
                disabled={excluindo === x.id}
                onClick={() => excluir(x)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
