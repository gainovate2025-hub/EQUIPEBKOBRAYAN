import { useState } from 'react'
import ListaComprovantes from '../../components/comprovantes/ListaComprovantes'
import { supabase } from '../../lib/supabaseClient'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'

// Relatório do dia dos comprovantes de fatura enviados (05/11/2026). Zera
// sozinho todo mês (cron em migration_044); o botão aqui é só pra resetar
// na mão se precisar antes disso.

export default function SupervisorComprovantes() {
  const { toast, showToast } = useToast()
  const [resetando, setResetando] = useState(false)
  const [versao, setVersao] = useState(0) // muda depois do reset pra lista recarregar

  async function resetarMes() {
    if (!window.confirm('Isso apaga TODOS os comprovantes (de qualquer dia do mês) de vez, incluindo os arquivos. Não dá pra desfazer. Continuar?')) return
    setResetando(true)
    try {
      // Arquivos primeiro, pela Storage API (o SQL não pode mais apagá-los).
      const { data: todos } = await supabase.from('comprovantes_fatura').select('arquivo_path')
      const caminhos = (todos || []).map((c) => c.arquivo_path).filter(Boolean)
      for (let i = 0; i < caminhos.length; i += 500) {
        await supabase.storage.from('comprovantes').remove(caminhos.slice(i, i + 500))
      }
      const { error } = await supabase.rpc('resetar_comprovantes_mes')
      if (error) throw error
      showToast('Comprovantes do mês apagados.')
      setVersao((v) => v + 1)
    } catch (err) {
      showToast(err.message || 'Falha ao resetar.', 'error')
    } finally {
      setResetando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Comprovantes enviados pela equipe. Clique num deles pra abrir. Tudo zera sozinho todo dia 1 do mês.</p>
        <button type="button" className="btn-outline-danger btn-sm" onClick={resetarMes} disabled={resetando}>
          {resetando ? 'Resetando…' : 'Resetar mês agora'}
        </button>
      </div>

      <ListaComprovantes mostrarPessoa recarregarQuando={versao} />
      <Toast toast={toast} />
    </div>
  )
}
