import Modal from './Modal'

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', onConfirm, onCancel, danger = false }) {
  return (
    <Modal title={title} onClose={onCancel} width={400}>
      <p className="text-sm text-label">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button
          type="button"
          className="btn-primary"
          style={danger ? { background: 'linear-gradient(150deg,#e2242f,#7d0d15)' } : undefined}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
