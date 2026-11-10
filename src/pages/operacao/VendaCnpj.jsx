import { useEffect, useState } from 'react'
import {
  Search, Loader2, AlertTriangle, Info, Building2, Phone, Plus, Trash2, Save, ArrowLeft, Check, XCircle,
} from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { consultarOperadora, escreverVendaNaPlanilha } from '../../lib/api'
import { soDigitos, formatarCnpj, formatarCpf, comNoveDigito } from '../../lib/documentos'
import Secao from '../../components/ui/Secao'
import CampoTim from '../../components/ui/CampoTim'
import { Campo } from '../../components/vendaCnpj/Campo'

// Tela de consulta de CNPJ + registro da venda (operação e supervisor).
// Grava em vendas_cnpj, que vira a fila da tela do Cadastro. Contexto do
// banco em supabase/migration_025_vendas_cnpj.sql e seguintes
// (principalmente migration_040).
//
// Visual (10/11/2026): no estilo "Cadastro de Cliente" da TIM (print
// mandada pelo Brayan): cartões brancos com faixa azul-marinho, Linhas
// vendidas em tabela com "Adicionar linha" e lixeira, e botões Voltar /
// Salvar cadastro no rodapé. Usa as peças compartilhadas (Secao, CampoTim,
// field-input, btn-*) em vez de cores fixas, igual ao resto do site.
// O formulário aparece direto assim que o CNPJ é consultado.

function semAcento(v) {
  return (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Só o plano real que o Brayan mandou (print em 26/10/2026). Antes
// tinha 3 chutes (R$50/70/100), tirados a pedido dele.
const PLANOS = ['BLACKFRIDAY 80GB R$53,99']
const MAX_LINHAS = 10

// A Receita Federal coloca o número do CNPJ na frente da "razão social"
// de MEI/autônomo (ex: "61.351.426 DENISE PEREIRA DOS SANTOS"). Tira
// esse prefixo numérico, deixando só o nome de verdade.
function limparPrefixoNumerico(nome) {
  return (nome || '').replace(/^[\d./-]+\s+/, '').trim()
}

// MEI vem com o CPF do dono colado no fim da razão social (ex: "JOSE
// RODRIGO DE FREITAS 36649680850"). Separa o nome e o CPF pra já
// preencher os dados do cliente (pedido do Brayan em 10/11/2026).
function separarNomeECpf(razaoSocial) {
  const m = /^(.*?)\s+(\d{11})$/.exec((razaoSocial || '').trim())
  if (!m) return { nome: (razaoSocial || '').trim(), cpf: '' }
  return { nome: m[1].trim(), cpf: m[2] }
}

// Telefone da empresa no formato do celular: DDD + 9 + número. A Receita
// guarda muitos celulares antigos com 8 dígitos; o Brayan pediu pra
// sempre acrescentar o 9 (10/11/2026). Se já tiver 9 dígitos, mantém.
function telefoneComNove(est) {
  const ddd = soDigitos(est?.ddd1 || '')
  let numero = soDigitos(est?.telefone1 || '')
  if (!ddd || !numero) return ''
  if (numero.length === 8) numero = `9${numero}`
  return `${ddd}${numero}`.slice(0, 11)
}

function formatarDataBr(iso) {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

// Monta o endereço num texto só, pra ficar fácil de copiar de uma vez.
function montarEndereco(estabelecimento) {
  if (!estabelecimento) return ''
  const partes = [
    [estabelecimento.tipo_logradouro, estabelecimento.logradouro].filter(Boolean).join(' '),
    estabelecimento.numero,
    estabelecimento.bairro,
    estabelecimento.cep,
    estabelecimento.cidade?.nome,
    estabelecimento.estado?.sigla,
  ].filter(Boolean)
  return partes.join(', ')
}

// Busca os dados do CNPJ em DOIS serviços grátis ao mesmo tempo
// (10/11/2026). O cnpj.ws vem completo (inclusive o CPF do dono do MEI
// colado na razão social), mas só aceita 3 consultas por minuto por
// internet, e com a equipe toda no mesmo escritório dava "Muitas consultas
// seguidas" toda hora. O OpenCNPJ (api.opencnpj.org) não tem esse limite e
// traz endereço, telefone e e-mail, só não traz o CPF. Usa o cnpj.ws
// quando ele responde; senão o OpenCNPJ (aí o CPF é digitado na mão).
// A BrasilAPI e a minhareceita foram testadas e descartadas: escondem
// telefone, e-mail, rua e o CPF de MEI.
async function buscarCnpjWs(cnpjLimpo) {
  const res = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjLimpo}`)
  if (res.status === 404) throw Object.assign(new Error('nao_encontrado'), { naoEncontrado: true })
  if (!res.ok) throw new Error(`cnpj.ws ${res.status}`)
  return res.json()
}

// Converte a resposta do OpenCNPJ pro mesmo formato do cnpj.ws, que é o
// que o resto da tela usa.
async function buscarOpenCnpj(cnpjLimpo) {
  const res = await fetch(`https://api.opencnpj.org/${cnpjLimpo}`)
  if (res.status === 404) throw Object.assign(new Error('nao_encontrado'), { naoEncontrado: true })
  if (!res.ok) throw new Error(`OpenCNPJ ${res.status}`)
  const d = await res.json()
  const tel = (d.telefones || []).find((t) => !t.is_fax) || {}
  const principal = (d.cnaes || []).find((c) => c.is_principal) || {}
  return {
    razao_social: d.razao_social,
    estabelecimento: {
      cnpj: d.cnpj,
      nome_fantasia: d.nome_fantasia,
      tipo_logradouro: d.tipo_logradouro,
      logradouro: d.logradouro,
      numero: d.numero,
      bairro: d.bairro,
      cep: d.cep,
      cidade: { nome: d.municipio },
      estado: { sigla: d.uf },
      ddd1: tel.ddd || '',
      telefone1: tel.numero || '',
      email: d.email || '',
      situacao_cadastral: d.situacao_cadastral,
      data_inicio_atividade: d.data_inicio_atividade,
      atividade_principal: { descricao: principal.descricao || '' },
    },
  }
}

async function buscarCnpj(cnpjLimpo) {
  const [ws, open] = await Promise.allSettled([buscarCnpjWs(cnpjLimpo), buscarOpenCnpj(cnpjLimpo)])
  if (ws.status === 'fulfilled') return ws.value
  if (open.status === 'fulfilled') return open.value
  if (ws.reason?.naoEncontrado || open.reason?.naoEncontrado) throw new Error('CNPJ não encontrado na Receita.')
  throw new Error('Os serviços de consulta de CNPJ não responderam. Aguarde um minuto e tente de novo.')
}

// Qualquer situação diferente de "Ativa" (Suspensa, Inapta, Baixada,
// Nula...) é REPROVADO e não pode vender (pedido do Brayan em 10/11/2026;
// antes só Suspensa e Inapta bloqueavam). Sem situação nenhuma na
// resposta, não bloqueia (não dá pra afirmar nada).
function situacaoBloqueada(situacao) {
  const s = semAcento(situacao).trim()
  return Boolean(s) && s !== 'ativa'
}

// id fixo por linha (10/11/2026): antes a linha era achada pela posição
// na lista, e remover uma linha no meio ou uma consulta de operadora que
// voltava atrasada podia gravar o resultado na linha errada.
function novoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function linhaVazia() {
  return {
    id: novoId(),
    numero: '',
    numeroConsultado: null, // último número que já foi consultado, evita reconsultar à toa
    tipo: 'nova', // 'nova' | 'portabilidade'
    titularTipo: 'pf', // 'pf' | 'pj'
    titularCpf: '',
    titularNomePf: '',
    titularRazaoSocial: '',
    titularCnpj: '',
    tipoChip: 'fisico', // 'fisico' | 'esim'
    operadoraOrigem: '', // só linha nova: de qual operadora o cliente vem
    consultando: false,
    operadora: null,
    operadoraBruta: null,
    portado: null,
    erroOperadora: null,
  }
}

// --- E-mail do cliente (pedido do Brayan em 10/11/2026) -----------------
// Sem acento, sem espaço e só minúsculas (o sistema da TIM recusa).
function limparEmail(v) {
  return (v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]/g, '')
}

// E-mails de contador/provedor que aparecem no cadastro da Receita no
// lugar do e-mail do cliente: não podem ser usados.
const PALAVRAS_PROIBIDAS_EMAIL = ['maismei', 'provedor', 'contabil']
function emailProibido(email) {
  return PALAVRAS_PROIBIDAS_EMAIL.some((p) => (email || '').includes(p))
}

// E-mail que parece de corretora (seguros/imóveis): só AVISA, não
// bloqueia, porque o próprio cliente pode ser corretor (10/11/2026).
function emailDeCorretora(email) {
  return /corretor|seguros/.test(email || '')
}

function emailValido(email) {
  return /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email || '')
}

// Correção do que vem depois do @ (ex: gmial.com -> gmail.com). Compara
// com os provedores mais comuns e sugere o mais parecido (até 2 letras
// de diferença).
const DOMINIOS_COMUNS = [
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com',
  'live.com', 'bol.com.br', 'uol.com.br', 'terra.com.br', 'msn.com', 'hotmail.com.br', 'outlook.com.br',
]
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[a.length][b.length]
}
function sugerirEmailCorrigido(email) {
  const i = (email || '').lastIndexOf('@')
  if (i < 1) return null
  const local = email.slice(0, i)
  const original = email.slice(i + 1)
  if (!original || DOMINIOS_COMUNS.includes(original)) return null
  const ajustado = original.replace(/\.con$/, '.com').replace(/\.co$/, '.com').replace(/\.combr$/, '.com.br').replace(/,/g, '.')
  if (DOMINIOS_COMUNS.includes(ajustado)) return `${local}@${ajustado}`
  let melhor = null
  for (const d of DOMINIOS_COMUNS) {
    const dist = Math.min(distancia(original, d), distancia(ajustado, d))
    if (dist <= 2 && (!melhor || dist < melhor.dist)) melhor = { d, dist }
  }
  return melhor ? `${local}@${melhor.d}` : null
}

// Operadoras pra caixa "de qual operadora o cliente vem" (linha nova).
const OPERADORAS_ORIGEM = ['VIVO', 'CLARO', 'TIM', 'OI', 'OUTRA']

function linhaValida(l) {
  // Linha nova não pede dado nenhum do titular (pedido do Brayan em
  // 10/11/2026), só a operadora de onde o cliente vem.
  if (l.tipo !== 'portabilidade') return Boolean(l.operadoraOrigem)
  const titularOk = l.titularTipo === 'pf'
    ? soDigitos(l.titularCpf).length === 11 && l.titularNomePf.trim()
    : soDigitos(l.titularCnpj).length === 14 && l.titularRazaoSocial.trim()
  if (!titularOk) return false
  if (l.tipo === 'portabilidade') {
    const d = soDigitos(l.numero)
    if (d.length !== 10 && d.length !== 11) return false
  }
  return true
}

function Aviso({ children }) {
  if (!children) return null
  return (
    <p className="tim-alert" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      {children}
    </p>
  )
}

// Resultado da consulta de operadora do telefone do cliente, logo abaixo
// do campo. TIM aparece em vermelho (é só aviso, não bloqueia a venda).
function OperadoraDoCliente({ info }) {
  if (!info) return null
  if (info.consultando) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted">
        <Loader2 size={12} className="animate-spin" /> Consultando operadora…
      </span>
    )
  }
  if (info.erro) return <span className="text-xs font-normal text-bad-text">Não consegui consultar a operadora: {info.erro}</span>
  if (info.operadora === 'TIM') {
    return (
      <span className="flex items-center gap-1 text-xs font-bold text-bad-text">
        <AlertTriangle size={13} /> Este número já é TIM
      </span>
    )
  }
  return (
    <span className="text-xs font-normal text-muted">
      Operadora: <span className="font-semibold text-ink">{info.operadora || info.bruta || 'não identificada'}</span>
    </span>
  )
}

function StatusPlanilha({ planilha, tentarDeNovo }) {
  if (!planilha) return null
  if (planilha.enviando) {
    return (
      <p className="tim-info mb-3">
        <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-brand-500" /> Cadastrando na planilha de vendas…
      </p>
    )
  }
  if (planilha.ok) {
    return (
      <p className="mb-3 flex items-start gap-2 rounded-md border border-good-border bg-good-bg px-3 py-2 text-sm font-semibold text-good-text">
        <Check size={16} className="mt-0.5 shrink-0" /> Cadastrada na planilha de vendas (aba {planilha.aba}, linha {planilha.linha}).
      </p>
    )
  }
  if (planilha.naoConfigurada) {
    return (
      <p className="tim-info mb-3">
        <Info size={16} className="mt-0.5 shrink-0 text-brand-500" /> A planilha de vendas ainda não foi configurada (Configurações › Planilha de vendas). A venda ficou salva no painel.
      </p>
    )
  }
  return (
    <div className="tim-alert mb-3 flex-wrap items-center">
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1">A venda foi salva, mas não entrou na planilha: {planilha.erro}</span>
      <button type="button" className="btn-outline btn-sm" onClick={tentarDeNovo}>Tentar de novo</button>
    </div>
  )
}

function AvisoEmail({ email, faltando, corrigir }) {
  if (!email && faltando) {
    return <span className="text-xs font-bold text-bad-text">A consulta não trouxe e-mail do cliente. Pergunte e digite aqui.</span>
  }
  if (emailProibido(email)) {
    return <span className="text-xs font-bold text-bad-text">E-mail de contador/provedor não pode. Use o e-mail do próprio cliente.</span>
  }
  if (emailDeCorretora(email)) {
    return (
      <span className="text-xs font-bold text-warn-text">
        Parece e-mail de corretora. Confira se é mesmo o e-mail do cliente antes de salvar.
      </span>
    )
  }
  const sugestao = sugerirEmailCorrigido(email)
  if (sugestao) {
    return (
      <span className="text-xs font-normal text-muted">
        Você quis dizer <span className="font-semibold text-ink">{sugestao}</span>?{' '}
        <button type="button" className="font-semibold text-brand-500 underline" onClick={() => corrigir(sugestao)}>
          Corrigir
        </button>
      </span>
    )
  }
  return null
}

function DadoEmpresa({ label, valor }) {
  if (!valor) return null
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-paper px-3 py-2">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="text-sm font-medium text-ink">{valor}</span>
    </div>
  )
}

// Uma linha da tabela "Linhas vendidas". Em tela larga vira uma linha de
// tabela; no celular, as colunas empilham (cada campo com seu rótulo).
const COLUNAS_LINHA = 'lg:grid-cols-[44px_1.1fr_1fr_1.3fr_0.9fr_1.3fr_1.5fr_52px]'

function LinhaVendida({ numeroDaLinha, linha, atualizar, consultar, remover, podeRemover, operadoraSugerida }) {
  function set(campo, valor) {
    atualizar(linha.id, { [campo]: valor })
  }

  // Consulta sozinha assim que o número digitado fica completo, sem
  // botão. Dispara no onChange quando chega a 11 dígitos (celular, o
  // formato mais comum) e no onBlur como reforço pra números de 10 (caso
  // a pessoa saia do campo sem completar os 11).
  function aoMudarNumero(valor) {
    const digitos = soDigitos(valor).slice(0, 11)
    // Número mudou: o resultado da consulta anterior não vale mais.
    atualizar(linha.id, {
      numero: digitos,
      numeroConsultado: null,
      consultando: false,
      operadora: null,
      operadoraBruta: null,
      portado: null,
      erroOperadora: null,
    })
    if (digitos.length === 11) consultar(linha.id, digitos)
  }

  function aoSairDoNumero() {
    if (linha.numero.length === 10 && linha.numero !== linha.numeroConsultado) {
      consultar(linha.id, linha.numero)
    }
  }

  // Linha nova não tem número ainda (é a TIM que gera), então o campo de
  // número só existe na portabilidade (pedido do Brayan em 10/11/2026).
  // Voltar pra "Linha nova" apaga o número e a operadora já consultados.
  function mudarTipo(tipo) {
    if (tipo === 'nova') {
      atualizar(linha.id, {
        tipo,
        numero: '',
        numeroConsultado: null,
        consultando: false,
        operadora: null,
        operadoraBruta: null,
        portado: null,
        erroOperadora: null,
      })
    } else {
      set('tipo', tipo)
    }
  }

  const portabilidade = linha.tipo === 'portabilidade'
  const pj = linha.titularTipo === 'pj'
  const rotuloCelular = 'text-xs font-semibold text-muted lg:hidden'

  return (
    <div className={`grid grid-cols-1 items-start gap-2 border-b border-divider px-2 py-2.5 last:border-b-0 sm:grid-cols-2 ${COLUNAS_LINHA}`}>
      <div className="flex items-center gap-2 lg:block">
        <span className="inline-flex h-8 w-9 items-center justify-center rounded-md bg-paper text-sm font-semibold text-ink">
          {numeroDaLinha}
        </span>
        <span className="text-sm font-semibold text-ink lg:hidden">Linha {numeroDaLinha}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className={rotuloCelular}>Nova ou portabilidade</span>
        <select className="field-input" aria-label="Nova ou portabilidade" value={linha.tipo} onChange={(e) => mudarTipo(e.target.value)}>
          <option value="nova">Linha nova</option>
          <option value="portabilidade">Portabilidade</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className={rotuloCelular}>Tipo de chip</span>
        <select className="field-input" aria-label="Tipo de chip" value={linha.tipoChip} onChange={(e) => set('tipoChip', e.target.value)}>
          <option value="fisico">Chip físico</option>
          <option value="esim">eSIM</option>
        </select>
      </div>

      <div className={`flex-col gap-1 ${portabilidade ? 'flex' : 'hidden lg:flex'}`}>
        <span className={rotuloCelular}>Número a portar (DDD + número)</span>
        {!portabilidade && (
          <p className="hidden py-2 text-sm text-subtle lg:block" aria-hidden>Não precisa</p>
        )}
        {portabilidade && (<>
        <input
          className="field-input"
          aria-label="Número com DDD"
          placeholder="Ex: 11999990000"
          inputMode="numeric"
          value={linha.numero}
          onChange={(e) => aoMudarNumero(e.target.value)}
          onBlur={aoSairDoNumero}
          required
        />
        {linha.consultando && <p className="text-xs text-muted">Consultando operadora…</p>}
        {linha.erroOperadora && <p className="text-xs text-bad-text">{linha.erroOperadora}</p>}
        {linha.operadora === 'TIM' && (
          <p className="flex items-center gap-1 text-xs font-semibold text-bad-text">
            <AlertTriangle size={12} /> Número TIM: não fazemos TIM pra TIM
          </p>
        )}
        {linha.operadora && linha.operadora !== 'TIM' && (
          <p className="text-xs text-muted">
            Operadora: <span className="font-semibold text-ink">{linha.operadora}</span>
            {linha.portado === true && ' (já portado)'}
          </p>
        )}
        </>)}
      </div>

      {!portabilidade && (
        <div className="flex flex-col gap-1 lg:col-span-3">
          <span className="text-xs font-semibold text-muted">De qual operadora o cliente vem</span>
          <select
            className="field-input"
            aria-label="De qual operadora o cliente vem"
            value={linha.operadoraOrigem || operadoraSugerida || ''}
            onChange={(e) => set('operadoraOrigem', e.target.value)}
            onFocus={() => { if (!linha.operadoraOrigem && operadoraSugerida) set('operadoraOrigem', operadoraSugerida) }}
            required
          >
            <option value="">Selecione</option>
            {OPERADORAS_ORIGEM.map((o) => (
              <option key={o} value={o}>{o === 'OUTRA' ? 'Outra' : o}</option>
            ))}
          </select>
          {(linha.operadoraOrigem || operadoraSugerida) === 'TIM' && (
            <p className="flex items-center gap-1 text-xs font-semibold text-bad-text">
              <AlertTriangle size={12} /> O cliente já é TIM
            </p>
          )}
        </div>
      )}

      {portabilidade && (<>
      <div className="flex flex-col gap-1">
        <span className={rotuloCelular}>Titular</span>
        <select className="field-input" aria-label="Titular" value={linha.titularTipo} onChange={(e) => set('titularTipo', e.target.value)}>
          <option value="pf">Pessoa física</option>
          <option value="pj">Pessoa jurídica</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className={rotuloCelular}>{pj ? 'CNPJ do titular' : 'CPF do titular'}</span>
        {pj ? (
          <input
            className="field-input"
            aria-label="CNPJ do titular"
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            value={formatarCnpj(linha.titularCnpj)}
            onChange={(e) => set('titularCnpj', soDigitos(e.target.value).slice(0, 14))}
            required
          />
        ) : (
          <input
            className="field-input"
            aria-label="CPF do titular"
            placeholder="000.000.000-00"
            inputMode="numeric"
            value={formatarCpf(linha.titularCpf)}
            onChange={(e) => set('titularCpf', soDigitos(e.target.value).slice(0, 11))}
            required
          />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className={rotuloCelular}>{pj ? 'Razão social do titular' : 'Nome do titular'}</span>
        {pj ? (
          <input
            className="field-input"
            aria-label="Razão social do titular"
            placeholder="Razão social Ltda"
            value={linha.titularRazaoSocial}
            onChange={(e) => set('titularRazaoSocial', e.target.value)}
            required
          />
        ) : (
          <input
            className="field-input"
            aria-label="Nome do titular"
            placeholder="Nome completo"
            value={linha.titularNomePf}
            onChange={(e) => set('titularNomePf', e.target.value)}
            required
          />
        )}
      </div>
      </>)}

      <div className="flex lg:justify-center">
        <button
          type="button"
          onClick={() => remover(linha.id)}
          disabled={!podeRemover}
          aria-label={`Remover linha ${numeroDaLinha}`}
          title={podeRemover ? 'Remover linha' : 'A venda precisa de pelo menos 1 linha'}
          className="btn-outline-danger h-9 w-9 p-0"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

export default function VendaCnpj() {
  const { profile } = useAuth()
  const [cnpj, setCnpj] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState(null) // resposta crua do cnpj.ws

  const [salvando, setSalvando] = useState(false)
  const [vendaSalva, setVendaSalva] = useState(null) // registro já gravado, pra mostrar a ficha final
  // Envio da ficha pra planilha de vendas, logo depois de salvar:
  // null | { enviando } | { ok, linha, aba } | { naoConfigurada } | { erro }
  const [planilha, setPlanilha] = useState(null)

  async function enviarPraPlanilha(venda) {
    setPlanilha({ enviando: true })
    try {
      const r = await escreverVendaNaPlanilha(venda)
      setPlanilha(r.configurada ? { ok: true, linha: r.linha, aba: r.aba } : { naoConfigurada: true })
    } catch (err) {
      setPlanilha({ erro: err.message || 'Falha ao escrever na planilha.' })
    }
  }

  const [linhas, setLinhas] = useState(() => [linhaVazia()])
  const [plano, setPlano] = useState(PLANOS[0])
  const [pontoReferencia, setPontoReferencia] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const [emailCliente, setEmailCliente] = useState('')
  // A consulta do CNPJ não trouxe e-mail (ou trouxe e-mail de contador):
  // o campo pisca até alguém digitar o e-mail do cliente.
  const [emailFaltando, setEmailFaltando] = useState(false)
  const [cpfCliente, setCpfCliente] = useState('')
  const [telefoneCliente, setTelefoneCliente] = useState('')
  const [captador, setCaptador] = useState('')
  const [fechouVenda, setFechouVenda] = useState(profile?.name || '')
  // Operadora do telefone do cliente, consultada sozinha no
  // consultaoperadora.com.br assim que o telefone fica completo.
  const [operadoraCliente, setOperadoraCliente] = useState(null) // { numero, consultando, operadora, bruta, erro }

  useEffect(() => {
    const numero = soDigitos(telefoneCliente)
    if (numero.length !== 10 && numero.length !== 11) {
      setOperadoraCliente(null)
      return undefined
    }
    let cancelado = false // se o telefone mudar no meio, ignora a resposta velha
    setOperadoraCliente({ numero, consultando: true })
    consultarOperadora(numero)
      .then((r) => {
        if (!cancelado) setOperadoraCliente({ numero, consultando: false, operadora: r.operadora, bruta: r.operadoraBruta })
      })
      .catch((err) => {
        if (!cancelado) setOperadoraCliente({ numero, consultando: false, erro: err.message })
      })
    return () => { cancelado = true }
  }, [telefoneCliente])

  // "Quantidade de linhas" e a tabela andam juntas: escolher o número
  // aumenta/corta a tabela (cortando do fim); "Adicionar linha" e a
  // lixeira mudam o número. Virou select de 1 a 10 em 10/11/2026: no
  // campo numérico, apagar o valor pra digitar outro voltava pra 1 e
  // apagava as linhas de baixo.
  function atualizarQuantidade(valor) {
    const n = Math.max(1, Math.min(MAX_LINHAS, Number(valor) || 1))
    setLinhas((atual) => {
      if (n <= atual.length) return atual.slice(0, n)
      const novas = [...atual]
      while (novas.length < n) novas.push(linhaVazia())
      return novas
    })
  }

  function adicionarLinha() {
    setLinhas((atual) => (atual.length >= MAX_LINHAS ? atual : [...atual, linhaVazia()]))
  }

  function removerLinha(id) {
    setLinhas((atual) => (atual.length <= 1 ? atual : atual.filter((l) => l.id !== id)))
  }

  // Mescla só os campos alterados sobre a versão ATUAL da linha.
  function atualizarLinha(id, patch) {
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  async function consultarOperadoraDaLinha(id, numeroLimpo) {
    atualizarLinha(id, { consultando: true, erroOperadora: null })
    let patch
    try {
      const r = await consultarOperadora(numeroLimpo)
      patch = {
        numeroConsultado: numeroLimpo,
        consultando: false,
        operadora: r.operadora,
        operadoraBruta: r.operadoraBruta,
        portado: r.portado,
      }
    } catch (err) {
      patch = { consultando: false, erroOperadora: err.message }
    }
    // Só aplica se a linha ainda tem o mesmo número: se a pessoa mudou o
    // número enquanto a consulta rodava, essa resposta é velha.
    setLinhas((atual) => atual.map((l) => (
      l.id === id && soDigitos(l.numero) === numeroLimpo ? { ...l, ...patch } : l
    )))
  }

  // Limpa o formulário mas deixa o CNPJ digitado (usado ao consultar um
  // CNPJ novo, pra não misturar dados do cliente anterior).
  function limparFormulario() {
    setDados(null)
    setErro('')
    setVendaSalva(null)
    setPlanilha(null)
    setLinhas([linhaVazia()])
    setPlano(PLANOS[0])
    setPontoReferencia('')
    setNomeCliente('')
    setEmailCliente('')
    setEmailFaltando(false)
    setCpfCliente('')
    setTelefoneCliente('')
    setCaptador('')
    setFechouVenda(profile?.name || '')
  }

  function limparTudo() {
    setCnpj('')
    limparFormulario()
  }

  async function consultar(e) {
    e?.preventDefault()
    limparFormulario()
    const limpo = soDigitos(cnpj)
    if (limpo.length !== 14) return setErro('Digite um CNPJ válido (14 números).')

    setBuscando(true)
    try {
      const resposta = await buscarCnpj(limpo)
      setDados(resposta)
      // Já preenche os dados do cliente com o que veio da empresa (dá pra
      // corrigir à mão depois).
      const est = resposta?.estabelecimento
      const { nome, cpf } = separarNomeECpf(limparPrefixoNumerico(resposta?.razao_social))
      setNomeCliente(nome)
      setCpfCliente(cpf)
      setTelefoneCliente(telefoneComNove(est))
      const emailDaConsulta = limparEmail(est?.email)
      const emailServe = emailDaConsulta && !emailProibido(emailDaConsulta)
      setEmailCliente(emailServe ? emailDaConsulta : '')
      setEmailFaltando(!emailServe)
    } catch (err) {
      setErro(err.message)
    } finally {
      setBuscando(false)
    }
  }

  function dadosEmpresa() {
    const est = dados?.estabelecimento
    return {
      cnpj: formatarCnpj(est?.cnpj || dados?.cnpj || cnpj),
      razao_social: limparPrefixoNumerico(dados?.razao_social),
      nome_fantasia: est?.nome_fantasia || '',
      endereco: montarEndereco(est),
      telefone: est?.telefone1 ? comNoveDigito(`${est.ddd1 || ''}${est.telefone1}`) : '',
      email: est?.email || '',
      situacao: est?.situacao_cadastral || '',
      data_abertura: formatarDataBr(est?.data_inicio_atividade),
      atividade_principal: est?.atividade_principal?.descricao || '',
      uf: est?.estado?.sigla || '',
    }
  }

  async function registrarVendaNaoFeita() {
    setSalvando(true)
    setErro('')
    const empresa = dadosEmpresa()
    const { error } = await supabase.from('vendas_cnpj').insert({
      ...empresa,
      status: 'venda_nao_feita',
      solicitado_por: profile.id,
    })
    setSalvando(false)
    // Se falhar, mantém a tela como está pra pessoa poder tentar de novo.
    if (error) return setErro('Não foi possível registrar a venda não feita: ' + error.message)
    limparTudo()
  }

  // Linha nova sem escolha feita usa a operadora do telefone do cliente
  // (a mesma que aparece pré-selecionada na caixa).
  function comOrigem(l) {
    if (l.tipo === 'portabilidade' || l.operadoraOrigem) return l
    return { ...l, operadoraOrigem: operadoraCliente?.operadora || '' }
  }

  function linhasParaSalvar() {
    return linhas.map(comOrigem).map((l) => {
      if (l.tipo !== 'portabilidade') {
        return { numero: null, tipo: l.tipo, tipo_chip: l.tipoChip, operadora_origem: l.operadoraOrigem }
      }
      return {
        numero: soDigitos(l.numero) || null,
        tipo: l.tipo,
        tipo_chip: l.tipoChip,
        titular_tipo: l.titularTipo,
        titular_documento: l.titularTipo === 'pf' ? soDigitos(l.titularCpf) : soDigitos(l.titularCnpj),
        titular_nome: l.titularTipo === 'pf' ? l.titularNomePf.trim() : l.titularRazaoSocial.trim(),
        operadora: l.operadora,
        operadora_bruta: l.operadoraBruta,
        portado: l.portado,
      }
    })
  }

  // Confere o que o "required" do navegador não pega (10/11/2026).
  function problemaNoFormulario() {
    if (soDigitos(cpfCliente).length !== 11) return 'Informe o CPF do cliente com 11 números.'
    if (emailProibido(emailCliente)) return 'Esse e-mail é de contador/provedor. Informe o e-mail do próprio cliente.'
    if (!emailValido(emailCliente)) return 'Informe um e-mail válido pro cliente.'
    const tel = soDigitos(telefoneCliente).length
    if (tel !== 10 && tel !== 11) return 'Informe o telefone do cliente com DDD (10 ou 11 números).'
    if (operadoraCliente?.consultando) return 'Aguarde terminar a consulta de operadora do telefone do cliente.'
    if (linhas.some((l) => l.consultando)) return 'Aguarde terminar a consulta de operadora das linhas.'
    const semOrigem = linhas.map(comOrigem).findIndex((l) => l.tipo !== 'portabilidade' && !l.operadoraOrigem)
    if (semOrigem >= 0) return `Escolha de qual operadora o cliente vem na linha ${semOrigem + 1}.`
    if (!linhas.map(comOrigem).every(linhaValida)) {
      return 'Nas linhas de portabilidade, preencha o número e o titular (CPF e nome, ou CNPJ e razão social).'
    }
    const tim = linhas.findIndex((l) => l.tipo === 'portabilidade' && l.operadora === 'TIM')
    if (tim >= 0) return `A linha ${tim + 1} é um número TIM. Não fazemos portabilidade de TIM pra TIM.`
    return ''
  }

  async function salvarVendaFeita(e) {
    e?.preventDefault()
    const problema = problemaNoFormulario()
    if (problema) return setErro(problema)
    setSalvando(true)
    setErro('')
    const empresa = dadosEmpresa()
    const payload = {
      ...empresa,
      status: 'venda_feita',
      quantidade_linhas: linhas.length,
      linhas: linhasParaSalvar(),
      plano,
      ponto_referencia: pontoReferencia.trim() || null,
      nome_cliente: nomeCliente.trim() || null,
      email_cliente: emailCliente.trim() || null,
      cpf_cliente: soDigitos(cpfCliente) || null,
      telefone_cliente: comNoveDigito(telefoneCliente) || null,
      // Coluna operadora_linha (migration_029, estava reservada sem uso):
      // guarda a operadora do telefone do cliente, pra tela do Cadastro
      // avisar quando for TIM.
      operadora_linha: operadoraCliente?.operadora || operadoraCliente?.bruta || null,
      captador: captador.trim() || null,
      fechou_venda: fechouVenda.trim() || null,
      solicitado_por: profile.id,
    }
    const { data, error } = await supabase.from('vendas_cnpj').insert(payload).select().single()
    setSalvando(false)
    if (error) return setErro('Erro ao salvar: ' + error.message)
    setVendaSalva(data)
    enviarPraPlanilha(data)
  }

  const empresa = dados ? dadosEmpresa() : null
  const bloqueado = empresa ? situacaoBloqueada(empresa.situacao) : false
  // Com a empresa na tela, o erro aparece perto dos botões do rodapé;
  // sem ela (erro da consulta de CNPJ), logo abaixo da busca.
  const erroNoRodape = Boolean(empresa && !vendaSalva)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Consulte o CNPJ e preencha as informações abaixo pra registrar a venda.</p>

      {/* Consulta de CNPJ */}
      <Secao titulo="Consultar CNPJ" icone={Search}>
        <form onSubmit={consultar} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="field-input sm:flex-1"
            aria-label="CNPJ"
            placeholder="Digite ou cole o CNPJ (00.000.000/0000-00)"
            inputMode="numeric"
            value={formatarCnpj(cnpj)}
            onChange={(e) => setCnpj(soDigitos(e.target.value).slice(0, 14))}
          />
          <button type="submit" disabled={buscando} className="btn-primary px-5">
            {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {buscando ? 'Consultando…' : 'Consultar'}
          </button>
        </form>
      </Secao>

      {!erroNoRodape && <Aviso>{erro}</Aviso>}

      {/* Dados da empresa (vindos da consulta) */}
      {empresa && !vendaSalva && (
        <Secao titulo="Dados da empresa" icone={Building2}>
          <p className="text-lg font-bold text-sidebar">{empresa.razao_social || '(sem razão social)'}</p>
          {empresa.nome_fantasia && <p className="text-sm text-muted">{empresa.nome_fantasia}</p>}

          {bloqueado && (
            <div className="tim-alert mt-2 text-base font-bold">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              REPROVADO: CNPJ com situação {empresa.situacao?.toUpperCase()}. Não venda pra esse cliente.
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <DadoEmpresa label="CNPJ" valor={empresa.cnpj} />
            {bloqueado ? (
              <div className="flex flex-col gap-0.5 rounded-md border border-bad-border bg-bad-bg px-3 py-2">
                <span className="text-xs font-semibold text-bad-text">Situação</span>
                <span className="text-sm font-bold text-bad-text">{empresa.situacao} · REPROVADO</span>
              </div>
            ) : (
              <DadoEmpresa label="Situação" valor={empresa.situacao} />
            )}
            <DadoEmpresa label="Aberta desde" valor={empresa.data_abertura} />
            <DadoEmpresa label="Telefone" valor={empresa.telefone} />
            <DadoEmpresa label="E-mail" valor={empresa.email} />
            <DadoEmpresa label="Atividade" valor={empresa.atividade_principal} />
            <div className="sm:col-span-2 lg:col-span-3">
              <DadoEmpresa label="Endereço" valor={empresa.endereco} />
            </div>
          </div>
        </Secao>
      )}

      {/* Formulário de cadastro: aparece direto depois da consulta */}
      {empresa && !vendaSalva && !bloqueado && (
        <form onSubmit={salvarVendaFeita} className="flex flex-col gap-4">
          <Secao titulo="Dados do cliente">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CampoTim label="Nome do cliente" obrigatorio>
                <input className="field-input" placeholder="Nome completo" value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} required />
              </CampoTim>
              <CampoTim label="CPF do cliente" obrigatorio>
                <input
                  className="field-input"
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  value={formatarCpf(cpfCliente)}
                  onChange={(e) => setCpfCliente(soDigitos(e.target.value).slice(0, 11))}
                  required
                />
              </CampoTim>
              <CampoTim label="Número" obrigatorio>
                <input
                  className="field-input"
                  placeholder="Ex: 11999990000"
                  inputMode="numeric"
                  value={telefoneCliente}
                  onChange={(e) => setTelefoneCliente(soDigitos(e.target.value).slice(0, 11))}
                  required
                />
                <OperadoraDoCliente info={operadoraCliente} />
              </CampoTim>
              <CampoTim label="E-mail" obrigatorio>
                <input
                  type="email"
                  className={`field-input ${emailFaltando && !emailCliente ? 'piscar-forte' : ''}`}
                  placeholder="cliente@exemplo.com"
                  value={emailCliente}
                  onChange={(e) => setEmailCliente(limparEmail(e.target.value))}
                  required
                />
                <AvisoEmail email={emailCliente} faltando={emailFaltando} corrigir={setEmailCliente} />
              </CampoTim>
              <CampoTim label="Endereço de entrega (o do cartão CNPJ)" className="sm:col-span-2">
                <input className="field-input" value={empresa.endereco} readOnly disabled />
              </CampoTim>
              <CampoTim label="Ponto de referência" obrigatorio className="sm:col-span-2">
                <input className="field-input" placeholder="Ex: perto do mercado São José" value={pontoReferencia} onChange={(e) => setPontoReferencia(e.target.value)} required />
              </CampoTim>
            </div>
            <p className="tim-info mt-3">
              <Info size={17} className="mt-0.5 shrink-0 text-brand-500" />
              O endereço de entrega é só o que consta no cartão CNPJ do cliente. Não é liberada venda pra outro endereço.
            </p>
          </Secao>

          <Secao titulo="Equipe">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CampoTim label="Captador da venda">
                <input className="field-input" placeholder="Quem captou o cliente" value={captador} onChange={(e) => setCaptador(e.target.value)} />
              </CampoTim>
              <CampoTim label="Quem fechou a venda (operador)" obrigatorio>
                <input className="field-input" value={fechouVenda} onChange={(e) => setFechouVenda(e.target.value)} required />
              </CampoTim>
            </div>
          </Secao>

          <Secao titulo="Plano">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CampoTim label="Quantidade de linhas">
                <select className="field-input" value={linhas.length} onChange={(e) => atualizarQuantidade(e.target.value)}>
                  {Array.from({ length: MAX_LINHAS }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </CampoTim>
              <CampoTim label="Plano contratado">
                <select className="field-input" value={plano} onChange={(e) => setPlano(e.target.value)}>
                  {PLANOS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </CampoTim>
            </div>
          </Secao>

          <Secao
            titulo="Linhas vendidas"
            icone={Phone}
            acao={
              <button
                type="button"
                onClick={adicionarLinha}
                disabled={linhas.length >= MAX_LINHAS}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-brand-300 px-3 py-1 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-40"
              >
                <Plus size={15} /> Adicionar linha
              </button>
            }
          >
            <div className="overflow-hidden rounded-md border border-divider">
              <div className={`hidden gap-2 bg-paper px-2 py-2 text-sm font-semibold text-ink lg:grid ${COLUNAS_LINHA}`}>
                <span>Linha</span>
                <span>Nova / portab.</span>
                <span>Tipo de chip</span>
                <span>Número a portar</span>
                <span>Titular (portabilidade)</span>
                <span>CPF/CNPJ do titular</span>
                <span>Nome do titular</span>
                <span className="text-center">Ações</span>
              </div>
              {linhas.map((l, i) => (
                <LinhaVendida
                  key={l.id}
                  numeroDaLinha={i + 1}
                  linha={l}
                  atualizar={atualizarLinha}
                  consultar={consultarOperadoraDaLinha}
                  remover={removerLinha}
                  podeRemover={linhas.length > 1}
                  operadoraSugerida={operadoraCliente?.operadora && OPERADORAS_ORIGEM.includes(operadoraCliente.operadora) ? operadoraCliente.operadora : ''}
                />
              ))}
            </div>
          </Secao>

          <Aviso>{erro}</Aviso>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={limparTudo} className="btn-outline px-5 py-2.5">
                <ArrowLeft size={16} /> Voltar
              </button>
              <button type="button" onClick={registrarVendaNaoFeita} disabled={salvando} className="btn-outline-danger px-5 py-2.5">
                <XCircle size={16} /> Venda não feita
              </button>
            </div>
            <button type="submit" disabled={salvando} className="btn-primary px-6 py-2.5 font-semibold">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {salvando ? 'Salvando…' : 'Salvar cadastro'}
            </button>
          </div>
        </form>
      )}

      {/* CNPJ bloqueado: não mostra o formulário, só deixa registrar e voltar */}
      {empresa && !vendaSalva && bloqueado && (
        <>
          <Aviso>{erro}</Aviso>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={limparTudo} className="btn-outline px-5 py-2.5">
              <ArrowLeft size={16} /> Voltar
            </button>
            <button type="button" onClick={registrarVendaNaoFeita} disabled={salvando} className="btn-outline-danger px-5 py-2.5">
              <XCircle size={16} /> Registrar venda não feita
            </button>
          </div>
        </>
      )}

      {/* Ficha final, depois de salvar */}
      {vendaSalva && (
        <Secao titulo="Ficha da venda pronta pra cadastrar" icone={Check}>
          <StatusPlanilha planilha={planilha} tentarDeNovo={() => enviarPraPlanilha(vendaSalva)} />
          <p className="mb-2 text-sm text-muted">Clique no ícone ao lado de cada campo pra copiar o valor.</p>
          <Campo comCopiar label="CNPJ" valor={vendaSalva.cnpj} />
          <Campo comCopiar label="Razão social" valor={vendaSalva.razao_social} />
          <Campo comCopiar label="Nome fantasia" valor={vendaSalva.nome_fantasia} />
          <Campo comCopiar label="Situação" valor={vendaSalva.situacao} />
          <Campo comCopiar label="Aberta desde" valor={vendaSalva.data_abertura} />
          <Campo comCopiar label="Atividade" valor={vendaSalva.atividade_principal} />
          <Campo comCopiar label="Endereço" valor={vendaSalva.endereco} />
          <Campo comCopiar label="Ponto de referência" valor={vendaSalva.ponto_referencia} />
          <Campo comCopiar label="Telefone (empresa)" valor={vendaSalva.telefone} />
          <Campo comCopiar label="E-mail (empresa)" valor={vendaSalva.email} />
          <Campo comCopiar label="Nome do cliente" valor={vendaSalva.nome_cliente} />
          <Campo comCopiar label="CPF do cliente" valor={vendaSalva.cpf_cliente ? formatarCpf(vendaSalva.cpf_cliente) : ''} />
          <Campo comCopiar label="Número do cliente" valor={vendaSalva.telefone_cliente} />
          <Campo label="Operadora do telefone do cliente" valor={vendaSalva.operadora_linha} />
          <Campo comCopiar label="E-mail do cliente" valor={vendaSalva.email_cliente} />
          <Campo comCopiar label="Plano" valor={vendaSalva.plano} />
          <Campo comCopiar label="Captador da venda" valor={vendaSalva.captador} />
          <Campo comCopiar label="Quem fechou a venda" valor={vendaSalva.fechou_venda} />

          {(vendaSalva.linhas || []).map((l, i) => (
            <div key={i} className="mt-3 rounded-md border border-divider px-3 py-1">
              <p className="pt-1 text-sm font-semibold text-sidebar">Linha {i + 1}</p>
              <Campo comCopiar label="Tipo" valor={l.tipo === 'portabilidade' ? 'Portabilidade' : 'Linha nova'} />
              <Campo comCopiar label="Número" valor={l.numero} />
              <Campo comCopiar label="Operadora" valor={l.operadora || l.operadora_bruta} />
              <Campo comCopiar label="Tipo de chip" valor={l.tipo_chip === 'esim' ? 'eSIM' : 'Chip físico'} />
              <Campo comCopiar label="Operadora de origem do cliente" valor={l.operadora_origem} />
              {l.tipo === 'portabilidade' && (<>
              <Campo comCopiar label="Titular" valor={l.titular_tipo === 'pj' ? 'Pessoa jurídica' : 'Pessoa física'} />
              <Campo
                comCopiar
                label={l.titular_tipo === 'pj' ? 'CNPJ do titular' : 'CPF do titular'}
                valor={l.titular_tipo === 'pj' ? formatarCnpj(l.titular_documento) : formatarCpf(l.titular_documento)}
              />
              <Campo comCopiar label={l.titular_tipo === 'pj' ? 'Razão social do titular' : 'Nome do titular'} valor={l.titular_nome} />
              </>)}
            </div>
          ))}

          <button type="button" onClick={limparTudo} className="btn-primary mt-4 px-5 py-2.5">
            <Search size={16} /> Nova consulta
          </button>
        </Secao>
      )}
    </div>
  )
}
