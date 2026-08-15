import { useCallback, useRef, useState } from 'react'

export function useToast() {
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const timer = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ show: true, message, type })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2600)
  }, [])

  return { toast, showToast }
}
