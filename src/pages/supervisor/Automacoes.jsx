import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Workflow, FileText, MessageCircle } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { fetchParcelamentoConfig, updateParcelamentoConfig } from '../../lib/api'
import SectionHeading from '../../components/ui/SectionHeading'
import Modal from '../../components/ui/Modal'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import WhatsAppBotPanel from '../../components/automacoes/WhatsAppBotPanel'

const AUTOMACOES = [
  {
    key: 'crivo',
    nome: 'Crivo TIM',
    descricao: 'Consulta CNPJ nos dois sistemas do TIM (Easy Vendas) e responde aprovado/reprovado no chat.',
    icon: Search,
    to: '/supervisor/crivo',
    status: 'Ativo',
  },
  {
    key: 'p2b',
    nome: 'P2B (CUST CODE)',
    descricao: 'Automatiza a busca de CUST CODE no Phoenix2Business e joga na planilha.',
    icon: Workflow,
    to: null,
    status: 'Roda local',
  },
  {
    key: 'parcelamento',
    nome: 'Portal Parcelamento',
    descricao: 'Consulta fatura no Portal Parcelamento por Custcode, baixa o PDF e envia pro cliente pelo WhatsApp Web.',
    icon: FileText,
    to: null,
    status: 'Roda local',
  },
  {
    key: 'whatsapp',
    nome: 'Bot de Atendimento (WhatsApp)',
    descricao: 'Liga o menu automático de atendimento num número — digita o número, escaneia o QR, pronto.',
    icon: MessageCircle,
    to: null,
    status: 'Na nuvem',
  },
]

export default function Automacoes() {
  const [abrindo, setAbrindo] = useState(null)

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Automações" hint="As ferramentas que fazem trabalho repetitivo por você" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {AUTOMACOES.map((a) => {
          const Conteudo = (
            <div className="card flex h-full flex-col gap-3 p-6 transition hover:border-brand-500">
              <div className="flex items-center justify-between">
                <a.icon size={22} strokeWidth={2} className="text-brand-600" />
                <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-muted">{a.status}</span>
              </div>
              <div className="text-sm font-semibold">{a.nome}</div>
              <p className="text-xs text-muted">{a.descricao}</p>
            </div>
          )
          if (a.to) {
            return <Link key={a.key} to={a.to} className="block">{Conteudo}</Link>
          }
          return (
            <button key={a.key} type="button" className="block text-left" onClick={() => setAbrindo(a.key)}>
              {Conteudo}
            </button>
          )
        })}
      </div>

      {abrindo === 'p2b' && (
        <Modal title="Como abrir o P2B" onClose={() => setAbrindo(null)}>
          <div className="flex flex-col gap-3 text-sm">
            <p>O P2B ainda não tem versão web — ele roda direto no seu computador, um por vez, cada um com a própria conta Google.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Abre a pasta do projeto P2B no seu computador</li>
              <li>Dá dois cliques no arquivo <code className="rounded bg-paper px-1 py-0.5">iniciar.command</code></li>
              <li>Ele já busca a versão mais nova sozinho antes de abrir</li>
            </ol>
            <p className="text-muted">Se não achar o atalho ou der erro ao abrir, me chama que eu te ajudo a resolver.</p>
          </div>
        </Modal>
      )}

      {abrindo === 'parcelamento' && (
        <Modal title="Portal Parcelamento" onClose={() => setAbrindo(null)} width={560}>
          <div className="flex flex-col gap-3 text-sm">
            <p>Essa automação roda direto no Chrome (extensão), um por vez — mas a planilha usada é definida AQUI, pra todo mundo que ligar a extensão usar a mesma.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Instala a extensão em <code className="rounded bg-paper px-1 py-0.5">chrome://extensions</code> a partir da pasta <code className="rounded bg-paper px-1 py-0.5">extensao-portal-parcelamento/</code> do repositório</li>
              <li>Deixa uma aba do Portal Parcelamento e uma do WhatsApp Web logadas, e clica em Ligar no ícone da extensão</li>
            </ol>
            <p className="text-muted">Ela consulta cada Custcode pendente na planilha abaixo, envia a fatura e a cobrança por WhatsApp, e marca o resultado na coluna "DATA DA FATURA".</p>
          </div>
          <ParcelamentoConfigForm />
        </Modal>
      )}

      {abrindo === 'whatsapp' && (
        <Modal title="Bot de Atendimento no WhatsApp" onClose={() => setAbrindo(null)} width={480}>
          <div className="flex flex-col gap-3 text-sm">
            <p>Digita o número que vai atender (com DDI, ex: 55 11 99999-8888) e escaneia o QR pelo celular desse número — como conectar o WhatsApp Web.</p>
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

  useEffect(() => {
    fetchParcelamentoConfig()
      .then((config) => {
        setAppsScriptUrl(config.apps_script_url || '')
        setSheetUrl(config.sheet_url || '')
        setAbaNome(config.aba_nome || 'Custo Code')
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
      })
      showToast('Planilha atualizada — vale pra quem já tiver a extensão ligada.')
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
      <button type="submit" className="btn-primary self-start" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar planilha'}
      </button>
      <Toast toast={toast} />
    </form>
  )
}
