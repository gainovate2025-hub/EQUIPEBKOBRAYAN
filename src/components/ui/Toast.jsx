export default function Toast({ toast }) {
  if (!toast?.show) return null
  const isError = toast.type === 'error'
  return (
    <div
      className="fixed bottom-6 right-6 z-[100] rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg transition-all"
      style={{ background: isError ? '#a5121c' : '#16181c' }}
    >
      {toast.message}
    </div>
  )
}
