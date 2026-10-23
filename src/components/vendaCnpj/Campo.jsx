import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function BotaoCopiar({ valor }) {
  const [copiado, setCopiado] = useState(false)
  if (!valor) return null
  return (
    <button
      type="button"
      className="rounded-md p-1 text-muted hover:bg-paper hover:text-ink"
      title="Copiar"
      onClick={async () => {
        await navigator.clipboard.writeText(String(valor))
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1200)
      }}
    >
      {copiado ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
    </button>
  )
}

// comCopiar=false: usado na tela inicial do operador (só pra ele ver os
// dados da empresa e decidir venda feita/não feita) — não tem motivo pra
// copiar nada ainda. comCopiar=true: na "Ficha da venda" (final, ou na
// fila de quem faz o cadastro), onde faz sentido copiar pra colar no
// sistema de verdade.
export function Campo({ label, valor, comCopiar = false }) {
  if (!valor) return null
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-sm">
      <div>
        <span className="text-muted">{label}: </span>
        <span className="font-medium text-ink">{valor}</span>
      </div>
      {comCopiar && <BotaoCopiar valor={valor} />}
    </div>
  )
}
