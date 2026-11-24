// Equipe de portabilidade (migration_075, 24/11/2026): esconde do menu o
// que é só da contestação. O SIM da portabilidade conta no mesmo lugar da
// contestação (contestations_done), só com outro nome.
const SO_CONTESTACAO = [
  'faturas', 'comprovantes', 'reagendamentos', 'custcode', 'custcodes',
  'automacoes', 'venda-cnpj', 'vendas-desempenho',
]

export function menuDaEquipe(items, portabilidade) {
  if (!portabilidade) return items
  return items.filter((i) => !SO_CONTESTACAO.includes(i.to.split('/').pop()))
}
