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

function hojeCurto() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function soDigitos(v) {
  return (v || '').replace(/\D/g, '')
}

function linkWhatsapp(telefone) {
  const numero = soDigitos(telefone)
  if (!numero) return null
  const comDdi = numero.length <= 11 ? `55${numero}` : numero
  return `https://wa.me/${comDdi}`
}

// filtroNomes: null = mostra todo mundo (supervisão sem equipe vinculada);
// array de nomes = mostra só as linhas cujo vendedor bate com um desses
// nomes (BKO vê só o próprio; líder/supervisor com equipe vê o time).
export default function FaturasList({ filtroNomes }) {
  const { toast, showToast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [linhas, setLinhas] = useState([])
  const [config, setConfig] = useState(null)
  const [colunas, setColunas] = useState(null)
  const [salvandoId, setSalvandoId] = useState(null)
  const [protocolos, setProtocolos] = useState({})
  const [retornoDatas, setRetornoDatas] = useState({})

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const resultado = await fetchFaturasLinhas()
      setConfig(resultado.config)
      setColunas(resultado.colunas)
      setLinhas(resultado.linhas)
    } catch (err) {
      setErro(err.message || 'Falha ao carregar planilha.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const linhasFiltradas = useMemo(() => {
    if (!filtroNomes) return linhas
    const permitidos = new Set(filtroNomes.map((n) => (n || '').trim().toLowerCase()).filter(Boolean))
    return linhas.filter((l) => permitidos.has((l.vendedor || '').trim().toLowerCase()))
  }, [linhas, filtroNomes])

  async function aplicarStatus(linha, novoStatus) {
    setSalvandoId(linha.linhaPlanilha)
    try {
      const valorStatus = novoStatus === 'CONTESTADO' ? `FATURA CONTESTADA ${hojeCurto()}` : novoStatus
      await escreverFaturaCampo(config, colunas, linha.linhaPlanilha, 'status', valorStatus)
      if (novoStatus === 'CONTESTADO') {
        const protocolo = (protocolos[linha.linhaPlanilha] || '').trim()
        if (protocolo) {
          await escreverFaturaCampo(config, colunas, linha.linhaPlanilha, 'protocolo', protocolo)
        }
      }
      showToast('Status atualizado.')
      await carregar()
    } catch (err) {
      showToast(err.message || 'Falha ao salvar.', 'error')
    } finally {
      setSalvandoId(null)
    }
  }

  async function aplicarRetorno(linha) {
    const data = retornoDatas[linha.linhaPlanilha]
    if (!data) return showToast('Escolhe a data de retorno.', 'error')
    const [, mes, dia] = data.split('-')
    setSalvandoId(linha.linhaPlanilha)
    try {
      await escreverFaturaCampo(
        config,
        colunas,
        linha.linhaPlanilha,
        'status',
        `AGUARDANDO COMPROVANTE DE PAGAMENTO PARA ${dia}/${mes}`
      )
      showToast('Retorno agendado.')
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
    return (
      <p className="text-sm text-muted">
        Configuração de Faturas ainda não feita — peça pro supervisor configurar em Automações → Faturas (Controle de fatura).
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {linhasFiltradas.length === 0 && <p className="text-sm text-muted">Nenhum cliente encontrado.</p>}

      {linhasFiltradas.map((linha) => {
        const wa = linkWhatsapp(linha.telefone)
        const salvando = salvandoId === linha.linhaPlanilha
        return (
          <div key={linha.linhaPlanilha} className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{linha.nome || '(sem nome)'}</div>
                <div className="text-xs text-muted">CNPJ: {linha.cnpj || '—'} · CustCode: {linha.custcode || '—'}</div>
              </div>
              <div className="flex items-center gap-2">
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                    WhatsApp
                  </a>
                )}
                <span className="rounded-full bg-paper px-2 py-0.5 text-xs">{linha.status || 'sem status'}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="field-input w-auto"
                defaultValue=""
                disabled={salvando}
                onChange={(e) => {
                  const valor = e.target.value
                  if (valor) aplicarStatus(linha, valor)
                  e.target.value = ''
                }}
              >
                <option value="">Marcar como…</option>
                {STATUS_OPCOES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <input
                className="field-input w-auto"
                placeholder="Protocolo (se contestação)"
                value={protocolos[linha.linhaPlanilha] || ''}
                onChange={(e) => setProtocolos((p) => ({ ...p, [linha.linhaPlanilha]: e.target.value }))}
              />

              <input
                type="date"
                className="field-input w-auto"
                value={retornoDatas[linha.linhaPlanilha] || ''}
                onChange={(e) => setRetornoDatas((p) => ({ ...p, [linha.linhaPlanilha]: e.target.value }))}
              />
              <button type="button" className="btn-ghost btn-sm" disabled={salvando} onClick={() => aplicarRetorno(linha)}>
                Retornar pro cliente
              </button>
            </div>
          </div>
        )
      })}
      <Toast toast={toast} />
    </div>
  )
}
