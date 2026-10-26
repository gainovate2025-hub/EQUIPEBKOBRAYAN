import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import SectionHeading from '../../components/ui/SectionHeading'

// RASCUNHO (26/10/2026) — quantas fichas (vendas_feitas) cada operador
// mandou e de quais UFs, pra o supervisor acompanhar desempenho.

export default function VendasDesempenho() {
  const [linhas, setLinhas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase
        .from('vendas_cnpj')
        .select('solicitado_por, uf, profiles(name)')
        .eq('status', 'venda_feita')
      setLinhas(data || [])
      setLoading(false)
    }
    carregar()
  }, [])

  if (loading) return <p className="text-sm text-muted">Carregando…</p>

  // Agrupa por operador: total de fichas + contagem por UF.
  const porOperador = new Map()
  for (const l of linhas) {
    const chave = l.solicitado_por
    if (!porOperador.has(chave)) {
      porOperador.set(chave, { nome: l.profiles?.name || 'Alguém', total: 0, ufs: new Map() })
    }
    const entrada = porOperador.get(chave)
    entrada.total += 1
    const uf = l.uf || '—'
    entrada.ufs.set(uf, (entrada.ufs.get(uf) || 0) + 1)
  }

  const linhasOrdenadas = [...porOperador.values()].sort((a, b) => b.total - a.total)

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Desempenho — Vendas CNPJ" hint="Quantas fichas cada operador subiu, e de quais UFs" />

      {linhasOrdenadas.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma venda registrada ainda.</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs font-semibold text-muted">
                <th className="px-4 py-2">Operador</th>
                <th className="px-4 py-2">Total de fichas</th>
                <th className="px-4 py-2">Por UF</th>
              </tr>
            </thead>
            <tbody>
              {linhasOrdenadas.map((op, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 font-medium text-ink">{op.nome}</td>
                  <td className="px-4 py-2">{op.total}</td>
                  <td className="px-4 py-2 text-muted">
                    {[...op.ufs.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([uf, qtd]) => `${uf}: ${qtd}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
