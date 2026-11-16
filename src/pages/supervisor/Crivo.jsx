import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import Secao from '../../components/ui/Secao'
import Tabs from '../../components/ui/Tabs'
import CrivoLog, { FaixaPcs } from './CrivoLog'
import CrivoMandados from './CrivoMandados'
import { AlertTriangle, Loader2 } from 'lucide-react'

const RESULT_LABEL = { aprovado: 'Aprovado', reprovado: 'Reprovado', nao_encontrado: 'CNPJ errado' }
const RESULT_COLOR = {
  aprovado: 'text-good-text',
  reprovado: 'text-bad-text',
  nao_encontrado: 'text-warn-text',
}

// erro_mensagem sempre começa com "[1º sistema]" ou "[2º sistema]" (veja
// easyvendas.js) — extrai esse número pra avisar o supervisor certinho
// onde o Crivo travou, em vez de um erro genérico sem contexto.
function sistemaDoErro(mensagem) {
  const m = /^\[(\d)º sistema\]/.exec(mensagem || '')
  return m ? m[1] : null
}

// Timer de relogin das matrículas do Easy Vendas — a sessão delas cai
// sozinha de 1h em 1h, derrubando a automação até alguém relogar na mão.
// Conta a partir da PRIMEIRA consulta mandada no dia (é quando a
// matrícula de verdade começou a ser usada/logada), e repete sozinho a
// cada 40 minutos dali em diante — sem precisar de botão pra reiniciar.
//
// Puxa esse horário do BANCO (não de localStorage) — tem ~40 operadores
// cada um no próprio navegador, mas quem acompanha o timer de verdade é
// quem administra os PCs da automação; se fosse guardado só no
// navegador de cada um, o timer de quem administra nunca começaria a
// contar a menos que ELA MESMA mandasse a 1ª consulta do dia. Com o
// banco, funciona pra quem estiver olhando essa tela, em qualquer PC.
async function buscarPrimeiraConsultaHoje() {
  const inicioDoDia = new Date()
  inicioDoDia.setHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('crivo_consultas')
    .select('created_at')
    .gte('created_at', inicioDoDia.toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
  return data?.[0] ? new Date(data[0].created_at).getTime() : null
}
const DURACAO_RELOGIN_MS = 40 * 60 * 1000

function formatarTempo(totalSegundos) {
  const s = Math.max(0, totalSegundos)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function soCnpjDigitos(v) {
  return v.replace(/\D/g, '')
}

function formatarCnpj(v) {
  const d = soCnpjDigitos(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function soCepDigitos(v) {
  return v.replace(/\D/g, '').slice(0, 8)
}

function formatarCep(v) {
  const d = soCepDigitos(v)
  return d.replace(/^(\d{5})(\d)/, '$1-$2')
}

// Junta os dois sistemas num veredito só: reprovado em qualquer um decide
// na hora (mesma regra do banco — migration_018), CNPJ errado em qualquer
// um também já é motivo de aviso, e só é aprovado quando os dois concordam.
function veredito(c) {
  const s1 = c.sistema1_resultado
  const s2 = c.sistema2_resultado
  if (s1 === 'reprovado' || s2 === 'reprovado') return 'reprovado'
  if (s1 === 'nao_encontrado' || s2 === 'nao_encontrado') return 'nao_encontrado'
  if (s1 === 'aprovado' && s2 === 'aprovado') return 'aprovado'
  return null
}

function RespostaCrivoSimples({ consulta: c }) {
  if (c.status === 'erro') {
    const sistema = sistemaDoErro(c.erro_mensagem)
    return (
      <div className="flex items-center gap-1.5 text-bad-text">
        <AlertTriangle size={15} className="shrink-0" />
        Erro no {sistema ? `${sistema}º sistema` : 'Crivo'}. Envie o CNPJ de novo.
      </div>
    )
  }
  const resultado = veredito(c)
  if (!resultado)
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Loader2 size={14} className="animate-spin" /> aguardando…
      </span>
    )
  return <span className={`text-base font-bold ${RESULT_COLOR[resultado]}`}>{RESULT_LABEL[resultado]}</span>
}

// Se o 1º sistema já reprovou (ou não achou o CNPJ), o 2º nunca roda de
// propósito — mostrar "não necessário" em vez de "aguardando" pra sempre,
// que dava a entender que ainda tava processando.
function sistema1Terminal(c) {
  return c.sistema1_resultado === 'reprovado' || c.sistema1_resultado === 'nao_encontrado'
}

function RespostaCrivoDetalhada({ consulta: c }) {
  if (c.status === 'erro') {
    return (
      <div className="flex items-center gap-1.5 text-bad-text">
        <AlertTriangle size={15} className="shrink-0" /> Erro ao consultar. Envie o CNPJ de novo.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {['sistema1', 'sistema2'].map((sis, i) => {
        const resultado = c[`${sis}_resultado`]
        return (
          <div key={sis}>
            <span className="text-muted">{i + 1}º sistema: </span>
            {resultado ? (
              <span className={`font-semibold ${RESULT_COLOR[resultado]}`}>{RESULT_LABEL[resultado]}</span>
            ) : sis === 'sistema2' && sistema1Terminal(c) ? (
              <span className="text-muted">não necessário</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Loader2 size={14} className="animate-spin" /> aguardando…
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const ABAS_CRIVO = [
  { key: 'chat', label: 'Chat' },
  { key: 'mandados', label: 'CNPJs mandados' },
  { key: 'log', label: 'Log' },
]

export default function Crivo() {
  const { profile } = useAuth()
  const visaoSimples = profile?.role === 'operacao'
  const [cnpj, setCnpj] = useState('')
  const [cep, setCep] = useState('')
  const [consultas, setConsultas] = useState([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [confirmarReenvio, setConfirmarReenvio] = useState('') // CNPJ já respondido que a pessoa quer mandar de novo
  const [msg, setMsg] = useState('')
  const fimRef = useRef(null)
  // Supervisor/líder vê também a aba "Log" (PCs, fila, tempos e erros).
  const [aba, setAba] = useState('chat')

  // Timer de relogin das matrículas (veja comentário de buscarPrimeiraConsultaHoje).
  // null enquanto ainda não teve nenhuma consulta hoje (timer parado).
  const [primeiraConsultaHoje, setPrimeiraConsultaHoje] = useState(null)
  const [segundosRestantes, setSegundosRestantes] = useState(null)

  // Busca no banco de tempos em tempos — só precisa até achar a 1ª
  // consulta do dia; depois disso o horário não muda mais (para de
  // perguntar de novo, sem necessidade).
  useEffect(() => {
    if (primeiraConsultaHoje) return
    let cancelado = false
    buscarPrimeiraConsultaHoje().then((em) => {
      if (!cancelado) setPrimeiraConsultaHoje(em)
    })
    const intervalo = setInterval(async () => {
      const em = await buscarPrimeiraConsultaHoje()
      if (!cancelado && em) setPrimeiraConsultaHoje(em)
    }, 20000)
    return () => {
      cancelado = true
      clearInterval(intervalo)
    }
  }, [primeiraConsultaHoje])

  // Repete sozinho a cada 40min a partir da 1ª consulta do dia — nunca
  // para, não precisa de botão pra reiniciar.
  useEffect(() => {
    if (!primeiraConsultaHoje) {
      setSegundosRestantes(null)
      return
    }
    function tick() {
      const decorrido = (Date.now() - primeiraConsultaHoje) % DURACAO_RELOGIN_MS
      setSegundosRestantes(Math.round((DURACAO_RELOGIN_MS - decorrido) / 1000))
    }
    tick()
    const intervalo = setInterval(tick, 1000)
    return () => clearInterval(intervalo)
  }, [primeiraConsultaHoje])

  // CEP padrão (crivo_configuracoes, 1 linha só) — a extensão usa esse
  // valor sempre que uma consulta não vier com um CEP específico,
  // principalmente pra conseguir reconstruir o formulário do 1º sistema
  // quando ele trava (campo de CNPJ fica cinza) e precisa de CEP de novo
  // pra seguir em frente.
  const [cepPadrao, setCepPadrao] = useState('')
  const [cepPadraoCarregado, setCepPadraoCarregado] = useState(false)
  const [salvandoCepPadrao, setSalvandoCepPadrao] = useState(false)
  const [msgCepPadrao, setMsgCepPadrao] = useState('')

  useEffect(() => {
    supabase
      .from('crivo_configuracoes')
      .select('cep_padrao')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        setCepPadrao(data?.cep_padrao || '')
        setCepPadraoCarregado(true)
      })
  }, [])

  async function salvarCepPadrao(e) {
    e?.preventDefault()
    setMsgCepPadrao('')
    const limpo = soCepDigitos(cepPadrao)
    if (limpo && limpo.length !== 8) return setMsgCepPadrao('CEP inválido (8 números). Corrija ou deixe em branco.')

    setSalvandoCepPadrao(true)
    const { error } = await supabase
      .from('crivo_configuracoes')
      .update({ cep_padrao: limpo ? formatarCep(limpo) : null, atualizado_em: new Date().toISOString() })
      .eq('id', 1)
    setSalvandoCepPadrao(false)
    setMsgCepPadrao(error ? 'Erro: ' + error.message : 'Salvo.')
  }

  // Com ~50 logins mandando CNPJ pro mesmo chat, cada operador só deve ver
  // as PRÓPRIAS consultas — senão o CNPJ que o login 1 manda aparece
  // misturado na tela do login 2, confuso pra equipe toda. Supervisor/
  // líder continua vendo todo mundo (visão de acompanhamento geral).
  const load = useCallback(async () => {
    if (!profile?.id) return
    let query = supabase.from('crivo_consultas').select('*, profiles(name)').order('created_at', { ascending: false }).limit(50)
    if (visaoSimples) query = query.eq('solicitado_por', profile.id)
    const { data } = await query
    setConsultas((data || []).slice().reverse())
    setLoading(false)
  }, [profile?.id, visaoSimples])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    // Debounce: cada consulta passa por várias mudanças seguidas (trava
    // sistema1 → resultado sistema1 → trava sistema2 → resultado
    // sistema2), e cada uma delas disparava um reload na hora. Com muita
    // gente mandando CNPJ ao mesmo tempo isso virava uma rajada de
    // queries repetidas pro Supabase em CADA navegador aberto — agora
    // junta mudanças próximas (até 400ms) num reload só.
    let debounceId = null
    const canal = supabase
      .channel('crivo_consultas_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crivo_consultas' }, () => {
        clearTimeout(debounceId)
        debounceId = setTimeout(load, 400)
      })
      .subscribe()
    // além do tempo real, atualiza sozinho a cada 4s (funciona mesmo sem
    // o "replication" do Supabase ligado pra essa tabela).
    const intervalo = setInterval(load, 4000)
    return () => {
      supabase.removeChannel(canal)
      clearInterval(intervalo)
      clearTimeout(debounceId)
    }
  }, [load])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [consultas])

  async function consultar(e) {
    e?.preventDefault()
    setMsg('')
    const limpo = soCnpjDigitos(cnpj)
    if (limpo.length !== 14) return setMsg('Digite um CNPJ válido (14 números).')

    // Se esse CNPJ já foi consultado antes E já tem uma resposta final
    // (aprovado/reprovado/CNPJ errado), não manda de novo pra fila — além
    // de ser perda de tempo, mandar o mesmo CNPJ duas vezes pro Easy
    // Vendas faz ele cair na tela de Contrato (confirmado ao vivo), o que
    // podia bagunçar a automação. Em vez disso, mostra a resposta que já
    // tinha, igual se tivesse acabado de responder agora.
    // 13/11/2026 (Brayan): dá pra mandar de novo um CNPJ já respondido.
    // O 1º envio só avisa; enviar o MESMO CNPJ de novo logo em seguida
    // manda pra fila (pra quem quer consultar outra vez de propósito).
    const jaRespondida = [...consultas].reverse().find((c) => soCnpjDigitos(c.cnpj) === limpo && veredito(c))
    if (jaRespondida && confirmarReenvio !== limpo) {
      const resultado = veredito(jaRespondida)
      setConfirmarReenvio(limpo)
      return setMsg(
        `Esse CNPJ já foi consultado e respondeu: ${RESULT_LABEL[resultado]} (em ${new Date(jaRespondida.created_at).toLocaleString('pt-BR')}). Pra consultar de novo, clique em enviar mais uma vez.`
      )
    }
    setConfirmarReenvio('')

    const ultima = consultas[consultas.length - 1]
    // Só segura enquanto a última ainda está rodando. Se ela deu ERRO, a
    // própria tela pede "envie o CNPJ de novo" — antes isso era barrado
    // aqui e a extensão nunca recebia o reenvio (11/11/2026).
    if (ultima && soCnpjDigitos(ultima.cnpj) === limpo && ultima.status === 'pendente') {
      return setMsg('Esse CNPJ já foi o último consultado. Aguarde terminar antes de enviar de novo.')
    }

    const cepLimpo = soCepDigitos(cep)
    if (cepLimpo && cepLimpo.length !== 8) return setMsg('CEP inválido (8 números). Corrija ou deixe em branco.')

    setEnviando(true)
    const { error } = await supabase.from('crivo_consultas').insert({
      cnpj: limpo,
      cep: cepLimpo ? formatarCep(cepLimpo) : null,
      solicitado_por: profile.id,
    })
    setEnviando(false)
    if (error) return setMsg('Erro: ' + error.message)
    // Se essa acabou sendo a 1ª consulta do dia, não precisa esperar o
    // próximo poll (até 20s) pra o timer começar a contar.
    setPrimeiraConsultaHoje((atual) => atual || Date.now())
    setCnpj('')
    setCep('')
  }

  if (!visaoSimples && (aba === 'log' || aba === 'mandados')) {
    return (
      <div className="flex flex-col gap-4">
        <Tabs tabs={ABAS_CRIVO} active={aba} onChange={setAba} />
        {aba === 'log' ? <CrivoLog /> : <CrivoMandados />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {!visaoSimples && <Tabs tabs={ABAS_CRIVO} active={aba} onChange={setAba} />}
      <p className="text-sm text-muted">Envie o CNPJ no chat abaixo. O Crivo consulta nos dois sistemas da TIM e responde nesta tela.</p>

      {segundosRestantes !== null && (
        <div className={`card flex items-center gap-3 p-4 ${segundosRestantes <= 0 ? 'border-bad-border bg-bad-bg' : ''}`}>
          {segundosRestantes > 0 ? (
            <p className="text-sm">
              <span className="font-semibold">Relogar as matrículas do Easy Vendas em:</span>{' '}
              <span className="font-mono text-base">{formatarTempo(segundosRestantes)}</span>
            </p>
          ) : (
            <p className="text-sm font-semibold text-bad-text">Hora de relogar as matrículas no Easy Vendas. A sessão cai a cada 1h.</p>
          )}
        </div>
      )}

      {!visaoSimples && (
        <Secao titulo="CEP padrão">
          <p className="mb-3 text-sm text-muted">
            Usado quando a consulta vem sem CEP. Ajuda o Crivo a destravar o formulário (campo de CNPJ cinza) sozinho.
          </p>
          <form onSubmit={salvarCepPadrao} className="flex flex-wrap items-center gap-3">
            <input
              className="field-input w-32"
              aria-label="CEP padrão"
              placeholder="00000-000"
              value={formatarCep(cepPadrao)}
              onChange={(e) => setCepPadrao(soCepDigitos(e.target.value))}
              disabled={!cepPadraoCarregado}
            />
            <button type="submit" className="btn-primary" disabled={salvandoCepPadrao || !cepPadraoCarregado}>
              {salvandoCepPadrao ? 'Salvando…' : 'Salvar'}
            </button>
            {msgCepPadrao && <span className="text-xs text-muted">{msgCepPadrao}</span>}
          </form>
        </Secao>
      )}

      <FaixaPcs />

      <Secao titulo="Chat do Crivo">
        <div className="flex max-h-[520px] min-h-[300px] flex-col gap-4 overflow-y-auto">
          {loading && <p className="text-sm text-muted">Carregando…</p>}
          {!loading && consultas.length === 0 && (
            <p className="text-sm text-muted">Nenhuma consulta ainda. Envie um CNPJ no campo abaixo.</p>
          )}

          {consultas.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <div className="flex flex-col items-end gap-0.5 self-end">
                <div className="flex items-baseline gap-2 text-xs text-muted">
                  <span>{c.profiles?.name || 'Alguém'}</span>
                  <span>{new Date(c.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-brand-600 px-3 py-2 text-sm font-medium text-white">
                  {formatarCnpj(c.cnpj)}
                  {c.cep && <div className="mt-0.5 text-xs font-normal text-white/80">CEP: {c.cep}</div>}
                </div>
              </div>

              <div className="flex flex-col items-start gap-0.5 self-start">
                <div className="text-xs text-muted">Crivo</div>
                <div className="max-w-[85%] rounded-lg rounded-tl-sm border border-line bg-paper px-3 py-2 text-xs">
                  {visaoSimples ? <RespostaCrivoSimples consulta={c} /> : <RespostaCrivoDetalhada consulta={c} />}
                </div>
              </div>
            </div>
          ))}
          <div ref={fimRef} />
        </div>

        <form onSubmit={consultar} className="mt-4 flex flex-wrap items-center gap-3 border-t border-divider pt-4">
          <input
            className="field-input min-w-[200px] flex-1"
            aria-label="CNPJ"
            placeholder="Digite ou cole o CNPJ (00.000.000/0000-00)"
            value={formatarCnpj(cnpj)}
            onChange={(e) => setCnpj(soCnpjDigitos(e.target.value).slice(0, 14))}
          />
          <input
            className="field-input w-32"
            aria-label="CEP (opcional)"
            placeholder="CEP (opcional)"
            value={formatarCep(cep)}
            onChange={(e) => setCep(soCepDigitos(e.target.value))}
          />
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">CEP é opcional. Só ajuda o Crivo a achar a empresa mais rápido quando você já souber.</p>

        {msg && (
          <p className="mt-2 text-sm font-medium text-bad-text" role="alert">
            {msg}
          </p>
        )}
      </Secao>
    </div>
  )
}
