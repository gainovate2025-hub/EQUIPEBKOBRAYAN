import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPlanilhaLinhas, escreverPlanilhaCampo } from '../../lib/api'
import Toast from '../ui/Toast'
import { useToast } from '../../lib/useToast'
import { useAuth } from '../../lib/AuthContext'

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

// Lista genérica ligada numa aba da planilha "Controle de fatura" — vale
// pros 3 módulos (fatura, contestação, reagendamento), cada um é só uma
// aba diferente com seu próprio mapeamento de coluna (configurado em
// Configurações). O que muda de módulo pra módulo são as opções passadas:
//
// - modulo: 'fatura' | 'contestacao' | 'reagendamento'
// - filtroNomes: null (mostra todo mundo) ou array de nomes permitidos
// - statusOpcoes: array de opções fixas pro dropdown de status, ou null
//   pra editar o status como texto livre
// - mostrarWhatsapp / mostrarProtocolo / mostrarRetorno: liga/desliga
//   cada recurso extra
// - autoDataContestado: quando true, escolher "CONTESTADO" no status já
//   grava com a data de hoje junto (comportamento específico de Fatura)
export default function PlanilhaLista({
  modulo,
  filtroNomes,
  statusOpcoes = null,
  mostrarWhatsapp = false,
  mostrarProtocolo = false,
  mostrarRetorno = false,
  autoDataContestado = false,
}) {
  const { role } = useAuth()
  const { toast, showToast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [linhas, setLinhas] = useState([])
  const [config, setConfig] = useState(null)
  const [colunas, setColunas] = useState(null)
  const [salvandoId, setSalvandoId] = useState(null)
  const [statusLivre, setStatusLivre] = useState({})
  const [protocolos, setProtocolos] = useState({})
  const [retornoDatas, setRetornoDatas] = useState({})

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const resultado = await fetchPlanilhaLinhas(modulo)
      setConfig(resultado.config)
      setColunas(resultado.colunas)
      setLinhas(resultado.linhas)
      const statusIniciais = {}
      const protocolosIniciais = {}
      resultado.linhas.forEach((l) => {
        statusIniciais[l.linhaPlanilha] = l.status || ''
        protocolosIniciais[l.linhaPlanilha] = l.protocolo || ''
      })
      setStatusLivre(statusIniciais)
      setProtocolos(protocolosIniciais)
    } catch (err) {
      setErro(err.message || 'Falha ao carregar planilha.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [modulo])

  const linhasFiltradas = useMemo(() => {
    if (!filtroNomes) return linhas
    const permitidos = new Set(filtroNomes.map((n) => (n || '').trim().toLowerCase()).filter(Boolean))
    return linhas.filter((l) => permitidos.has((l.vendedor || '').trim().toLowerCase()))
  }, [linhas, filtroNomes])

  async function salvarStatus(linha, novoStatus) {
    setSalvandoId(linha.linhaPlanilha)
    try {
      const valorStatus = autoDataContestado && novoStatus === 'CONTESTADO'
        ? `FATURA CONTESTADA ${hojeCurto()}`
        : novoStatus
      await escreverPlanilhaCampo(config, colunas, linha.linhaPlanilha, 'status', valorStatus)
      if (mostrarProtocolo && novoStatus === 'CONTESTADO') {
        const protocolo = (protocolos[linha.linhaPlanilha] || '').trim()
        if (protocolo) {
          await escreverPlanilhaCampo(config, colunas, linha.linhaPlanilha, 'protocolo', protocolo)
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

  async function salvarProtocolo(linha) {
    setSalvandoId(linha.linhaPlanilha)
    try {
      await escreverPlanilhaCampo(config, colunas, linha.linhaPlanilha, 'protocolo', (protocolos[linha.linhaPlanilha] || '').trim())
      showToast('Protocolo salvo.')
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
      await escreverPlanilhaCampo(
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
        {role === 'supervisor' ? (
          <>Configuração ainda não feita — vá em <Link to="/supervisor/configuracoes" className="underline">Configurações</Link> e escolha a aba e as colunas dessa planilha.</>
        ) : (
          'Configuração ainda não feita — peça pro supervisor configurar em Configurações.'
        )}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {linhasFiltradas.length === 0 && <p className="text-sm text-muted">Nenhum cliente encontrado.</p>}

      {linhasFiltradas.map((linha) => {
        const wa = mostrarWhatsapp ? linkWhatsapp(linha.telefone) : null
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
              {statusOpcoes ? (
                <select
                  className="field-input w-auto"
                  defaultValue=""
                  disabled={salvando}
                  onChange={(e) => {
                    const valor = e.target.value
                    if (valor) salvarStatus(linha, valor)
                    e.target.value = ''
                  }}
                >
                  <option value="">Marcar como…</option>
                  {statusOpcoes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    className="field-input w-auto flex-1"
                    placeholder="Status"
                    value={statusLivre[linha.linhaPlanilha] ?? ''}
                    onChange={(e) => setStatusLivre((p) => ({ ...p, [linha.linhaPlanilha]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={salvando}
                    onClick={() => salvarStatus(linha, statusLivre[linha.linhaPlanilha] || '')}
                  >
                    Salvar status
                  </button>
                </>
              )}

              {mostrarProtocolo && (
                <>
                  <input
                    className="field-input w-auto"
                    placeholder="Protocolo"
                    value={protocolos[linha.linhaPlanilha] || ''}
                    onChange={(e) => setProtocolos((p) => ({ ...p, [linha.linhaPlanilha]: e.target.value }))}
                  />
                  <button type="button" className="btn-ghost btn-sm" disabled={salvando} onClick={() => salvarProtocolo(linha)}>
                    Salvar protocolo
                  </button>
                </>
              )}

              {mostrarRetorno && (
                <>
                  <input
                    type="date"
                    className="field-input w-auto"
                    value={retornoDatas[linha.linhaPlanilha] || ''}
                    onChange={(e) => setRetornoDatas((p) => ({ ...p, [linha.linhaPlanilha]: e.target.value }))}
                  />
                  <button type="button" className="btn-ghost btn-sm" disabled={salvando} onClick={() => aplicarRetorno(linha)}>
                    Retornar pro cliente
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
      <Toast toast={toast} />
    </div>
  )
}
