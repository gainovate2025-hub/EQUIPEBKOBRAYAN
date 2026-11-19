import { useEffect, useState } from 'react'
import {
  Search, Loader2, AlertTriangle, Info, Building2, Plus, Trash2, Save, ArrowLeft, Check, XCircle,
} from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { consultarOperadora, escreverVendaNaPlanilha } from '../../lib/api'
import { soDigitos, formatarCnpj, formatarCpf, comNoveDigito, cpfValido } from '../../lib/documentos'
import Secao from '../../components/ui/Secao'
import CampoTim from '../../components/ui/CampoTim'
import { OperadoraLogo } from '../../components/vendaCnpj/OperadoraLogo'

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

// Pacote de dados de cada linha (print do Brayan em 19/11/2026, "Monte o
// plano ideal para a sua empresa"): cada linha escolhe o seu pacote, a voz
// é sempre ilimitada e o valor mensal vem do pacote. Antes era um plano só
// pra venda inteira ('BLACKFRIDAY 80GB R$53,99').
const PACOTES = [
  { id: '80GB', preco: 53.99 },
  { id: '40GB', preco: 39.99 },
]
const PACOTE_PADRAO = '80GB'
const MAX_LINHAS = 10

function precoDoPacote(id) {
  return (PACOTES.find((p) => p.id === id) || PACOTES[0]).preco
}

function reais(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Texto que vai na coluna "plano" (Cadastro e planilha), ex:
// "2x 80GB (R$ 53,99) + 1x 40GB (R$ 39,99) · Voz ilimitada · Total R$ 147,97/mês".
function resumoDoPlano(linhas) {
  const partes = PACOTES
    .map((p) => ({ ...p, qtd: linhas.filter((l) => (l.pacote || PACOTE_PADRAO) === p.id).length }))
    .filter((p) => p.qtd > 0)
    .map((p) => `${p.qtd}x ${p.id} (${reais(p.preco)})`)
  const total = linhas.reduce((soma, l) => soma + precoDoPacote(l.pacote), 0)
  return `${partes.join(' + ')} · Voz ilimitada · Total ${reais(total)}/mês`
}

// Soma do plano: valor mensal de cada linha somado.
// "Por ano" e "Fidelidade de 2 anos" foram tirados a pedido do Brayan (12/11/2026).
function SomaDoPlano({ linhas }) {
  const porMes = linhas.reduce((soma, l) => soma + precoDoPacote(l.pacote), 0)
  const quantidade = linhas.length
  return (
    <div className="w-full rounded-md border border-divider bg-paper p-3 sm:w-72">
      <p className="mb-2 text-sm font-semibold text-ink">Valor do plano</p>
      <p className="text-xs text-muted">
        {quantidade} {quantidade === 1 ? 'linha' : 'linhas'} · voz ilimitada
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted">Total por mês</span>
        <span className="text-lg font-bold text-ink">{reais(porMes)}</span>
      </div>
    </div>
  )
}

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

// 3ª opção (16/11/2026): quando o OpenCNPJ bloqueia a internet do
// escritório (deu 403) e o cnpj.ws estoura o limite de 3 por minuto, a
// consulta falhava toda. A BrasilAPI esconde telefone/e-mail em alguns
// casos, mas traz situação e endereço — dá pra seguir e digitar o resto.
async function buscarBrasilApi(cnpjLimpo) {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`)
  if (res.status === 404) throw Object.assign(new Error('nao_encontrado'), { naoEncontrado: true })
  if (!res.ok) throw new Error(`BrasilAPI ${res.status}`)
  const d = await res.json()
  const tel = soDigitos(d.ddd_telefone_1 || '')
  return {
    razao_social: d.razao_social,
    estabelecimento: {
      cnpj: d.cnpj,
      nome_fantasia: d.nome_fantasia,
      tipo_logradouro: d.descricao_tipo_de_logradouro,
      logradouro: d.logradouro,
      numero: d.numero,
      bairro: d.bairro,
      cep: d.cep,
      cidade: { nome: d.municipio },
      estado: { sigla: d.uf },
      ddd1: tel.slice(0, 2),
      telefone1: tel.slice(2),
      email: d.email || '',
      situacao_cadastral: d.descricao_situacao_cadastral,
      data_inicio_atividade: d.data_inicio_atividade,
      atividade_principal: { descricao: d.cnae_fiscal_descricao || '' },
    },
  }
}

async function buscarCnpj(cnpjLimpo) {
  const [ws, open, brasil] = await Promise.allSettled([buscarCnpjWs(cnpjLimpo), buscarOpenCnpj(cnpjLimpo), buscarBrasilApi(cnpjLimpo)])
  if (ws.status === 'fulfilled') return ws.value
  if (open.status === 'fulfilled') return open.value
  if (brasil.status === 'fulfilled') return brasil.value
  if (ws.reason?.naoEncontrado || open.reason?.naoEncontrado || brasil.reason?.naoEncontrado) throw new Error('CNPJ não encontrado na Receita.')
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
    // Começa sem escolha (11/11/2026): a ficha só sobe com cada linha
    // preenchida de verdade, não com o padrão que veio marcado.
    tipo: '', // '' | 'nova' | 'portabilidade'
    titularTipo: 'pf', // 'pf' | 'pj'
    titularCpf: '',
    titularNomePf: '',
    titularRazaoSocial: '',
    titularCnpj: '',
    tipoChip: 'fisico', // 'fisico' | 'esim' — já vem chip físico (Brayan, 17/11/2026)
    pacote: PACOTE_PADRAO, // pacote de dados da linha (19/11/2026)
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

function linhaValida(l) {
  if (!l.tipo || !l.tipoChip) return false
  // Linha nova não pede mais nada (nem titular, nem operadora de origem).
  if (l.tipo !== 'portabilidade') return true
  const titularOk = l.titularTipo === 'pf'
    ? cpfValido(l.titularCpf) && l.titularNomePf.trim()
    : soDigitos(l.titularCnpj).length === 14 && l.titularRazaoSocial.trim()
  if (!titularOk) return false
  // 17/11/2026: todo número a portar tem que ter 11 dígitos (DDD + 9 + número).
  if (soDigitos(l.numero).length !== 11) return false
  return true
}

function nomeComparavel(v) {
  return semAcento(v).replace(/\s+/g, ' ').trim()
}

// 17/11/2026 (Brayan): o mesmo CPF não pode aparecer em mais de uma linha
// com nomes diferentes (ex: 3 linhas com o mesmo CPF e 3 nomes). Mesmo CPF
// com o mesmo nome pode. Devolve índice -> número da 1ª linha com esse CPF.
function linhasComCpfRepetido(linhas) {
  const vistos = new Map() // cpf -> { i, nome }
  const repetidas = new Map()
  linhas.forEach((l, i) => {
    if (l.tipo !== 'portabilidade' || l.titularTipo !== 'pf') return
    const cpf = soDigitos(l.titularCpf)
    if (cpf.length !== 11) return
    const nome = nomeComparavel(l.titularNomePf)
    const antes = vistos.get(cpf)
    if (!antes) {
      vistos.set(cpf, { i, nome })
      return
    }
    if (!antes.nome && nome) antes.nome = nome
    if (nome && antes.nome && nome !== antes.nome) repetidas.set(i, antes.i + 1)
  })
  return repetidas
}

// Número de portabilidade repetido entre as linhas (pedido do Brayan em
// 11/11/2026): duas linhas não podem portar o mesmo número. Compara com o
// 9 na frente, pra "11 9999-0000" e "11 99999-0000" contarem como iguais.
// Devolve o índice das linhas repetidas (a 1ª de cada número fica de fora).
function chaveNumero(l) {
  if (l.tipo !== 'portabilidade') return ''
  const d = comNoveDigito(l.numero)
  return d.length === 11 ? d : ''
}

function linhasComNumeroRepetido(linhas) {
  const vistos = new Map()
  const repetidas = new Map() // índice -> número da 1ª linha com o mesmo número
  linhas.forEach((l, i) => {
    const k = chaveNumero(l)
    if (!k) return
    if (vistos.has(k)) repetidas.set(i, vistos.get(k) + 1)
    else vistos.set(k, i)
  })
  return repetidas
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
    <span className="flex items-center gap-1.5 text-xs font-normal text-muted">
      Operadora: <OperadoraLogo operadora={info.operadora} bruta={info.bruta} />
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

// Uma linha do "Monte o plano ideal para a sua empresa" (visual do print
// do Brayan, 19/11/2026): cartão com a bolinha vermelha numerada, Tipo de
// linha, Tipo de chip, Pacote de dados, Plano de voz e o valor mensal na
// caixa cinza à direita; lixeira fora do cartão. Na portabilidade, número
// (com a operadora atual), titular, CPF/CNPJ e nome aparecem embaixo,
// igual era na tabela antiga. Sem DDD e sem "Ver mais" (Brayan: "deixe
// igual o de antes, mas nesse formato").
function LinhaVendida({ numeroDaLinha, linha, atualizar, consultar, remover, podeRemover, repeteLinha, cpfRepeteLinha }) {
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

  // 17/11/2026: o número não é apagado ao trocar o tipo, porque a 1ª
  // linha já vem com o telefone do cartão CNPJ. Linha nova só ignora o
  // número na hora de salvar.
  function mudarTipo(tipo) {
    set('tipo', tipo)
    if (tipo === 'portabilidade' && linha.numero.length === 11 && linha.numero !== linha.numeroConsultado) {
      consultar(linha.id, linha.numero)
    }
  }

  const portabilidade = linha.tipo === 'portabilidade'
  const pj = linha.titularTipo === 'pj'
  const rotulo = 'text-sm text-muted'

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="flex flex-col lg:flex-row">
          <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-3 p-4">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tim text-sm font-semibold text-white">
              {numeroDaLinha}
            </span>

            <label className="flex w-full flex-col gap-1 sm:w-44">
              <span className={rotulo}>Tipo de linha</span>
              <select className="field-input font-semibold text-brand-700" aria-label="Tipo de linha" value={linha.tipo} onChange={(e) => mudarTipo(e.target.value)} required>
                <option value="">Selecione</option>
                <option value="nova">Nova Linha</option>
                <option value="portabilidade">Portabilidade</option>
              </select>
            </label>

            <label className="flex w-full flex-col gap-1 sm:w-40">
              <span className={rotulo}>Tipo de chip</span>
              <select className="field-input font-semibold text-brand-700" aria-label="Tipo de chip" value={linha.tipoChip} onChange={(e) => set('tipoChip', e.target.value)} required>
                <option value="">Selecione</option>
                <option value="fisico">Chip físico</option>
                <option value="esim">eSIM</option>
              </select>
            </label>

            <label className="flex w-full flex-col gap-1 sm:w-44">
              <span className={rotulo}>Pacote de dados</span>
              <select className="field-input font-semibold text-brand-700" aria-label="Pacote de dados" value={linha.pacote} onChange={(e) => set('pacote', e.target.value)}>
                {PACOTES.map((p) => (
                  <option key={p.id} value={p.id}>{p.id}</option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1">
              <span className={rotulo}>Plano de Voz</span>
              <span className="text-xl font-bold text-brand-700">Ilimitado</span>
            </div>

          </div>

          <div className="flex flex-col items-center justify-center gap-0.5 bg-paper px-6 py-4 lg:w-60">
            <span className="text-sm text-brand-700">Valor mensal</span>
            <span className="text-2xl font-bold text-brand-700">{reais(precoDoPacote(linha.pacote))}/mês</span>
          </div>
        </div>

        {portabilidade && (
          <div className="grid grid-cols-1 gap-3 border-t border-divider px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Número a portar (DDD + número)</span>
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
              {repeteLinha > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-bad-text">
                  <AlertTriangle size={12} /> Número repetido: igual ao da linha {repeteLinha}
                </span>
              )}
              {linha.consultando && <span className="text-xs text-muted">Consultando operadora…</span>}
              {linha.erroOperadora && <span className="text-xs text-bad-text">{linha.erroOperadora}</span>}
              {linha.operadora === 'TIM' && (
                <span className="flex items-center gap-1 text-xs font-semibold text-bad-text">
                  <AlertTriangle size={12} /> Número TIM: não fazemos TIM pra TIM
                </span>
              )}
              {linha.operadora && linha.operadora !== 'TIM' && (
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <OperadoraLogo operadora={linha.operadora} bruta={linha.operadoraBruta} />
                  {linha.portado === true && <span>(já portado)</span>}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1">
              <span className={rotulo}>Titular do número</span>
              <select className="field-input" aria-label="Titular do número" value={linha.titularTipo} onChange={(e) => set('titularTipo', e.target.value)}>
                <option value="pf">Pessoa física</option>
                <option value="pj">Pessoa jurídica</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className={rotulo}>{pj ? 'CNPJ do titular' : 'CPF do titular'}</span>
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
              {!pj && soDigitos(linha.titularCpf).length === 11 && !cpfValido(linha.titularCpf) && (
                <span className="flex items-center gap-1 text-xs font-semibold text-bad-text">
                  <AlertTriangle size={12} /> CPF inválido, confira os números
                </span>
              )}
              {!pj && cpfRepeteLinha > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-bad-text">
                  <AlertTriangle size={12} /> CPF já usado na linha {cpfRepeteLinha} com outro nome
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1">
              <span className={rotulo}>{pj ? 'Razão social do titular' : 'Nome do titular'}</span>
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
            </label>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => remover(linha.id)}
        disabled={!podeRemover}
        aria-label={`Remover linha ${numeroDaLinha}`}
        title={podeRemover ? 'Remover linha' : 'A venda precisa de pelo menos 1 linha'}
        className="shrink-0 rounded-md p-1.5 text-brand-300 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-30"
      >
        <Trash2 size={24} />
      </button>
    </div>
  )
}

// 16/11/2026 (Brayan): não deixa subir ficha de CNPJ que o Crivo
// reprovou. Vale a última resposta do Crivo pra esse CNPJ (mesma regra do
// chat: reprovado em qualquer um dos 2 sistemas é reprovado).
async function crivoReprovou(cnpjLimpo) {
  const { data } = await supabase
    .from('crivo_consultas')
    .select('created_at, sistema1_resultado, sistema2_resultado')
    .eq('cnpj', cnpjLimpo)
    .eq('status', 'concluido')
    .order('created_at', { ascending: false })
    .limit(1)
  const c = data?.[0]
  if (!c) return null
  return c.sistema1_resultado === 'reprovado' || c.sistema2_resultado === 'reprovado' ? c.created_at : null
}

export default function VendaCnpj() {
  const { profile } = useAuth()
  const [cnpj, setCnpj] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState(null) // resposta crua do cnpj.ws
  const [reprovadoNoCrivo, setReprovadoNoCrivo] = useState(null) // data da resposta do Crivo, quando reprovou

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
    setReprovadoNoCrivo(null)
    setErro('')
    setVendaSalva(null)
    setPlanilha(null)
    setLinhas([linhaVazia()])
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
      const [resposta, reprovou] = await Promise.all([buscarCnpj(limpo), crivoReprovou(limpo)])
      setReprovadoNoCrivo(reprovou)
      setDados(resposta)
      // Já preenche os dados do cliente com o que veio da empresa (dá pra
      // corrigir à mão depois).
      const est = resposta?.estabelecimento
      const { nome, cpf } = separarNomeECpf(limparPrefixoNumerico(resposta?.razao_social))
      setNomeCliente(nome)
      setCpfCliente(cpf)
      setTelefoneCliente(telefoneComNove(est))
      // 17/11/2026: a 1ª linha já vem com o telefone do cartão CNPJ (com o
      // 9 na frente). Dá pra editar.
      setLinhas([{ ...linhaVazia(), numero: telefoneComNove(est) }])
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

  function linhasParaSalvar() {
    return linhas.map((l) => {
      if (l.tipo !== 'portabilidade') {
        return { numero: null, tipo: l.tipo, tipo_chip: l.tipoChip, pacote: l.pacote, valor_mensal: precoDoPacote(l.pacote) }
      }
      return {
        numero: soDigitos(l.numero) || null,
        tipo: l.tipo,
        tipo_chip: l.tipoChip,
        pacote: l.pacote,
        valor_mensal: precoDoPacote(l.pacote),
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
    const incompleta = linhas.findIndex((l) => !linhaValida(l))
    if (incompleta >= 0) {
      const l = linhas[incompleta]
      if (!l.tipo) return `Na linha ${incompleta + 1}, escolha se é linha nova ou portabilidade.`
      if (!l.tipoChip) return `Na linha ${incompleta + 1}, escolha o tipo de chip (chip físico ou eSIM).`
      if (soDigitos(l.numero).length !== 11) return `Na linha ${incompleta + 1}, o número a portar precisa ter 11 dígitos (DDD + 9 + número).`
      if (l.titularTipo === 'pf' && soDigitos(l.titularCpf).length === 11 && !cpfValido(l.titularCpf)) return `Na linha ${incompleta + 1}, o CPF do titular é inválido. Confira os números.`
      return `Na linha ${incompleta + 1} (portabilidade), preencha o titular do número (CPF e nome, ou CNPJ e razão social).`
    }
    const cpfRepetido = linhasComCpfRepetido(linhas)
    if (cpfRepetido.size) {
      const [i, primeira] = [...cpfRepetido][0]
      return `O CPF da linha ${i + 1} já foi usado na linha ${primeira} com outro nome. O mesmo CPF não pode ter nomes diferentes.`
    }
    const repetidas = linhasComNumeroRepetido(linhas)
    if (repetidas.size) {
      const [i, primeira] = [...repetidas][0]
      return `A linha ${i + 1} tem o mesmo número da linha ${primeira}. Cada portabilidade precisa de um número diferente.`
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
    const reprovou = await crivoReprovou(soDigitos(dadosEmpresa().cnpj))
    if (reprovou) {
      setSalvando(false)
      setReprovadoNoCrivo(reprovou)
      return setErro('Esse CNPJ foi REPROVADO no Crivo. Não dá pra subir a ficha.')
    }
    const empresa = dadosEmpresa()
    const payload = {
      ...empresa,
      status: 'venda_feita',
      quantidade_linhas: linhas.length,
      linhas: linhasParaSalvar(),
      plano: resumoDoPlano(linhas),
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

  const numerosRepetidos = linhasComNumeroRepetido(linhas)
  const cpfsRepetidos = linhasComCpfRepetido(linhas)
  const empresa = dados ? dadosEmpresa() : null
  const bloqueadoSituacao = empresa ? situacaoBloqueada(empresa.situacao) : false
  const bloqueado = bloqueadoSituacao || Boolean(empresa && reprovadoNoCrivo)
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
          {/* 17/11/2026 (Brayan): sem o nome do cliente em destaque aqui.
              Só a razão social igual ao cartão CNPJ (com os números). A
              caixa "só o nome" foi tirada a pedido dele (18/11/2026). */}
          <div className="grid grid-cols-1 gap-2">
            <DadoEmpresa label="Razão social" valor={(dados?.razao_social || '').trim() || '(sem razão social)'} />
          </div>

          {reprovadoNoCrivo && (
            <div className="tim-alert mt-2 text-base font-bold">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              REPROVADO NO CRIVO em {new Date(reprovadoNoCrivo).toLocaleString('pt-BR')}. Não dá pra subir a ficha desse CNPJ.
            </div>
          )}

          {bloqueadoSituacao && (
            <div className="tim-alert mt-2 text-base font-bold">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              REPROVADO: CNPJ com situação {empresa.situacao?.toUpperCase()}. Não venda pra esse cliente.
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <DadoEmpresa label="CNPJ" valor={empresa.cnpj} />
            <DadoEmpresa label="Nome fantasia" valor={empresa.nome_fantasia} />
            {bloqueadoSituacao ? (
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
              <DadoEmpresa label="Endereço fiscal da Empresa" valor={empresa.endereco} />
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
              <CampoTim label="Ponto de referência" obrigatorio className="sm:col-span-2">
                <input className="field-input" placeholder="Ex: perto do mercado São José" value={pontoReferencia} onChange={(e) => setPontoReferencia(e.target.value)} required />
              </CampoTim>
            </div>
            <p className="tim-info mt-3">
              <Info size={17} className="mt-0.5 shrink-0 text-brand-500" />
              O endereço de entrega será somente no endereço fiscal da Empresa (cartão CNPJ). Não é liberada venda pra outro endereço.
            </p>
          </Secao>

          {/* "Monte o plano ideal para a sua empresa" no visual do print do
              Brayan (19/11/2026): título azul, "Adicionar Linha" em pílula e um
              cartão por linha. Junta as antigas seções Plano e Linhas
              vendidas. */}
          <section className="rounded-lg2 border border-line bg-surface p-4 shadow-card sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-brand-700">Monte o plano ideal para a sua empresa</h2>
              <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={adicionarLinha}
                disabled={linhas.length >= MAX_LINHAS}
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
              >
                <Plus size={18} /> Adicionar Linha
              </button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {linhas.map((l, i) => (
                <LinhaVendida
                  key={l.id}
                  numeroDaLinha={i + 1}
                  linha={l}
                  atualizar={atualizarLinha}
                  consultar={consultarOperadoraDaLinha}
                  remover={removerLinha}
                  podeRemover={linhas.length > 1}
                  repeteLinha={numerosRepetidos.get(i) || 0}
                  cpfRepeteLinha={cpfsRepetidos.get(i) || 0}
                />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <SomaDoPlano linhas={linhas} />
            </div>
          </section>

          {/* Equipe no fim da ficha (Brayan, 17/11/2026). */}
          <Secao titulo="Equipe">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* "Operador" e "Supervisor" (Brayan, 11/11/2026). O supervisor
                  fica guardado na coluna captador (era "Captador da venda"). */}
              <CampoTim label="Operador" obrigatorio>
                <input className="field-input" placeholder="Quem fechou a venda" value={fechouVenda} onChange={(e) => setFechouVenda(e.target.value)} required />
              </CampoTim>
              <CampoTim label="Supervisor">
                <input className="field-input" placeholder="Supervisor do operador" value={captador} onChange={(e) => setCaptador(e.target.value)} />
              </CampoTim>
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

      {/* Depois de salvar: só a mensagem "Enviado" (Brayan, 17/11/2026),
          sem mostrar os dados do cliente. Se a planilha falhar, avisa. */}
      {vendaSalva && (
        <Secao titulo="Cadastro" icone={Check}>
          <p className="flex items-center gap-2 rounded-md border border-good-border bg-good-bg px-4 py-3 text-lg font-bold text-good-text">
            <Check size={22} className="shrink-0" /> Enviado
          </p>
          {(planilha?.erro || planilha?.naoConfigurada) && (
            <div className="mt-3">
              <StatusPlanilha planilha={planilha} tentarDeNovo={() => enviarPraPlanilha(vendaSalva)} />
            </div>
          )}
          <button type="button" onClick={limparTudo} className="btn-primary mt-4 px-5 py-2.5">
            <Search size={16} /> Nova consulta
          </button>
        </Secao>
      )}
    </div>
  )
}
