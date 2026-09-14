import { Link } from 'react-router-dom'
import { Search, Workflow } from 'lucide-react'
import SectionHeading from '../../components/ui/SectionHeading'

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
    descricao: 'Automatiza a busca de CUST CODE no Phoenix2Business e joga na planilha. Roda no seu computador — abre pelo atalho "iniciar.command" na pasta do projeto (ainda não tem versão web).',
    icon: Workflow,
    to: null,
    status: 'Roda local',
  },
]

export default function Automacoes() {
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
          return a.to ? (
            <Link key={a.key} to={a.to} className="block">{Conteudo}</Link>
          ) : (
            <div key={a.key}>{Conteudo}</div>
          )
        })}
      </div>
    </div>
  )
}
