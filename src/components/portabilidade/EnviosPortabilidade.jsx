import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { fmtMoney, fmtDateTime } from '../../lib/helpers'
import SectionHeading from '../ui/SectionHeading'
import Field from '../ui/Field'

// Envio de produção da equipe de portabilidade (migration_076, 24/11/2026).
// modo "bko": formulário (quantos SIM + quantos CNPJs trabalhados) e a
// lista dos próprios envios. modo "lider": lista dos envios da equipe,
// com total por BKO. Cada SIM vale R$ 2; excluir desconta de volta.

const VALOR_SIM = 2

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

function mensagemErro(error) {
  if (/envios_portabilidade|enviar_portabilidade|excluir_envio_portabilidade|casos_portabilidade|schema cache|does not exist/i.test(error.message)) {
    return 'O envio de portabilidade ainda não foi ativado no banco: rode a migration_076 no SQL Editor do Supabase.'
  }
  return error.message
}

function lerInteiro(texto) {
  const t = String(texto ?? '').trim()
  if (!/^\d+$/.test(t)) return NaN
  return Number(t)
}

export default function EnviosPortabilidade({ modo = 'bko', onMudou }) {
  const ehBko = modo === 'bko'
  const [sim, setSim] = useState('')
  const [casos, setCasos] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mes, setMes] = useState(0)
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [excluindo, setExcluindo] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase
      .from('envios_portabilidade')
      .select('*, profiles!envios_portabilidade_user_id_fkey(name)')
      .gte('criado_em', inicioDoMes(mes).toISOString())
      .lt('criado_em', inicioDoMes(mes + 1).toISOString())
      .order('criado_em', { ascending: false })
    if (error) setErro(mensagemErro(error))
    else setErro('')
    setLinhas(data || [])
    setCarregando(false)
  }, [mes])

  useEffect(() => { carregar() }, [carregar])

  async function enviar(e) {
    e.preventDefault()
    setAviso('')
    setErro('')
    const s = lerInteiro(sim)
    const c = lerInteiro(casos)
    if (Number.isNaN(s) || Number.isNaN(c)) return setErro('Preencha os dois números só com dígitos (pode ser 0).')
    if (s === 0 && c === 0) return setErro('Coloque pelo menos 1 SIM ou 1 CNPJ.')
    if (s > c) return setErro('O número de SIM não pode ser maior que o de CNPJs trabalhados.')
    setSalvando(true)
    const { error } = await supabase.rpc('enviar_portabilidade', { p_sim: s, p_casos: c })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    setAviso(`Enviado: ${s} SIM e ${c} CNPJ${c === 1 ? '' : 's'}. ${s ? `+${fmtMoney(s * VALOR_SIM)} na comissão.` : ''}`)
    setSim('')
    setCasos('')
    setMes(0)
    carregar()
    onMudou?.()
  }

  async function excluir(x) {
    const dono = ehBko ? 'seu envio' : `o envio de ${x.profiles?.name || 'BKO'}`
    if (!window.confirm(`Excluir ${dono} (${x.sim} SIM, ${x.casos} CNPJs)? Sai da contagem e da comissão. Não dá pra desfazer.`)) return
    setExcluindo(x.id)
    setAviso('')
    setErro('')
    const { error } = await supabase.rpc('excluir_envio_portabilidade', { p_id: x.id })
    setExcluindo(null)
    if (error) return setErro(mensagemErro(error))
    setAviso('Envio excluído e descontado.')
    carregar()
    onMudou?.()
  }

  const totais = linhas.reduce((t, x) => ({ sim: t.sim + x.sim, casos: t.casos + x.casos }), { sim: 0, casos: 0 })
  const porPessoa = useMemo(() => {
    const m = new Map()
    for (const x of linhas) {
      const n = x.profiles?.name || 'Alguém'
      const atual = m.get(n) || { sim: 0, casos: 0 }
      m.set(n, { sim: atual.sim + x.sim, casos: atual.casos + x.casos })
    }
    return [...m.entries()].sort((a, b) => b[1].sim - a[1].sim)
  }, [linhas])

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading
        title={ehBko ? 'Enviar minha produção' : 'Envios da equipe'}
        hint={ehBko
          ? `Coloque quantos SIM e quantos CNPJs você trabalhou. Pode mandar várias vezes no dia: cada envio soma. Cada SIM vale ${fmtMoney(VALOR_SIM)}.`
          : 'O que cada BKO mandou. Excluir um envio desconta da contagem e da comissão.'}
      />

      {ehBko && (
        <form onSubmit={enviar} className="card flex flex-col gap-4 p-5 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="sm:w-44">
            <Field label="CNPJs trabalhados">
              <input className="field-input" inputMode="numeric" placeholder="Ex.: 80" value={casos} onChange={(e) => setCasos(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <div className="sm:w-44">
            <Field label="Quantos SIM">
              <input className="field-input" inputMode="numeric" placeholder="Ex.: 12" value={sim} onChange={(e) => setSim(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}

      {erro && <p className="tim-alert" role="alert">{erro}</p>}
      {aviso && <p className="text-sm font-medium text-good-text">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <select className="field-input w-auto" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
          {[0, -1, -2].map((d) => <option key={d} value={d}>{nomeDoMes(inicioDoMes(d))}</option>)}
        </select>
        <p className="text-sm text-muted">
          {carregando
            ? 'Carregando…'
            : `${linhas.length} envio${linhas.length === 1 ? '' : 's'} · ${totais.sim} SIM · ${totais.casos} CNPJs`}
        </p>
      </div>

      {!ehBko && !carregando && porPessoa.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {porPessoa.map(([nome, t]) => (
            <span key={nome} className="card px-3 py-1.5 text-sm">
              <span className="font-medium text-ink">{nome}</span>{' '}
              <span className="text-muted">{t.sim} SIM · {t.casos} CNPJs</span>
            </span>
          ))}
        </div>
      )}

      {!carregando && linhas.length === 0 && !erro && (
        <p className="text-sm text-muted">Nenhum envio nesse mês.</p>
      )}

      {!carregando && linhas.length > 0 && (
        <div className="card divide-y divide-line">
          {linhas.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="flex min-w-0 flex-1 flex-col">
                {!ehBko && <span className="font-medium text-ink">{x.profiles?.name || 'Alguém'}</span>}
                <span className={ehBko ? 'text-ink' : 'text-muted'}>
                  {x.sim} SIM · {x.casos} CNPJs · {fmtDateTime(x.criado_em)}
                </span>
              </div>
              <span className="font-semibold text-ink">{fmtMoney(x.sim * VALOR_SIM)}</span>
              <button
                type="button"
                className="rounded-md p-1.5 text-bad-text hover:bg-bad-bg"
                title="Excluir este envio"
                aria-label="Excluir este envio"
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
