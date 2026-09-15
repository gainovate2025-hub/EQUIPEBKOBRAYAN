import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { updateProfile } from '../../lib/api'
import SectionHeading from '../../components/ui/SectionHeading'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'

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
      await updateProfile(profile.id, { name })
      if (password.trim()) {
        const { error } = await supabase.auth.updateUser({ password: password.trim() })
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
      <SectionHeading title="Configurações da conta" hint="Seus dados de acesso" />
      <form onSubmit={handleSubmit} className="card flex max-w-md flex-col gap-4 p-6">
        <Field label="Nome">
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Usuário (login)">
          <input className="field-input" value={profile?.username || ''} disabled />
        </Field>
        <Field label="Nova senha (opcional)">
          <input type="password" className="field-input" placeholder="deixe em branco para manter" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button type="submit" className="btn-primary self-start" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
      </form>
      <Toast toast={toast} />
    </div>
  )
}
