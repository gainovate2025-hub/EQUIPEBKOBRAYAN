import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Workflow } from 'lucide-react'
import SectionHeading from '../../components/ui/SectionHeading'
import Modal from '../../components/ui/Modal'

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
    </div>
  )
}
