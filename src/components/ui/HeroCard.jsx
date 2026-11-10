// Cartão de destaque (comissão). O HeroCardRed saiu em 10/11/2026: o
// único uso (meta de reagendamentos no Dashboard) repetia o StatCard.
export function HeroCardWhite({ label, value, sub, minWidth = 200 }) {
  return (
    <div className="stat-card" style={{ minWidth }}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}
