import { useEffect } from 'react'

// Fecha com Esc e o × tem nome pro leitor de tela (10/11/2026).
export default function Modal({ title, onClose, children, width = 480 }) {
  useEffect(() => {
    function aoTeclar(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[88vh] w-full overflow-auto rounded-lg2 bg-surface p-6 shadow-modal"
        style={{ maxWidth: width }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-xl text-muted hover:text-ink">&times;</button>
        </div>
        {children}
      </div>
    </div>
  )
}
