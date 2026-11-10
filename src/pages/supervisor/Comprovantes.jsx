import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'

// Relatório do dia dos comprovantes de fatura enviados (05/11/2026). Zera
// sozinho todo mês (cron em migration_044); o botão aqui é só pra resetar
// na mão se precisar antes disso.

function inicioDoDia() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function SupervisorComprovantes() {
  const { toast, showToast } = useToast()
  const [linhas, setLinhas] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetando, setResetando] = useState(false)

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('comprovantes_fatura')
      .select('*, profiles(name)')
      .gte('enviado_em', inicioDoDia())
      .order('enviado_em', { ascending: false })
    if (error) showToast(error.message, 'error')
    setLinhas(data || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const porPessoa = useMemo(() => {
    const mapa = new Map()
    for (const l of linhas) {
      const nome = l.profiles?.name || 'Alguém'
      mapa.set(nome, (mapa.get(nome) || 0) + 1)
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1])
  }, [linhas])

  async function resetarMes() {
    if (!window.confirm('Isso apaga TODOS os comprovantes (de qualquer dia do mês) de vez, incluindo os arquivos. Não dá pra desfazer. Continuar?')) return
    setResetando(true)
    try {
      const { error } = await supabase.rpc('resetar_comprovantes_mes')
      if (error) throw error
      showToast('Comprovantes do mês apagados.')
      carregar()
    } catch (err) {
      showToast(err.message || 'Falha ao resetar.', 'error')
    } finally {
      setResetando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Comprovantes enviados hoje. A contagem zera sozinha todo dia 1 do mês.</p>
        <button type="button" className="btn-outline-danger btn-sm" onClick={resetarMes} disabled={resetando}>
          {resetando ? 'Resetando…' : 'Resetar mês agora'}
        </button>
      </div>

      {!loading && porPessoa.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {porPessoa.map(([nome, qtd]) => (
            <div key={nome} className="card px-4 py-2 text-sm">
              <span className="font-medium text-ink">{nome}</span>{' '}
              <span className="text-muted">({qtd} hoje)</span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted">Nenhum comprovante enviado hoje ainda.</p>
      ) : (
        <div className="team-table">
          <table className="tim-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Quem</th>
                <th>Observação</th>
                <th>Arquivo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td className="text-muted">
                    {new Date(l.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="font-medium">{l.profiles?.name || 'Alguém'}</td>
                  <td className="text-muted">{l.observacao || '-'}</td>
                  <td>
                    <a href={l.arquivo_url} target="_blank" rel="noreferrer" className="font-medium text-brand-600">
                      Ver
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toast toast={toast} />
    </div>
  )
}
