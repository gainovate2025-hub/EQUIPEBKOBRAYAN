import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import Secao from '../components/ui/Secao'
import Field from '../components/ui/Field'
import Toast from '../components/ui/Toast'
import { useToast } from '../lib/useToast'

// "Meu relatório" (pedido do Brayan em 26/11/2026: "uma opção pra eu mandar
// um relatório meu: contestações feitas, faturas, reagendamentos, anotar
// coisas, tudo"). Um por dia; mandar de novo no mesmo dia atualiza.
// Só a própria pessoa vê. Não mexe na comissão (migration_078).

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inicioDoMes(desloc = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + desloc)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function nomeDoMes(desloc) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + desloc)
  const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function dataBR(iso) {
  const [a, m, d] = iso.split('-')
  const dia = new Date(Number(a), Number(m) - 1, Number(d)).toLocaleDateString('pt-BR', { weekday: 'short' })
  return `${d}/${m}/${a} (${dia.replace('.', '')})`
}

const VAZIO = { data: hojeISO(), contestacoes: '', faturas: '', reagendamentos: '', anotacoes: '' }

function mensagemErro(error) {
  if (/relatorios_pessoais|schema cache|does not exist/i.test(error.message)) {
    return 'O "Meu relatório" ainda não foi ativado no banco: rode a migration_078 no SQL Editor do Supabase.'
  }
  return error.message
}

export default function MeuRelatorio() {
  const { user } = useAuth()
  const { toast, showToast } = useToast()
  const [form, setForm] = useState(VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [mes, setMes] = useState(0)
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!user) return
    setCarregando(true)
    const { data, error } = await supabase
      .from('relatorios_pessoais')
      .select('*')
      .eq('user_id', user.id)
      .gte('data', inicioDoMes(mes))
      .lt('data', inicioDoMes(mes + 1))
      .order('data', { ascending: false })
    setErro(error ? mensagemErro(error) : '')
    setLinhas(data || [])
    setCarregando(false)
  }, [user, mes])

  useEffect(() => { carregar() }, [carregar])

  const jaTemNoDia = linhas.find((l) => l.data === form.data)

  function mudar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function enviar(e) {
    e.preventDefault()
    const num = (v) => (String(v).trim() === '' ? 0 : Number(v))
    const dados = {
      user_id: user.id,
      data: form.data,
      contestacoes: num(form.contestacoes),
      faturas: num(form.faturas),
      reagendamentos: num(form.reagendamentos),
      anotacoes: form.anotacoes.trim() || null,
      atualizado_em: new Date().toISOString(),
    }
    if ([dados.contestacoes, dados.faturas, dados.reagendamentos].some((n) => !Number.isInteger(n) || n < 0)) {
      return showToast('Use só números inteiros (0 ou mais).', 'error')
    }
    if (!dados.contestacoes && !dados.faturas && !dados.reagendamentos && !dados.anotacoes) {
      return showToast('Preencha pelo menos um número ou uma anotação.', 'error')
    }
    setSalvando(true)
    const { error } = await supabase.from('relatorios_pessoais').upsert(dados, { onConflict: 'user_id,data' })
    setSalvando(false)
    if (error) return showToast(mensagemErro(error), 'error')
    showToast(jaTemNoDia ? 'Relatório do dia atualizado.' : 'Relatório enviado.')
    setForm({ ...VAZIO, data: hojeISO() })
    carregar()
  }

  function editar(l) {
    setForm({
      data: l.data,
      contestacoes: String(l.contestacoes || ''),
      faturas: String(l.faturas || ''),
      reagendamentos: String(l.reagendamentos || ''),
      anotacoes: l.anotacoes || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function excluir(l) {
    if (!window.confirm(`Excluir o relatório de ${dataBR(l.data)}? Não dá pra desfazer.`)) return
    const { error } = await supabase.from('relatorios_pessoais').delete().eq('id', l.id)
    if (error) return showToast(mensagemErro(error), 'error')
    showToast('Relatório excluído.')
    carregar()
  }

  const totais = useMemo(() => linhas.reduce((t, l) => ({
    contestacoes: t.contestacoes + (l.contestacoes || 0),
    faturas: t.faturas + (l.faturas || 0),
    reagendamentos: t.reagendamentos + (l.reagendamentos || 0),
  }), { contestacoes: 0, faturas: 0, reagendamentos: 0 }), [linhas])

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">Anote o seu dia. Só você vê. Não muda a comissão nem os números do painel.</p>

      <Secao titulo={jaTemNoDia ? 'Atualizar relatório do dia' : 'Mandar relatório'}>
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Dia">
              <input type="date" className="field-input" value={form.data} max={hojeISO()} onChange={(e) => mudar('data', e.target.value)} required />
            </Field>
            <Field label="Contestações feitas">
              <input className="field-input" inputMode="numeric" placeholder="0" value={form.contestacoes} onChange={(e) => mudar('contestacoes', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Faturas">
              <input className="field-input" inputMode="numeric" placeholder="0" value={form.faturas} onChange={(e) => mudar('faturas', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Reagendamentos">
              <input className="field-input" inputMode="numeric" placeholder="0" value={form.reagendamentos} onChange={(e) => mudar('reagendamentos', e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <Field label="Anotações">
            <textarea
              className="field-input min-h-[120px]"
              placeholder="O que aconteceu no dia, pendências, lembretes…"
              value={form.anotacoes}
              onChange={(e) => mudar('anotacoes', e.target.value)}
            />
          </Field>
          {jaTemNoDia && <p className="text-xs text-warn-text">Já tem relatório nesse dia: enviar vai substituir o que estava lá.</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? 'Enviando…' : jaTemNoDia ? 'Atualizar relatório' : 'Mandar relatório'}
            </button>
            {(form.anotacoes || form.contestacoes || form.faturas || form.reagendamentos) && (
              <button type="button" className="btn-ghost" onClick={() => setForm({ ...VAZIO, data: hojeISO() })}>Limpar</button>
            )}
          </div>
        </form>
      </Secao>

      <Secao titulo="Meus relatórios">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <select className="field-input w-auto" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {[0, -1, -2, -3].map((d) => <option key={d} value={d}>{nomeDoMes(d)}</option>)}
            </select>
            {!carregando && (
              <p className="text-sm text-muted">
                {linhas.length} dia{linhas.length === 1 ? '' : 's'} · {totais.contestacoes} contestações · {totais.faturas} faturas · {totais.reagendamentos} reagendamentos
              </p>
            )}
          </div>

          {erro && <p className="tim-alert" role="alert">{erro}</p>}
          {carregando && <p className="text-sm text-muted">Carregando…</p>}
          {!carregando && !erro && linhas.length === 0 && <p className="text-sm text-muted">Nenhum relatório nesse mês.</p>}

          {!carregando && linhas.length > 0 && (
            <div className="card divide-y divide-line">
              {linhas.map((l) => (
                <div key={l.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{dataBR(l.data)}</span>
                    <span className="mr-auto text-muted">
                      {l.contestacoes} contestações · {l.faturas} faturas · {l.reagendamentos} reagendamentos
                    </span>
                    <button type="button" className="rounded-md p-1.5 text-muted hover:bg-paper hover:text-ink" title="Editar" aria-label="Editar" onClick={() => editar(l)}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="rounded-md p-1.5 text-bad-text hover:bg-bad-bg" title="Excluir" aria-label="Excluir" onClick={() => excluir(l)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {l.anotacoes && <p className="whitespace-pre-wrap text-ink">{l.anotacoes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Secao>
      <Toast toast={toast} />
    </div>
  )
}
