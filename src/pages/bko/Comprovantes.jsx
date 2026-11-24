import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import Secao from '../../components/ui/Secao'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { registrarComprovanteFatura, registrarCustcodeAguardando, subirArquivoComprovante } from '../../lib/api'
import ListaComprovantes from '../../components/comprovantes/ListaComprovantes'
import AguardandoComprovante from '../../components/comprovantes/AguardandoComprovante'

// Comprovantes de fatura enviada (05/11/2026): sobe o print/foto do que
// mandou hoje, aparece no relatório do dia do supervisor, e já soma +1
// fatura e +R$2 na comissão na hora (migration_044 + migration_047).
// Zera sozinho todo mês.

export default function BkoComprovantes() {
  const { user } = useAuth()
  const { toast, showToast } = useToast()
  const [observacao, setObservacao] = useState('')
  const [custcode, setCustcode] = useState('')
  const [arquivo, setArquivo] = useState(null)
  // Sem comprovante ainda (24/11/2026): manda só o CUSTCODE e anexa depois.
  const [semComprovante, setSemComprovante] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // Muda a cada envio, pra lista de baixo recarregar.
  const [versao, setVersao] = useState(0)

  async function enviar(e) {
    e.preventDefault()
    // CUSTCODE é obrigatório (Brayan, 23/11/2026). Formato tipo 7.2248162.
    if (!/^\d+\.\d+$/.test(custcode.trim())) return showToast('Preencha o CUSTCODE (ex: 7.2248162).', 'error')
    if (!semComprovante && !arquivo) return showToast('Escolha um arquivo, ou marque "Ainda não tenho o comprovante".', 'error')
    setEnviando(true)
    try {
      if (semComprovante) {
        await registrarCustcodeAguardando(custcode.trim(), observacao.trim())
      } else {
        const { caminho, url } = await subirArquivoComprovante(user.id, arquivo)
        await registrarComprovanteFatura(caminho, url, observacao.trim(), custcode.trim())
      }

      setArquivo(null)
      setObservacao('')
      setCustcode('')
      e.target.reset()
      showToast(semComprovante
        ? 'CUSTCODE enviado. Fica aguardando comprovante e só conta na comissão quando você anexar.'
        : 'Comprovante enviado. Já contou +R$2 na comissão.')
      setSemComprovante(false)
      setVersao((v) => v + 1)
    } catch (err) {
      showToast(err.message || 'Falha ao enviar o comprovante.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">Envie o print ou a foto de cada fatura que você mandou hoje.</p>

      <Secao titulo="Enviar comprovante">
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={semComprovante} onChange={(e) => setSemComprovante(e.target.checked)} />
            Ainda não tenho o comprovante (fica aguardando e só conta na comissão quando eu anexar)
          </label>
          {!semComprovante && (
            <label className="tim-label">
              Arquivo (foto ou print)
              <input
                type="file"
                accept="image/*,application/pdf"
                className="field-input"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
            </label>
          )}
          {/* CUSTCODE do cliente (23/11/2026). Obrigatório; só aceita número e ponto. */}
          <label className="tim-label">
            CUSTCODE *
            <input
              className="field-input"
              required
              value={custcode}
              onChange={(e) => setCustcode(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="ex: 7.2248162"
              inputMode="decimal"
            />
          </label>
          <label className="tim-label">
            Observação (opcional)
            <input
              className="field-input"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="ex: nome do cliente…"
            />
          </label>
          <button type="submit" className="btn-primary self-start" disabled={enviando}>
            {enviando ? 'Enviando…' : semComprovante ? 'Enviar só o CUSTCODE' : 'Enviar comprovante'}
          </button>
        </form>
      </Secao>

      <AguardandoComprovante
        userId={user?.id}
        recarregarQuando={versao}
        onAnexou={() => {
          showToast('Comprovante anexado. Agora contou +R$2 na comissão.')
          setVersao((v) => v + 1)
        }}
      />

      <Secao titulo="Meus comprovantes enviados">
        <ListaComprovantes somenteUsuarioId={user?.id} recarregarQuando={versao} />
      </Secao>
      <Toast toast={toast} />
    </div>
  )
}

