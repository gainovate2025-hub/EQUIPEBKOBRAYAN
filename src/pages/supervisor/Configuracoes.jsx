import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
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
