import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Quantas fichas (vendas feitas) cada operador mandou e de quais UFs, pra
// o supervisor acompanhar o desempenho (desde 26/10/2026).

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
    const uf = l.uf || 'sem UF'
    entrada.ufs.set(uf, (entrada.ufs.get(uf) || 0) + 1)
  }

  const linhasOrdenadas = [...porOperador.values()].sort((a, b) => b.total - a.total)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Vendas CNPJ por operador: quantas fichas cada um enviou e de quais UFs.</p>

      {linhasOrdenadas.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma venda registrada ainda.</p>
      ) : (
        <div className="team-table">
          <table className="tim-table">
            <thead>
              <tr>
                <th>Operador</th>
                <th>Total de fichas</th>
                <th>Por UF</th>
              </tr>
            </thead>
            <tbody>
              {linhasOrdenadas.map((op, i) => (
                <tr key={i}>
                  <td className="font-medium">{op.nome}</td>
                  <td>{op.total}</td>
                  <td className="text-muted">
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
