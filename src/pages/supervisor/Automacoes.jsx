import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { fetchParcelamentoConfig, updateParcelamentoConfig, fetchParcelamentoLogin, enviarParcelamentoLogin } from '../../lib/api'
import Modal from '../../components/ui/Modal'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import WhatsAppBotPanel from '../../components/automacoes/WhatsAppBotPanel'

// Cards simples (10/11/2026): sem ícone e sem a pílula de status
// ("Ativo", "Roda local"...), que eram só enfeite e não mudavam nunca.
const AUTOMACOES = [
  {
    key: 'crivo',
    nome: 'Crivo TIM',
    descricao: 'Consulta CNPJ nos dois sistemas da TIM (Easy Vendas) e responde aprovado/reprovado no chat.',
    to: '/supervisor/crivo',
  },
  {
    key: 'p2b',
    nome: 'P2B (CUST CODE)',
    descricao: 'Busca o CUST CODE no Phoenix2Business e preenche a planilha. Abre no site próprio do P2B.',
    to: null,
    // Virou link pro site separado (05/11/2026, pedido do Brayan): o
    // painel embutido (P2BPanel) tinha ficado desatualizado em relação ao
    // site próprio, que já tem tudo (divisão entre matrículas, log
    // detalhado, mapeamento).
    externalUrl: 'https://p2b-automation-frontend.onrender.com',
  },
  {
    key: 'parcelamento',
    nome: 'Portal Parcelamento',
    descricao: 'Consulta a fatura no Portal Parcelamento pelo Custcode e envia pro cliente. Roda na extensão do Chrome.',
    to: null,
  },
  {
    key: 'whatsapp',
    nome: 'Bot de atendimento (WhatsApp)',
    descricao: 'Liga o menu automático de atendimento num número de WhatsApp pelo QR code.',
    to: null,
  },
]

export default function Automacoes() {
  const [abrindo, setAbrindo] = useState(null)

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">Robôs e extensões da equipe.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {AUTOMACOES.map((a) => {
          const Conteudo = (
            <div className="card flex h-full items-start justify-between gap-3 p-5 transition hover:border-brand-500">
              <div className="flex flex-col gap-1.5">
                <div className="text-sm font-semibold text-ink">{a.nome}</div>
                <p className="text-sm text-muted">{a.descricao}</p>
              </div>
              <ChevronRight size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            </div>
          )
          if (a.externalUrl) {
            return (
              <a key={a.key} href={a.externalUrl} target="_blank" rel="noreferrer" className="block">
                {Conteudo}
              </a>
            )
          }
          if (a.to) {
            return <Link key={a.key} to={a.to} className="block">{Conteudo}</Link>
          }
          return (
            <button key={a.key} type="button" className="block w-full text-left" onClick={() => setAbrindo(a.key)}>
              {Conteudo}
            </button>
          )
        })}
      </div>

      {abrindo === 'parcelamento' && (
        <Modal title="Portal Parcelamento" onClose={() => setAbrindo(null)} width={560}>
          <div className="flex flex-col gap-3 text-sm">
            <p>Roda na extensão do Chrome. A planilha é definida aqui e vale pra todos que ligarem a extensão.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Instale a extensão em <code className="rounded bg-paper px-1 py-0.5">chrome://extensions</code> a partir da pasta <code className="rounded bg-paper px-1 py-0.5">extensao-portal-parcelamento/</code> do repositório</li>
              <li>Deixe uma aba do Portal Parcelamento aberta e clique em Ligar no ícone da extensão</li>
              <li>Se a aba do Portal cair na tela de login, use o formulário "Login" abaixo e ela entra sozinha</li>
            </ol>
            <p className="text-muted">Ela consulta cada Custcode pendente, envia a fatura por e-mail e marca "FATURA ENVIADA POR EMAIL" na coluna de status.</p>
          </div>
          <ParcelamentoConfigForm />
          <ParcelamentoLoginForm />
        </Modal>
      )}

      {abrindo === 'whatsapp' && (
        <Modal title="Bot de atendimento no WhatsApp" onClose={() => setAbrindo(null)} width={480}>
          <div className="flex flex-col gap-3 text-sm">
            <p>Digite o número que vai atender (com DDI, ex: 55 11 99999-8888) e escaneie o QR pelo celular desse número, como no WhatsApp Web.</p>
          </div>
          <WhatsAppBotPanel />
        </Modal>
      )}
    </div>
  )
}

function ParcelamentoConfigForm() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [appsScriptUrl, setAppsScriptUrl] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')
  const [abaNome, setAbaNome] = useState('')
  const [colunaCustcode, setColunaCustcode] = useState('')
  const [colunaEmail, setColunaEmail] = useState('')
  const [colunaTelefone, setColunaTelefone] = useState('')
  const [colunaStatus, setColunaStatus] = useState('')

  useEffect(() => {
    fetchParcelamentoConfig()
      .then((config) => {
        setAppsScriptUrl(config.apps_script_url || '')
        setSheetUrl(config.sheet_url || '')
        setAbaNome(config.aba_nome || 'Custo Code')
        setColunaCustcode(config.coluna_custcode || 'CUSTCODE')
        setColunaEmail(config.coluna_email || 'EMAIL')
        setColunaTelefone(config.coluna_telefone || 'TELEFONE')
        setColunaStatus(config.coluna_status || 'DATA DA FATURA')
      })
      .catch((err) => showToast(err.message || 'Falha ao carregar configuração.', 'error'))
      .finally(() => setCarregando(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      await updateParcelamentoConfig(profile.id, {
        apps_script_url: appsScriptUrl.trim(),
        sheet_url: sheetUrl.trim(),
        aba_nome: abaNome.trim() || 'Custo Code',
        coluna_custcode: colunaCustcode.trim() || 'CUSTCODE',
        coluna_email: colunaEmail.trim() || 'EMAIL',
        coluna_telefone: colunaTelefone.trim() || 'TELEFONE',
        coluna_status: colunaStatus.trim() || 'DATA DA FATURA',
      })
      showToast('Planilha atualizada. Vale pra quem já tiver a extensão ligada.')
    } catch (err) {
      showToast(err.message || 'Falha ao salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <p className="mt-4 text-sm text-muted">Carregando configuração…</p>

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <Field label="URL do Apps Script (Web App)">
        <input
          className="field-input"
          placeholder="https://script.google.com/macros/s/.../exec"
          value={appsScriptUrl}
          onChange={(e) => setAppsScriptUrl(e.target.value)}
        />
      </Field>
      <Field label="Link da planilha">
        <input
          className="field-input"
          placeholder="Cole o link da planilha do Google Sheets"
          value={sheetUrl}
          onChange={(e) => setSheetUrl(e.target.value)}
        />
      </Field>
      <Field label="Nome da aba">
        <input
          className="field-input"
          placeholder="Custo Code"
          value={abaNome}
          onChange={(e) => setAbaNome(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome da coluna do Custcode">
          <input
            className="field-input"
            placeholder="CUSTCODE"
            value={colunaCustcode}
            onChange={(e) => setColunaCustcode(e.target.value)}
          />
        </Field>
        <Field label="Nome da coluna do e-mail">
          <input
            className="field-input"
            placeholder="EMAIL"
            value={colunaEmail}
            onChange={(e) => setColunaEmail(e.target.value)}
          />
        </Field>
        <Field label="Nome da coluna do telefone">
          <input
            className="field-input"
            placeholder="TELEFONE"
            value={colunaTelefone}
            onChange={(e) => setColunaTelefone(e.target.value)}
          />
        </Field>
        <Field label="Nome da coluna de status">
          <input
            className="field-input"
            placeholder="DATA DA FATURA"
            value={colunaStatus}
            onChange={(e) => setColunaStatus(e.target.value)}
          />
        </Field>
      </div>
      <p className="text-xs text-muted">É nessa coluna que a extensão escreve "FATURA ENVIADA POR EMAIL" depois de enviar.</p>
      <button type="submit" className="btn-primary self-start" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar planilha'}
      </button>
      <Toast toast={toast} />
    </form>
  )
}

function ParcelamentoLoginForm() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [usuario, setUsuario] = useState('')
  const [token, setToken] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ultimoEnvio, setUltimoEnvio] = useState(null)

  useEffect(() => {
    fetchParcelamentoLogin()
      .then((login) => {
        if (login?.usuario) setUltimoEnvio({ usuario: login.usuario, criado_em: login.criado_em })
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!usuario.trim() || !token.trim()) return
    setEnviando(true)
    try {
      const usuarioLimpo = usuario.trim().toUpperCase()
      await enviarParcelamentoLogin(profile.id, { usuario: usuarioLimpo, token: token.trim() })
      setUltimoEnvio({ usuario: usuarioLimpo, criado_em: new Date().toISOString() })
      setToken('')
      showToast('Login enviado. A extensão usa isso na próxima vez que travar numa tela de login.')
    } catch (err) {
      showToast(err.message || 'Falha ao enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <div>
        <p className="text-sm font-semibold">Login (só quando a extensão pedir)</p>
        <p className="text-xs text-muted">
          Se a aba do Portal cair na tela de login, informe a matrícula e o código do token e envie. A extensão
          entra sozinha. O código vale por pouco tempo, então envie só na hora de usar.
        </p>
      </div>
      <Field label="Matrícula">
        <input
          className="field-input"
          placeholder="T3786035"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />
      </Field>
      <Field label="Código do token">
        <input
          className="field-input"
          placeholder="6 dígitos do chaveiro/app"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <button type="submit" className="btn-primary self-start" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar login'}
      </button>
      {ultimoEnvio && (
        <p className="text-xs text-muted">
          Último envio: {ultimoEnvio.usuario} às {new Date(ultimoEnvio.criado_em).toLocaleTimeString('pt-BR')}
        </p>
      )}
      <Toast toast={toast} />
    </form>
  )
}
