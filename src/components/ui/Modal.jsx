export default function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="max-h-[88vh] w-full overflow-auto rounded-xl2 bg-white p-7"
        style={{ maxWidth: width, boxShadow: '0 18px 44px rgba(20,24,33,.08)' }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-xl text-muted hover:text-ink">&times;</button>
        </div>
        {children}
      </div>
    </div>
  )
}
