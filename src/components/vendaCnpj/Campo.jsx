import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

// Botão de copiar usado na ficha da venda (VendaCnpj e fila do Cadastro).
// try/catch (10/11/2026): o navegador pode negar acesso à área de
// transferência (aba sem foco, http). Sem isso a página dava erro mudo.
export function BotaoCopiar({ valor }) {
  const [estado, setEstado] = useState('') // '' | 'ok' | 'erro'
  if (!valor) return null
  return (
    <button
      type="button"
      className="rounded-md p-1 text-muted hover:bg-brand-50 hover:text-brand-600"
      title={estado === 'erro' ? 'Não foi possível copiar' : 'Copiar'}
      aria-label="Copiar"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(valor))
          setEstado('ok')
        } catch {
          setEstado('erro')
        }
        setTimeout(() => setEstado(''), 1200)
      }}
    >
      {estado === 'ok' ? <Check size={14} className="text-good-text" /> : <Copy size={14} className={estado === 'erro' ? 'text-bad-text' : ''} />}
    </button>
  )
}

// comCopiar=false: usado na tela inicial do operador (só pra ele ver os
// dados da empresa e decidir venda feita/não feita), não tem motivo pra
// copiar nada ainda. comCopiar=true: na "Ficha da venda" (final, ou na
// fila de quem faz o cadastro), onde faz sentido copiar pra colar no
// sistema de verdade.
export function Campo({ label, valor, comCopiar = false }) {
  if (!valor) return null
  return (
    <div className="flex items-center justify-between gap-2 border-b border-divider py-1.5 text-sm">
      <div>
        <span className="text-muted">{label}: </span>
        <span className="font-medium text-ink">{valor}</span>
      </div>
      {comCopiar && <BotaoCopiar valor={valor} />}
    </div>
  )
}
