export function pct(done, goal) {
  if (!goal) return 0
  return Math.round((done / goal) * 1000) / 10
}

export function statusOf(pctValue) {
  if (pctValue >= 100) return { emoji: '🟢', label: 'Meta atingida', tone: 'good' }
  if (pctValue >= 70) return { emoji: '🟡', label: 'Próximo da meta', tone: 'warn' }
  return { emoji: '🔴', label: 'Abaixo da meta', tone: 'bad' }
}

export const fmtMoney = (v) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const fmtDateTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
