import { useEffect, useMemo, useState } from 'react'
import { fetchFaturasLinhas, escreverFaturaCampo } from '../../lib/api'
import Toast from '../ui/Toast'
import { useToast } from '../../lib/useToast'

const STATUS_OPCOES = [
  'TRATANDO',
  'CONTESTADO',
  'INCONTESTÁVEL',
  'FATURA PAGA',
  'CLIENTE NÃO ATENDEU',
  'CLIENTE SE RECUSA A PAGAR',
]

// Mostra só as linhas da planilha de Faturas que estão marcadas como
// contestação (status com "CONTEST" ou já com protocolo preenchido) —
// mesma fonte de dados da tela de Faturas, só filtrada.
export default function FaturaContestacaoList({ filtroNomes }) {
  const { toast, showToast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [linhas, setLinhas] = useState([])
  const [config, setConfig] = useState(null)
  const [colunas, setColunas] = useState(null)
  const [salvandoId, setSalvandoId] = useState(null)
  const [protocolos, setProtocolos] = useState({})

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const resultado = await fetchFaturasLinhas()
      setConfig(resultado.config)
      setColunas(resultado.colunas)
      setLinhas(resultado.linhas)
      const iniciais = {}
      resultado.linhas.forEach((l) => { iniciais[l.linhaPlanilha] = l.protocolo || '' })
      setProtocolos(iniciais)
    } catch (err) {
      setErro(err.message || 'Falha ao carregar planilha.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const contestadas = useMemo(() => {
    let base = linhas.filter((l) => /contest/i.test(l.status) || (l.protocolo || '').trim())
    if (filtroNomes) {
      const permitidos = new Set(filtroNomes.map((n) => (n || '').trim().toLowerCase()).filter(Boolean))
      base = base.filter((l) => permitidos.has((l.vendedor || '').trim().toLowerCase()))
    }
    return base
  }, [linhas, filtroNomes])

  async function salvarProtocolo(linha) {
    setSalvandoId(linha.linhaPlanilha)
    try {
      await escreverFaturaCampo(config, colunas, linha.linhaPlanilha, 'protocolo', (protocolos[linha.linhaPlanilha] || '').trim())
      showToast('Protocolo salvo.')
      await carregar()
    } catch (err) {
      showToast(err.message || 'Falha ao salvar.', 'error')
    } finally {
      setSalvandoId(null)
    }
  }

  async function resolver(linha, novoStatus) {
    setSalvandoId(linha.linhaPlanilha)
    try {
      await escreverFaturaCampo(config, colunas, linha.linhaPlanilha, 'status', novoStatus)
      showToast('Status atualizado.')
      await carregar()
    } catch (err) {
      showToast(err.message || 'Falha ao salvar.', 'error')
    } finally {
      setSalvandoId(null)
    }
  }

  if (carregando) return <p className="text-sm text-muted">Carregando planilha…</p>
  if (erro) return <p className="text-sm font-medium text-bad-text">{erro}</p>
  if (!config?.aba_nome) {
    return <p className="text-sm text-muted">Configuração de Faturas ainda não feita — peça pro supervisor configurar em Automações.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {contestadas.length === 0 && <p className="text-sm text-muted">Nenhuma contestação em aberto agora.</p>}

      {contestadas.map((linha) => {
        const salvando = salvandoId === linha.linhaPlanilha
        return (
          <div key={linha.linhaPlanilha} className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{linha.nome || '(sem nome)'}</div>
                <div className="text-xs text-muted">CNPJ: {linha.cnpj || '—'} · CustCode: {linha.custcode || '—'}</div>
              </div>
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs">{linha.status || 'sem status'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                className="field-input w-auto flex-1"
                placeholder="Número do protocolo"
                value={protocolos[linha.linhaPlanilha] || ''}
                onChange={(e) => setProtocolos((p) => ({ ...p, [linha.linhaPlanilha]: e.target.value }))}
              />
              <button type="button" className="btn-ghost btn-sm" disabled={salvando} onClick={() => salvarProtocolo(linha)}>
                Salvar protocolo
              </button>

              <select
                className="field-input w-auto"
                defaultValue=""
                disabled={salvando}
                onChange={(e) => {
                  const valor = e.target.value
                  if (valor) resolver(linha, valor)
                  e.target.value = ''
                }}
              >
                <option value="">Mudar status…</option>
                {STATUS_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )
      })}
      <Toast toast={toast} />
    </div>
  )
}
