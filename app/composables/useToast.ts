type ToastVariant = 'info' | 'error'

export type AppToast = {
  id: string
  message: string
  variant: ToastVariant
}

export function useToast() {
  const toasts = useState<AppToast[]>('app-toasts', () => [])

  function dismissToast(id: string) {
    toasts.value = toasts.value.filter(toast => toast.id !== id)
  }

  function showToast(message: string, variant: ToastVariant = 'info') {
    const id = crypto.randomUUID()
    toasts.value = [...toasts.value, { id, message, variant }]

    if (import.meta.client) {
      window.setTimeout(() => dismissToast(id), 4500)
    }
  }

  return {
    toasts,
    showToast,
    dismissToast,
  }
}
