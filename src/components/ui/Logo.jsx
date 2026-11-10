// Marca do painel: "BKO" com três riscos vermelhos na frente, no mesmo
// espírito do cabeçalho das telas da TIM (sem usar o logo da TIM em si).
export default function Logo({ size = 22, claro = true }) {
  const risco = { height: Math.max(2, Math.round(size / 7)), width: Math.round(size * 0.8) }
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <span className="flex flex-col justify-center gap-[3px]" aria-hidden>
        <span className="block rounded-sm bg-tim" style={risco} />
        <span className="block rounded-sm bg-tim" style={risco} />
        <span className="block rounded-sm bg-tim" style={risco} />
      </span>
      <span
        className={`font-extrabold leading-none tracking-tight ${claro ? 'text-white' : 'text-sidebar'}`}
        style={{ fontSize: size * 1.15 }}
      >
        BKO
      </span>
    </span>
  )
}
