// Cores pelos tokens do tema (10/11/2026), antes eram hex fixos no style.
export default function Toast({ toast }) {
  if (!toast?.show) return null
  const isError = toast.type === 'error'
  return (
    <div
      role="status"
      className={`fixed bottom-6 right-6 z-[100] max-w-[calc(100vw-3rem)] rounded-md px-4 py-3 text-sm font-medium text-white shadow-md ${isError ? 'bg-bad-text' : 'bg-sidebar'}`}
    >
      {toast.message}
    </div>
  )
}
