import { useEffect, useState } from 'react'
import { useAuth, idDoDispositivo } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { atualizarNomePerfil } from '../../lib/api'
import Secao from '../../components/ui/Secao'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import ModuloConfigForm from '../../components/automacoes/ModuloConfigForm'
import PlanilhaVendasForm from '../../components/automacoes/PlanilhaVendasForm'

export default function Configuracoes() {
  const { profile, refreshProfile } = useAuth()
  const { toast, showToast } = useToast()
  const [name, setName] = useState(profile?.name || '')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await atualizarNomePerfil(profile.id, name)
      if (password.trim()) {
        const { error } = await supabase.auth.updateUser({
          password: password.trim(),
        })
        if (error) throw error
      }
      await refreshProfile()
      setPassword('')
      showToast('Configurações salvas.')
    } catch (err) {
      showToast(err.message || 'Falha ao salvar.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Secao titulo="Seus dados de acesso" className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Nome">
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Usuário (login)">
            <input className="field-input" value={profile?.username || ''} disabled />
          </Field>
          <Field label="Nova senha (opcional)">
            <input
              type="password"
              className="field-input"
              placeholder="Deixe em branco pra manter a atual"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button type="submit" className="btn-primary self-start" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </form>
      </Secao>

      {profile?.role === 'supervisor' && <TravaComputador showToast={showToast} />}

      {profile?.role === 'supervisor' && (
        <>
          <Secao titulo="Planilha de vendas">
            <PlanilhaVendasForm />
          </Secao>
          <Secao titulo="Planilha de fatura">
            <p className="text-sm text-muted">Escolha a aba e as colunas que cada tela puxa da planilha Controle de fatura.</p>
            <div className="mt-4">
              <span className="text-sm font-semibold">Faturas</span>
              <ModuloConfigForm modulo="fatura" />
            </div>
            <div className="mt-6 border-t border-line pt-4">
              <span className="text-sm font-semibold">Contestação (faturas)</span>
              <ModuloConfigForm modulo="contestacao" />
            </div>
          </Secao>
        </>
      )}

      <Toast toast={toast} />
    </div>
  )
}

// Trava do login neste computador (migration_078, pedido do Brayan em
// 26/11/2026: "não quero que meu login apareça em outro computador a não
// ser o meu"). Ligada, qualquer outro computador que entrar com esse login
// é deslogado na hora, e as sessões abertas em outros lugares caem.
function TravaComputador({ showToast }) {
  const [travado, setTravado] = useState(null) // null = carregando
  const [ativa, setAtiva] = useState(true) // false = migration ainda não rodou
  const [salvando, setSalvando] = useState(false)
  const meu = idDoDispositivo()

  useEffect(() => {
    supabase.rpc('meu_dispositivo_travado').then(({ data, error }) => {
      if (error) { setAtiva(false); setTravado(''); return }
      setTravado(data || '')
    })
  }, [])

  async function mudar(ligar) {
    if (ligar && !window.confirm('Travar o seu login NESTE computador? Em qualquer outro computador ou celular ele vai ser deslogado na hora. Se você limpar os dados deste navegador, vai precisar destravar pelo Supabase.')) return
    setSalvando(true)
    const { error } = await supabase.rpc('travar_meu_dispositivo', { p_dispositivo: ligar ? meu : '' })
    if (!error && ligar) await supabase.auth.signOut({ scope: 'others' })
    setSalvando(false)
    if (error) return showToast(error.message, 'error')
    setTravado(ligar ? meu : '')
    showToast(ligar ? 'Login travado neste computador. As outras sessões foram derrubadas.' : 'Trava desligada: o login volta a entrar de qualquer computador.')
  }

  return (
    <Secao titulo="Login só neste computador" className="max-w-md">
      {!ativa ? (
        <p className="text-sm text-muted">Ainda não foi ativado no banco: rode a migration_078 no SQL Editor do Supabase.</p>
      ) : travado === null ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          {travado === meu && <p className="font-medium text-good-text">Ligado: seu login só entra neste computador.</p>}
          {travado && travado !== meu && <p className="font-medium text-warn-text">Ligado em OUTRO computador.</p>}
          {!travado && <p className="text-muted">Desligado: seu login entra de qualquer computador.</p>}
          <p className="text-xs text-muted">Com a trava ligada, quem tentar entrar com o seu usuário em outro computador é deslogado na hora.</p>
          {travado === meu ? (
            <button type="button" className="btn-outline self-start" disabled={salvando} onClick={() => mudar(false)}>Desligar a trava</button>
          ) : (
            <button type="button" className="btn-primary self-start" disabled={salvando} onClick={() => mudar(true)}>
              {travado ? 'Travar neste computador (troca)' : 'Travar meu login neste computador'}
            </button>
          )}
        </div>
      )}
    </Secao>
  )
}
