// Logo da operadora (pedido do Brayan em 11/11/2026): na hora que a
// consulta acha a operadora do número, aparece o logo dela, pra bater o
// olho e saber de onde a linha vem.
// Os SVGs ficam em public/operadoras/ (baixados do Wikimedia Commons),
// servidos pelo próprio site — não dependem de nenhum site de fora.
const LOGOS = {
  VIVO: 'vivo.svg',
  CLARO: 'claro.svg',
  TIM: 'tim.svg',
  OI: 'oi.svg',
}

export function OperadoraLogo({ operadora, bruta }) {
  const arquivo = LOGOS[operadora]
  if (!arquivo) {
    return <span className="text-xs font-semibold text-ink">{operadora || bruta || 'não identificada'}</span>
  }
  return (
    <span className="inline-flex h-8 items-center rounded-md border border-divider bg-white px-1.5" title={`Operadora: ${operadora}`}>
      <img
        src={`${import.meta.env.BASE_URL}operadoras/${arquivo}`}
        alt={operadora}
        className="h-6 w-auto max-w-[72px] object-contain"
      />
    </span>
  )
}
