import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import SectionHeading from '../../components/ui/SectionHeading'

const RESULT_LABEL = { aprovado: 'Aprovado', reprovado: 'Reprovado', nao_encontrado: 'CNPJ errado' }
const RESULT_COLOR = {
  aprovado: 'text-green-600',
  reprovado: 'text-red-600',
  nao_encontrado: 'text-amber-600',
}

// erro_mensagem sempre começa com "[1º sistema]" ou "[2º sistema]" (veja
// easyvendas.js) — extrai esse número pra avisar o supervisor certinho
// onde o Crivo travou, em vez de um erro genérico sem contexto.
function sistemaDoErro(mensagem) {
  const m = /^\[(\d)º sistema\]/.exec(mensagem || '')
  return m ? m[1] : null
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
      <div className="text-red-600">
        ⚠️ Erro no {sistema ? `${sistema}º sistema` : 'Crivo'} — manda o CNPJ de novo.
      </div>
    )
  }
  const resultado = veredito(c)
  if (!resultado) return <span className="text-muted">⏳ aguardando…</span>
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
    return <div className="text-red-600">⚠️ Erro ao consultar — manda o CNPJ de novo.</div>
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
              <span className="text-muted">— não necessário</span>
            ) : (
              <span className="text-muted">⏳ aguardando…</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function Crivo() {
  const { profile } = useAuth()
  const visaoSimples = profile?.role === 'operacao'
  const [cnpj, setCnpj] = useState('')
  const [cep, setCep] = useState('')
  const [consultas, setConsultas] = useState([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const fimRef = useRef(null)

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
    if (limpo && limpo.length !== 8) return setMsgCepPadrao('CEP inválido (8 números) — ou deixa em branco.')

    setSalvandoCepPadrao(true)
    const { error } = await supabase
      .from('crivo_configuracoes')
      .update({ cep_padrao: limpo ? formatarCep(limpo) : null, atualizado_em: new Date().toISOString() })
      .eq('id', 1)
    setSalvandoCepPadrao(false)
    setMsgCepPadrao(error ? 'Erro: ' + error.message : 'Salvo!')
  }

  // Com ~50 logins mandando CNPJ pro mesmo chat, cada operador só deve ver
  // as PRÓPRIAS consultas — senão o CNPJ que o login 1 manda aparece
  // misturado na tela do login 2, confuso pra equipe toda. Supervisor/
  // líder continua vendo todo mundo (visão de acompanhamento geral).
  const load = useCallback(async () => {
    if (!profile?.id) return
    let query = supabase
      .from('crivo_consultas')
      .select('*, profiles(name)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (visaoSimples) query = query.eq('solicitado_por', profile.id)
    const { data } = await query
    setConsultas((data || []).slice().reverse())
    setLoading(false)
  }, [profile?.id, visaoSimples])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const canal = supabase
      .channel('crivo_consultas_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crivo_consultas' }, () => load())
      .subscribe()
    // além do tempo real, atualiza sozinho a cada 4s (funciona mesmo sem
    // o "replication" do Supabase ligado pra essa tabela).
    const intervalo = setInterval(load, 4000)
    return () => { supabase.removeChannel(canal); clearInterval(intervalo) }
  }, [load])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [consultas])

  async function consultar(e) {
    e?.preventDefault()
    setMsg('')
    const limpo = soCnpjDigitos(cnpj)
    if (limpo.length !== 14) return setMsg('Digita um CNPJ válido (14 números).')

    // Se esse CNPJ já foi consultado antes E já tem uma resposta final
    // (aprovado/reprovado/CNPJ errado), não manda de novo pra fila — além
    // de ser perda de tempo, mandar o mesmo CNPJ duas vezes pro Easy
    // Vendas faz ele cair na tela de Contrato (confirmado ao vivo), o que
    // podia bagunçar a automação. Em vez disso, mostra a resposta que já
    // tinha, igual se tivesse acabado de responder agora.
    const jaRespondida = [...consultas].reverse().find((c) => soCnpjDigitos(c.cnpj) === limpo && veredito(c))
    if (jaRespondida) {
      const resultado = veredito(jaRespondida)
      return setMsg(`Esse CNPJ já foi consultado e respondeu: ${RESULT_LABEL[resultado]} (em ${new Date(jaRespondida.created_at).toLocaleString('pt-BR')}).`)
    }

    const ultima = consultas[consultas.length - 1]
    if (ultima && soCnpjDigitos(ultima.cnpj) === limpo) {
      return setMsg('Esse CNPJ já foi o último consultado — espera terminar antes de mandar de novo.')
    }

    const cepLimpo = soCepDigitos(cep)
    if (cepLimpo && cepLimpo.length !== 8) return setMsg('CEP inválido (8 números) — ou deixa em branco.')

    setEnviando(true)
    const { error } = await supabase.from('crivo_consultas').insert({
      cnpj: limpo,
      cep: cepLimpo ? formatarCep(cepLimpo) : null,
      solicitado_por: profile.id,
    })
    setEnviando(false)
    if (error) return setMsg('Erro: ' + error.message)
    setCnpj('')
    setCep('')
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Chat do Crivo" hint="Manda o CNPJ aqui embaixo — o Crivo consulta nos dois sistemas do TIM e responde nessa mesma tela" />

      {!visaoSimples && (
        <div className="card flex flex-col gap-2 p-4">
          <p className="text-sm font-semibold">CEP padrão</p>
          <p className="text-xs text-muted">
            Usado automaticamente quando uma consulta não vier com um CEP específico — ajuda o Crivo a se recuperar
            sozinho quando o formulário trava (campo de CNPJ fica cinza) e precisa de CEP de novo pra seguir.
          </p>
          <form onSubmit={salvarCepPadrao} className="flex items-center gap-3">
            <input
              className="field-input w-32"
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
        </div>
      )}

      <div className="card flex max-h-[520px] min-h-[300px] flex-col gap-4 overflow-y-auto p-5">
        {loading && <p className="text-sm text-muted">Carregando…</p>}
        {!loading && consultas.length === 0 && <p className="text-sm text-muted">Nenhuma consulta ainda — manda um CNPJ ali embaixo.</p>}

        {consultas.map((c) => (
          <div key={c.id} className="flex flex-col gap-2">
            <div className="flex flex-col items-end gap-0.5 self-end">
              <div className="flex items-baseline gap-2 text-[11px] text-muted">
                <span>{c.profiles?.name || 'Alguém'}</span>
                <span>{new Date(c.created_at).toLocaleString('pt-BR')}</span>
              </div>
              <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-brand-600 px-3 py-2 text-sm font-medium text-white">
                {formatarCnpj(c.cnpj)}
                {c.cep && <div className="mt-0.5 text-xs font-normal text-white/80">CEP: {c.cep}</div>}
              </div>
            </div>

            <div className="flex flex-col items-start gap-0.5 self-start">
              <div className="text-[11px] text-muted">Crivo</div>
              <div className="max-w-[85%] rounded-lg rounded-tl-sm border border-line bg-paper px-3 py-2 text-xs">
                {visaoSimples ? <RespostaCrivoSimples consulta={c} /> : <RespostaCrivoDetalhada consulta={c} />}
              </div>
            </div>
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      <form onSubmit={consultar} className="flex items-center gap-3">
        <input
          className="field-input flex-1"
          placeholder="Digita ou cola o CNPJ (00.000.000/0000-00)"
          value={formatarCnpj(cnpj)}
          onChange={(e) => setCnpj(soCnpjDigitos(e.target.value).slice(0, 14))}
        />
        <input
          className="field-input w-32"
          placeholder="CEP (opcional)"
          value={formatarCep(cep)}
          onChange={(e) => setCep(soCepDigitos(e.target.value))}
        />
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      <p className="text-xs text-muted">CEP é opcional — só ajuda o Crivo a achar a empresa mais rápido quando você já souber.</p>

      {msg && <p className="text-sm font-medium text-red-600">{msg}</p>}
    </div>
  )
}
